/**
 * Cellular logic circuits. Values are continuous in [0, 1].
 * Sensors (components) feed nodes; nodes drive component activations and
 * cell actions. Cycles are allowed: a node reading a node that has not yet
 * been evaluated this tick sees last tick's value (one-tick delay).
 */
import { clamp01, NUM_CHANNELS, NUM_TISSUES } from './constants';
import type { ParamDef } from './components';

export type NodeKind =
  | 'sensor'
  | 'const'
  | 'random'
  | 'signalIn'
  | 'internal'
  | 'and'
  | 'or'
  | 'not'
  | 'threshold'
  | 'compare'
  | 'gain'
  | 'add'
  | 'sub'
  | 'mul'
  | 'delay'
  | 'latch'
  | 'osc'
  | 'pulse'
  | 'actuator'
  | 'action'
  | 'signalOut';

export interface CircuitNodeDef {
  id: number;
  kind: NodeKind;
  x: number;
  y: number;
  params: Record<string, number>;
  /** Component uid for sensor/actuator nodes. */
  ref?: number;
  /** Output port key for sensor nodes. */
  port?: string;
}

export interface WireDef {
  from: number;
  to: number;
  slot: number;
}

export interface CircuitDef {
  nodes: CircuitNodeDef[];
  wires: WireDef[];
}

export type NodeGroup = 'input' | 'logic' | 'memory' | 'output';

export interface NodeKindDef {
  kind: NodeKind;
  label: string;
  group: NodeGroup;
  slots: string[];
  params: ParamDef[];
  blurb: string;
  hasOutput: boolean;
}

const prm = (key: string, label: string, min: number, max: number, step: number, def: number, options?: string[]): ParamDef => ({
  key,
  label,
  min,
  max,
  step,
  default: def,
  options,
});

export const ACTION_NAMES = ['Divide', 'Adhere', 'Release bonds', 'Apoptosis', 'Become tissue'] as const;
export const ACT_DIVIDE = 0;
export const ACT_ADHERE = 1;
export const ACT_RELEASE = 2;
export const ACT_APOPTOSIS = 3;
export const ACT_TISSUE = 4;

export const INTERNAL_NAMES = ['Bond count', 'Age', 'Tissue is…', 'Organism size'] as const;

const tissueOptions = Array.from({ length: NUM_TISSUES }, (_, i) => `Tissue ${'ABCD'[i]}`);
const channelOptions = Array.from({ length: NUM_CHANNELS }, (_, i) => `Ch ${i + 1}`);

