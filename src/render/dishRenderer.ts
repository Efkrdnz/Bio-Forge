/**
 * Renders the petri dish: background, field textures, ambient resource
 * particles, bonds with travelling signals, cells (LOD), effects, overlays.
 */
import { GRID_CELL, NUM_RES, TAU } from '../sim/constants';
import type { World } from '../sim/world';
import { T } from '../sim/components';
import type { Cell } from '../sim/cell';
import { Camera } from './camera';
import { drawCell, drawCellDot, lookFromCell, type CellLook } from './cellDraw';
import { RAMPS, RES_COLORS, ramp } from './palette';
import { glowSprite, makeCanvas } from './sprites';

export type FieldOverlay = 'none' | 'sorb' | 'lith' | 'murk' | 'heat' | 'light' | 'echoA' | 'echoB';
export type ColorMode = 'strain' | 'tissue' | 'health';

export interface RenderOptions {
  overlay: FieldOverlay;
  colorMode: ColorMode;
  showFlow: boolean;
  showParticles: boolean;
  showBonds: boolean;
  selectedId: number | null;
  hoverId: number | null;
  brush?: { x: number; y: number; r: number; color: string } | null;
  highlightRoot?: string | null;
  quality: 'high' | 'low';
}

const P_STRIDE = 6;

export class DishRenderer {
  private fieldCanvas = makeCanvas(120, 120);
  private fieldImg: ImageData | null = null;
  private fieldStamp = -1;
  private fieldOverlayKey = '';
  private particles: Float32Array;
  private nParticles: number;
  private looks = new Map<number, CellLook>();
  private bg: HTMLCanvasElement | OffscreenCanvas | null = null;
  private bgKey = '';
  private frame = 0;

  constructor(nParticles = 900) {
    this.nParticles = nParticles;
    this.particles = new Float32Array(nParticles * P_STRIDE);
  }

  private ensureField(world: World, overlay: FieldOverlay) {
    const env = world.env;
    if (this.fieldCanvas.width !== env.W || this.fieldCanvas.height !== env.H) {
      this.fieldCanvas = makeCanvas(env.W, env.H);
      this.fieldImg = null;
    }
    const key = overlay;
    // Refresh ~8 Hz of sim time or when the overlay changes
    if (this.fieldImg && key === this.fieldOverlayKey && world.tick - this.fieldStamp < 4 && world.tick >= this.fieldStamp) return;
    this.fieldOverlayKey = key;
    this.fieldStamp = world.tick;
    const g = this.fieldCanvas.getContext('2d') as CanvasRenderingContext2D;
    if (!this.fieldImg) this.fieldImg = g.createImageData(env.W, env.H);
    const d = this.fieldImg.data;
    const p = world.params;
    const ms = p.maxSorb;
    const ml = p.maxLith;
    const lm = env.lightMul;
    for (let i = 0; i < env.W * env.H; i++) {
      const o = i * 4;
      if (!env.mask[i]) {
        d[o + 3] = 0;
        continue;
      }
      let r: number;
      let gg: number;
      let b: number;
      let a = 255;
      switch (overlay) {
        case 'none': {
          const s = Math.min(1.4, env.sorb[i] / ms);
          const l = Math.min(1.4, env.lith[i] / ml);
          const m = Math.min(1.5, env.murk[i] / 5);
          const li = env.lightBase[i] * lm;
          const h = env.heat[i] - 0.5;
          r = 3 + 6 * s + 34 * l + 70 * m + 16 * li + Math.max(0, h) * 120;
          gg = 9 + 46 * s + 22 * l + 10 * m + 15 * li;
          b = 16 + 40 * s + 4 * l + 84 * m + 6 * li + Math.max(0, -h) * 120;
          break;
        }
        case 'sorb':
          [r, gg, b] = ramp(RAMPS.sorb, env.sorb[i] / ms);
          break;
        case 'lith':
          [r, gg, b] = ramp(RAMPS.lith, env.lith[i] / ml);
          break;
        case 'murk':
          [r, gg, b] = ramp(RAMPS.murk, env.murk[i] / 6);
          break;
        case 'heat':
          [r, gg, b] = ramp(RAMPS.heat, env.heat[i]);
          break;
        case 'light':
          [r, gg, b] = ramp(RAMPS.light, env.lightBase[i] * lm);
          break;
        case 'echoA':
          [r, gg, b] = ramp(RAMPS.echo, Math.min(1, env.echoA[i] * 2));
          break;
        case 'echoB':
          [r, gg, b] = ramp(RAMPS.echo, Math.min(1, env.echoB[i] * 2));
          break;
        default:
          r = gg = b = 0;
          a = 0;
      }
      d[o] = r;
      d[o + 1] = gg;
      d[o + 2] = b;
      d[o + 3] = a;
    }
    g.putImageData(this.fieldImg, 0, 0);
  }

