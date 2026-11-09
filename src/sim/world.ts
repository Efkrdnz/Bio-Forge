/**
 * World: owns the environment, cells, bonds, strains and organisms, and
 * orchestrates one simulation tick.
 */
import { NUM_RES, R_CHARGE, R_LITH, R_SORB } from './constants';
import { Rng } from './rng';
import { Environment } from './environment';
import { makeLedger, note, type Ledger } from './ledger';
import { DEFAULT_PARAMS, type SimParams } from './params';
import { Cell, HIST_EVERY, type DeathCause, type Strain } from './cell';
import type { Bond } from './bond';
import { compileDesign, cloneDesign, normalizeDesign, type CellDesign } from './design';
import { SpatialHash, physicsStep } from './physics';
import { metabolize, runCircuit, sense } from './metabolism';
import {
  adhesionActions,
  cleanBonds,
  exchangeAcrossBonds,
  predation,
  recomputeOrganisms,
  updateChannels,
  type OrganismInfo,
} from './multicell';
import { flushPendingBonds, kill, lifecycle } from './lifecycle';
import { mutateDesign } from './evolution';
import { evaluateGoal, polarToWorld, type ExperimentDef, type GoalStatus, type Inoculation } from './experiment';

export type FxKind = 'birth' | 'death' | 'snap' | 'hit' | 'inoculate' | 'mutation';
export interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  hue: number;
  tick: number;
}

export interface PopSample {
  tick: number;
  total: number;
  byRoot: Record<string, number>;
  byStrain: [number, number][];
  sorb: number;
  lith: number;
  murk: number;
  organisms: number;
  energyIn: number;
  energyOut: number;
}

export interface WorldOptions {
  seed?: number;
  gridW?: number;
  gridH?: number;
  params?: Partial<SimParams>;
  fill?: number;
}

const MAX_STRAINS_KEPT = 1500;

export class World {
  tick = 0;
  rng: Rng;
  seed: number;
  params: SimParams;
  env: Environment;
  ledger: Ledger = makeLedger();
  cells: Cell[] = [];
  bonds: Bond[] = [];
  strains = new Map<number, Strain>();
  organisms = new Map<number, OrganismInfo>();
  hash: SpatialHash;
  nextCellId = 1;
  nextBondId = 1;
  nextStrainId = 1;
  nextOrganismId = 1;
  bondsDirty = false;
  pendingBirths: Cell[] = [];
  pendingBonds: [Cell, Cell, number, number][] = [];
  fx: Fx[] = [];
  history: PopSample[] = [];
  historyEvery = 30;
  deaths: Partial<Record<DeathCause, number>> = {};
  births = 0;
  /** Predation kills that fed the predator. */
  feasts = 0;
  tickEnergyIn = 0;
  tickEnergyOut = 0;
  energyRateIn = 0;
  energyRateOut = 0;
  /** Design library the world knows about (root designs by id). */
  designs = new Map<string, CellDesign>();
  experiment: ExperimentDef | null = null;
  goalStatus: Record<string, GoalStatus> = {};
  scheduleIndex = 0;
  /** Messages for the UI (events fired, goals met). */
  log: { tick: number; text: string; kind: 'event' | 'goal' | 'info' }[] = [];

  constructor(opts: WorldOptions = {}) {
    this.seed = opts.seed ?? 1;
    this.rng = new Rng(this.seed);
    this.params = { ...DEFAULT_PARAMS, ...(opts.params ?? {}) };
    this.env = new Environment(opts.gridW ?? 120, opts.gridH ?? 120, this.seed * 31 + 7);
    this.hash = new SpatialHash(this.env.worldW, this.env.worldH, 32);
    this.env.initialize(this.params, this.ledger, opts.fill ?? 0.4);
  }

  // ---------------------------------------------------------------- strains
  registerDesign(d: CellDesign): void {
    this.designs.set(d.id, normalizeDesign(cloneDesign(d)));
  }

