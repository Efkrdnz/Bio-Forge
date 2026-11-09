import { World } from '../src/sim/world';
import { protocell, lysinHunter } from '../src/sim/presets/designs';
const w = new World({ seed: 9, params: { feedRate: 0.0016, mutationRate: 0 } });
w.inoculate(protocell(), 300, w.env.cx, w.env.cy, 400);
for (let t = 0; t < 600; t++) w.step();
const [h] = w.inoculate(lysinHunter(), 1, w.env.cx, w.env.cy, 0);
for (let t = 0; t <= 600; t++) {
  w.step();
  if (t % 100 === 0 && h.alive) {
    const names = h.cd.design.components.map((c) => c.type.slice(0, 6));
    console.log(t, 'gen', names.map((n, i) => h.eGen[i] > 0.001 ? `${n}+${(h.eGen[i] * 1000).toFixed(0)}` : '').filter(Boolean).join(' '),
      '| use', names.map((n, i) => `${n}-${(h.eUse[i] * 1000).toFixed(0)}`).join(' '), 'cell-', (h.eUse[h.cd.n] * 1000).toFixed(0), 'auto+', (h.eGen[h.cd.n + 1] * 1000).toFixed(0), 'mass', h.mass.toFixed(1), 'sorbTot', h.total(0).toFixed(1), 'feasts', w.feasts);
  }
}
