import { World } from '../src/sim/world';
import { templateDesigns } from '../src/sim/presets/designs';
const id = process.argv[2] ?? 'sentinel';
const d = templateDesigns().find((x) => x.id === id)!;
const w = new World({ seed: 3 });
w.inoculate(d, 1, w.env.cx, w.env.cy, 0);
const c = w.cells[0];
for (let t = 0; t <= 1500; t++) {
  w.step();
  if (t % 100 === 0 && c.alive) {
    const res = [0, 1, 2, 3].map((r) => `${c.total(r).toFixed(1)}/${c.totalCap(r).toFixed(1)}`);
    const comps = c.cd.design.components.map((x, i) => `${x.type}:${c.activity[i].toFixed(2)}`).join(' ');
    console.log(t, 'm', c.mass.toFixed(2), 'int', c.integrity.toFixed(2), 'res s/l/c/m', res.join(' '), 'gen', [...c.eGen].reduce((a, b) => a + b).toFixed(3), 'use', [...c.eUse].reduce((a, b) => a + b).toFixed(3), 'tox', c.toxicity.toFixed(2), 'mflow', [...c.membraneFlow].map(v=>v.toFixed(3)).join(','));
    if (t === 500) console.log(comps);
  }
}
console.log('alive', c.alive, c.deathCause, w.cells.length, 'err', w.matterError().toExponential(2));
