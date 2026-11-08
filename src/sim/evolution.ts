/**
 * Controlled mutation of cell designs. Each operator returns a short,
 * human-readable note for the lineage view.
 */
import { ALL_TISSUES, MAX_COMPONENTS, NUM_TISSUES, TAU } from './constants';
import { COMPONENT_DEFS, COMPONENT_TYPES, type ComponentType } from './components';
import { NODE_DEFS, defaultNodeParams } from './circuit';
import { cloneDesign, makeComponent, nextNodeId, normalizeDesign, type CellDesign } from './design';
import { MEMBRANE_TYPES, MEMBRANE_DEFS } from './membranes';
import type { Rng } from './rng';

export interface MutationOptions {
  strength: number;
  structural: boolean;
  circuit: boolean;
}

type Op = { w: number; fn: (d: CellDesign, rng: Rng, o: MutationOptions) => string | null };

const fmt = (v: number) => (Math.abs(v) >= 10 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(3));

function roundStep(v: number, step: number) {
  return Math.round(v / step) * step;
}

const MUTABLE_ADD: ComponentType[] = COMPONENT_TYPES.filter((t) => t !== 'core');

const ops: Record<string, Op> = {
  param: {
    w: 5,
    fn: (d, rng, o) => {
      const cands = d.components.filter((c) => COMPONENT_DEFS[c.type].params.length > 0);
      if (!cands.length) return null;
      const c = rng.pick(cands);
      const def = COMPONENT_DEFS[c.type];
      const pd = rng.pick(def.params);
      const old = c.params[pd.key] ?? pd.default;
      let v: number;
      if (pd.options) {
        if (!rng.chance(0.3)) return null;
        v = rng.int(0, pd.options.length);
        if (v === old) return null;
        c.params[pd.key] = v;
        return `${def.name}: ${pd.label} → ${pd.options[v]}`;
      }
      v = old + rng.gauss() * (pd.max - pd.min) * 0.12 * o.strength;
      v = Math.max(pd.min, Math.min(pd.max, roundStep(v, pd.step)));
      if (Math.abs(v - old) < 1e-9) return null;
      c.params[pd.key] = v;
      return `${def.name}: ${pd.label} ${fmt(old)}→${fmt(v)}`;
    },
  },
  move: {
    w: 2,
    fn: (d, rng, o) => {
      if (!d.components.length) return null;
      const c = rng.pick(d.components);
      c.angle = (((c.angle + rng.gauss() * 0.45 * o.strength) % TAU) + TAU) % TAU;
      if (COMPONENT_DEFS[c.type].placement === 'interior')
        c.dist = Math.max(0, Math.min(0.75, c.dist + rng.gauss() * 0.12 * o.strength));
      return `${COMPONENT_DEFS[c.type].name} shifted`;
    },
  },
  membrane: {
    w: 1,
    fn: (d, rng, o) => {
      if (rng.chance(0.15)) {
        const t = rng.pick(MEMBRANE_TYPES);
        if (t === d.membrane.type) return null;
        d.membrane.type = t;
        return `membrane → ${MEMBRANE_DEFS[t].name}`;
      }
      const old = d.membrane.thickness;
      d.membrane.thickness = Math.max(0.5, Math.min(2, roundStep(old + rng.gauss() * 0.2 * o.strength, 0.05)));
      return `membrane ${fmt(old)}→${fmt(d.membrane.thickness)}`;
    },
  },
  add: {
    w: 1.2,
    fn: (d, rng, o) => {
      if (!o.structural || d.components.length >= MAX_COMPONENTS) return null;
      const t = rng.pick(MUTABLE_ADD);
      makeComponent(d, t, rng.range(0, 360), rng.range(0.15, 0.7));
      return `+${COMPONENT_DEFS[t].name}`;
    },
  },
  duplicate: {
    w: 0.7,
    fn: (d, rng, o) => {
      if (!o.structural || d.components.length >= MAX_COMPONENTS) return null;
      const src = rng.pick(d.components);
      if (src.type === 'core') return null;
      const c = makeComponent(d, src.type, ((src.angle * 180) / Math.PI + rng.range(-40, 40)) % 360, src.dist, { ...src.params }, src.tissues);
      c.dist = src.dist;
      return `×2 ${COMPONENT_DEFS[src.type].name}`;
    },
  },
  remove: {
    w: 1,
    fn: (d, rng, o) => {
      if (!o.structural) return null;
      const cands = d.components.filter((c) => c.type !== 'core');
      if (cands.length < 2) return null;
      const c = rng.pick(cands);
      d.components = d.components.filter((x) => x !== c);
      d.conduits = d.conduits.filter((k) => k.a !== c.uid && k.b !== c.uid);
      const dead = new Set(d.circuit.nodes.filter((n) => n.ref === c.uid).map((n) => n.id));
      d.circuit.nodes = d.circuit.nodes.filter((n) => !dead.has(n.id));
      d.circuit.wires = d.circuit.wires.filter((w) => !dead.has(w.from) && !dead.has(w.to));
      return `−${COMPONENT_DEFS[c.type].name}`;
    },
  },
  conduit: {
    w: 0.6,
    fn: (d, rng, o) => {
      if (!o.structural || d.components.length < 2) return null;
      if (d.conduits.length && rng.chance(0.4)) {
        d.conduits.splice(rng.int(0, d.conduits.length), 1);
        return '−conduit';
      }
      const a = rng.pick(d.components);
      const b = rng.pick(d.components);
      if (a === b || d.conduits.some((k) => (k.a === a.uid && k.b === b.uid) || (k.a === b.uid && k.b === a.uid))) return null;
      d.conduits.push({ a: a.uid, b: b.uid });
      return `+conduit ${COMPONENT_DEFS[a.type].glyph}–${COMPONENT_DEFS[b.type].glyph}`;
    },
  },
  tissue: {
    w: 0.4,
    fn: (d, rng) => {
      if (!d.components.length) return null;
      const c = rng.pick(d.components);
      if (c.type === 'core') return null;
      const bit = 1 << rng.int(0, NUM_TISSUES);
      const m = c.tissues ^ bit;
      if ((m & ALL_TISSUES) === 0) return null;
      c.tissues = m;
      return `${COMPONENT_DEFS[c.type].name} expression changed`;
    },
  },
  development: {
    w: 0.6,
    fn: (d, rng, o) => {
      const dev = d.development;
      const r = rng.next();
      if (r < 0.4) {
        const old = dev.divisionAngle;
        dev.divisionAngle = Math.round(old + rng.gauss() * 25 * o.strength);
        return `division axis ${old}°→${dev.divisionAngle}°`;
      }
      if (r < 0.75) {
        if (dev.mode !== 'bonded') return null;
        const old = dev.maxCells;
        dev.maxCells = Math.max(1, Math.min(64, old + (rng.chance(0.5) ? 1 : -1)));
        return `organism size ${old}→${dev.maxCells}`;
      }
      if (r < 0.85 && o.structural) {
        dev.mode = dev.mode === 'bonded' ? 'separate' : 'bonded';
        if (dev.mode === 'bonded' && dev.maxCells < 2) dev.maxCells = 2;
        return `development → ${dev.mode}`;
      }
      const old = dev.rotateEach;
      dev.rotateEach = Math.round(old + rng.gauss() * 30 * o.strength);
      return `division rotation ${old}°→${dev.rotateEach}°`;
    },
  },
  nodeParam: {
    w: 1.5,
    fn: (d, rng, o) => {
      if (!o.circuit) return null;
      const cands = d.circuit.nodes.filter((n) => NODE_DEFS[n.kind].params.some((p) => !p.options));
      if (!cands.length) return null;
      const n = rng.pick(cands);
      const pd = rng.pick(NODE_DEFS[n.kind].params.filter((p) => !p.options));
      const old = n.params[pd.key] ?? pd.default;
      const v = Math.max(pd.min, Math.min(pd.max, roundStep(old + rng.gauss() * (pd.max - pd.min) * 0.1 * o.strength, pd.step)));
      if (v === old) return null;
      n.params[pd.key] = v;
      return `${NODE_DEFS[n.kind].label} ${pd.label} ${fmt(old)}→${fmt(v)}`;
    },
  },
  rewire: {
    w: 1,
    fn: (d, rng, o) => {
      if (!o.circuit || !d.circuit.wires.length) return null;
      const wire = rng.pick(d.circuit.wires);
      const srcs = d.circuit.nodes.filter((n) => NODE_DEFS[n.kind].hasOutput && n.id !== wire.to);
      if (!srcs.length) return null;
      const s = rng.pick(srcs);
      if (s.id === wire.from) return null;
      wire.from = s.id;
      return `rewired → ${NODE_DEFS[s.kind].label}`;
    },
  },
  wire: {
    w: 0.6,
    fn: (d, rng, o) => {
      if (!o.circuit) return null;
      if (d.circuit.wires.length && rng.chance(0.45)) {
        d.circuit.wires.splice(rng.int(0, d.circuit.wires.length), 1);
        return '−wire';
      }
      // Add a sensor → actuator link (creating nodes as needed)
      const sensors = d.components.filter((c) => COMPONENT_DEFS[c.type].outputs.length);
      const acts = d.components.filter((c) => COMPONENT_DEFS[c.type].actuated);
      if (!sensors.length || !acts.length) return null;
      const s = rng.pick(sensors);
      const a = rng.pick(acts);
      let sn = d.circuit.nodes.find((n) => n.kind === 'sensor' && n.ref === s.uid);
      if (!sn) {
        sn = { id: nextNodeId(d), kind: 'sensor', x: 40, y: 40 + d.circuit.nodes.length * 30, params: {}, ref: s.uid, port: rng.pick(COMPONENT_DEFS[s.type].outputs).key };
        d.circuit.nodes.push(sn);
      }
      let an = d.circuit.nodes.find((n) => n.kind === 'actuator' && n.ref === a.uid);
      if (!an) {
        an = { id: nextNodeId(d), kind: 'actuator', x: 420, y: 40 + d.circuit.nodes.length * 30, params: {}, ref: a.uid };
        d.circuit.nodes.push(an);
      }
      let from = sn.id;
      if (rng.chance(0.5)) {
        const kind = rng.pick(['not', 'threshold', 'gain'] as const);
        const g = { id: nextNodeId(d), kind, x: 230, y: 40 + d.circuit.nodes.length * 30, params: defaultNodeParams(kind) };
        d.circuit.nodes.push(g);
        d.circuit.wires.push({ from: sn.id, to: g.id, slot: 0 });
        from = g.id;
      }
      d.circuit.wires.push({ from, to: an.id, slot: 0 });
      return `+circuit ${COMPONENT_DEFS[s.type].glyph}→${COMPONENT_DEFS[a.type].glyph}`;
    },
  },
};

