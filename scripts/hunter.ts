import { World } from '../src/sim/world';
import { protocell, lysinHunter } from '../src/sim/presets/designs';
import { R_CHARGE } from '../src/sim/constants';
const w = new World({ seed: 9, params: { feedRate: 0.0016, mutationRate: 0 } });
w.inoculate(protocell(), 300, w.env.cx, w.env.cy, 400);
for (let t = 0; t < 600; t++) w.step();
const [h] = w.inoculate(lysinHunter(), 1, w.env.cx, w.env.cy, 0);
let dealt = 0;
for (let t = 0; t <= 2000; t++) {
  const before = w.cells.reduce((a, c) => a + c.damage.predation, 0);
  w.step();
  dealt += w.cells.reduce((a, c) => a + c.damage.predation, 0) - before;
  if (t % 200 === 0) {
    if (!h.alive) { console.log(t, 'hunter dead', h.deathCause); break; }
    let net = 0; for (let i = 0; i < h.eGen.length; i++) net += h.eGen[i] - h.eUse[i];
    const sp = h.cd.byType[29];
    if (t >= 200 && t <= 600) {
      const names = h.cd.design.components.map((c) => c.type.slice(0, 5));
      const rows = ['cyto', ...names].map((n, k) => `${n}:${[0, 1, 2, 3].map((r) => h.buf[k * 4 + r].toFixed(2)).join('/')}`);
      console.log('   ', rows.join('  '));
      console.log('    act', names.map((n, i) => `${n}:${h.activity[i].toFixed(2)}`).join(' '), 'cytoCap', [...h.cytoCap].map((v) => v.toFixed(1)).join('/'), 'tox', h.toxicity.toFixed(2));
    }
    console.log(t, 'mass', h.mass.toFixed(1), '/', h.cd.divideMass.toFixed(1), 'ch', h.total(R_CHARGE).toFixed(1), 'int', h.integrity.toFixed(1), 'net', (net * 1000).toFixed(1), 'dealt', dealt.toFixed(1), 'feasts', w.feasts, 'spikeAct', sp.map((i) => h.activity[i].toFixed(2)).join(','), 'prox', [...h.sensors].map((v) => v.toFixed(2)).join(','), 'hunters', w.cells.filter((c) => c.strain.rootId === 'lysin-hunter').length);
  }
}
