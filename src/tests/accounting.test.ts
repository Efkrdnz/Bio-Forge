import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { templateDesigns } from '../sim/presets/designs';
import { divide, kill } from '../sim/lifecycle';
import { run } from './helpers';

const rel = (w: World) => Math.abs(w.matterError()) / Math.max(1, w.totalMatter());

describe('resource accounting', () => {
  it('conserves matter across a busy mixed ecosystem (births, deaths, predation, bonds)', () => {
    const w = new World({ seed: 9, params: { mutationRate: 0.3 } });
    for (const d of templateDesigns()) w.inoculate(d, 4, w.env.cx, w.env.cy, 300);
    run(w, 1500);
    expect(w.births).toBeGreaterThan(50);
    expect(rel(w)).toBeLessThan(1e-5);
  });

  it('records brushes, culls and inoculations in the ledger', () => {
    const w = new World({ seed: 3 });
    const d = templateDesigns()[0];
    w.inoculate(d, 20, w.env.cx, w.env.cy, 200);
    run(w, 200);
    w.brush('sorb', w.env.cx, w.env.cy, 80, 5);
    w.brush('murk', w.env.cx + 100, w.env.cy, 60, 3);
    w.brush('sorb', w.env.cx - 100, w.env.cy, 60, -50);
    w.cull(w.env.cx, w.env.cy, 60);
    run(w, 200);
    expect(rel(w)).toBeLessThan(1e-5);
  });

  it('division splits matter exactly in half and conserves the total', () => {
    const w = new World({ seed: 4, params: { mutationRate: 0 } });
    const d = templateDesigns()[0];
    const [c] = w.inoculate(d, 1, w.env.cx, w.env.cy, 0);
    const before = c.matter();
    const massBefore = c.mass;
    const daughter = divide(w, c);
    expect(c.mass).toBeCloseTo(massBefore / 2, 10);
    expect(daughter.mass).toBeCloseTo(massBefore / 2, 10);
    expect(c.matter() + daughter.matter()).toBeCloseTo(before, 9);
  });

  it('death returns all cell matter to the dish', () => {
    const w = new World({ seed: 5 });
    const [c] = w.inoculate(templateDesigns()[0], 1, w.env.cx, w.env.cy, 0);
    const envBefore = w.env.totalMatter();
    const cellMatter = c.matter();
    kill(w, c, 'culled');
    expect(w.env.totalMatter() - envBefore).toBeCloseTo(cellMatter, 2);
    expect(c.matter()).toBe(0);
  });

  it('tracks energy production and consumption in the ledger', () => {
    const w = new World({ seed: 6 });
    w.inoculate(templateDesigns()[0], 10, w.env.cx, w.env.cy, 100);
    run(w, 300);
    expect(w.ledger.energyIn).toBeGreaterThan(0);
    expect(w.ledger.energyOut).toBeGreaterThan(0);
    // Charge held by cells can never exceed what was produced plus initial provisions
    const held = w.cells.reduce((a, c) => a + c.total(2), 0);
    expect(held).toBeLessThan(w.ledger.energyIn + 30 * w.births + 1000);
  });
});
