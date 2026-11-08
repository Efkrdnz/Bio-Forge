import { World } from '../src/sim/world';
import { templateDesigns } from '../src/sim/presets/designs';
import { R_CHARGE } from '../src/sim/constants';

const ticks = Number(process.argv[2] ?? 3000);
const only = process.argv[3];
for (const d of templateDesigns()) {
  if (only && d.id !== only) continue;
  const w = new World({ seed: 3, params: { lightIntensity: 0.9 } });
  w.registerDesign(d);
  w.inoculate(d, 8, w.env.cx, w.env.cy, 150);
  const t0 = performance.now();
  const m0 = w.totalMatter();
  const line: string[] = [];
  for (let t = 0; t < ticks; t++) {
    w.step();
    if (t % 500 === 499) line.push(`${w.cells.length}`);
  }
  const ms = performance.now() - t0;
  const c = w.cells[0];
  const cd = w.strains.values().next().value!.compiled;
  console.log(
    d.id.padEnd(14),
    'pop', line.join(','),
    '| build', cd.buildMass.toFixed(1), 'div', cd.divideMass.toFixed(1),
    '| deaths', JSON.stringify(w.deaths),
    '| err', w.matterError(m0).toExponential(1),
    '| ms/tick', (ms / ticks).toFixed(2),
    c ? `| c0 m=${c.mass.toFixed(1)} ch=${c.total(R_CHARGE).toFixed(1)} int=${c.integrity.toFixed(1)}` : '',
    '| strains', w.strains.size, 'orgs', w.organisms.size,
  );
}