  /** Root strain for a design (re-used while the blueprint is unchanged). */
  rootStrain(design: CellDesign): Strain {
    const json = JSON.stringify(normalizeDesign(cloneDesign(design)));
    for (const s of this.strains.values()) {
      if (s.parentId === null && s.rootId === design.id && JSON.stringify(s.design) === json) return s;
    }
    let version = 1;
    for (const s of this.strains.values()) if (s.parentId === null && s.rootId === design.id) version++;
    const d = normalizeDesign(cloneDesign(design));
    const s: Strain = {
      id: this.nextStrainId++,
      name: version > 1 ? `${d.name} v${version}` : d.name,
      design: d,
      compiled: compileDesign(d),
      parentId: null,
      rootId: design.id,
      hue: d.hue,
      depth: 0,
      birthTick: this.tick,
      population: 0,
      peak: 0,
      totalBorn: 0,
      extinctTick: null,
      note: version > 1 ? 'edited blueprint' : 'founder',
    };
    this.strains.set(s.id, s);
    if (!this.designs.has(design.id)) this.registerDesign(design);
    return s;
  }

  mutate(parent: Strain): Strain {
    const { design, note: mnote } = mutateDesign(parent.design, this.rng, {
      strength: this.params.mutationStrength,
      structural: this.params.structuralMutations,
      circuit: this.params.circuitMutations,
    });
    const id = this.nextStrainId++;
    const base = parent.name.split('·')[0];
    design.name = `${base}·${id.toString(36).toUpperCase()}`;
    const s: Strain = {
      id,
      name: design.name,
      design,
      compiled: compileDesign(design),
      parentId: parent.id,
      rootId: parent.rootId,
      hue: design.hue,
      depth: parent.depth + 1,
      birthTick: this.tick,
      population: 0,
      peak: 0,
      totalBorn: 0,
      extinctTick: null,
      note: mnote,
    };
    this.strains.set(id, s);
    return s;
  }

  // ---------------------------------------------------------------- cells
  /**
   * Create a founder cell from nothing (matter enters the dish and is logged).
   */
  spawn(strainOrDesign: Strain | CellDesign, x: number, y: number, angle?: number, tissue?: number): Cell | null {
    if (this.cells.length + this.pendingBirths.length >= this.params.maxPopulation) return null;
    const strain = 'compiled' in strainOrDesign ? strainOrDesign : this.rootStrain(strainOrDesign);
    const cd = strain.compiled;
    if (!this.env.insideDish(x, y, 8)) {
      const dx = x - this.env.cx;
      const dy = y - this.env.cy;
      const d = Math.hypot(dx, dy) || 1;
      x = this.env.cx + (dx / d) * (this.env.R - 20);
      y = this.env.cy + (dy / d) * (this.env.R - 20);
    }
    const mass = cd.buildMass * 1.25;
    const c = new Cell(
      this.nextCellId++,
      strain,
      x,
      y,
      angle ?? this.rng.range(-Math.PI, Math.PI),
      mass,
      tissue ?? cd.design.development.startTissue,
      this.tick,
      this.rng.next() * 6.28,
    );
    c.updateCaps();
    // Starter provisions
    c.buf[R_SORB] = c.cytoCap[R_SORB] * 0.6;
    c.buf[R_LITH] = c.cytoCap[R_LITH] * 0.5;
    c.buf[R_CHARGE] = c.cytoCap[R_CHARGE] * 0.8;
    for (let i = 0; i < cd.n; i++) {
      const o = (i + 1) * NUM_RES;
      c.buf[o + R_CHARGE] = cd.caps[i * NUM_RES + R_CHARGE] * 0.8;
      c.buf[o + R_SORB] = cd.caps[i * NUM_RES + R_SORB] * 0.3;
    }
    const matter = c.matter();
    this.ledger.matterIn += matter;
    note(this.ledger, 'inoculation', matter);
    this.pendingBirths.push(c);
    this.pushFx('inoculate', x, y, strain.hue);
    return c;
  }

  inoculate(design: CellDesign, count: number, x: number, y: number, spread = 60): Cell[] {
    const out: Cell[] = [];
    for (let k = 0; k < count; k++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(this.rng.next()) * spread;
      const c = this.spawn(design, x + Math.cos(a) * r, y + Math.sin(a) * r);
      if (c) out.push(c);
    }
    this.flushBirths();
    return out;
  }

  /** Move freshly spawned cells into the world (and form pending bonds). */
  flushBirths(): void {
    if (!this.pendingBirths.length) return;
    for (const c of this.pendingBirths) {
      this.cells.push(c);
      const s = c.strain;
      s.population++;
      s.totalBorn++;
      if (s.population > s.peak) s.peak = s.population;
      s.extinctTick = null;
      this.births++;
    }
    this.pendingBirths.length = 0;
    flushPendingBonds(this);
  }

