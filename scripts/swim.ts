import { World } from '../src/sim/world';
import { pulseSwimmer } from '../src/sim/presets/designs';
const w = new World({ seed: 4, params: { feedRate: 0.004, lithFeedRate: 0.002, mutationRate: 0, maxPopulation: 60 } });
const d = pulseSwimmer();
w.inoculate(d, 1, w.env.cx, w.env.cy, 0);
let biggest = 0;
for (let t = 0; t < 2500; t++) {
  w.step();
  for (const o of w.organisms.values()) biggest = Math.max(biggest, o.size);
}
console.log('cells', w.cells.length, 'organisms', w.organisms.size, 'largest ever', biggest);
// pick largest organism, track centroid and channel wave
const org = [...w.organisms.values()].filter((o) => w.cells.some((c) => c.organismId === o.id && c.tissue === 0)).sort((a, b) => b.size - a.size)[0];
const members = w.cells.filter((c) => c.organismId === org.id);
const cen = () => { let x = 0, y = 0; for (const c of members) { x += c.x; y += c.y; } return [x / members.length, y / members.length]; };
const p0 = cen();
const rows: string[] = [];
for (let t = 0; t < 300; t++) {
  w.step();
  if (t % 10 === 0) rows.push(members.map((c) => (c.alive ? c.channels[0].toFixed(2) : '--') + (c.tissue === 0 ? '*' : ' ')).join(' '));
}
const p1 = cen();
console.log('organism size', members.length, 'moved', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(1), 'in 300 ticks');
console.log(rows.slice(0, 12).join('\n'));
