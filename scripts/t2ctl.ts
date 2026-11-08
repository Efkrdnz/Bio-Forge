import { World } from '../src/sim/world';
import { allPresets } from '../src/sim/presets/experiments';
const exp = allPresets().find((e) => e.id === 'tut-2')!;
const w = new World({ seed: exp.seed, params: exp.params });
w.loadExperiment(exp);
for (let t = 0; t < 4000; t++) { w.step(); if (t % 500 === 499) console.log(t + 1, w.cells.length, JSON.stringify(w.goalStatus)); }
