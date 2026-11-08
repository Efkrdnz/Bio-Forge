import { describe, it, expect } from 'vitest';
import { compileCircuit, evaluateCircuit, makeCircuitState, defaultNodeParams, type CircuitDef, type NodeKind, type CircuitIO } from '../sim/circuit';
import { R_CHARGE } from '../sim/constants';
import { design, place, quietWorld, run } from './helpers';

function mk(nodes: [number, NodeKind, Record<string, number>?][], wires: [number, number, number?][]): CircuitDef {
  return {
    nodes: nodes.map(([id, kind, p]) => ({ id, kind, x: 0, y: 0, params: { ...defaultNodeParams(kind), ...(p ?? {}) } })),
    wires: wires.map(([from, to, slot]) => ({ from, to, slot: slot ?? 0 })),
  };
}

function harness(def: CircuitDef) {
  const c = compileCircuit(def, new Map(), () => -1, 0);
  const st = makeCircuitState(c);
  const out = { activation: new Float32Array(0), actions: new Uint8Array(4), tissueTarget: -1, channelOut: new Float32Array(4) };
  const io: CircuitIO = { sensorValue: () => 0, channel: () => 0, internal: () => 0, random: () => 0.5, tick: 0 };
  const step = () => evaluateCircuit(c, st, io, out);
  const val = (id: number) => st.values[def.nodes.findIndex((n) => n.id === id)];
  return { step, val, st, out, c };
}

