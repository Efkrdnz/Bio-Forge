import { describe, it, expect } from 'vitest';
import { R_CHARGE, R_MURK, R_SORB } from '../sim/constants';
import { COMPONENT_DEFS, COMPONENT_TYPES } from '../sim/components';
import { compileDesign } from '../sim/design';
import { design, netEnergy, place, quietWorld, run, setField } from './helpers';
import { metabolize, sense, runCircuit } from '../sim/metabolism';

describe('component catalogue', () => {
  it('every component has a cost, an upkeep and a sane buffer', () => {
    for (const t of COMPONENT_TYPES) {
      const def = COMPONENT_DEFS[t];
      const p: Record<string, number> = {};
      for (const pd of def.params) p[pd.key] = pd.default;
      expect(def.massCost(p)).toBeGreaterThan(0);
      expect(def.upkeep(p)).toBeGreaterThan(0);
      expect(def.buffer(p).every((v) => v >= 0)).toBe(true);
      expect(def.blurb.length).toBeGreaterThan(10);
    }
  });

  it('more components raise build mass and division threshold', () => {
    const a = compileDesign(design('a', (b) => { b.add('core', 0, 0); }));
    const b = compileDesign(design('b', (b) => { b.add('core', 0, 0); b.add('combustor', 0, 0.3); b.add('flagellum', 180); }));
    expect(b.buildMass).toBeGreaterThan(a.buildMass);
    expect(b.divideMass).toBeGreaterThan(a.divideMass);
  });
});

