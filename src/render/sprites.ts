/**
 * Cached soft glow sprites for cheap additive bloom (no shadowBlur).
 */
const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function glowSprite(color: string, size = 64, falloff = 1): HTMLCanvasElement | OffscreenCanvas {
  const key = `${color}|${size}|${falloff}`;
  let c = cache.get(key);
  if (c) return c;
  c = makeCanvas(size, size);
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const at = (a: number) => color.replace(/[\d.]+\)$/, `${a})`);
  // Smooth (gaussian-like) falloff so sprites never show a hard edge
  grd.addColorStop(0, color);
  grd.addColorStop(0.15 * falloff, at(0.6));
  grd.addColorStop(0.35 * falloff, at(0.22));
  grd.addColorStop(0.6, at(0.07));
  grd.addColorStop(0.85, at(0.015));
  grd.addColorStop(1, at(0));
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  cache.set(key, c);
  return c;
}

/** Hue-bucketed glow for cells (36 buckets). */
export function hueGlow(hue: number, light = 60, alpha = 0.9): HTMLCanvasElement | OffscreenCanvas {
  const h = Math.round((((hue % 360) + 360) % 360) / 10) * 10;
  return glowSprite(`hsla(${h},95%,${light}%,${alpha})`);
}

export { makeCanvas };