describe('logic circuits', () => {
  const gate = (kind: NodeKind, a: number, b?: number) => {
    const nodes: [number, NodeKind, Record<string, number>?][] = [[1, 'const', { value: a }], [3, kind]];
    const wires: [number, number, number?][] = [[1, 3, 0]];
    if (b !== undefined) {
      nodes.push([2, 'const', { value: b }]);
      wires.push([2, 3, 1]);
    }
    const h = harness(mk(nodes, wires));
    h.step();
    return h.val(3);
  };

  it('implements fuzzy AND / OR / NOT / compare truth tables', () => {
    for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      expect(gate('and', a, b)).toBe(Math.min(a, b));
      expect(gate('or', a, b)).toBe(Math.max(a, b));
      expect(gate('compare', a, b)).toBe(a > b ? 1 : 0);
    }
    expect(gate('not', 0)).toBe(1);
    expect(gate('not', 1)).toBe(0);
    expect(gate('and', 0.3, 0.8)).toBeCloseTo(0.3);
  });

  it('clamps arithmetic to [0, 1]', () => {
    expect(gate('add', 0.7, 0.6)).toBe(1);
    expect(gate('sub', 0.2, 0.6)).toBe(0);
    expect(gate('mul', 0.5, 0.5)).toBeCloseTo(0.25);
  });

  it('threshold has hysteresis', () => {
    let x = 0;
    const def = mk([[1, 'const'], [2, 'threshold', { t: 0.5, h: 0.2 }]], [[1, 2]]);
    const h = harness(def);
    const run1 = (v: number) => {
      x = v;
      h.st.values[0] = x;
      // drive by overwriting the const param
      h.c.p0[0] = x;
      h.step();
      return h.val(2);
    };
    expect(run1(0.4)).toBe(0);
    expect(run1(0.6)).toBe(1);
    expect(run1(0.4)).toBe(1); // still above t - h
    expect(run1(0.25)).toBe(0);
  });

  it('latch remembers set until reset', () => {
    const h = harness(mk([[1, 'const', { value: 0 }], [2, 'const', { value: 0 }], [3, 'latch']], [[1, 3, 0], [2, 3, 1]]));
    h.step();
    expect(h.val(3)).toBe(0);
    h.c.p0[0] = 1;
    h.step();
    expect(h.val(3)).toBe(1);
    h.c.p0[0] = 0;
    h.step();
    expect(h.val(3)).toBe(1);
    h.c.p0[1] = 1;
    h.step();
    expect(h.val(3)).toBe(0);
  });

  it('delay outputs the input n ticks later', () => {
    const h = harness(mk([[1, 'const', { value: 1 }], [2, 'delay', { n: 5 }]], [[1, 2]]));
    const seen: number[] = [];
    for (let i = 0; i < 8; i++) {
      h.step();
      seen.push(h.val(2));
    }
    expect(seen.slice(0, 5)).toEqual([0, 0, 0, 0, 0]);
    expect(seen[5]).toBe(1);
  });

  it('clock oscillates with the configured period and duty', () => {
    const h = harness(mk([[1, 'osc', { period: 10, duty: 0.3 }]], []));
    let high = 0;
    let edges = 0;
    let prev = 0;
    for (let i = 0; i < 100; i++) {
      h.step();
      const v = h.val(1);
      high += v;
      if (v === 1 && prev === 0) edges++;
      prev = v;
    }
    expect(edges).toBeGreaterThanOrEqual(9);
    expect(edges).toBeLessThanOrEqual(11);
    expect(high / 100).toBeCloseTo(0.3, 1);
  });

  it('edge pulse fires once on a rising edge', () => {
    const h = harness(mk([[1, 'const', { value: 0 }], [2, 'pulse']], [[1, 2]]));
    h.step();
    h.c.p0[0] = 1;
    const out: number[] = [];
    for (let i = 0; i < 4; i++) {
      h.step();
      out.push(h.val(2));
    }
    expect(out).toEqual([1, 0, 0, 0]);
  });

  it('feedback loops are evaluated with a one-tick delay (NOT ring oscillates)', () => {
    const h = harness(mk([[1, 'not']], [[1, 1]]));
    const seq: number[] = [];
    for (let i = 0; i < 6; i++) {
      h.step();
      seq.push(h.val(1));
    }
    expect(seq).toEqual([1, 0, 1, 0, 1, 0]);
  });

  it('actions and signal outputs are reported', () => {
    const h = harness(
      mk([[1, 'const', { value: 1 }], [2, 'action', { which: 0 }], [3, 'action', { which: 4, k: 2 }], [4, 'signalOut', { ch: 2 }]], [[1, 2], [1, 3], [1, 4]]),
    );
    h.step();
    expect(h.out.actions[0]).toBe(1);
    expect(h.out.tissueTarget).toBe(2);
    expect(h.out.channelOut[2]).toBe(1);
  });

  it('an actuator node overrides always-on activation in a live cell', () => {
    const w = quietWorld();
    const d = design('act', (b) => {
      b.add('core', 0, 0);
      const f = b.add('flagellum', 180, 1, { power: 2 });
      const k = b.node('const', 0, 0, { value: 0 });
      b.wire(k, b.actuator(f, 100, 0));
    });
    const c = place(w, d, w.env.cx, w.env.cy, 0);
    c.buf[R_CHARGE] = c.cytoCap[R_CHARGE];
    const x0 = c.x;
    run(w, 40);
    expect(Math.abs(c.x - x0)).toBeLessThan(2);
    expect(c.activation[1]).toBe(0);
  });

  it('sensor → circuit → actuator steers a cell (chemotaxis)', () => {
    const w = quietWorld({ viscosity: 1 });
    for (const i of w.env.inside) w.env.sorb[i] = (Math.floor(i / w.env.W) / w.env.H) * 8; // rich to the south (+y)
    const d = design('taxis', (b) => {
      b.add('core', 0, 0);
      const cl = b.add('chemoreceptor', 40);
      const cr = b.add('chemoreceptor', -40);
      const fl = b.add('flagellum', 150, 1, { power: 1.5 });
      const fr = b.add('flagellum', -150, 1, { power: 1.5 });
      const sl = b.sensor(cl, 'level', 0, 0);
      const sr = b.sensor(cr, 'level', 0, 0);
      const cmpL = b.node('compare', 0, 0);
      const cmpR = b.node('compare', 0, 0);
      const base = b.node('const', 0, 0, { value: 0.35 });
      const mixL = b.node('add', 0, 0);
      const mixR = b.node('add', 0, 0);
      b.wire(sl, cmpL, 0);
      b.wire(sr, cmpL, 1);
      b.wire(sr, cmpR, 0);
      b.wire(sl, cmpR, 1);
      b.wire(cmpL, mixR, 0);
      b.wire(base, mixR, 1);
      b.wire(cmpR, mixL, 0);
      b.wire(base, mixL, 1);
      b.wire(mixR, b.actuator(fr, 0, 0));
      b.wire(mixL, b.actuator(fl, 0, 0));
    });
    const c = place(w, d, w.env.cx, w.env.cy, 0); // heading east, food south
    for (let k = 2; k < c.buf.length; k += 4) c.buf[k] = 3;
    const y0 = c.y;
    run(w, 250);
    expect(c.y - y0).toBeGreaterThan(30);
  });
});
