// Headless check that tutorials 2, 3 and 6 are solvable with the intended fix.
import { World } from '../src/sim/world';
import { allPresets } from '../src/sim/presets/experiments';
import { cloneDesign } from '../src/sim/design';
import { netEnergy } from '../src/tests/helpers';

function start(id: string) {
  const exp = allPresets().find((e) => e.id === id)!;
  const w = new World({ seed: exp.seed, params: exp.params });
  w.loadExperiment(exp);
  return w;
}
const which = process.argv[2] ?? 'all';
if (which === 'all' || which === '2') {
  const w = start('tut-2');
  for (let t = 0; t < 600; t++) w.step();
  let best = -1;
  for (const c of w.cells) best = Math.max(best, netEnergy(c));
  console.log('tut-2 before fix: best net', (best * 1000).toFixed(1), 'goal1', w.goalStatus.g1?.text);
  const d = cloneDesign(w.designs.get('tut-plumb')!);
  const comb = d.components.find((c) => c.type === 'combustor')!;
  for (const p of d.components.filter((c) => c.type === 'pore')) d.conduits.push({ a: p.uid, b: comb.uid });
  w.registerDesign(d);
  w.inoculate(d, 4, w.env.cx, w.env.cy, 80);
  for (let t = 0; t < 2500; t++) w.step();
  best = -1;
  for (const c of w.cells) if (c.strain.design.conduits.length) best = Math.max(best, netEnergy(c));
  console.log('tut-2 after fix: best net', (best * 1000).toFixed(1), JSON.stringify(w.goalStatus));
}
if (which === 'all' || which === '3') {
  for (const mode of ['direct', 'compare']) {
    const w = start('tut-3');
    const d = cloneDesign(w.designs.get('tut-gradient')!);
    const nodes = d.circuit.nodes;
    const sens = nodes.filter((n) => n.kind === 'sensor');
    const acts = nodes.filter((n) => n.kind === 'actuator');
    // sensor 0 is left (+35°), actuators: [right flagellum, left flagellum] as built
    const leftS = sens[0], rightS = sens[1];
    const rightA = acts[0], leftA = acts[1];
    if (mode === 'direct') {
      d.circuit.wires.push({ from: leftS.id, to: rightA.id, slot: 0 }, { from: rightS.id, to: leftA.id, slot: 0 });
    } else {
      let id = 100;
      const add = (kind: string, params: Record<string, number> = {}) => { const n = { id: id++, kind, x: 0, y: 0, params } as never; nodes.push(n); return (n as { id: number }).id; };
      const cL = add('compare'), cR = add('compare'), k = add('const', { value: 0.35 }), mR = add('add'), mL = add('add');
      d.circuit.wires.push({ from: leftS.id, to: cL, slot: 0 }, { from: rightS.id, to: cL, slot: 1 }, { from: rightS.id, to: cR, slot: 0 }, { from: leftS.id, to: cR, slot: 1 },
        { from: cL, to: mR, slot: 0 }, { from: k, to: mR, slot: 1 }, { from: cR, to: mL, slot: 0 }, { from: k, to: mL, slot: 1 }, { from: mR, to: rightA.id, slot: 0 }, { from: mL, to: leftA.id, slot: 0 });
    }
    w.registerDesign(d);
    w.cullWhere(() => true);
    w.inoculate(d, 8, w.env.cx - w.env.R * 0.65, w.env.cy, w.env.R * 0.12);
    let doneAt = -1;
    for (let t = 0; t < 6000; t++) { w.step(); if (doneAt < 0 && w.goalStatus.g1?.done) doneAt = w.tick; }
    console.log('tut-3', mode, 'goal done at', doneAt, w.goalStatus.g1?.text, 'pop', w.cells.length);
  }
  // control: unwired blind gliders
  const w = start('tut-3');
  for (let t = 0; t < 6000; t++) w.step();
  console.log('tut-3 control (no wiring):', w.goalStatus.g1?.text, 'done', w.goalStatus.g1?.done, 'pop', w.cells.length);
}
if (which === 'all' || which === '6') {
  const w = start('tut-6');
  for (let t = 0; t < 7200; t++) { w.step(); if (t % 1000 === 999) console.log('tut-6 t', t + 1, 'pop', w.cells.length, JSON.stringify(w.goalStatus)); }
}
