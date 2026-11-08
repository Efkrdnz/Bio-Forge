import { World } from '../sim/world';
import type { CellDesign } from '../sim/design';
import { buildDesign, type BuildApi } from '../sim/presets/builder';
import type { SimParams } from '../sim/params';
import type { Cell } from '../sim/cell';

/** A quiet world: no feeding, no jitter, uniform fields. */
export function quietWorld(params: Partial<SimParams> = {}, fill = 0.4): World {
  return new World({
    seed: 42,
    params: { feedRate: 0, lithFeedRate: 0, murkDecay: 0, murkDrain: 0, brownian: 0, mutationRate: 0, ...params },
    fill,
  });
}

export function design(name: string, build: (b: BuildApi) => void, opts: Parameters<typeof buildDesign>[3] = {}): CellDesign {
  return buildDesign(`test-${name}`, name, 180, opts, build);
}

export function place(w: World, d: CellDesign, x = w.env.cx, y = w.env.cy, angle = 0): Cell {
  const c = w.spawn(d, x, y, angle)!;
  w.inoculate(d, 0, x, y); // flush pending births
  return c;
}

export function setField(w: World, field: 'sorb' | 'lith' | 'murk' | 'heat', value: number): void {
  const f = w.env.field(field);
  for (const i of w.env.inside) f[i] = value;
}

export function run(w: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) w.step();
}

export function netEnergy(c: Cell): number {
  let n = 0;
  for (let i = 0; i < c.eGen.length; i++) n += c.eGen[i] - c.eUse[i];
  return n;
}
