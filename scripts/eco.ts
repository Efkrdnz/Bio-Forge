import { World } from '../src/sim/world';
import { templateDesigns } from '../src/sim/presets/designs';
const ids = (process.argv[2] ?? 'protocell').split(',');
const ticks = Number(process.argv[3] ?? 6000);
const w = new World({ seed: 5 });
for (const d of templateDesigns().filter((x) => ids.includes(x.id))) w.inoculate(d, 10, w.env.cx, w.env.cy, 300);
const t0 = performance.now();
for (let t = 1; t <= ticks; t++) {
  w.step();
  if (t % 1000 === 0) {
    const s = w.stats();
    const byRoot: Record<string, number> = {};
    for (const c of w.cells) byRoot[c.strain.rootId] = (byRoot[c.strain.rootId] ?? 0) + 1;
    console.log(t, JSON.stringify(byRoot), 'sorb', s.sorb.toFixed(0), 'lith', s.lith.toFixed(0), 'murk', s.murk.toFixed(0), 'bio', s.biomass.toFixed(0), 'deaths', JSON.stringify(w.deaths), 'strains', s.strains, 'ms', ((performance.now() - t0) / t).toFixed(2));
  }
}
