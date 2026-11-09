import { World } from '../src/sim/world';
import { experiments } from '../src/sim/presets/experiments';
const only = process.argv[2];
const ticks = Number(process.argv[3] ?? 8000);
for (const exp of experiments()) {
  if (only && exp.id !== only) continue;
  if (exp.id === 'exp-blank') continue;
  const w = new World({ seed: exp.seed, params: exp.params });
  w.loadExperiment(exp);
  const lines: string[] = [];
  for (let t = 1; t <= ticks; t++) {
    w.step();
    if (t % 1000 === 0) {
      const by: Record<string, number> = {};
      for (const c of w.cells) by[c.strain.rootId] = (by[c.strain.rootId] ?? 0) + 1;
      lines.push(`  t${t} ${Object.entries(by).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    }
  }
  console.log(exp.id, 'goals', Object.entries(w.goalStatus).map(([k, g]) => `${k}=${g.done ? 'DONE@' + g.doneTick : g.text}`).join(' | '), 'deaths', JSON.stringify(w.deaths));
  console.log(lines.join('\n'));
}
