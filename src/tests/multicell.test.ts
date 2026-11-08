import { describe, it, expect } from 'vitest';
import { R_CHARGE, NUM_RES } from '../sim/constants';
import { createBond, recomputeOrganisms } from '../sim/multicell';
import { restLength } from '../sim/bond';
import { design, place, quietWorld, run } from './helpers';
import { pulseSwimmer } from '../sim/presets/designs';
import { T } from '../sim/components';

const sticky = (extra: Parameters<typeof design>[1] = () => {}) =>
  design('sticky', (b) => {
    b.add('core', 0, 0, { autoDivide: 0 });
    b.add('adhesion', 0);
    b.add('adhesion', 180);
    b.add('junction', 90, 1, { conductance: 0.5 });
    b.add('gaprelay', -90, 1, { conductance: 0.9 });
    extra(b);
  });

describe('multicellular connections', () => {
  it('bonds pull cells to rest length and resist separation', () => {
    const w = quietWorld();
    const d = sticky();
    const a = place(w, d, w.env.cx, w.env.cy);
    const b = place(w, d, w.env.cx + 21, w.env.cy + 3);
    const bond = createBond(w, a, b)!;
    expect(bond).toBeTruthy();
    run(w, 60);
    expect(w.bonds.length).toBe(1);
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    expect(Math.abs(dist - restLength(bond)) / restLength(bond)).toBeLessThan(0.1);
  });

  it('bond slots come from adhesion knobs', () => {
    const w = quietWorld();
    const plain = design('plain', (b) => { b.add('core', 0, 0); });
    const a = place(w, plain);
    const b = place(w, plain, w.env.cx + 20);
    expect(createBond(w, a, b)).toBeNull();
    const s = sticky();
    expect(place(w, s, w.env.cx - 100).cd.bondSlots).toBe(4);
  });

  it('junctions equalise cytosol between bonded cells', () => {
    const w = quietWorld();
    const d = sticky();
    const a = place(w, d, w.env.cx, w.env.cy);
    const b = place(w, d, w.env.cx + 20, w.env.cy);
    createBond(w, a, b);
    a.buf[R_CHARGE] = a.cytoCap[R_CHARGE];
    b.buf[R_CHARGE] = 0;
    for (let i = 1; i <= b.cd.n; i++) b.buf[i * NUM_RES + R_CHARGE] = 0;
    run(w, 80);
    const ca = a.buf[R_CHARGE] / a.cytoCap[R_CHARGE];
    const cb = b.buf[R_CHARGE] / b.cytoCap[R_CHARGE];
    expect(Math.abs(ca - cb)).toBeLessThan(0.15);
    expect(cb).toBeGreaterThan(0.1);
  });

  it('without junctions, bonded cells do not share resources', () => {
    const w = quietWorld();
    const d = design('nojn', (b) => { b.add('core', 0, 0, { autoDivide: 0 }); b.add('adhesion', 0); b.add('adhesion', 180); });
    const a = place(w, d, w.env.cx, w.env.cy);
    const b = place(w, d, w.env.cx + 20, w.env.cy);
    createBond(w, a, b);
    b.buf[R_CHARGE] = 0;
    for (let i = 1; i <= b.cd.n; i++) b.buf[i * NUM_RES + R_CHARGE] = 0;
    a.buf[R_CHARGE] = a.cytoCap[R_CHARGE];
    run(w, 40);
    expect(b.buf[R_CHARGE]).toBeLessThan(0.01);
  });

  it('bonds break when over-stretched', () => {
    const w = quietWorld();
    const d = sticky();
    const a = place(w, d, w.env.cx, w.env.cy);
    const b = place(w, d, w.env.cx + 20, w.env.cy);
    createBond(w, a, b);
    run(w, 5);
    expect(w.bonds.length).toBe(1);
    b.x += 200;
    w.step();
    w.step();
    expect(w.bonds.length).toBe(0);
    expect(a.bonds.length).toBe(0);
  });

  it('organisms are the connected components of the bond graph', () => {
    const w = quietWorld();
    const d = sticky();
    const cells = [0, 1, 2, 3].map((k) => place(w, d, w.env.cx + k * 22, w.env.cy));
    const lone = place(w, d, w.env.cx, w.env.cy + 150);
    createBond(w, cells[0], cells[1]);
    createBond(w, cells[1], cells[2]);
    createBond(w, cells[2], cells[3]);
    recomputeOrganisms(w);
    const ids = new Set(cells.map((c) => c.organismId));
    expect(ids.size).toBe(1);
    expect(cells[0].organismId).not.toBe(0);
    expect(lone.organismId).toBe(0);
    expect(w.organisms.get(cells[0].organismId)!.size).toBe(4);
    // Cutting the middle bond splits it in two
    const mid = cells[1].bonds.find((b) => b.a === cells[2] || b.b === cells[2])!;
    mid.broken = true;
    w.bondsDirty = true;
    w.step();
    expect(cells[0].organismId).not.toBe(cells[3].organismId);
    expect(w.organisms.size).toBe(2);
  });

  it('bonded organisms hold their shape while their flagella move them together', () => {
    const w = quietWorld();
    const d = sticky((b) => { b.add('flagellum', 180, 1, { power: 2 }); });
    const a = place(w, d, w.env.cx, w.env.cy, 0);
    const b = place(w, d, w.env.cx - 20, w.env.cy, 0);
    createBond(w, a, b);
    for (const c of [a, b]) for (let k = R_CHARGE; k < c.buf.length; k += NUM_RES) c.buf[k] = 2;
    const cx0 = (a.x + b.x) / 2;
    run(w, 80);
    expect((a.x + b.x) / 2 - cx0).toBeGreaterThan(8);
    expect(w.bonds.length).toBe(1);
  });

  it('adhere action bonds touching kin', () => {
    const w = quietWorld();
    const d = sticky((b) => {
      const k = b.node('const', 0, 0, { value: 1 });
      b.wire(k, b.node('action', 0, 0, { which: 1 }));
    });
    const a = place(w, d, w.env.cx, w.env.cy);
    place(w, d, w.env.cx + a.radius * 2, w.env.cy);
    run(w, 3);
    expect(w.bonds.length).toBe(1);
  });
});

