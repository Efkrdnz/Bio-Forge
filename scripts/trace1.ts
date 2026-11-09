// Usage: tsx scripts/trace1.ts <experimentId> <rootId> [ticks]
import { World } from '../src/sim/world';
import { allPresets } from '../src/sim/presets/experiments';
const [expId, root, T = '2000'] = process.argv.slice(2);
const exp = allPresets().find((e) => e.id === expId)!;
const w = new World({ seed: exp.seed, params: exp.params });
w.loadExperiment(exp);
const deaths: Record<string, number> = {};
const seen = new Set<number>();
for (let t = 1; t <= Number(T); t++) {
  const alive = new Set(w.cells.filter((c) => c.strain.rootId === root).map((c) => c.id));
  const snapshot = new Map(w.cells.filter((c) => c.strain.rootId === root).map((c) => [c.id, c]));
  w.step();
  for (const id of alive) if (!w.cellById(id)) { const c = snapshot.get(id)!; deaths[c.deathCause ?? '?'] = (deaths[c.deathCause ?? '?'] ?? 0) + 1; }
  if (t % 200 === 0) {
    const cs = w.cells.filter((c) => c.strain.rootId === root);
    const c = cs[0];
    if (!c) { console.log(t, 'extinct', JSON.stringify(deaths)); break; }
    let net = 0; for (let i = 0; i < c.eGen.length; i++) net += c.eGen[i] - c.eUse[i];
    const gi = w.env.index(c.x, c.y);
    console.log(t, 'n', cs.length, 'mass', c.mass.toFixed(1) + '/' + c.cd.divideMass.toFixed(0), 'ch', c.total(2).toFixed(1), 'sorb', c.total(0).toFixed(1), 'lith', c.total(1).toFixed(1), 'tox', c.toxicity.toFixed(2), 'int', c.integrity.toFixed(1), 'heat', w.env.heat[gi].toFixed(2), 'envMurk', w.env.murk[gi].toFixed(1), 'light', w.env.lightAt(c.x, c.y).toFixed(2), 'net', (net * 1000).toFixed(0), 'deaths', JSON.stringify(deaths));
  }
  void seen;
}
