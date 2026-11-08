import { World } from '../src/sim/world';
import { templateDesigns } from '../src/sim/presets/designs';
import { sense, runCircuit, metabolize } from '../src/sim/metabolism';
import { predation, adhesionActions, exchangeAcrossBonds, updateChannels, cleanBonds, recomputeOrganisms } from '../src/sim/multicell';
import { lifecycle } from '../src/sim/lifecycle';
import { physicsStep } from '../src/sim/physics';
const w = new World({ seed: 31, params: { maxPopulation: 800, feedRate: 0.006, lithFeedRate: 0.003 } });
for (const d of templateDesigns()) w.inoculate(d, 70, w.env.cx, w.env.cy, 500);
for (let i = 0; i < 100; i++) w.step();
const T: Record<string, number> = {};
const tm = (k: string, f: () => void) => { const t = performance.now(); f(); T[k] = (T[k] ?? 0) + performance.now() - t; };
const N = 300;
for (let it = 0; it < N; it++) {
  tm('env', () => w.env.step(w.params, w.tick, w.ledger));
  tm('hash', () => w.hash.rebuild(w.cells));
  tm('sense', () => { for (const c of w.cells) { c.age++; sense(w, c); } });
  tm('circuit', () => { for (const c of w.cells) { runCircuit(w, c); updateChannels(c); } });
  tm('metab', () => { for (const c of w.cells) metabolize(w, c); });
  tm('predation', () => { for (const c of w.cells) { predation(w, c); adhesionActions(w, c); } });
  tm('exchange', () => exchangeAcrossBonds(w));
  tm('lifecycle', () => { for (const c of w.cells) if (c.alive) lifecycle(w, c); w.purgeDead(); (w as any).flushBirths(); });
  tm('hash2', () => w.hash.rebuild(w.cells));
  tm('physics', () => physicsStep(w));
  tm('orgs', () => { if (w.bondsDirty) { cleanBonds(w); recomputeOrganisms(w); w.bondsDirty = false; } });
  w.tick++;
}
let tot = 0; for (const v of Object.values(T)) tot += v;
console.log('cells', w.cells.length, 'bonds', w.bonds.length, 'total ms/tick', (tot / N).toFixed(2));
for (const [k, v] of Object.entries(T).sort((a, b) => b[1] - a[1])) console.log(k.padEnd(10), (v / N).toFixed(3));