export const NODE_DEFS: Record<NodeKind, NodeKindDef> = {
  sensor: { kind: 'sensor', label: 'Sensor', group: 'input', slots: [], params: [], blurb: 'Reads a sensor component output.', hasOutput: true },
  const: { kind: 'const', label: 'Constant', group: 'input', slots: [], params: [prm('value', 'Value', 0, 1, 0.05, 1)], blurb: 'Fixed value.', hasOutput: true },
  random: { kind: 'random', label: 'Random', group: 'input', slots: [], params: [prm('p', 'Chance', 0, 1, 0.01, 0.05)], blurb: 'Outputs 1 with the given chance each tick.', hasOutput: true },
  signalIn: { kind: 'signalIn', label: 'Signal In', group: 'input', slots: [], params: [prm('ch', 'Channel', 0, NUM_CHANNELS - 1, 1, 0, channelOptions)], blurb: 'Reads an internal signal channel (shared with neighbours through gap relays).', hasOutput: true },
  internal: {
    kind: 'internal',
    label: 'Cell State',
    group: 'input',
    slots: [],
    params: [
      prm('which', 'Reads', 0, INTERNAL_NAMES.length - 1, 1, 0, [...INTERNAL_NAMES]),
      prm('k', 'Tissue / scale', 0, 50, 1, 0),
    ],
    blurb: 'Bond count (/6), age (/scale×100 ticks), tissue match, organism size (/scale).',
    hasOutput: true,
  },
  and: { kind: 'and', label: 'AND', group: 'logic', slots: ['a', 'b'], params: [], blurb: 'Minimum of inputs (fuzzy AND).', hasOutput: true },
  or: { kind: 'or', label: 'OR', group: 'logic', slots: ['a', 'b'], params: [], blurb: 'Maximum of inputs (fuzzy OR).', hasOutput: true },
  not: { kind: 'not', label: 'NOT', group: 'logic', slots: ['a'], params: [], blurb: '1 − input.', hasOutput: true },
  threshold: {
    kind: 'threshold',
    label: 'Threshold',
    group: 'logic',
    slots: ['in'],
    params: [prm('t', 'Threshold', 0, 1, 0.01, 0.5), prm('h', 'Hysteresis', 0, 0.5, 0.01, 0.05)],
    blurb: '1 when input exceeds threshold (with hysteresis).',
    hasOutput: true,
  },
  compare: { kind: 'compare', label: 'Compare', group: 'logic', slots: ['a', 'b'], params: [], blurb: '1 when a > b.', hasOutput: true },
  gain: {
    kind: 'gain',
    label: 'Gain',
    group: 'logic',
    slots: ['in'],
    params: [prm('k', 'Gain', 0, 8, 0.1, 2), prm('bias', 'Bias', -1, 1, 0.05, 0)],
    blurb: 'in × gain + bias, clamped.',
    hasOutput: true,
  },
  add: { kind: 'add', label: 'Add', group: 'logic', slots: ['a', 'b'], params: [], blurb: 'a + b, clamped.', hasOutput: true },
  sub: { kind: 'sub', label: 'Subtract', group: 'logic', slots: ['a', 'b'], params: [], blurb: 'a − b, clamped at 0.', hasOutput: true },
  mul: { kind: 'mul', label: 'Multiply', group: 'logic', slots: ['a', 'b'], params: [], blurb: 'a × b.', hasOutput: true },
  delay: { kind: 'delay', label: 'Delay', group: 'memory', slots: ['in'], params: [prm('n', 'Ticks', 1, 60, 1, 10)], blurb: 'Outputs the input from n ticks ago.', hasOutput: true },
  latch: { kind: 'latch', label: 'Latch', group: 'memory', slots: ['set', 'reset'], params: [], blurb: 'Remembers: set → 1, reset → 0.', hasOutput: true },
  osc: {
    kind: 'osc',
    label: 'Clock',
    group: 'memory',
    slots: ['enable'],
    params: [prm('period', 'Period', 4, 600, 2, 60), prm('duty', 'Duty', 0.05, 0.95, 0.05, 0.5)],
    blurb: 'Square-wave clock (runs while enable is high or unconnected).',
    hasOutput: true,
  },
  pulse: { kind: 'pulse', label: 'Edge Pulse', group: 'memory', slots: ['in'], params: [], blurb: 'Outputs 1 for one tick when input rises above 0.5.', hasOutput: true },
  actuator: { kind: 'actuator', label: 'Activate', group: 'output', slots: ['level'], params: [], blurb: 'Sets a component’s activation (overrides always-on).', hasOutput: false },
  action: {
    kind: 'action',
    label: 'Action',
    group: 'output',
    slots: ['trigger'],
    params: [prm('which', 'Action', 0, ACTION_NAMES.length - 1, 1, 0, [...ACTION_NAMES]), prm('k', 'Tissue', 0, NUM_TISSUES - 1, 1, 1, tissueOptions)],
    blurb: 'Performs a cell action while the trigger is above 0.5.',
    hasOutput: false,
  },
  signalOut: {
    kind: 'signalOut',
    label: 'Signal Out',
    group: 'output',
    slots: ['level'],
    params: [prm('ch', 'Channel', 0, NUM_CHANNELS - 1, 1, 0, channelOptions)],
    blurb: 'Raises an internal signal channel to at least the input level.',
    hasOutput: false,
  },
};

