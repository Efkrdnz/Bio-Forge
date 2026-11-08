import { describe, it, expect } from 'vitest';
import { Rng } from '../sim/rng';
import { mutateDesign, diffDesigns } from '../sim/evolution';
import { compileDesign, validateDesign } from '../sim/design';
import { templateDesigns } from '../sim/presets/designs';
import { MAX_COMPONENTS } from '../sim/constants';
import { World } from '../sim/world';
import { run } from './helpers';

describe('evolution', () => {
  it('mutation always yields compilable designs that keep their Codex Core', () => {
    const rng = new Rng(5);
    for (const base of templateDesigns()) {
      let d = base;
      for (let i = 0; i < 120; i++) {
        d = mutateDesign(d, rng, { strength: 2, structural: true, circuit: true }).design;
        const cd = compileDesign(d);
        expect(cd.n).toBeLessThanOrEqual(MAX_COMPONENTS);
        expect(d.components.filter((c) => c.type === 'core').length).toBe(1);
        expect(Number.isFinite(cd.buildMass)).toBe(true);
        expect(validateDesign(d).some((x) => x.text.startsWith('Only one Codex'))).toBe(false);
      }
    }
  });

  it('structural mutations can be disabled', () => {
    const rng = new Rng(9);
    const base = templateDesigns()[0];
    let d = base;
    for (let i = 0; i < 200; i++) d = mutateDesign(d, rng, { strength: 1, structural: false, circuit: false }).design;
    expect(d.components.length).toBe(base.components.length);
    expect(d.conduits.length).toBe(base.conduits.length);
  });

  it('is deterministic for a given seed', () => {
    const a = mutateDesign(templateDesigns()[3], new Rng(3), { strength: 1, structural: true, circuit: true });
    const b = mutateDesign(templateDesigns()[3], new Rng(3), { strength: 1, structural: true, circuit: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('diffDesigns reports changes', () => {
    const base = templateDesigns()[0];
    const { design } = mutateDesign(base, new Rng(1), { strength: 3, structural: true, circuit: true });
    const changed = JSON.stringify(base.components) !== JSON.stringify(design.components) || base.membrane.thickness !== design.membrane.thickness;
    if (changed) expect(diffDesigns(base, design).length).toBeGreaterThan(0);
  });

  it('builds a lineage tree with parent links and tracks extinction', () => {
    const w = new World({ seed: 12, params: { mutationRate: 0.6 } });
    w.inoculate(templateDesigns()[1], 10, w.env.cx, w.env.cy, 200);
    run(w, 2500);
    const strains = [...w.strains.values()];
    expect(strains.length).toBeGreaterThan(5);
    for (const s of strains) {
      if (s.parentId !== null && w.strains.has(s.parentId)) expect(w.strains.get(s.parentId)!.depth).toBe(s.depth - 1);
      expect(s.rootId).toBe('drifter');
      expect(s.population).toBe(w.cells.filter((c) => c.strain === s).length);
      if (s.population === 0) expect(s.extinctTick).not.toBeNull();
    }
    expect(Math.max(...strains.map((s) => s.depth))).toBeGreaterThan(1);
  });

  it('selection: a heat-tolerant design outcompetes a fragile one in a hot dish', () => {
    const designs = templateDesigns();
    const fragile = designs.find((d) => d.id === 'protocell')!;
    const tough = designs.find((d) => d.id === 'sentinel')!;
    const w = new World({ seed: 8, params: { baseHeat: 0.82, mutationRate: 0 } });
    for (const i of w.env.inside) w.env.heat[i] = 0.82;
    w.inoculate(fragile, 15, w.env.cx, w.env.cy, 300);
    w.inoculate(tough, 15, w.env.cx, w.env.cy, 300);
    run(w, 1500);
    const nf = w.cells.filter((c) => c.strain.rootId === 'protocell').length;
    const nt = w.cells.filter((c) => c.strain.rootId === 'sentinel').length;
    expect(nt).toBeGreaterThan(nf);
  });
});
