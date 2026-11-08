import { describe, it, expect } from 'vitest';
import { canDivide, divide } from '../sim/lifecycle';
import { design, place, quietWorld, run } from './helpers';
import { protocell, filament } from '../sim/presets/designs';

const grower = (extra: Parameters<typeof design>[1] = () => {}, opts = {}) =>
  design('grower', (b) => {
    b.add('core', 0, 0, { divideAt: 2.1 });
    b.add('assembler', 180, 0.3, { rate: 0.12 });
    b.add('combustor', 0, 0.3);
    b.add('pore', 60);
    b.add('pore', -60);
    b.add('efflux', 180);
    extra(b);
  }, opts);

describe('cell division', () => {
  it('cells grow and divide on their own when fed', () => {
    const w = new (quietWorld().constructor as typeof import('../sim/world').World)({ seed: 2 });
    w.inoculate(protocell(), 1, w.env.cx, w.env.cy, 0);
    run(w, 1200);
    expect(w.cells.length).toBeGreaterThan(2);
  });

  it('requires a Codex Core and sufficient mass', () => {
    const w = quietWorld();
    const noCore = design('nocore', (b) => { b.add('assembler', 0, 0.3); });
    const c = place(w, noCore);
    c.mass = c.cd.divideMass * 2;
    expect(canDivide(w, c)).toBe(false);
    const d = place(w, grower(), w.env.cx + 100);
    expect(canDivide(w, d)).toBe(false); // too small
    run(w, 5);
    d.mass = d.cd.divideMass + 0.1;
    d.lastDivision = -1000;
    expect(canDivide(w, d)).toBe(true);
  });

  it('daughters inherit the strain without mutation, mutate when forced', () => {
    const w = quietWorld({ mutationRate: 0 });
    const c = place(w, grower());
    c.mass = c.cd.divideMass;
    const d1 = divide(w, c);
    expect(d1.strain).toBe(c.strain);
    w.params.mutationRate = 1;
    for (const comp of c.strain.design.components) if (comp.type === 'core') comp.params.fidelity = 0;
    c.cd.fidelity = 0;
    c.mass = c.cd.divideMass;
    const d2 = divide(w, c);
    expect(d2.strain).not.toBe(c.strain);
    expect(d2.strain.parentId).toBe(c.strain.id);
    expect(d2.strain.depth).toBe(c.strain.depth + 1);
    expect(d2.strain.note.length).toBeGreaterThan(0);
    expect(d2.strain.rootId).toBe(c.strain.rootId);
  });

  it('Codex fidelity lowers the mutation rate', () => {
    const count = (fidelity: number) => {
      const w = quietWorld({ mutationRate: 0.5 });
      const d = grower();
      for (const comp of d.components) if (comp.type === 'core') comp.params.fidelity = fidelity;
      const c = place(w, d);
      let muts = 0;
      for (let i = 0; i < 200; i++) {
        c.mass = c.cd.divideMass;
        const k = divide(w, c);
        if (k.strain !== c.strain) muts++;
      }
      return muts;
    };
    expect(count(1)).toBeLessThan(count(0) * 0.4);
  });

  it('bonded development keeps daughters attached until the organism is full', () => {
    const w = quietWorld({ feedRate: 0.004, lithFeedRate: 0.002 }, 0.6);
    const d = filament();
    d.development.maxCells = 4;
    w.inoculate(d, 1, w.env.cx, w.env.cy, 0);
    run(w, 4000);
    const sizes = [...w.organisms.values()].map((o) => o.size);
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(4);
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(3);
    // budding: more cells than one organism can hold
    expect(w.cells.length).toBeGreaterThan(4);
  });

  it('daughter tissue rules differentiate cells', () => {
    const w = quietWorld();
    const d = grower(() => {}, { dev: { daughterTissue: 'alternate' } });
    const c = place(w, d);
    c.mass = c.cd.divideMass;
    const k = divide(w, c);
    expect(c.tissue).toBe(0);
    expect(k.tissue).toBe(1);
    const d2 = grower(() => {}, { dev: { daughterTissue: 'toB' } });
    const p = place(w, d2, w.env.cx + 150);
    p.mass = p.cd.divideMass;
    expect(divide(w, p).tissue).toBe(1);
  });

  it('circuit-driven division and differentiation', () => {
    const w = quietWorld();
    const d = design('ctl', (b) => {
      b.add('core', 0, 0, { autoDivide: 0 });
      const k = b.node('const', 0, 0, { value: 1 });
      b.wire(k, b.node('action', 0, 0, { which: 4, k: 3 }));
    });
    const c = place(w, d);
    run(w, 2);
    expect(c.tissue).toBe(3);
    c.mass = c.cd.divideMass + 1;
    c.lastDivision = -1000;
    run(w, 3);
    expect(w.cells.length).toBe(1); // auto-divide off and no divide action
  });

  it('cells die and return matter when integrity runs out', () => {
    const w = quietWorld({ baseHeat: 1 });
    for (const i of w.env.inside) w.env.heat[i] = 1;
    const c = place(w, design('frail', (b) => { b.add('core', 0, 0); }));
    run(w, 400);
    expect(c.alive).toBe(false);
    expect(c.deathCause).toBe('heat');
    expect(w.cells.length).toBe(0);
  });
});
