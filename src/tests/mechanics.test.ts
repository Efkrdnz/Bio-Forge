import { describe, it, expect } from 'vitest';
import { R_CHARGE, R_MURK, R_SORB, NUM_RES } from '../sim/constants';
import { design, place, quietWorld, run, setField } from './helpers';
import { kill } from '../sim/lifecycle';
import { murkEater } from '../sim/presets/designs';
import { World } from '../sim/world';

const drain = (c: { buf: Float64Array }) => {
  for (let k = R_CHARGE; k < c.buf.length; k += NUM_RES) c.buf[k] = 0;
};

describe('energy rules', () => {
  it('a fully drained combustor restarts itself when it has fuel (self-priming)', () => {
    const w = quietWorld();
    const d = design('prime', (b) => { b.add('core', 0, 0, { autoDivide: 0 }); b.add('combustor', 0, 0.2, { rate: 0.15 }); }, { membrane: 'shell' });
    const c = place(w, d);
    drain(c);
    c.buf[R_SORB] = c.cytoCap[R_SORB];
    run(w, 60);
    expect(c.total(R_CHARGE)).toBeGreaterThan(1);
  });

  it('the growth checkpoint stops the assembler when charge is scarce', () => {
    const mk = (charged: boolean) => {
      const w = quietWorld();
      const d = design('gate', (b) => { b.add('core', 0, 0, { autoDivide: 0 }); b.add('assembler', 0, 0.2, { rate: 0.12 }); }, { membrane: 'shell' });
      const c = place(w, d);
      c.buf[R_SORB] = c.cytoCap[R_SORB];
      c.buf[1] = c.cytoCap[1];
      if (!charged) drain(c);
      else for (let k = R_CHARGE; k < c.buf.length; k += NUM_RES) c.buf[k] = 50;
      const m0 = c.mass;
      run(w, 20);
      return c.mass - m0;
    };
    expect(mk(false)).toBeLessThan(0.01);
    expect(mk(true)).toBeGreaterThan(0.3);
  });

  it('a scavenger pore (murk only) pumps murk out of the dish', () => {
    const w = quietWorld();
    setField(w, 'murk', 4);
    setField(w, 'sorb', 4);
    const d = design('scav', (b) => { b.add('core', 0, 0); b.add('pore', 0, 1, { select: 3, rate: 0.05 }); }, { membrane: 'shell' });
    const c = place(w, d);
    const s0 = c.total(R_SORB);
    const m0 = c.total(R_MURK);
    run(w, 10);
    expect(c.total(R_MURK)).toBeGreaterThan(m0 + 0.2);
    expect(c.total(R_SORB)).toBeLessThanOrEqual(s0 + 0.05);
  });
});

describe('feasting', () => {
  it('a predator that lands the killing blow digests the prey, conserving matter', () => {
    const w = new World({ seed: 3, params: { feedRate: 0, lithFeedRate: 0, brownian: 0, mutationRate: 0 } });
    const hunter = design('hunt', (b) => { b.add('core', 0, 0, { autoDivide: 0 }); b.add('spike', 0, 1, { power: 2 }); });
    const prey = design('prey', (b) => { b.add('core', 0, 0, { autoDivide: 0 }); });
    const h = place(w, hunter, w.env.cx, w.env.cy, 0);
    const p = place(w, prey, w.env.cx + h.radius * 1.8, w.env.cy, 0);
    const before = w.totalMatter();
    const ledger0 = w.ledger.matterIn - w.ledger.matterOut;
    const hunterMatter0 = h.matter();
    const preyMatter = p.matter();
    for (let t = 0; t < 600 && p.alive; t++) w.step();
    expect(p.alive).toBe(false);
    expect(p.deathCause).toBe('predation');
    expect(w.feasts).toBe(1);
    expect(h.matter() - hunterMatter0).toBeGreaterThan(preyMatter * 0.5);
    expect(Math.abs(w.totalMatter() - before - (w.ledger.matterIn - w.ledger.matterOut - ledger0))).toBeLessThan(1e-3);
  });

  it('a cull is not a feast', () => {
    const w = quietWorld();
    const hunter = design('hunt', (b) => { b.add('core', 0, 0); b.add('spike', 0, 1, { power: 2 }); });
    const prey = design('prey', (b) => { b.add('core', 0, 0); });
    const h = place(w, hunter, w.env.cx, w.env.cy, 0);
    const p = place(w, prey, w.env.cx + h.radius * 1.8, w.env.cy, 0);
    run(w, 5);
    kill(w, p, 'culled');
    expect(w.feasts).toBe(0);
  });
});

describe('homeostasis circuits', () => {
  it('the Murk Eater closes its murk pores when it is full of murk', () => {
    const w = quietWorld({ lightIntensity: 1 });
    setField(w, 'murk', 5);
    const c = place(w, murkEater());
    const pores = c.cd.design.components.map((x, i) => (x.type === 'pore' && x.params.select === 3 ? i : -1)).filter((i) => i >= 0);
    run(w, 3);
    expect(pores.every((i) => c.activation[i] === 1)).toBe(true);
    for (let k = R_MURK; k < c.buf.length; k += NUM_RES) c.buf[k] = 50; // flood it
    run(w, 3);
    expect(pores.every((i) => c.activation[i] === 0)).toBe(true);
  });
});
