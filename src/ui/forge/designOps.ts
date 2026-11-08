/**
 * Immutable-style edit helpers for the design being forged.
 */
import { useUI } from '../store';
import { cloneDesign, makeComponent, nextNodeId, normalizeDesign, type CellDesign } from '../../sim/design';
import { COMPONENT_DEFS, type ComponentType } from '../../sim/components';
import { defaultNodeParams, type NodeKind } from '../../sim/circuit';
import { MAX_COMPONENTS, TAU } from '../../sim/constants';

export function edit(fn: (d: CellDesign) => void) {
  const s = useUI.getState();
  const d = cloneDesign(s.forgeDesign);
  fn(d);
  normalizeDesign(d);
  s.set({ forgeDesign: d, forgeDirty: true });
}

export function addComponentAt(type: ComponentType, angle: number, dist: number): number | null {
  const s = useUI.getState();
  const d0 = s.forgeDesign;
  if (d0.components.length >= MAX_COMPONENTS) {
    s.toast(`A cell can hold at most ${MAX_COMPONENTS} components`, 'warn');
    return null;
  }
  if (type === 'core' && d0.components.some((c) => c.type === 'core')) {
    s.toast('Only one Codex Core per cell', 'warn');
    return null;
  }
  let uid: number | null = null;
  edit((d) => {
    const c = makeComponent(d, type, (angle * 180) / Math.PI, dist);
    if (COMPONENT_DEFS[type].placement !== 'membrane') c.dist = Math.max(0, Math.min(0.75, dist));
    // Express in the tissue currently being viewed and all others by default
    uid = c.uid;
  });
  if (uid !== null) useUI.getState().set({ forgeSelected: uid });
  return uid;
}

/** Find a free spot for a new component of this placement type. */
export function freeSpot(d: CellDesign, type: ComponentType): [number, number] {
  const memb = COMPONENT_DEFS[type].placement === 'membrane';
  let best: [number, number] = [0, memb ? 1 : 0.45];
  let bestScore = -1;
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * TAU;
    const dist = memb ? 1 : 0.25 + ((k * 7) % 5) * 0.12;
    const x = Math.cos(a) * dist;
    const y = Math.sin(a) * dist;
    let minD = Infinity;
    for (const c of d.components) {
      const cx = Math.cos(c.angle) * c.dist;
      const cy = Math.sin(c.angle) * c.dist;
      minD = Math.min(minD, Math.hypot(cx - x, cy - y));
    }
    if (minD > bestScore) {
      bestScore = minD;
      best = [a, dist];
    }
  }
  return best;
}

export function removeComponent(uid: number) {
  edit((d) => {
    const c = d.components.find((x) => x.uid === uid);
    if (!c) return;
    d.components = d.components.filter((x) => x.uid !== uid);
    d.conduits = d.conduits.filter((k) => k.a !== uid && k.b !== uid);
    const dead = new Set(d.circuit.nodes.filter((n) => n.ref === uid).map((n) => n.id));
    d.circuit.nodes = d.circuit.nodes.filter((n) => !dead.has(n.id));
    d.circuit.wires = d.circuit.wires.filter((w) => !dead.has(w.from) && !dead.has(w.to));
  });
  useUI.getState().set({ forgeSelected: null });
}

export function toggleConduit(a: number, b: number) {
  if (a === b) return;
  edit((d) => {
    const i = d.conduits.findIndex((k) => (k.a === a && k.b === b) || (k.a === b && k.b === a));
    if (i >= 0) d.conduits.splice(i, 1);
    else d.conduits.push({ a, b });
  });
}

export function addNode(kind: NodeKind, x: number, y: number, extra: { ref?: number; port?: string; params?: Record<string, number> } = {}): number {
  let id = 0;
  edit((d) => {
    id = nextNodeId(d);
    d.circuit.nodes.push({ id, kind, x, y, params: { ...defaultNodeParams(kind), ...(extra.params ?? {}) }, ref: extra.ref, port: extra.port });
  });
  return id;
}

export function removeNode(id: number) {
  edit((d) => {
    d.circuit.nodes = d.circuit.nodes.filter((n) => n.id !== id);
    d.circuit.wires = d.circuit.wires.filter((w) => w.from !== id && w.to !== id);
  });
}

export function addWire(from: number, to: number, slot: number) {
  edit((d) => {
    if (from === to && d.circuit.nodes.find((n) => n.id === from)?.kind !== 'not') {
      // self-loops are allowed (one-tick feedback) but rarely intended except for NOT rings
    }
    if (d.circuit.wires.some((w) => w.from === from && w.to === to && w.slot === slot)) return;
    d.circuit.wires.push({ from, to, slot });
  });
}

export function removeWire(index: number) {
  edit((d) => {
    d.circuit.wires.splice(index, 1);
  });
}

export function newDesignId(base: string): string {
  return `${base.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20)}-${Date.now().toString(36).slice(-5)}`;
}
