import { World } from '../src/sim/world';
import { allPresets } from '../src/sim/presets/experiments';
const exp = allPresets().find((e) => e.id === 'exp-thermal')!;
const w = new World({ seed: exp.seed, params: exp.params });
w.loadExperiment(exp);
for (let t = 1; t <= 8000; t++) {
  w.step();
  if (t % 2000 === 0) {
    const out: string[] = [];
    for (const [d, r] of [[0.15, 0.15], [0.2, 0.2], [0.3, 0.15], [0.3, 0.2]]) {
      const x = w.env.cx + d * w.env.R, rr = r * w.env.R;
      const n = w.cells.filter((c) => c.strain.rootId === 'protocell' && Math.hypot(c.x - x, c.y - w.env.cy) < rr).length;
      const s = w.cells.filter((c) => c.strain.rootId === 'sentinel' && Math.hypot(c.x - x, c.y - w.env.cy) < rr).length;
      out.push(`d${d}r${r}: P${n}/S${s}`);
    }
    console.log(t, out.join('  '));
  }
}
