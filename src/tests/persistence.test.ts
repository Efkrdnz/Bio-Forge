import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { templateDesigns } from '../sim/presets/designs';
import { loadWorld, restore, saveWorld, snapshot } from '../sim/serialize';
import { normalizeDesign, compileDesign, type CellDesign } from '../sim/design';
import { run } from './helpers';

function fingerprint(w: World): string {
  const parts: string[] = [`t${w.tick}`, `n${w.cells.length}`, `b${w.bonds.length}`, `s${w.strains.size}`];
  for (const c of w.cells) parts.push(`${c.id}:${c.x.toFixed(6)},${c.y.toFixed(6)},${c.mass.toFixed(6)},${c.integrity.toFixed(6)},${c.tissue},${c.strain.id}`);
  let e = 0;
  for (const i of w.env.inside) e += w.env.sorb[i] * (i % 7) + w.env.murk[i];
  parts.push(e.toFixed(4));
  return parts.join('|');
}

function busyWorld(): World {
  const w = new World({ seed: 77, params: { mutationRate: 0.3 } });
  for (const d of templateDesigns()) w.inoculate(d, 3, w.env.cx, w.env.cy, 250);
  return w;
}

describe('persistence', () => {
  it('snapshot → restore → step reproduces the original run exactly (determinism)', () => {
    const a = busyWorld();
    run(a, 400);
    const snap = snapshot(a);
    run(a, 300);
    const b = restore(snap);
    run(b, 300);
    expect(fingerprint(b)).toBe(fingerprint(a));
  });

  it('JSON save/load round-trips the full world', () => {
    const a = busyWorld();
    run(a, 300);
    const json = saveWorld(a);
    const b = loadWorld(json);
    expect(fingerprint(b)).toBe(fingerprint(a));
    expect(b.bonds.length).toBe(a.bonds.length);
    expect(b.organisms.size).toBe(a.organisms.size);
    expect(b.ledger.matterIn).toBe(a.ledger.matterIn);
    expect(b.history.length).toBe(a.history.length);
    run(a, 200);
    run(b, 200);
    expect(fingerprint(b)).toBe(fingerprint(a));
    expect(Math.abs(b.matterError()) / b.totalMatter()).toBeLessThan(1e-5);
  });

  it('rejects files that are not BIOFORGE worlds', () => {
    expect(() => loadWorld('{"hello":1}')).toThrow();
  });

  it('normalises damaged / partial designs instead of crashing', () => {
    const junk = {
      id: 'x',
      name: 'junk',
      hue: 10,
      membrane: { type: 'nope', thickness: 99 },
      components: [
        { uid: 1, type: 'core', angle: 0, dist: 5, params: { divideAt: 999 }, tissues: 0 },
        { uid: 2, type: 'warp-drive', angle: 0, dist: 0, params: {}, tissues: 1 },
        { uid: 3, type: 'pore', angle: 1, dist: 0.2, params: { rate: 'fast' }, tissues: 1 },
      ],
      conduits: [{ a: 1, b: 99 }],
      circuit: { nodes: [{ id: 1, kind: 'sensor', x: 0, y: 0, params: {}, ref: 99, port: 'x' }], wires: [{ from: 1, to: 7, slot: 0 }] },
    } as unknown as CellDesign;
    const d = normalizeDesign(junk);
    expect(d.membrane.type).toBe('veil');
    expect(d.membrane.thickness).toBe(2);
    expect(d.components.length).toBe(2);
    expect(d.components[0].params.divideAt).toBe(4);
    expect(d.components[1].dist).toBe(1);
    expect(d.conduits.length).toBe(0);
    const cd = compileDesign(d);
    expect(cd.n).toBe(2);
  });
});
