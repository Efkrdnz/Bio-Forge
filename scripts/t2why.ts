import { World } from '../src/sim/world';
import { allPresets } from '../src/sim/presets/experiments';
import { netEnergy } from '../src/tests/helpers';
for (const mut of [0, 0.1]) {
  const exp = allPresets().find((e) => e.id === 'tut-2')!;
  const w = new World({ seed: exp.seed, params: { ...exp.params, mutationRate: mut } });
  w.loadExperiment(exp);
  for (let t = 1; t <= 1500; t++) {
    w.step();
    let best = -1, bc = null as null | (typeof w.cells)[0];
    for (const c of w.cells) { const n = netEnergy(c); if (n > best) { best = n; bc = c; } }
    if (best > 0.055) { console.log('mut', mut, 'tick', t, 'net', (best * 1000).toFixed(1), 'age', bc!.age, 'depth', bc!.strain.depth, 'note', bc!.strain.note, 'mass', bc!.mass.toFixed(1)); break; }
    if (t === 1500) console.log('mut', mut, 'never; best at end', (best * 1000).toFixed(1));
  }
}