describe('component behaviour', () => {
  it('Combustor turns sorb into charge and murk (1 → 3 + 1)', () => {
    const w = quietWorld();
    const d = design('burn', (b) => { b.add('core', 0, 0); b.add('combustor', 0, 0.2, { rate: 0.1 }); b.add('flagellum', 180, 1, { power: 2.5 }); }, { membrane: 'shell' });
    const c = place(w, d);
    c.buf[R_SORB] = c.cytoCap[R_SORB];
    c.buf[R_CHARGE] = 1;
    const s0 = c.total(R_SORB);
    const m0 = c.total(R_MURK);
    run(w, 60);
    const burned = s0 - c.total(R_SORB);
    expect(burned).toBeGreaterThan(0.5);
    // murk produced equals sorb burned (minus passive exchange through the veil)
    const murkMade = c.total(R_MURK) - m0;
    expect(murkMade).toBeGreaterThan(burned * 0.85);
    expect(murkMade).toBeLessThan(burned * 1.2);
    expect(c.eGen.reduce((a, v) => a + v, 0)).toBeGreaterThan(0.05);
  });

  it('Intake Pore draws sorb out of the dish at its location', () => {
    const w = quietWorld();
    setField(w, 'sorb', 6);
    const d = design('pore', (b) => { b.add('core', 0, 0); b.add('pore', 0, 1, { rate: 0.05 }); }, { membrane: 'shell' });
    const c = place(w, d);
    const gi = w.env.index(c.x + c.radius, c.y);
    const before = w.env.sorb[gi];
    const s0 = c.total(R_SORB);
    run(w, 5);
    expect(c.total(R_SORB)).toBeGreaterThan(s0);
    expect(w.env.sorb[gi]).toBeLessThan(before);
  });

  it('Efflux Pump expels murk into the dish', () => {
    const w = quietWorld();
    setField(w, 'murk', 0);
    const d = design('eff', (b) => { b.add('core', 0, 0); b.add('efflux', 0, 1, { rate: 0.2 }); }, { membrane: 'shell' });
    const c = place(w, d);
    c.buf[R_MURK] = c.cytoCap[R_MURK];
    const m0 = c.total(R_MURK);
    run(w, 80);
    expect(c.total(R_MURK)).toBeLessThan(m0 * 0.7);
    expect(w.env.totalMatter()).toBeGreaterThan(0);
  });

  it('Photovore produces charge only in light', () => {
    const lit = quietWorld({ lightIntensity: 1 });
    const dark = quietWorld({ lightIntensity: 0 });
    const d = design('pv', (b) => { b.add('core', 0, 0); b.add('photovore', 0, 0.4, { area: 2 }); });
    const a = place(lit, d);
    const b = place(dark, d);
    for (const c of [a, b]) for (let k = R_CHARGE; k < c.buf.length; k += 4) c.buf[k] = 0.2;
    const ca = a.total(R_CHARGE);
    const cb = b.total(R_CHARGE);
    run(lit, 60);
    run(dark, 60);
    expect(a.total(R_CHARGE) - ca).toBeGreaterThan(2);
    expect(b.total(R_CHARGE)).toBeLessThan(cb);
  });

  it('Capacitor increases total charge capacity', () => {
    const a = quietWorld();
    const base = design('noc', (b) => { b.add('core', 0, 0); });
    const cap = design('cap', (b) => { b.add('core', 0, 0); b.add('capacitor', 0, 0.3, { size: 2 }); });
    expect(place(a, cap).totalCap(R_CHARGE)).toBeGreaterThan(place(a, base).totalCap(R_CHARGE) + 10);
  });

  it('Assembler grows biomass; without it the cell does not grow', () => {
    const w = quietWorld();
    const grow = design('grow', (b) => { b.add('core', 0, 0, { autoDivide: 0 }); b.add('assembler', 0, 0.2, { rate: 0.1 }); b.add('combustor', 180, 0.2); });
    const still = design('still', (b) => { b.add('core', 0, 0, { autoDivide: 0 }); b.add('combustor', 180, 0.2); });
    const a = place(w, grow, w.env.cx - 150, w.env.cy);
    const b = place(w, still, w.env.cx + 150, w.env.cy);
    const ma = a.mass;
    const mb = b.mass;
    run(w, 200);
    expect(a.mass).toBeGreaterThan(ma + 0.5);
    expect(b.mass).toBeLessThanOrEqual(mb + 1e-9);
  });

  it('Murk Reclaimer converts murk to sorb at a net energy loss (no perpetual motion)', () => {
    const w = quietWorld();
    const d = design('rec', (b) => { b.add('core', 0, 0); b.add('reclaimer', 0, 0.2, { rate: 0.1 }); }, { membrane: 'shell' });
    const c = place(w, d);
    c.buf[R_MURK] = 4;
    c.buf[R_CHARGE] = c.cytoCap[R_CHARGE];
    const s0 = c.total(R_SORB);
    const ch0 = c.total(R_CHARGE);
    run(w, 100);
    const made = c.total(R_SORB) - s0;
    expect(made).toBeGreaterThan(0.3);
    // Burning that sorb would yield 3/unit, refining cost 3.5/unit
    expect(ch0 - c.total(R_CHARGE)).toBeGreaterThan(made * 3);
  });

  it('Flagellum pushes the cell away from its side', () => {
    const w = quietWorld();
    const d = design('swim', (b) => { b.add('core', 0, 0); b.add('flagellum', 180, 1, { power: 2 }); });
    const c = place(w, d, w.env.cx, w.env.cy, 0);
    c.buf[R_CHARGE] = c.cytoCap[R_CHARGE];
    for (let i = 1; i <= c.cd.n; i++) c.buf[i * 4 + R_CHARGE] = 2;
    const x0 = c.x;
    run(w, 60);
    expect(c.x - x0).toBeGreaterThan(10);
    expect(Math.abs(c.y - w.env.cy)).toBeLessThan(5);
  });

  it('Cilia rotate the cell', () => {
    const w = quietWorld();
    const d = design('spin', (b) => { b.add('core', 0, 0); b.add('cilia', 90, 1, { power: 2 }); });
    const c = place(w, d, w.env.cx, w.env.cy, 0);
    run(w, 40);
    expect(Math.abs(c.angle)).toBeGreaterThan(0.2);
  });

  it('Chemoreceptor reads dish nutrient at its position (directional)', () => {
    const w = quietWorld();
    for (const i of w.env.inside) w.env.sorb[i] = ((i % w.env.W) / w.env.W) * 10; // rich to the east
    const d = design('chem', (b) => { b.add('core', 0, 0); b.add('chemoreceptor', 0); b.add('chemoreceptor', 180); });
    const c = place(w, d, w.env.cx, w.env.cy, 0);
    sense(w, c);
    expect(c.sensors[0]).toBeGreaterThan(c.sensors[2]);
  });

  it('Heat stress damages a thin veil more than a Keratex shell with a Thermo Shield', () => {
    const w = quietWorld({ baseHeat: 0.95 });
    setField(w, 'heat', 0.95);
    const veil = design('veil', (b) => { b.add('core', 0, 0); });
    const shell = design('shell', (b) => { b.add('core', 0, 0); b.add('thermoshield', 0, 0.3); }, { membrane: 'shell', thickness: 2 });
    const a = place(w, veil, w.env.cx - 100, w.env.cy);
    const b = place(w, shell, w.env.cx + 100, w.env.cy);
    run(w, 40);
    expect(a.damage.heat).toBeGreaterThan(b.damage.heat * 1.5);
  });

  it('Lysin Spike damages touching foreign cells and siphons them', () => {
    const w = quietWorld();
    const hunter = design('hunt', (b) => { b.add('core', 0, 0); b.add('spike', 0, 1, { power: 2 }); });
    const prey = design('prey', (b) => { b.add('core', 0, 0); });
    const h = place(w, hunter, w.env.cx, w.env.cy, 0);
    const p = place(w, prey, w.env.cx + h.radius * 1.8, w.env.cy, 0);
    const i0 = p.integrity;
    run(w, 30);
    expect(p.damage.predation).toBeGreaterThan(0.2);
    expect(p.integrity).toBeLessThan(i0);
  });

  it('Armor facing a spike blocks most of the damage', () => {
    const mk = (armored: boolean) => {
      const w = quietWorld();
      const hunter = design('hunt', (b) => { b.add('core', 0, 0); b.add('spike', 0, 1, { power: 2 }); });
      const prey = design('prey', (b) => { b.add('core', 0, 0); if (armored) b.add('armor', 180); });
      const h = place(w, hunter, w.env.cx, w.env.cy, 0);
      const p = place(w, prey, w.env.cx + h.radius * 1.8, w.env.cy, 0);
      run(w, 30);
      return p.damage.predation;
    };
    expect(mk(true)).toBeLessThan(mk(false) * 0.5);
  });

  it('Conduits speed up the internal resource network', () => {
    const mk = (withConduit: boolean) => {
      const w = quietWorld();
      setField(w, 'sorb', 6);
      const d = design('pl', (b) => {
        b.add('core', 0, 0, { autoDivide: 0 });
        const v = b.add('vesicle', 180, 0.8, { size: 3 });
        const p = b.add('pore', 0, 1, { rate: 0.05 });
        const p2 = b.add('pore', 20, 1, { rate: 0.05 });
        if (withConduit) { b.conduit(p, v); b.conduit(p2, v); }
      }, { membrane: 'shell' });
      const c = place(w, d);
      run(w, 60);
      const vi = c.cd.uidToIndex.get(2)!; // vesicle uid
      return c.buf[(vi + 1) * 4 + R_SORB];
    };
    expect(mk(true)).toBeGreaterThan(mk(false) * 1.3);
  });

  it('Unexpressed components (tissue masks) do nothing and cost nothing', () => {
    const w = quietWorld();
    const d = design('tis', (b) => { b.add('core', 0, 0); b.add('combustor', 0, 0.3, { rate: 0.2 }, 2); });
    const c = place(w, d);
    c.tissue = 0;
    c.buf[R_SORB] = c.cytoCap[R_SORB];
    sense(w, c);
    runCircuit(w, c);
    for (let k = 0; k < 20; k++) metabolize(w, c);
    expect(c.eGen[1]).toBe(0);
    expect(c.eUse[1]).toBe(0);
    c.tissue = 1;
    for (let k = 0; k < 20; k++) metabolize(w, c);
    expect(c.eGen[1]).toBeGreaterThan(0);
  });

  it('starving cells digest their own biomass (autophagy) before dying', () => {
    const w = quietWorld();
    setField(w, 'sorb', 0);
    const d = design('hungry', (b) => { b.add('core', 0, 0); b.add('flagellum', 180); }, { membrane: 'shell' });
    const c = place(w, d);
    const m0 = c.mass;
    run(w, 400);
    expect(c.mass).toBeLessThan(m0);
    expect(netEnergy(c)).toBeLessThanOrEqual(0.001);
  });
});