export const NODE_KINDS = Object.keys(NODE_DEFS) as NodeKind[];

export const K = {
  sensor: 0,
  const: 1,
  random: 2,
  signalIn: 3,
  internal: 4,
  and: 5,
  or: 6,
  not: 7,
  threshold: 8,
  compare: 9,
  gain: 10,
  add: 11,
  sub: 12,
  mul: 13,
  delay: 14,
  latch: 15,
  osc: 16,
  pulse: 17,
  actuator: 18,
  action: 19,
  signalOut: 20,
} as const satisfies Record<NodeKind, number>;

export function defaultNodeParams(kind: NodeKind): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of NODE_DEFS[kind].params) out[p.key] = p.default;
  return out;
}

/** Compiled, flat representation for fast per-tick evaluation. */
export interface CompiledCircuit {
  n: number;
  order: Int32Array; // evaluation order (node indices)
  kind: Int8Array;
  p0: Float32Array;
  p1: Float32Array;
  /** For sensor: component index; for actuator: component index (or -1). */
  compIndex: Int32Array;
  /** For sensor: output port index within the component's outputs. */
  portIndex: Int32Array;
  /** Input wiring: for node i, slot s: wires at inStart[i*2+s] .. inStart[i*2+s]+inCount[i*2+s] in inSrc */
  inStart: Int32Array;
  inCount: Int32Array;
  inSrc: Int32Array;
  /** Delay buffers: offset & length per node (0 for non-delay). */
  delayOff: Int32Array;
  delayLen: Int32Array;
  delayTotal: number;
  /** Node ids, for mapping back to the editor. */
  ids: Int32Array;
  /** Indices of actuator nodes for components with activation. */
  hasActuator: Uint8Array; // per component index
}

export const MAX_SLOTS = 2;

export function compileCircuit(
  def: CircuitDef,
  uidToIndex: Map<number, number>,
  outputIndex: (compIndex: number, port: string) => number,
  numComponents: number,
): CompiledCircuit {
  const nodes = def.nodes;
  const n = nodes.length;
  const idToIdx = new Map<number, number>();
  nodes.forEach((nd, i) => idToIdx.set(nd.id, i));

  const kind = new Int8Array(n);
  const p0 = new Float32Array(n);
  const p1 = new Float32Array(n);
  const compIndex = new Int32Array(n).fill(-1);
  const portIndex = new Int32Array(n).fill(-1);
  const delayOff = new Int32Array(n);
  const delayLen = new Int32Array(n);
  const ids = new Int32Array(n);
  const hasActuator = new Uint8Array(numComponents);
  let delayTotal = 0;

  nodes.forEach((nd, i) => {
    ids[i] = nd.id;
    kind[i] = K[nd.kind];
    const pdefs = NODE_DEFS[nd.kind].params;
    const get = (j: number) => (pdefs[j] ? (nd.params[pdefs[j].key] ?? pdefs[j].default) : 0);
    p0[i] = get(0);
    p1[i] = get(1);
    if (nd.kind === 'sensor' || nd.kind === 'actuator') {
      const ci = nd.ref !== undefined ? uidToIndex.get(nd.ref) : undefined;
      if (ci !== undefined) {
        compIndex[i] = ci;
        if (nd.kind === 'sensor') portIndex[i] = outputIndex(ci, nd.port ?? '');
        else hasActuator[ci] = 1;
      }
    }
    if (nd.kind === 'delay') {
      const len = Math.max(1, Math.min(60, Math.round(p0[i])));
      delayOff[i] = delayTotal;
      delayLen[i] = len;
      delayTotal += len;
    }
  });

  // Group wires by (to, slot)
  const buckets: number[][] = Array.from({ length: n * MAX_SLOTS }, () => []);
  for (const w of def.wires) {
    const from = idToIdx.get(w.from);
    const to = idToIdx.get(w.to);
    if (from === undefined || to === undefined) continue;
    if (!NODE_DEFS[nodes[from].kind].hasOutput) continue;
    const slots = NODE_DEFS[nodes[to].kind].slots.length;
    if (w.slot < 0 || w.slot >= slots) continue;
    buckets[to * MAX_SLOTS + w.slot].push(from);
  }
  const inStart = new Int32Array(n * MAX_SLOTS);
  const inCount = new Int32Array(n * MAX_SLOTS);
  const src: number[] = [];
  for (let b = 0; b < buckets.length; b++) {
    inStart[b] = src.length;
    inCount[b] = buckets[b].length;
    src.push(...buckets[b]);
  }

  // Topological order (Kahn); nodes in cycles are appended in definition order.
  const indeg = new Int32Array(n);
  const outs: number[][] = Array.from({ length: n }, () => []);
  for (let to = 0; to < n; to++) {
    for (let s = 0; s < MAX_SLOTS; s++) {
      for (const from of buckets[to * MAX_SLOTS + s]) {
        indeg[to]++;
        outs[from].push(to);
      }
    }
  }
  const order: number[] = [];
  const queue: number[] = [];
  const done = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  while (queue.length) {
    const i = queue.shift()!;
    if (done[i]) continue;
    done[i] = 1;
    order.push(i);
    for (const j of outs[i]) {
      indeg[j]--;
      if (indeg[j] === 0) queue.push(j);
    }
  }
  for (let i = 0; i < n; i++) if (!done[i]) order.push(i);

  return {
    n,
    order: Int32Array.from(order),
    kind,
    p0,
    p1,
    compIndex,
    portIndex,
    inStart,
    inCount,
    inSrc: Int32Array.from(src),
    delayOff,
    delayLen,
    delayTotal,
    ids,
    hasActuator,
  };
}