  cellById(id: number): Cell | undefined {
    return this.cells.find((c) => c.id === id);
  }

  cull(x: number, y: number, r: number): number {
    let n = 0;
    for (const c of this.cells) {
      if (c.alive && Math.hypot(c.x - x, c.y - y) < r + c.radius * 0.5) {
        kill(this, c, 'culled');
        n++;
      }
    }
    this.purgeDead();
    return n;
  }

  cullWhere(pred: (c: Cell) => boolean): number {
    let n = 0;
    for (const c of this.cells)
      if (c.alive && pred(c)) {
        kill(this, c, 'culled');
        n++;
      }
    this.purgeDead();
    return n;
  }

  purgeDead(): void {
    let any = false;
    for (const c of this.cells) if (!c.alive) any = true;
    if (!any) return;
    const keep: Cell[] = [];
    for (const c of this.cells) {
      if (c.alive) keep.push(c);
      else {
        const s = c.strain;
        s.population--;
        if (s.population <= 0) {
          s.population = 0;
          s.extinctTick = this.tick;
        }
      }
    }
    this.cells = keep;
    cleanBonds(this);
    recomputeOrganisms(this);
    this.bondsDirty = false;
  }

  pushFx(kind: FxKind, x: number, y: number, hue: number): void {
    this.fx.push({ kind, x, y, hue, tick: this.tick });
    if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 300);
  }

  /** Brush a field, keeping the ledger exact. */
  brush(field: 'sorb' | 'lith' | 'murk' | 'heat', x: number, y: number, r: number, amount: number): void {
    const cap = field === 'sorb' ? this.params.maxSorb * 1.6 : field === 'lith' ? this.params.maxLith * 1.6 : 30;
    const net = this.env.brush(field, x, y, r, amount, cap);
    if (net > 0) {
      this.ledger.matterIn += net;
      note(this.ledger, 'brush', net);
    } else if (net < 0) {
      this.ledger.matterOut -= net;
      note(this.ledger, 'brushRemove', -net);
    }
  }

  // ---------------------------------------------------------------- matter audit
  totalMatter(): number {
    let t = this.env.totalMatter();
    for (const c of this.cells) t += c.matter();
    for (const c of this.pendingBirths) t += c.matter();
    return t;
  }

  /** Difference between actual matter and what the ledger says (should be ~0). */
  matterError(): number {
    return this.totalMatter() - (this.ledger.matterIn - this.ledger.matterOut);
  }

  // ---------------------------------------------------------------- experiment
  loadExperiment(exp: ExperimentDef): void {
    this.experiment = exp;
    this.goalStatus = {};
    this.scheduleIndex = 0;
    for (const d of exp.designs) this.registerDesign(d);
    if (exp.lightSources) this.env.lightSources = exp.lightSources.map((s) => ({ ...s }));
    this.env.updatePatterns(this.params, true);
    for (const inoc of exp.inoculations) this.applyInoculation(inoc);
  }

  applyInoculation(inoc: Inoculation): void {
    const d = this.designs.get(inoc.designId);
    if (!d) return;
    const [x, y] = polarToWorld(this, inoc.angle ?? 0, inoc.dist ?? 0);
    this.inoculate(d, inoc.count, x, y, (inoc.spread ?? 0.15) * this.env.R);
  }

  private runSchedule(): void {
    const exp = this.experiment;
    if (!exp) return;
    const sched = exp.schedule;
    while (this.scheduleIndex < sched.length && sched[this.scheduleIndex].tick <= this.tick) {
      const ev = sched[this.scheduleIndex++];
      if (ev.kind === 'set') {
        (this.params as unknown as Record<string, unknown>)[ev.key] = ev.value;
      } else if (ev.kind === 'pulse') {
        const [x, y] = polarToWorld(this, ev.angle, ev.dist);
        this.brush(ev.field, x, y, ev.r * this.env.R, ev.amount);
      } else if (ev.kind === 'inoculate') {
        this.applyInoculation(ev);
      }
      this.log.push({ tick: this.tick, text: ev.label ?? `${ev.kind} event`, kind: 'event' });
    }
  }

  evaluateGoals(): void {
    const exp = this.experiment;
    if (!exp) return;
    for (const g of exp.goals) {
      const prev = this.goalStatus[g.id];
      const st = evaluateGoal(this, g, prev);
      if (st.done && !prev?.done) this.log.push({ tick: this.tick, text: `Goal complete: ${g.label}`, kind: 'goal' });
      this.goalStatus[g.id] = st;
    }
  }

  // ---------------------------------------------------------------- tick
  step(): void {
    this.tickEnergyIn = 0;
    this.tickEnergyOut = 0;
    this.runSchedule();
    this.env.step(this.params, this.tick, this.ledger);
    const cells = this.cells;
    this.hash.rebuild(cells);

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      c.age++;
      sense(this, c);
      runCircuit(this, c);
      updateChannels(c);
      metabolize(this, c);
    }
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      predation(this, c);
      adhesionActions(this, c);
    }
    exchangeAcrossBonds(this);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.alive) lifecycle(this, c);
    }
    this.purgeDead();
    this.flushBirths();
    this.hash.rebuild(this.cells);
    physicsStep(this);
    if (this.bondsDirty) {
      cleanBonds(this);
      recomputeOrganisms(this);
      this.bondsDirty = false;
    } else if (this.tick % 30 === 0) {
      recomputeOrganisms(this);
    }

    if (this.tick % HIST_EVERY === 0) for (const c of this.cells) c.record();
    this.energyRateIn += (this.tickEnergyIn - this.energyRateIn) * 0.05;
    this.energyRateOut += (this.tickEnergyOut - this.energyRateOut) * 0.05;
    if (this.tick % this.historyEvery === 0) this.sample();
    if (this.tick % 15 === 0) this.evaluateGoals();
    if (this.tick % 600 === 0) this.pruneStrains();
    this.tick++;
  }

  sample(): void {
    const byRoot: Record<string, number> = {};
    const byStrainMap = new Map<number, number>();
    for (const c of this.cells) {
      byRoot[c.strain.rootId] = (byRoot[c.strain.rootId] ?? 0) + 1;
      byStrainMap.set(c.strain.id, (byStrainMap.get(c.strain.id) ?? 0) + 1);
    }
    const byStrain = [...byStrainMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const t = this.env.totals();
    this.history.push({
      tick: this.tick,
      total: this.cells.length,
      byRoot,
      byStrain,
      sorb: t.sorb,
      lith: t.lith,
      murk: t.murk,
      organisms: this.organisms.size,
      energyIn: this.energyRateIn,
      energyOut: this.energyRateOut,
    });
    if (this.history.length > 1200) {
      // Downsample older half to keep long runs bounded
      const keep = this.history.filter((_, i) => i % 2 === 0 || i > 800);
      this.history = keep;
      this.historyEvery = Math.min(240, this.historyEvery);
    }
  }

  /** Forget old extinct strains that have no living descendants. */
  pruneStrains(): void {
    if (this.strains.size <= MAX_STRAINS_KEPT) return;
    const alive = new Set<number>();
    for (const s of this.strains.values()) {
      if (s.population <= 0) continue;
      let p: Strain | undefined = s;
      while (p && !alive.has(p.id)) {
        alive.add(p.id);
        p = p.parentId !== null ? this.strains.get(p.parentId) : undefined;
      }
    }
    const extinct = [...this.strains.values()]
      .filter((s) => !alive.has(s.id) && s.parentId !== null)
      .sort((a, b) => a.peak - b.peak || a.id - b.id);
    let excess = this.strains.size - MAX_STRAINS_KEPT;
    for (const s of extinct) {
      if (excess-- <= 0) break;
      this.strains.delete(s.id);
    }
  }

  stats() {
    let mass = 0;
    let charge = 0;
    for (const c of this.cells) {
      mass += c.mass;
      charge += c.total(R_CHARGE);
    }
    const t = this.env.totals();
    let living = 0;
    for (const s of this.strains.values()) if (s.population > 0) living++;
    return {
      tick: this.tick,
      cells: this.cells.length,
      organisms: this.organisms.size,
      strains: living,
      biomass: mass,
      charge,
      sorb: t.sorb,
      lith: t.lith,
      murk: t.murk,
      heat: t.heat,
      bonds: this.bonds.length,
      energyIn: this.energyRateIn,
      energyOut: this.energyRateOut,
      lithCells: this.cells.reduce((a, c) => a + c.total(R_LITH), 0),
    };
  }
}
