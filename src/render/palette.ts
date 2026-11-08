import { RES_COLOR } from '../sim/constants';

export const TISSUE_COLORS = ['#3ef0c6', '#ffb347', '#ff6fd8', '#6fb8ff'];
export const RES_COLORS = [RES_COLOR.sorb, RES_COLOR.lith, RES_COLOR.charge, RES_COLOR.murk];

export function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${h.toFixed(0)},${s}%,${l}%,${a.toFixed(3)})`;
}

/** Ramp from a list of [r,g,b] stops for t in [0,1]. */
export function ramp(stops: [number, number, number][], t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export const RAMPS: Record<string, [number, number, number][]> = {
  sorb: [
    [4, 10, 18],
    [8, 70, 80],
    [40, 200, 170],
    [200, 255, 230],
  ],
  lith: [
    [6, 8, 16],
    [90, 60, 20],
    [230, 170, 60],
    [255, 240, 190],
  ],
  murk: [
    [6, 6, 16],
    [70, 20, 90],
    [190, 70, 220],
    [255, 190, 255],
  ],
  heat: [
    [20, 60, 200],
    [20, 160, 200],
    [20, 30, 40],
    [230, 120, 30],
    [255, 60, 40],
  ],
  light: [
    [4, 6, 12],
    [80, 70, 20],
    [240, 220, 120],
    [255, 255, 230],
  ],
  echo: [
    [6, 6, 14],
    [120, 20, 100],
    [255, 100, 220],
    [255, 230, 250],
  ],
};
