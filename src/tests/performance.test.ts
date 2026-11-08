import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { templateDesigns } from '../sim/presets/designs';
import { run } from './helpers';

describe('performance & stability', () => {
  it('steps a dense 700-cell mixed dish in a few milliseconds per tick', () => {
    const w = new World({ seed: 31, params: { maxPopulation: 700, feedRate: 0.006, lithFeedRate: 0.003 } });
    for (const d of templateDesigns()) w.inoculate(d, 64, w.env.cx, w.env.cy, 500);
    expect(w.cells.length).toBeGreaterThan(650);
    run(w, 50); // warm-up
    const t0 = performance.now();
    run(w, 200);
    const ms = (performance.now() - t0) / 200;
    console.log(`avg ${ms.toFixed(2)} ms/tick with ${w.cells.length} cells, ${w.bonds.length} bonds`);
    expect(ms).toBeLessThan(12);
  });

  it('stays numerically stable over a long run (no NaN, no escapes, bounded speeds)', () => {
    const w = new World({ seed: 32, params: { mutationRate: 0.4, mutationStrength: 2 } });
    for (const d of templateDesigns()) w.inoculate(d, 6, w.env.cx, w.env.cy, 400);
    for (let t = 0; t < 3000; t++) {
      w.step();
      if (t % 250 === 0) {
        for (const c of w.cells) {
          expect(Number.isFinite(c.x + c.y + c.mass + c.integrity + c.angle)).toBe(true);
          expect(Math.hypot(c.x - w.env.cx, c.y - w.env.cy)).toBeLessThan(w.env.R + 1);
          for (let k = 0; k < c.buf.length; k++) expect(c.buf[k]).toBeGreaterThan(-1e-6);
        }
        for (const i of w.env.inside) expect(w.env.sorb[i]).toBeGreaterThan(-1e-4);
      }
    }
  });

  it('complex cells (max components, big circuits) remain interactive', () => {
    const base = templateDesigns()[4];
    const w = new World({ seed: 33 });
    const d = JSON.parse(JSON.stringify(base));
    while (d.components.length < 28) d.components.push({ ...d.components[d.components.length - 1], uid: d.components.length + 100 });
    w.inoculate(d, 200, w.env.cx, w.env.cy, 500);
    const t0 = performance.now();
    run(w, 100);
    expect((performance.now() - t0) / 100).toBeLessThan(15);
  });
});
