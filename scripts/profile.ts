import { World } from '../src/sim/world';
import { templateDesigns } from '../src/sim/presets/designs';
const w = new World({ seed: 31, params: { maxPopulation: 800, feedRate: 0.006, lithFeedRate: 0.003 } });
for (const d of templateDesigns()) w.inoculate(d, 70, w.env.cx, w.env.cy, 500);
for (let i = 0; i < 50; i++) w.step();
const t0 = performance.now();
for (let i = 0; i < 400; i++) w.step();
console.log('cells', w.cells.length, 'ms/tick', ((performance.now() - t0) / 400).toFixed(2));