/** Per-cell circuit runtime memory. */
export interface CircuitState {
  values: Float32Array;
  mem: Float32Array;
  delay: Float32Array;
  delayPos: Int32Array;
}

export function makeCircuitState(c: CompiledCircuit): CircuitState {
  return {
    values: new Float32Array(c.n),
    mem: new Float32Array(c.n),
    delay: new Float32Array(c.delayTotal),
    delayPos: new Int32Array(c.n),
  };
}

/** Inputs the evaluator needs from the cell. */
export interface CircuitIO {
  /** Sensor outputs, [compIndex][portIndex] flattened via sensorOffset. */
  sensorValue(compIndex: number, portIndex: number): number;
  channel(ch: number): number;
  internal(which: number, k: number): number;
  random(): number;
  tick: number;
}

/** Results written by evaluation. */
export interface CircuitOut {
  /** Activation per component (only where hasActuator) — max of actuator inputs. */
  activation: Float32Array;
  /** Action flags: [divide, adhere, release, apoptosis] and tissue target (-1 = none). */
  actions: Uint8Array;
  tissueTarget: number;
  /** Channel source levels from signalOut nodes (max). */
  channelOut: Float32Array;
}

function slotValue(c: CompiledCircuit, st: CircuitState, i: number, s: number): number {
  const b = i * MAX_SLOTS + s;
  const cnt = c.inCount[b];
  if (cnt === 0) return 0;
  const start = c.inStart[b];
  let v = 0;
  for (let k = 0; k < cnt; k++) v += st.values[c.inSrc[start + k]];
  return v;
}

function slotConnected(c: CompiledCircuit, i: number, s: number): boolean {
  return c.inCount[i * MAX_SLOTS + s] > 0;
}

