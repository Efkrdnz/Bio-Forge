/**
 * Engine: owns the live World, runs the simulation loop with a per-frame time
 * budget, keeps timeline snapshots and the persistent design library.
 * React reads it through a lightweight subscription (see useEngine).
 */
import { World } from '../sim/world';
import { restore, snapshot, snapshotFromJSON, snapshotToJSON, type WorldSnapshot } from '../sim/serialize';
import type { ExperimentDef } from '../sim/experiment';
import { allPresets } from '../sim/presets/experiments';
import { templateDesigns } from '../sim/presets/designs';
import { cloneDesign, normalizeDesign, type CellDesign } from '../sim/design';

export const TICKS_PER_SECOND = 30;
const LIB_KEY = 'bioforge.library.v1';
const SLOT_KEY = 'bioforge.slots.v1';
const EXP_KEY = 'bioforge.experiments.v1';

export interface TimelineEntry {
  tick: number;
  snap: WorldSnapshot;
  label?: string;
  bookmark?: boolean;
}

export interface SaveSlot {
  id: string;
  name: string;
  savedAt: number;
  tick: number;
  cells: number;
  size: number;
}

type Listener = () => void;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, v: string): boolean {
  try {
    localStorage.setItem(key, v);
    return true;
  } catch {
    return false;
  }
}

export class Engine {
  world: World;
  running = true;
  speed = 1;
  private acc = 0;
  timeline: TimelineEntry[] = [];
  snapshotEvery = 300;
  maxSnapshots = 60;
  /** Effective simulated ticks per second (measured). */
  tps = 0;
  stepMs = 0;
  private tpsAcc = 0;
  private tpsTime = 0;
  private listeners = new Set<Listener>();
  version = 0;
  /** User design library (templates are always available separately). */
  library: CellDesign[] = [];
  userExperiments: ExperimentDef[] = [];
  currentExperiment: ExperimentDef | null = null;
  /** Monotonic counter bumped when the world object is replaced. */
  worldEpoch = 0;

  constructor() {
    this.library = this.loadLibrary();
    this.userExperiments = this.loadUserExperiments();
    const first = allPresets().find((e) => e.id === 'exp-open')!;
    this.world = this.makeWorld(first);
    this.currentExperiment = first;
    this.snapshotNow('start');
  }

  // ----------------------------------------------------------- subscription
  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify() {
    this.version++;
    for (const l of this.listeners) l();
  }

  // ----------------------------------------------------------- worlds
  makeWorld(exp: ExperimentDef): World {
    const w = new World({ seed: exp.seed, params: exp.params, fill: exp.fill });
    for (const d of templateDesigns()) w.registerDesign(d);
    for (const d of this.library) w.registerDesign(d);
    w.loadExperiment(exp);
    return w;
  }

  startExperiment(exp: ExperimentDef) {
    this.currentExperiment = exp;
    this.world = this.makeWorld(exp);
    this.timeline = [];
    this.worldEpoch++;
    this.snapshotNow('start');
    this.running = true;
    this.notify();
  }

  replaceWorld(w: World) {
    this.world = w;
    this.currentExperiment = w.experiment;
    this.worldEpoch++;
    this.notify();
  }

  // ----------------------------------------------------------- loop
  /** Advance simulation for a frame of `dt` seconds. */
  frame(dt: number) {
    if (!this.running) return;
    this.acc += Math.min(dt, 0.1) * TICKS_PER_SECOND * this.speed;
    const budget = 14; // ms per frame for simulation
    const t0 = performance.now();
    let steps = 0;
    while (this.acc >= 1) {
      this.stepOnce();
      this.acc -= 1;
      steps++;
      if (performance.now() - t0 > budget) {
        this.acc = Math.min(this.acc, 2);
        break;
      }
    }
    const el = performance.now() - t0;
    if (steps > 0) this.stepMs = this.stepMs * 0.9 + (el / steps) * 0.1;
    this.tpsAcc += steps;
    this.tpsTime += dt;
    if (this.tpsTime > 0.5) {
      this.tps = this.tpsAcc / this.tpsTime;
      this.tpsAcc = 0;
      this.tpsTime = 0;
    }
  }

  stepOnce() {
    this.world.step();
    if (this.world.tick % this.snapshotEvery === 0) this.snapshotNow();
  }

  step(n = 1) {
    for (let i = 0; i < n; i++) this.stepOnce();
    this.notify();
  }