  private ensureBackground(w: number, h: number) {
    const key = `${w}x${h}`;
    if (this.bg && this.bgKey === key) return;
    this.bgKey = key;
    this.bg = makeCanvas(w, h);
    const g = this.bg.getContext('2d') as CanvasRenderingContext2D;
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    grd.addColorStop(0, '#07131c');
    grd.addColorStop(1, '#010306');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,200,220,0.045)';
    g.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      g.beginPath();
      g.moveTo(x + 0.5, 0);
      g.lineTo(x + 0.5, h);
      g.stroke();
    }
    for (let y = 0; y < h; y += 40) {
      g.beginPath();
      g.moveTo(0, y + 0.5);
      g.lineTo(w, y + 0.5);
      g.stroke();
    }
  }

  private seedParticle(world: World, k: number) {
    const env = world.env;
    const P = this.particles;
    const o = k * P_STRIDE;
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * TAU;
      const rr = Math.sqrt(Math.random()) * env.R * 0.98;
      const x = env.cx + Math.cos(a) * rr;
      const y = env.cy + Math.sin(a) * rr;
      const i = env.index(x, y);
      const s = env.sorb[i] / world.params.maxSorb;
      const l = env.lith[i] / world.params.maxLith;
      const m = Math.min(1, env.murk[i] / 4);
      const tot = s + l * 0.6 + m;
      if (Math.random() * 1.6 > tot && tries < 5) continue;
      const pick = Math.random() * tot;
      P[o] = x;
      P[o + 1] = y;
      P[o + 2] = (Math.random() - 0.5) * 0.3;
      P[o + 3] = (Math.random() - 0.5) * 0.3;
      P[o + 4] = pick < s ? 0 : pick < s + l * 0.6 ? 1 : 3;
      P[o + 5] = 200 + Math.random() * 400;
      return;
    }
  }

  private updateParticles(world: World, dt: number) {
    const P = this.particles;
    const env = world.env;
    for (let k = 0; k < this.nParticles; k++) {
      const o = k * P_STRIDE;
      P[o + 5] -= dt * 60;
      if (P[o + 5] <= 0 || P[o] === 0) {
        this.seedParticle(world, k);
        continue;
      }
      P[o + 2] += (Math.random() - 0.5) * 0.06;
      P[o + 3] += (Math.random() - 0.5) * 0.06;
      P[o + 2] *= 0.97;
      P[o + 3] *= 0.97;
      P[o] += P[o + 2] * dt * 30;
      P[o + 1] += P[o + 3] * dt * 30;
      if (!env.insideDish(P[o], P[o + 1], 2)) P[o + 5] = 0;
    }
  }

  render(ctx: CanvasRenderingContext2D, world: World, cam: Camera, opts: RenderOptions, t: number, dt: number, dpr: number) {
    this.frame++;
    const W = cam.width;
    const H = cam.height;
    const env = world.env;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ensureBackground(Math.ceil(W), Math.ceil(H));
    ctx.drawImage(this.bg as CanvasImageSource, 0, 0, W, H);

    // world transform
    const z = cam.zoom;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z), dpr * (H / 2 - cam.y * z));
    const [vx0, vy0] = cam.toWorld(0, 0);
    const [vx1, vy1] = cam.toWorld(W, H);

    // Dish fluid + field
    this.ensureField(world, opts.overlay);
    ctx.save();
    ctx.beginPath();
    ctx.arc(env.cx, env.cy, env.R, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#050d14';
    ctx.fillRect(env.cx - env.R, env.cy - env.R, env.R * 2, env.R * 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = opts.overlay === 'none' ? 1 : 0.92;
    ctx.drawImage(this.fieldCanvas as CanvasImageSource, 0, 0, env.W * GRID_CELL, env.H * GRID_CELL);
    ctx.globalAlpha = 1;

    // Light shafts (soft caustics) for atmosphere
    if (opts.overlay === 'none' && opts.quality === 'high') {
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const a = t * 0.03 + k * 2.1;
        const x = env.cx + Math.cos(a) * env.R * 0.4;
        const y = env.cy + Math.sin(a * 1.3) * env.R * 0.4;
        const s = env.R * 1.3;
        ctx.globalAlpha = 0.05 * env.lightMul * world.params.lightIntensity;
        ctx.drawImage(glowSprite('rgba(170,255,240,0.9)') as CanvasImageSource, x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Ambient particles
    if (opts.showParticles) {
      this.updateParticles(world, dt);
      ctx.globalCompositeOperation = 'lighter';
      const P = this.particles;
      // Particles are drawn at a constant on-screen size (they are visual only)
      const ps = 1.7 / z;
      const round = z > 1.5;
      for (let k = 0; k < this.nParticles; k++) {
        const o = k * P_STRIDE;
        const x = P[o];
        const y = P[o + 1];
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        const life = Math.min(1, P[o + 5] / 120);
        ctx.globalAlpha = 0.55 * life;
        ctx.fillStyle = RES_COLORS[P[o + 4] | 0];
        if (round) {
          ctx.beginPath();
          ctx.arc(x, y, ps * 0.8, 0, TAU);
          ctx.fill();
        } else ctx.fillRect(x - ps / 2, y - ps / 2, ps, ps);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Light sources markers
    for (const s of env.lightSources) {
      ctx.strokeStyle = 'rgba(255,240,170,0.35)';
      ctx.lineWidth = 1.5 / z;
      ctx.setLineDash([8 / z, 6 / z]);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Bonds
    if (opts.showBonds) this.drawBonds(ctx, world, cam, opts, t);

    // Cells
    const pad = 40;
    const cells = world.cells;
    const detailBudget = opts.quality === 'high' ? 400 : 120;
    let detailed = 0;
    const seen = new Set<number>();
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      if (c.x < vx0 - pad || c.x > vx1 + pad || c.y < vy0 - pad || c.y > vy1 + pad) continue;
      seen.add(c.id);
      const sr = c.radius * z;
      const dim = !!opts.highlightRoot && c.strain.rootId !== opts.highlightRoot;
      if (sr < 2.6) {
        const hue = opts.colorMode === 'tissue' ? [168, 34, 315, 210][c.tissue] : opts.colorMode === 'health' ? 120 * (c.integrity / c.maxIntegrity) : c.strain.hue;
        drawCellDot(ctx, c.x, c.y, c.radius, hue, dim ? 0.25 : c.integrity / c.maxIntegrity);
        continue;
      }
      if (sr > 10 && detailed++ > detailBudget) {
        drawCellDot(ctx, c.x, c.y, c.radius, c.strain.hue, 1);
        continue;
      }
      let L = this.looks.get(c.id);
      L = lookFromCell(c, L);
      this.looks.set(c.id, L);
      drawCell(ctx, L, { t, zoom: z, colorMode: opts.colorMode, selected: c.id === opts.selectedId, dim, showFlow: opts.showFlow });
      if (opts.showFlow && sr > 8) this.drawCellFlow(ctx, c, z);
      if (c.id === opts.hoverId && c.id !== opts.selectedId) {
        ctx.strokeStyle = 'rgba(200,255,250,0.5)';
        ctx.lineWidth = 1 / z;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius * 1.3, 0, TAU);
        ctx.stroke();
      }
      // emission ripple
      if (c.flash > 0.25 && sr > 6 && c.cd.byType[T.emitter].length) {
        const u = 1 - c.flash;
        ctx.strokeStyle = `rgba(255,120,230,${c.flash * 0.3})`;
        ctx.lineWidth = 1.2 / z;
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.radius * (1.4 + u * 3), 0, TAU);
        ctx.stroke();
      }
    }
    if (this.frame % 120 === 0) for (const id of this.looks.keys()) if (!seen.has(id)) this.looks.delete(id);

    // Effects
    this.drawFx(ctx, world, z);
    ctx.restore(); // dish clip

    // Dish glass rim
    ctx.lineWidth = 6 / z;
    const rim = ctx.createLinearGradient(env.cx - env.R, env.cy - env.R, env.cx + env.R, env.cy + env.R);
    rim.addColorStop(0, 'rgba(180,255,250,0.55)');
    rim.addColorStop(0.5, 'rgba(60,140,160,0.18)');
    rim.addColorStop(1, 'rgba(180,240,255,0.45)');
    ctx.strokeStyle = rim;
    ctx.beginPath();
    ctx.arc(env.cx, env.cy, env.R + 3 / z, 0, TAU);
    ctx.stroke();
    ctx.lineWidth = 1 / z;
    ctx.strokeStyle = 'rgba(120,230,230,0.25)';
    ctx.beginPath();
    ctx.arc(env.cx, env.cy, env.R + 14 / z, 0, TAU);
    ctx.stroke();
    // graduation ticks
    ctx.strokeStyle = 'rgba(120,230,230,0.3)';
    for (let k = 0; k < 72; k++) {
      const a = (k / 72) * TAU;
      const l = (k % 6 === 0 ? 16 : 7) / z;
      ctx.beginPath();
      ctx.moveTo(env.cx + Math.cos(a) * (env.R + 14 / z), env.cy + Math.sin(a) * (env.R + 14 / z));
      ctx.lineTo(env.cx + Math.cos(a) * (env.R + 14 / z + l), env.cy + Math.sin(a) * (env.R + 14 / z + l));
      ctx.stroke();
    }

    // Brush cursor
    if (opts.brush) {
      ctx.strokeStyle = opts.brush.color;
      ctx.lineWidth = 1.5 / z;
      ctx.setLineDash([5 / z, 4 / z]);
      ctx.beginPath();
      ctx.arc(opts.brush.x, opts.brush.y, opts.brush.r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Microscope vignette in screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  private drawBonds(ctx: CanvasRenderingContext2D, world: World, cam: Camera, opts: RenderOptions, t: number) {
    const z = cam.zoom;
    for (const b of world.bonds) {
      const A = b.a;
      const B = b.b;
      const sr = A.radius * z;
      const tension = Math.min(1, b.stretch * 2.5);
      const flowMag = Math.min(1, (Math.abs(b.flow[0]) + Math.abs(b.flow[2]) + Math.abs(b.flow[3])) * 30);
      const sig = Math.min(1, Math.abs(b.signal) * 20);
      const w = Math.max(1 / z, Math.min(A.radius, B.radius) * (sr > 6 ? 0.35 : 0.5));
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(${150 + tension * 105},${230 - tension * 120},${230 - tension * 150},${0.25 + 0.2 * flowMag})`;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
      ctx.stroke();
      if (sr > 4) {
        ctx.strokeStyle = `rgba(200,255,255,${0.35 + 0.4 * flowMag})`;
        ctx.lineWidth = w * 0.3;
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
      // signal pulses travelling along the bond
      if (sig > 0.02 && sr > 2) {
        const u = b.signal >= 0 ? b.pulse : 1 - b.pulse;
        const px = A.x + (B.x - A.x) * u;
        const py = A.y + (B.y - A.y) * u;
        ctx.globalCompositeOperation = 'lighter';
        const s = Math.min(A.radius, B.radius) * (0.8 + sig);
        ctx.globalAlpha = 0.4 + 0.6 * sig;
        ctx.drawImage(glowSprite('rgba(255,120,230,0.95)') as CanvasImageSource, px - s / 2, py - s / 2, s, s);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      // resource flow arrows
      if (opts.showFlow && sr > 6 && flowMag > 0.03) {
        const dir = b.flow[2] + b.flow[0] >= 0 ? 1 : -1;
        const ux = (B.x - A.x) * dir;
        const uy = (B.y - A.y) * dir;
        const mx = (A.x + B.x) / 2;
        const my = (A.y + B.y) / 2;
        const ang = Math.atan2(uy, ux);
        const s = Math.min(A.radius, B.radius) * 0.35;
        ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * flowMag})`;
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(ang) * s, my + Math.sin(ang) * s);
        ctx.lineTo(mx + Math.cos(ang + 2.5) * s, my + Math.sin(ang + 2.5) * s);
        ctx.lineTo(mx + Math.cos(ang - 2.5) * s, my + Math.sin(ang - 2.5) * s);
        ctx.fill();
      }
      void t;
    }
  }

  private drawCellFlow(ctx: CanvasRenderingContext2D, c: Cell, z: number) {
    // Membrane exchange arrows: inward = absorption, outward = release
    for (let r = 0; r < NUM_RES; r++) {
      if (r === 2) continue;
      const f = c.membraneFlow[r];
      const mag = Math.min(1, Math.abs(f) * 40);
      if (mag < 0.05) continue;
      const a = c.angle + r * 2.1 + 0.6;
      const inward = f > 0;
      const r0 = c.radius * (inward ? 1.7 : 1.15);
      const r1 = c.radius * (inward ? 1.15 : 1.7);
      ctx.strokeStyle = RES_COLORS[r];
      ctx.globalAlpha = 0.4 + 0.5 * mag;
      ctx.lineWidth = Math.max(1 / z, c.radius * 0.08 * mag);
      ctx.beginPath();
      ctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0);
      ctx.lineTo(c.x + Math.cos(a) * r1, c.y + Math.sin(a) * r1);
      ctx.stroke();
      const hx = c.x + Math.cos(a) * r1;
      const hy = c.y + Math.sin(a) * r1;
      const back = inward ? a : a + Math.PI;
      const s = c.radius * 0.18;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(back + 0.5) * s, hy + Math.sin(back + 0.5) * s);
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(back - 0.5) * s, hy + Math.sin(back - 0.5) * s);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawFx(ctx: CanvasRenderingContext2D, world: World, z: number) {
    const now = world.tick;
    for (const f of world.fx) {
      const age = now - f.tick;
      if (age < 0 || age > 60) continue;
      const u = age / 60;
      const a = 1 - u;
      switch (f.kind) {
        case 'birth':
          ctx.strokeStyle = `hsla(${f.hue},90%,75%,${0.6 * a})`;
          ctx.lineWidth = 1.5 / z;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 6 + u * 22, 0, TAU);
          ctx.stroke();
          break;
        case 'death': {
          ctx.fillStyle = `hsla(${f.hue},60%,60%,${0.5 * a})`;
          for (let k = 0; k < 7; k++) {
            const aa = k * 0.9 + f.x;
            const rr = 4 + u * 26;
            ctx.beginPath();
            ctx.arc(f.x + Math.cos(aa) * rr, f.y + Math.sin(aa) * rr, 2.2 * a + 0.4, 0, TAU);
            ctx.fill();
          }
          break;
        }
        case 'snap':
          ctx.strokeStyle = `rgba(255,220,150,${a})`;
          ctx.lineWidth = 2 / z;
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const aa = k * 1.57 + 0.4;
            ctx.moveTo(f.x, f.y);
            ctx.lineTo(f.x + Math.cos(aa) * (4 + u * 12), f.y + Math.sin(aa) * (4 + u * 12));
          }
          ctx.stroke();
          break;
        case 'hit': {
          const s = 30 * (0.5 + u);
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = a * 0.7;
          ctx.drawImage(glowSprite('rgba(255,60,80,0.9)') as CanvasImageSource, f.x - s / 2, f.y - s / 2, s, s);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          break;
        }
        case 'inoculate':
          ctx.strokeStyle = `rgba(120,255,230,${a})`;
          ctx.lineWidth = 2 / z;
          ctx.beginPath();
          ctx.arc(f.x, f.y, 4 + u * 40, 0, TAU);
          ctx.stroke();
          break;
        case 'mutation':
          break;
      }
    }
  }
}