export function evaluateCircuit(c: CompiledCircuit, st: CircuitState, io: CircuitIO, out: CircuitOut): void {
  out.actions.fill(0);
  out.tissueTarget = -1;
  out.channelOut.fill(0);
  const vals = st.values;
  for (let oi = 0; oi < c.n; oi++) {
    const i = c.order[oi];
    let v = 0;
    switch (c.kind[i]) {
      case K.sensor:
        v = c.compIndex[i] >= 0 && c.portIndex[i] >= 0 ? io.sensorValue(c.compIndex[i], c.portIndex[i]) : 0;
        break;
      case K.const:
        v = c.p0[i];
        break;
      case K.random:
        v = io.random() < c.p0[i] ? 1 : 0;
        break;
      case K.signalIn:
        v = io.channel(c.p0[i] | 0);
        break;
      case K.internal:
        v = io.internal(c.p0[i] | 0, c.p1[i]);
        break;
      case K.and: {
        const ca = slotConnected(c, i, 0);
        const cb = slotConnected(c, i, 1);
        if (ca && cb) v = Math.min(slotValue(c, st, i, 0), slotValue(c, st, i, 1));
        else if (ca) v = slotValue(c, st, i, 0);
        else if (cb) v = slotValue(c, st, i, 1);
        else v = 0;
        break;
      }
      case K.or:
        v = Math.max(slotValue(c, st, i, 0), slotValue(c, st, i, 1));
        break;
      case K.not:
        v = 1 - clamp01(slotValue(c, st, i, 0));
        break;
      case K.threshold: {
        const x = slotValue(c, st, i, 0);
        const prev = st.mem[i];
        const t = c.p0[i];
        const h = c.p1[i];
        v = prev > 0.5 ? (x > t - h ? 1 : 0) : x > t ? 1 : 0;
        st.mem[i] = v;
        break;
      }
      case K.compare:
        v = slotValue(c, st, i, 0) > slotValue(c, st, i, 1) ? 1 : 0;
        break;
      case K.gain:
        v = slotValue(c, st, i, 0) * c.p0[i] + c.p1[i];
        break;
      case K.add:
        v = slotValue(c, st, i, 0) + slotValue(c, st, i, 1);
        break;
      case K.sub:
        v = slotValue(c, st, i, 0) - slotValue(c, st, i, 1);
        break;
      case K.mul:
        v = slotValue(c, st, i, 0) * slotValue(c, st, i, 1);
        break;
      case K.delay: {
        const len = c.delayLen[i];
        const off = c.delayOff[i];
        const pos = st.delayPos[i];
        v = st.delay[off + pos];
        st.delay[off + pos] = clamp01(slotValue(c, st, i, 0));
        st.delayPos[i] = (pos + 1) % len;
        break;
      }
      case K.latch: {
        const set = slotValue(c, st, i, 0) > 0.5;
        const reset = slotValue(c, st, i, 1) > 0.5;
        if (reset) st.mem[i] = 0;
        else if (set) st.mem[i] = 1;
        v = st.mem[i];
        break;
      }
      case K.osc: {
        const enabled = !slotConnected(c, i, 0) || slotValue(c, st, i, 0) > 0.5;
        const period = Math.max(2, c.p0[i]);
        if (enabled) st.mem[i] = (st.mem[i] + 1 / period) % 1;
        v = enabled && st.mem[i] < c.p1[i] ? 1 : 0;
        break;
      }
      case K.pulse: {
        const x = slotValue(c, st, i, 0) > 0.5 ? 1 : 0;
        v = x === 1 && st.mem[i] === 0 ? 1 : 0;
        st.mem[i] = x;
        break;
      }
      case K.actuator: {
        v = clamp01(slotValue(c, st, i, 0));
        const ci = c.compIndex[i];
        if (ci >= 0) out.activation[ci] = Math.max(out.activation[ci], v);
        break;
      }
      case K.action: {
        v = slotValue(c, st, i, 0);
        if (v > 0.5) {
          const which = c.p0[i] | 0;
          if (which === ACT_TISSUE) out.tissueTarget = c.p1[i] | 0;
          else out.actions[which] = 1;
        }
        break;
      }
      case K.signalOut: {
        v = clamp01(slotValue(c, st, i, 0));
        const ch = c.p0[i] | 0;
        if (v > out.channelOut[ch]) out.channelOut[ch] = v;
        break;
      }
    }
    vals[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
}