  // ----------------------------------------------------------- timeline
  snapshotNow(label?: string, bookmark = false) {
    const t = this.world.tick;
    // Keep timeline monotonic: drop entries "in the future" after a rewind
    this.timeline = this.timeline.filter((e) => e.tick < t || (e.tick === t && false));
    this.timeline.push({ tick: t, snap: snapshot(this.world), label, bookmark });
    // Thin out non-bookmarked snapshots when over budget
    while (this.timeline.length > this.maxSnapshots) {
      const idx = this.timeline.findIndex((e, i) => i > 0 && !e.bookmark && i % 2 === 1);
      this.timeline.splice(idx > 0 ? idx : 1, 1);
    }
  }

  rewindTo(entry: TimelineEntry) {
    const w = restore(entry.snap);
    this.world = w;
    this.worldEpoch++;
    this.timeline = this.timeline.filter((e) => e.tick <= entry.tick);
    this.notify();
  }

  bookmark(label: string) {
    this.snapshotNow(label, true);
    this.notify();
  }

  // ----------------------------------------------------------- design library
  loadLibrary(): CellDesign[] {
    const raw = safeGet(LIB_KEY);
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw) as CellDesign[];
      return arr.map((d) => normalizeDesign(d));
    } catch {
      return [];
    }
  }

  saveLibrary() {
    safeSet(LIB_KEY, JSON.stringify(this.library));
  }

  upsertDesign(d: CellDesign) {
    const copy = normalizeDesign(cloneDesign(d));
    const i = this.library.findIndex((x) => x.id === copy.id);
    if (i >= 0) this.library[i] = copy;
    else this.library.push(copy);
    this.saveLibrary();
    this.world.registerDesign(copy);
    this.notify();
  }

  deleteDesign(id: string) {
    this.library = this.library.filter((d) => d.id !== id);
    this.saveLibrary();
    this.notify();
  }

  allDesigns(): CellDesign[] {
    const out = new Map<string, CellDesign>();
    for (const d of templateDesigns()) out.set(d.id, d);
    for (const d of this.world.designs.values()) out.set(d.id, d);
    for (const d of this.library) out.set(d.id, d);
    return [...out.values()];
  }

  // ----------------------------------------------------------- experiments
  loadUserExperiments(): ExperimentDef[] {
    const raw = safeGet(EXP_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as ExperimentDef[];
    } catch {
      return [];
    }
  }

  saveUserExperiment(e: ExperimentDef) {
    const i = this.userExperiments.findIndex((x) => x.id === e.id);
    if (i >= 0) this.userExperiments[i] = e;
    else this.userExperiments.push(e);
    safeSet(EXP_KEY, JSON.stringify(this.userExperiments));
    this.notify();
  }

  deleteUserExperiment(id: string) {
    this.userExperiments = this.userExperiments.filter((e) => e.id !== id);
    safeSet(EXP_KEY, JSON.stringify(this.userExperiments));
    this.notify();
  }

  // ----------------------------------------------------------- save slots
  slots(): SaveSlot[] {
    const raw = safeGet(SLOT_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as SaveSlot[];
    } catch {
      return [];
    }
  }

  saveToSlot(name: string): { ok: boolean; message: string } {
    const json = snapshotToJSON(snapshot(this.world));
    const id = `slot-${Date.now().toString(36)}`;
    if (!safeSet(`bioforge.slot.${id}`, json)) return { ok: false, message: 'Browser storage is full or unavailable. Use Export instead.' };
    const slots = this.slots();
    slots.unshift({ id, name, savedAt: Date.now(), tick: this.world.tick, cells: this.world.cells.length, size: json.length });
    safeSet(SLOT_KEY, JSON.stringify(slots));
    this.notify();
    return { ok: true, message: `Saved “${name}”` };
  }

  loadSlot(id: string): { ok: boolean; message: string } {
    const json = safeGet(`bioforge.slot.${id}`);
    if (!json) return { ok: false, message: 'Save not found' };
    return this.importJSON(json);
  }

  deleteSlot(id: string) {
    try {
      localStorage.removeItem(`bioforge.slot.${id}`);
    } catch {
      /* ignore */
    }
    safeSet(SLOT_KEY, JSON.stringify(this.slots().filter((s) => s.id !== id)));
    this.notify();
  }

  exportJSON(): string {
    return snapshotToJSON(snapshot(this.world));
  }

  importJSON(json: string): { ok: boolean; message: string } {
    try {
      const snap = snapshotFromJSON(json);
      const w = restore(snap);
      this.world = w;
      this.currentExperiment = w.experiment;
      this.worldEpoch++;
      this.timeline = [];
      this.snapshotNow('loaded');
      this.notify();
      return { ok: true, message: `Loaded world at tick ${w.tick}` };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not load file' };
    }
  }
}

export const engine = new Engine();
if (typeof window !== 'undefined') (window as unknown as { bioforge: Engine }).bioforge = engine;
