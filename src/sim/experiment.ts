/**
 * Experiments: editable setups (environment, inoculations, scheduled events)
 * with live goals. Tutorials are experiments whose goals form a checklist.
 */
import type { ComponentType } from './components';
import type { CellDesign } from './design';
import type { LightSource } from './environment';
import type { SimParams } from './params';
import type { World } from './world';

export interface Inoculation {
  designId: string;
  count: number;
  /** Position as a fraction of dish radius from the centre (polar). */
  angle?: number;
  dist?: number;
  spread?: number;
}

export type ScheduleEvent =
  | { tick: number; kind: 'set'; key: keyof SimParams; value: number | string | boolean; label?: string }
  | { tick: number; kind: 'pulse'; field: 'sorb' | 'lith' | 'murk' | 'heat'; angle: number; dist: number; r: number; amount: number; label?: string }
  | ({ tick: number; kind: 'inoculate'; label?: string } & Inoculation);

export type GoalKind =
  | 'population'
  | 'survive'
  | 'organism'
  | 'diversity'
  | 'extinct'
  | 'hasComponent'
  | 'tissues'
  | 'depth'
  | 'region'
  | 'netEnergy';

export interface Goal {
  id: string;
  kind: GoalKind;
  label: string;
  hint?: string;
  designId?: string;
  n?: number;
  ticks?: number;
  component?: ComponentType;
  angle?: number;
  dist?: number;
  r?: number;
}

export interface ExperimentDef {
  id: string;
  name: string;
  summary: string;
  category: 'tutorial' | 'experiment' | 'sandbox';
  seed: number;
  params: Partial<SimParams>;
  lightSources?: LightSource[];
  inoculations: Inoculation[];
  schedule: ScheduleEvent[];
  goals: Goal[];
  /** Designs embedded so the experiment is self-contained. */
  designs: CellDesign[];
  /** Design to open in the Forge when the experiment starts (tutorials). */
  focusDesignId?: string;
  fill?: number;
}

export interface GoalStatus {
  done: boolean;
  progress: number;
  text: string;
  doneTick: number | null;
}

export function polarToWorld(w: World, angle = 0, dist = 0): [number, number] {
  const a = (angle * Math.PI) / 180;
  return [w.env.cx + Math.cos(a) * dist * w.env.R, w.env.cy + Math.sin(a) * dist * w.env.R];
}

function lineagePop(w: World, designId?: string): number {
  let n = 0;
  for (const c of w.cells) if (!designId || c.strain.rootId === designId) n++;
  return n;
}

export function evaluateGoal(w: World, g: Goal, prev?: GoalStatus): GoalStatus {
  if (prev?.done) return prev;
  let progress = 0;
  let text = '';
  switch (g.kind) {
    case 'population': {
      const n = lineagePop(w, g.designId);
      progress = n / (g.n ?? 1);
      text = `${n} / ${g.n}`;
      break;
    }
    case 'survive': {
      const n = lineagePop(w, g.designId);
      const t = g.ticks ?? 1000;
      progress = n > 0 ? w.tick / t : 0;
      text = n > 0 ? `${Math.min(w.tick, t)} / ${t} ticks` : 'extinct';
      break;
    }
    case 'organism': {
      let best = 0;
      for (const o of w.organisms.values()) if (!g.designId || o.rootId === g.designId) best = Math.max(best, o.size);
      if (best === 0 && lineagePop(w, g.designId) > 0) best = 1;
      progress = best / (g.n ?? 2);
      text = `largest ${best} / ${g.n} cells`;
      break;
    }
    case 'diversity': {
      let n = 0;
      for (const s of w.strains.values()) if (s.population > 0 && (!g.designId || s.rootId === g.designId)) n++;
      progress = n / (g.n ?? 2);
      text = `${n} / ${g.n} living strains`;
      break;
    }
    case 'extinct': {
      const n = lineagePop(w, g.designId);
      progress = n === 0 && w.tick > 30 ? 1 : 0;
      text = n === 0 ? 'gone' : `${n} remain`;
      break;
    }
    case 'hasComponent': {
      let best = 0;
      for (const s of w.strains.values()) {
        if (s.population <= 0) continue;
        if (g.designId && s.rootId !== g.designId) continue;
        best = Math.max(best, s.design.components.filter((c) => c.type === g.component).length);
      }
      progress = best / (g.n ?? 1);
      text = `${best} / ${g.n ?? 1} in a living design`;
      break;
    }
    case 'tissues': {
      let best = 0;
      for (const o of w.organisms.values()) {
        if (g.designId && o.rootId !== g.designId) continue;
        let k = 0;
        for (let t = o.tissues; t; t &= t - 1) k++;
        best = Math.max(best, k);
      }
      progress = best / (g.n ?? 2);
      text = `${best} / ${g.n} tissues in one organism`;
      break;
    }
    case 'depth': {
      let best = 0;
      for (const s of w.strains.values()) if (s.population > 0 && (!g.designId || s.rootId === g.designId)) best = Math.max(best, s.depth);
      progress = best / (g.n ?? 3);
      text = `${best} / ${g.n} mutations deep`;
      break;
    }
    case 'region': {
      const [x, y] = polarToWorld(w, g.angle, g.dist);
      const r = (g.r ?? 0.2) * w.env.R;
      let n = 0;
      for (const c of w.cells) if ((!g.designId || c.strain.rootId === g.designId) && Math.hypot(c.x - x, c.y - y) < r) n++;
      progress = n / (g.n ?? 1);
      text = `${n} / ${g.n} in zone`;
      break;
    }
    case 'netEnergy': {
      let best = -Infinity;
      for (const c of w.cells) {
        if (g.designId && c.strain.rootId !== g.designId) continue;
        let net = 0;
        for (let i = 0; i < c.eGen.length; i++) net += c.eGen[i] - c.eUse[i];
        best = Math.max(best, net);
      }
      const target = (g.n ?? 10) / 1000;
      progress = best > -Infinity ? best / target : 0;
      text = best > -Infinity ? `best ${(best * 1000).toFixed(1)} / ${g.n} mC/tick` : 'no cells';
      break;
    }
  }
  const done = progress >= 1;
  return { done, progress: Math.max(0, Math.min(1, progress)), text, doneTick: done ? w.tick : null };
}
