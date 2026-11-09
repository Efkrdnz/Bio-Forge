// Usage: tsx scripts/budget.ts <experimentId> <rootId> <tick>
import { World } from '../src/sim/world';
import { allPresets } from '../src/sim/presets/experiments';
const [expId, root, T = '1500'] = process.argv.slice(2);
const exp = allPresets().find((e) => e.id === expId)!;
const w = new World({ seed: exp.seed, params: exp.params });
w.loadExperiment(exp);
for (let t = 0; t < Number(T); t++) w.step();
for (const c of w.cells.filter((x) => x.strain.rootId === root).slice(0, 2)) {
  const names = c.cd.design.components.map((x, i) => `${x.type.slice(0, 6)}#${i}`);
  console.log('cell', c.id, 'mass', c.mass.toFixed(1), 'age', c.age, 'charge', c.total(2).toFixed(1), '/', c.totalCap(2).toFixed(1));
  console.log('  gen', names.map((n, i) => (c.eGen[i] > 1e-4 ? `${n}+${(c.eGen[i] * 1000).toFixed(1)}` : '')).filter(Boolean).join(' '), 'auto+', (c.eGen[c.cd.n + 1] * 1000).toFixed(1));
  console.log('  use', names.map((n, i) => `${n}-${(c.eUse[i] * 1000).toFixed(1)}`).join(' '), 'cell-', (c.eUse[c.cd.n] * 1000).toFixed(1));
  console.log('  act', names.map((n, i) => `${n}:${c.activity[i].toFixed(2)}/${c.activation[i].toFixed(2)}`).join(' '));
}
