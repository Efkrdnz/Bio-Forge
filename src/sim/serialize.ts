/**
 * Save / load. snapshot() produces a structured object (typed arrays copied)
 * used for the timeline; toJSON/fromJSON wrap it for files and localStorage.
 * Restoring a snapshot and stepping reproduces the original run exactly.
 */
import { NUM_RES } from './constants';
import { Cell, type Strain } from './cell';
import type { Bond } from './bond';
import { compileDesign, normalizeDesign, type CellDesign } from './design';
import { Environment } from './environment';
import { World } from './world';
import { makeCircuitState } from './circuit';

export const SAVE_VERSION = 1;

type TA = Float32Array | Float64Array | Int32Array | Uint8Array;

export interface WorldSnapshot {
  version: number;
  tick: number;
  seed: number;
  rng: [number, number, number, number];
  params: World['params'];
  env: {
    W: number;
    H: number;
    patternSeed: number;
    sorb: Float32Array;
    lith: Float32Array;
    murk: Float32Array;
    heat: Float32Array;
    echoA: Float32Array;
    echoB: Float32Array;
    lightSources: World['env']['lightSources'];
    echoAge?: number;
  };
  ledger: World['ledger'];
  strains: Omit<Strain, 'compiled'>[];
  cells: Record<string, unknown>[];
  bonds: Record<string, unknown>[];
  organisms: ReturnType<World['organisms']['get']>[];
  ids: { cell: number; bond: number; strain: number; organism: number };
  designs: CellDesign[];
  experiment: World['experiment'];
  goalStatus: World['goalStatus'];
  scheduleIndex: number;
  history: World['history'];
  historyEvery: number;
  deaths: World['deaths'];
  births: number;
  energyRateIn: number;
  energyRateOut: number;
  log: World['log'];
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const CELL_SCALARS = [
  'id', 'x', 'y', 'vx', 'vy', 'angle', 'av', 'mass', 'radius', 'integrity', 'maxIntegrity', 'age', 'tissue',
  'generation', 'divisions', 'lastDivision', 'birthTick', 'parentId', 'organismId', 'growth', 'heatStress',
  'toxicity', 'histPos', 'histCount', 'flash', 'phase', 'wantsAdhere', 'deathCause',
] as const;
const CELL_ARRAYS = ['buf', 'cytoCap', 'activation', 'activity', 'sensors', 'sensorMem', 'channels', 'eGen', 'eUse', 'edgeFlow', 'membraneFlow', 'hist'] as const;

export interface SnapshotOptions {
  /** Include each cell's activity-graph ring buffer (visual only). Default true. */
  cellHistory?: boolean;
  /** Include the dish population history samples (charts only). Default true. */
  popHistory?: boolean;
}

/**
 * Capture the full simulation state. The optional visual histories do not
 * affect the simulation, so leaving them out keeps snapshots small while
 * replays stay exact.
 */
export function snapshot(w: World, opts: SnapshotOptions = {}): WorldSnapshot {
  const withHist = opts.cellHistory !== false;
  const cells = w.cells.map((c) => {
    const o: Record<string, unknown> = { strainId: c.strain.id, damage: { ...c.damage } };
    for (const k of CELL_SCALARS) o[k] = c[k];
    for (const k of CELL_ARRAYS) if (k !== 'hist' || withHist) o[k] = (c[k] as TA).slice();
    if (!withHist) {
      o.histPos = 0;
      o.histCount = 0;
    }
    o.circuit = {
      values: c.circuit.values.slice(),
      mem: c.circuit.mem.slice(),
      delay: c.circuit.delay.slice(),
      delayPos: c.circuit.delayPos.slice(),
    };
    return o;
  });
  const bonds = w.bonds.map((b) => ({
    id: b.id,
    a: b.a.id,
    b: b.b.id,
    angA: b.angA,
    angB: b.angB,
    strength: b.strength,
    stiffness: b.stiffness,
    stretch: b.stretch,
    flow: b.flow.slice(),
    signal: b.signal,
    pulse: b.pulse,
  }));
  const strains = [...w.strains.values()].map((s) => {
    const { compiled: _c, ...rest } = s;
    void _c;
    return { ...rest, design: clone(s.design) };
  });
  return {
    version: SAVE_VERSION,
    tick: w.tick,
    seed: w.seed,
    rng: w.rng.getState(),
    params: { ...w.params },
    env: {
      W: w.env.W,
      H: w.env.H,
      patternSeed: w.env.patternSeed,
      sorb: w.env.sorb.slice(),
      lith: w.env.lith.slice(),
      murk: w.env.murk.slice(),
      heat: w.env.heat.slice(),
      echoA: w.env.echoA.slice(),
      echoB: w.env.echoB.slice(),
      lightSources: w.env.lightSources.map((s) => ({ ...s })),
      echoAge: w.env.echoAge,
    },
    ledger: clone(w.ledger),
    strains,
    cells,
    bonds,
    organisms: [...w.organisms.values()].map((o) => ({ ...o! })),
    ids: { cell: w.nextCellId, bond: w.nextBondId, strain: w.nextStrainId, organism: w.nextOrganismId },
    designs: [...w.designs.values()].map(clone),
    experiment: w.experiment ? clone(w.experiment) : null,
    goalStatus: clone(w.goalStatus),
    scheduleIndex: w.scheduleIndex,
    history: opts.popHistory === false ? [] : clone(w.history),
    historyEvery: w.historyEvery,
    deaths: { ...w.deaths },
    births: w.births,
    energyRateIn: w.energyRateIn,
    energyRateOut: w.energyRateOut,
    log: clone(w.log.slice(-200)),
  };
}

export function restore(s: WorldSnapshot): World {
  const w = new World({ seed: s.seed, gridW: s.env.W, gridH: s.env.H, params: s.params, fill: 0 });
  w.tick = s.tick;
  w.rng.setState([...s.rng] as [number, number, number, number]);
  w.env = new Environment(s.env.W, s.env.H, s.env.patternSeed);
  const e = w.env;
  e.sorb.set(s.env.sorb);
  e.lith.set(s.env.lith);
  e.murk.set(s.env.murk);
  e.heat.set(s.env.heat);
  e.echoA.set(s.env.echoA);
  e.echoB.set(s.env.echoB);
  e.lightSources = s.env.lightSources.map((x) => ({ ...x }));
  e.echoAge = s.env.echoAge ?? 0;
  e.updatePatterns(w.params, true);
  w.ledger = clone(s.ledger);
  w.strains.clear();
  for (const st of s.strains) {
    const design = normalizeDesign(clone(st.design));
    w.strains.set(st.id, { ...st, design, compiled: compileDesign(design) } as Strain);
  }
  const byId = new Map<number, Cell>();
  for (const o of s.cells) {
    const strain = w.strains.get(o.strainId as number);
    if (!strain) continue;
    const c = new Cell(o.id as number, strain, o.x as number, o.y as number, o.angle as number, o.mass as number, o.tissue as number, o.birthTick as number, o.phase as number);
    const cr = c as unknown as Record<string, unknown>;
    for (const k of CELL_SCALARS) if (o[k] !== undefined) cr[k] = o[k];
    for (const k of CELL_ARRAYS) {
      const src = o[k] as ArrayLike<number> | undefined;
      const dst = c[k] as TA;
      if (src && src.length === dst.length) dst.set(src);
    }
    c.damage = { ...(o.damage as Cell['damage']) };
    const circ = o.circuit as { values: ArrayLike<number>; mem: ArrayLike<number>; delay: ArrayLike<number>; delayPos: ArrayLike<number> };
    c.circuit = makeCircuitState(strain.compiled.circuit);
    if (circ && circ.values.length === c.circuit.values.length) {
      c.circuit.values.set(circ.values);
      c.circuit.mem.set(circ.mem);
      c.circuit.delay.set(circ.delay);
      c.circuit.delayPos.set(circ.delayPos);
    }
    c.alive = true;
    c.bonds = [];
    w.cells.push(c);
    byId.set(c.id, c);
  }
  for (const b of s.bonds) {
    const A = byId.get(b.a as number);
    const B = byId.get(b.b as number);
    if (!A || !B) continue;
    const bond: Bond = {
      id: b.id as number,
      a: A,
      b: B,
      angA: b.angA as number,
      angB: b.angB as number,
      strength: b.strength as number,
      stiffness: b.stiffness as number,
      stretch: b.stretch as number,
      flow: Float32Array.from(b.flow as ArrayLike<number>),
      signal: b.signal as number,
      broken: false,
      pulse: b.pulse as number,
    };
    if (bond.flow.length !== NUM_RES) bond.flow = new Float32Array(NUM_RES);
    A.bonds.push(bond);
    B.bonds.push(bond);
    w.bonds.push(bond);
  }
  w.organisms = new Map(s.organisms.map((o) => [o!.id, { ...o! }]));
  w.nextCellId = s.ids.cell;
  w.nextBondId = s.ids.bond;
  w.nextStrainId = s.ids.strain;
  w.nextOrganismId = s.ids.organism;
  w.designs = new Map(s.designs.map((d) => [d.id, normalizeDesign(clone(d))]));
  w.experiment = s.experiment ? clone(s.experiment) : null;
  w.goalStatus = clone(s.goalStatus);
  w.scheduleIndex = s.scheduleIndex;
  w.history = clone(s.history);
  w.historyEvery = s.historyEvery;
  w.deaths = { ...s.deaths };
  w.births = s.births;
  w.energyRateIn = s.energyRateIn;
  w.energyRateOut = s.energyRateOut;
  w.log = clone(s.log);
  return w;
}

// ---------------------------------------------------------------- JSON codec
function b64encode(bytes: Uint8Array): string {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}
function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const TAGS: [string, new (b: ArrayBuffer) => TA][] = [
  ['$f32', Float32Array as unknown as new (b: ArrayBuffer) => TA],
  ['$f64', Float64Array as unknown as new (b: ArrayBuffer) => TA],
  ['$i32', Int32Array as unknown as new (b: ArrayBuffer) => TA],
  ['$u8', Uint8Array as unknown as new (b: ArrayBuffer) => TA],
];

function encodeValue(v: unknown): unknown {
  if (v instanceof Float32Array) return { $f32: b64encode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  if (v instanceof Float64Array) return { $f64: b64encode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  if (v instanceof Int32Array) return { $i32: b64encode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)) };
  if (v instanceof Uint8Array) return { $u8: b64encode(v) };
  if (Array.isArray(v)) return v.map(encodeValue);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) o[k] = encodeValue(x);
    return o;
  }
  return v;
}

function decodeValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(decodeValue);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const [tag, Ctor] of TAGS) {
      if (typeof o[tag] === 'string' && Object.keys(o).length === 1) {
        const bytes = b64decode(o[tag] as string);
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        return new Ctor(buf);
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = decodeValue(x);
    return out;
  }
  return v;
}

export function snapshotToJSON(s: WorldSnapshot): string {
  return JSON.stringify({ format: 'bioforge-world', ...(encodeValue(s) as object) });
}

export function snapshotFromJSON(json: string): WorldSnapshot {
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (raw.format !== 'bioforge-world') throw new Error('Not a BIOFORGE world file');
  const s = decodeValue(raw) as WorldSnapshot;
  if (!s.version || s.version > SAVE_VERSION) throw new Error('Unsupported save version');
  return s;
}

export function saveWorld(w: World): string {
  return snapshotToJSON(snapshot(w));
}

export function loadWorld(json: string): World {
  return restore(snapshotFromJSON(json));
}
