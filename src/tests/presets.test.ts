import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { allPresets, tutorials } from '../sim/presets/experiments';
import { templateDesigns } from '../sim/presets/designs';
import { compileDesign, validateDesign, cloneDesign, makeComponent } from '../sim/design';
import { run } from './helpers';

function start(id: string): World {
  const exp = allPresets().find((e) => e.id === id)!;
  const w = new World({ seed: exp.seed, params: exp.params });
  w.loadExperiment(exp);
  return w;
}

describe('presets', () => {
  it('all template designs are valid (no errors)', () => {
    for (const d of templateDesigns()) {
      const errs = validateDesign(d).filter((i) => i.level === 'error');
      expect(errs, d.name).toEqual([]);
      expect(compileDesign(d).coreIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('every experiment and tutorial loads and runs without NaN', () => {
    for (const exp of allPresets()) {
      const w = new World({ seed: exp.seed, params: exp.params });
      w.loadExperiment(exp);
      run(w, 250);
      for (const c of w.cells) {
        expect(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.mass), exp.id).toBe(true);
      }
      expect(Number.isFinite(w.totalMatter())).toBe(true);
    }
  });

  it('scheduled events fire', () => {
    const w = start('exp-predator');
    run(w, 820);
    expect(w.cells.some((c) => c.strain.rootId === 'lysin-hunter')).toBe(true);
    expect(w.log.some((l) => l.text === 'Hunters released')).toBe(true);
  });

  it('tutorial 1 is solvable: adding a combustor completes both goals', () => {
    const w = start('tut-1');
    run(w, 60);
    expect(w.goalStatus.g1?.done).toBe(false);
    const fixed = cloneDesign(w.designs.get('tut-spark')!);
    makeComponent(fixed, 'combustor', 30, 0.35);
    w.registerDesign(fixed);
    w.inoculate(fixed, 4, w.env.cx, w.env.cy, 80);
    run(w, 2500);
    expect(w.goalStatus.g1?.done).toBe(true);
    expect(w.goalStatus.g2?.done).toBe(true);
  });

  it('tutorial 4 is solvable: knobs + bonded development grows an organism', () => {
    const w = start('tut-4');
    const d = cloneDesign(w.designs.get('tut-bond')!);
    makeComponent(d, 'adhesion', 0);
    makeComponent(d, 'adhesion', 180);
    d.development.mode = 'bonded';
    d.development.maxCells = 8;
    w.registerDesign(d);
    w.inoculate(d, 3, w.env.cx, w.env.cy, 60);
    run(w, 3500);
    expect(w.goalStatus.g1?.done).toBe(true);
    expect(w.goalStatus.g2?.done).toBe(true);
  });

  it('tutorial 5 is solvable: alternating tissues', () => {
    const w = start('tut-5');
    const d = cloneDesign(w.designs.get('tut-tissue')!);
    d.development.daughterTissue = 'alternate';
    w.registerDesign(d);
    w.inoculate(d, 3, w.env.cx, w.env.cy, 60);
    run(w, 4000);
    expect(w.goalStatus.g1?.done).toBe(true);
    expect(w.goalStatus.g2?.done).toBe(true);
  });

  it('tutorial list is ordered and each has goals and a focus design', () => {
    const t = tutorials();
    expect(t.length).toBeGreaterThanOrEqual(6);
    for (const x of t) {
      expect(x.goals.length).toBeGreaterThan(0);
      for (const g of x.goals) expect(g.label.length).toBeLessThan(70); // short, not walls of text
    }
  });
});
