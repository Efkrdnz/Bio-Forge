import { World } from '../src/sim/world';
import { allPresets } from '../src/sim/presets/experiments';
const exp = allPresets().find((e) => e.id === 'exp-thermal')!;
const w = new World({ seed: exp.seed, params: exp.params });
w.loadExperiment(exp);
for (let t = 1; t <= 8000; t++) {
  w.step();
  if (t % 2000 === 0) {
    const ps = w.cells.filter((c) => c.strain.rootId === 'protocell');
    const xs = ps.map((c) => (c.x - w.env.cx) / w.env.R).sort((a, b) => a - b);
    const tol = ps.map((c) => c.cd.membrane.heatTolerance);
    console.log(t, 'n', ps.length, 'x p50', xs[Math.floor(xs.length / 2)]?.toFixed(2), 'x p95', xs[Math.floor(xs.length * 0.95)]?.toFixed(2), 'max', xs[xs.length - 1]?.toFixed(2), 'tol mean', (tol.reduce((a, b) => a + b, 0) / tol.length).toFixed(3), 'tol max', Math.max(...tol).toFixed(3), JSON.stringify(w.goalStatus.g1?.text));
  }
}