describe('signalling', () => {
  it('gap relays propagate a signal down a chain with delay', () => {
    const w = quietWorld();
    const pacer = sticky((b) => {
      const k = b.node('const', 0, 0, { value: 1 });
      b.wire(k, b.node('signalOut', 0, 0, { ch: 0 }));
    });
    const body = sticky();
    const chain = [place(w, pacer, w.env.cx, w.env.cy)];
    for (let k = 1; k < 6; k++) chain.push(place(w, body, w.env.cx + k * 20, w.env.cy));
    for (let k = 0; k < 5; k++) createBond(w, chain[k], chain[k + 1]);
    const arrival: number[] = chain.map(() => -1);
    for (let t = 0; t < 300; t++) {
      w.step();
      chain.forEach((c, i) => {
        if (arrival[i] < 0 && c.channels[0] > 0.05) arrival[i] = t;
      });
    }
    expect(arrival.every((t) => t >= 0)).toBe(true);
    for (let k = 1; k < 6; k++) expect(arrival[k]).toBeGreaterThanOrEqual(arrival[k - 1]);
    expect(arrival[5]).toBeGreaterThan(arrival[1]);
    expect(chain[1].channels[0]).toBeGreaterThan(chain[5].channels[0]);
  });

  it('without gap relays the signal stays inside the source cell', () => {
    const w = quietWorld();
    const mkD = (src: boolean) =>
      design(src ? 'src' : 'dst', (b) => {
        b.add('core', 0, 0, { autoDivide: 0 });
        b.add('adhesion', 0);
        b.add('adhesion', 180);
        if (src) b.wire(b.node('const', 0, 0, { value: 1 }), b.node('signalOut', 0, 0, { ch: 1 }));
      });
    const a = place(w, mkD(true), w.env.cx, w.env.cy);
    const b = place(w, mkD(false), w.env.cx + 20, w.env.cy);
    createBond(w, a, b);
    run(w, 50);
    expect(a.channels[1]).toBeGreaterThan(0.9);
    expect(b.channels[1]).toBe(0);
  });

  it('Echo Emitters release echo into the dish that Echo Receptors hear', () => {
    const w = quietWorld();
    const em = design('em', (b) => { b.add('core', 0, 0); b.add('emitter', 0, 1, { channel: 0, rate: 1 }); });
    const ear = design('ear', (b) => { b.add('core', 0, 0); b.add('echoreceptor', 180, 1, { channel: 0, halfSat: 0.1 }); });
    const e = place(w, em, w.env.cx, w.env.cy, 0);
    for (let k = R_CHARGE; k < e.buf.length; k += NUM_RES) e.buf[k] = 3;
    const r = place(w, ear, w.env.cx + 50, w.env.cy, 0);
    run(w, 80);
    expect(w.env.sample(w.env.echoA, e.x + e.radius, e.y)).toBeGreaterThan(0.1);
    expect(r.sensors[0]).toBeGreaterThan(0.05);
    expect(w.env.sample(w.env.echoB, e.x, e.y)).toBe(0);
  });
});

describe('coordinated movement', () => {
  const chain = (withPacemaker: boolean) => {
    const w = quietWorld();
    const d = pulseSwimmer();
    const cells = [0, 1, 2, 3, 4].map((k) => place(w, d, w.env.cx - k * 22, w.env.cy, 0));
    cells.forEach((c, k) => {
      c.tissue = k === 0 && withPacemaker ? 0 : 1;
      for (let j = 2; j < c.buf.length; j += NUM_RES) c.buf[j] = 3;
    });
    for (let k = 0; k < 4; k++) createBond(w, cells[k], cells[k + 1], Math.PI, 0);
    const cx0 = cells.reduce((a, c) => a + c.x, 0) / 5;
    const cy0 = cells.reduce((a, c) => a + c.y, 0) / 5;
    let pulses = 0;
    let prev = 0;
    for (let t = 0; t < 300; t++) {
      w.step();
      const on = cells[4].activation[cells[4].cd.byType[T.flagellum][0]] > 0.5 ? 1 : 0; // body flagellum
      if (on && !prev) pulses++;
      prev = on;
    }
    const cx1 = cells.reduce((a, c) => a + c.x, 0) / 5;
    const cy1 = cells.reduce((a, c) => a + c.y, 0) / 5;
    return { moved: Math.hypot(cx1 - cx0, cy1 - cy0), pulses, bonds: w.bonds.length };
  };

  it('a pacemaker wave makes the whole organism swim; without it the body stays still', () => {
    const live = chain(true);
    const dead = chain(false);
    expect(live.bonds).toBe(4);
    expect(live.pulses).toBeGreaterThanOrEqual(3); // tail flagellum beats in bursts
    expect(live.moved).toBeGreaterThan(15);
    expect(dead.pulses).toBe(0);
    expect(dead.moved).toBeLessThan(live.moved * 0.3);
  });
});
