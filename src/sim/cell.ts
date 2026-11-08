/**
 * Runtime cell state. Buffers are laid out as (n + 1) nodes × 4 resources,
 * node 0 is the cytosol, node i + 1 is component i.
 */
import { NUM_CHANNELS, NUM_RES, RADIUS_K } from './constants';
import { makeCircuitState, type CircuitOut, type CircuitState } from './circuit';
import type { CompiledDesign } from './design';
import { CYTO_CAP_BASE } from './design';
import type { Bond } from './bond';
import { T } from './components';

export interface Strain {
  id: number;
  name: string;
  design: import('./design').CellDesign;
  compiled: CompiledDesign;
  parentId: number | null;
  /** Id of the root design (template / user design) this strain descends from. */
  rootId: string;
  hue: number;
  /** Number of mutation steps from the root design. */
  depth: number;
  birthTick: number;
  population: number;
  peak: number;
  totalBorn: number;
  extinctTick: number | null;
  note: string;
}

export const HIST_LEN = 90;
export const HIST_VARS = 6; // charge, sorb, murk, mass, integrity, energyNet
export const HIST_EVERY = 5;

export type DeathCause = 'integrity' | 'starvation' | 'heat' | 'toxicity' | 'predation' | 'senescence' | 'apoptosis' | 'culled';

export class Cell {
  id: number;
  strain: Strain;
  cd: CompiledDesign;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  angle: number;
  av = 0;
  fx = 0;
  fy = 0;
  torque = 0;
  mass: number;
  radius: number;
  integrity: number;
  maxIntegrity: number;
  age = 0;
  tissue: number;
  generation: number;
  divisions = 0;
  lastDivision = -9999;
  birthTick: number;
  parentId: number;
  organismId = 0;
  bonds: Bond[] = [];
  alive = true;
  deathCause: DeathCause | null = null;
  /** Dominant damage source (for death cause attribution). */
  damage = { heat: 0, toxicity: 0, predation: 0, starvation: 0, senescence: 0 };

  buf: Float64Array;
  cytoCap: Float32Array = new Float32Array(NUM_RES);
  activation: Float32Array;
  activity: Float32Array;
  sensors: Float32Array;
  sensorMem: Float32Array;
  circuit: CircuitState;
  circuitOut: CircuitOut;
  channels: Float32Array = new Float32Array(NUM_CHANNELS);
  /** Charge produced / used per component (EMA). Slot n = cell-level, n+1 = autophagy. */
  eGen: Float32Array;
  eUse: Float32Array;
  edgeFlow: Float32Array;
  /** Membrane exchange with the dish, EMA [sorb, lith, -, murk] (+ = inward). */
  membraneFlow: Float32Array = new Float32Array(NUM_RES);
  /** Growth rate EMA (mass per tick). */
  growth = 0;
  heatStress = 0;
  toxicity = 0;
  hist: Float32Array = new Float32Array(HIST_LEN * HIST_VARS);
  histPos = 0;
  histCount = 0;
  /** Visual-only: last time a signal pulse / emission happened. */
  flash = 0;
  /** Visual-only random phase. */
  phase: number;
  /** Pending adhesion request from the circuit. */
  wantsAdhere = false;

  constructor(id: number, strain: Strain, x: number, y: number, angle: number, mass: number, tissue: number, tick: number, phase: number) {
    this.id = id;
    this.strain = strain;
    this.cd = strain.compiled;
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.mass = mass;
    this.radius = RADIUS_K * Math.sqrt(mass);
    this.tissue = tissue;
    this.generation = 0;
    this.birthTick = tick;
    this.parentId = 0;
    this.phase = phase;
    const cd = this.cd;
    this.buf = new Float64Array((cd.n + 1) * NUM_RES);
    this.activation = new Float32Array(cd.n).fill(1);
    this.activity = new Float32Array(cd.n);
    this.sensors = new Float32Array(cd.numOutputs);
    this.sensorMem = new Float32Array(cd.n * 2);
    this.circuit = makeCircuitState(cd.circuit);
    this.circuitOut = {
      activation: this.activation,
      actions: new Uint8Array(4),
      tissueTarget: -1,
      channelOut: new Float32Array(NUM_CHANNELS),
    };
    this.eGen = new Float32Array(cd.n + 2);
    this.eUse = new Float32Array(cd.n + 2);
    this.edgeFlow = new Float32Array(cd.numEdges * NUM_RES);
    this.maxIntegrity = this.computeMaxIntegrity();
    this.integrity = this.maxIntegrity;
    this.updateCaps();
    // Initialise oscillator phases from params
    for (const i of cd.byType[T.oscillator] ?? []) this.sensorMem[i * 2] = cd.params[i * 4 + 2];
  }

  computeMaxIntegrity(): number {
    return this.cd.baseIntegrity * Math.sqrt(Math.max(1, this.mass) / 10);
  }

  updateCaps(): void {
    const s = this.mass / 10;
    for (let r = 0; r < NUM_RES; r++) this.cytoCap[r] = CYTO_CAP_BASE[r] * s;
    this.radius = RADIUS_K * Math.sqrt(this.mass);
  }

  /** Total of a resource across cytosol and all component buffers. */
  total(r: number): number {
    let t = 0;
    for (let k = r; k < this.buf.length; k += NUM_RES) t += this.buf[k];
    return t;
  }

  totalCap(r: number): number {
    let t = this.cytoCap[r];
    const cd = this.cd;
    for (let i = 0; i < cd.n; i++) t += cd.caps[i * NUM_RES + r];
    return t;
  }

  /** Matter held by the cell: buffers (sorb, lith, murk) + biomass. */
  matter(): number {
    return this.total(0) + this.total(1) + this.total(3) + this.mass;
  }

  expressed(i: number): boolean {
    return (this.cd.tissues[i] & (1 << this.tissue)) !== 0;
  }

  record(): void {
    const o = this.histPos * HIST_VARS;
    const h = this.hist;
    h[o] = this.total(2) / Math.max(0.01, this.totalCap(2));
    h[o + 1] = this.total(0) / Math.max(0.01, this.totalCap(0));
    h[o + 2] = this.total(3) / Math.max(0.01, this.totalCap(3));
    h[o + 3] = this.mass / this.cd.divideMass;
    h[o + 4] = this.integrity / Math.max(0.01, this.maxIntegrity);
    let net = 0;
    for (let i = 0; i < this.eGen.length; i++) net += this.eGen[i] - this.eUse[i];
    h[o + 5] = net;
    this.histPos = (this.histPos + 1) % HIST_LEN;
    if (this.histCount < HIST_LEN) this.histCount++;
  }

  /** Returns history series k as an array ordered oldest → newest. */
  series(k: number): number[] {
    const out: number[] = [];
    const start = (this.histPos - this.histCount + HIST_LEN) % HIST_LEN;
    for (let j = 0; j < this.histCount; j++) out.push(this.hist[((start + j) % HIST_LEN) * HIST_VARS + k]);
    return out;
  }
}