const OP_LIST = Object.values(ops);

export function mutateDesign(src: CellDesign, rng: Rng, o: MutationOptions): { design: CellDesign; note: string } {
  const d = cloneDesign(src);
  const notes: string[] = [];
  const count = 1 + (rng.chance(0.25 * o.strength) ? 1 : 0) + (rng.chance(0.06 * o.strength) ? 1 : 0);
  let guard = 0;
  while (notes.length < count && guard++ < 30) {
    let total = 0;
    for (const op of OP_LIST) total += op.w;
    let r = rng.next() * total;
    let chosen = OP_LIST[0];
    for (const op of OP_LIST) {
      r -= op.w;
      if (r <= 0) {
        chosen = op;
        break;
      }
    }
    const note = chosen.fn(d, rng, o);
    if (note) notes.push(note);
  }
  d.hue = (((d.hue + rng.gauss() * 7) % 360) + 360) % 360;
  normalizeDesign(d);
  return { design: d, note: notes.join('; ') || 'silent' };
}

/** Simple structural diff of two designs (for the lineage inspector). */
export function diffDesigns(a: CellDesign, b: CellDesign): string[] {
  const out: string[] = [];
  const ma = new Map(a.components.map((c) => [c.uid, c]));
  const mb = new Map(b.components.map((c) => [c.uid, c]));
  for (const [uid, c] of mb) if (!ma.has(uid)) out.push(`+ ${COMPONENT_DEFS[c.type].name}`);
  for (const [uid, c] of ma) if (!mb.has(uid)) out.push(`− ${COMPONENT_DEFS[c.type].name}`);
  for (const [uid, cb] of mb) {
    const ca = ma.get(uid);
    if (!ca) continue;
    for (const pd of COMPONENT_DEFS[cb.type].params) {
      const va = ca.params[pd.key];
      const vb = cb.params[pd.key];
      if (va !== vb) out.push(`~ ${COMPONENT_DEFS[cb.type].name} ${pd.label}: ${pd.options ? pd.options[va] : fmt(va)} → ${pd.options ? pd.options[vb] : fmt(vb)}`);
    }
  }
  if (a.membrane.type !== b.membrane.type) out.push(`~ membrane ${MEMBRANE_DEFS[a.membrane.type].name} → ${MEMBRANE_DEFS[b.membrane.type].name}`);
  if (a.membrane.thickness !== b.membrane.thickness) out.push(`~ thickness ${fmt(a.membrane.thickness)} → ${fmt(b.membrane.thickness)}`);
  if (a.circuit.wires.length !== b.circuit.wires.length) out.push(`~ circuit wires ${a.circuit.wires.length} → ${b.circuit.wires.length}`);
  if (a.conduits.length !== b.conduits.length) out.push(`~ conduits ${a.conduits.length} → ${b.conduits.length}`);
  const da = a.development;
  const db = b.development;
  if (da.mode !== db.mode || da.maxCells !== db.maxCells || da.divisionAngle !== db.divisionAngle || da.rotateEach !== db.rotateEach)
    out.push(`~ development ${da.mode}/${da.maxCells}/${da.divisionAngle}° → ${db.mode}/${db.maxCells}/${db.divisionAngle}°`);
  return out;
}
