/**
 * Petri-dish environment: a circular dish over a regular grid of fields.
 * Matter fields (sorb, lith, murk) diffuse conservatively between in-dish
 * neighbours. Heat relaxes toward a pattern; echo decays; light is computed.
 */
import { GRID_CELL, clamp01 } from './constants';
import { Rng } from './rng';
import type { Ledger } from './ledger';
import { note } from './ledger';
import type { SimParams } from './params';

export type MatterField = 'sorb' | 'lith' | 'murk';
export type AnyField = 'sorb' | 'lith' | 'murk' | 'heat' | 'echoA' | 'echoB' | 'light';

export interface LightSource {
  x: number;
  y: number;
  r: number;
  s: number;
}

export class Environment {
  readonly W: number;
  readonly H: number;
  readonly cell = GRID_CELL;
  readonly cx: number;
  readonly cy: number;
  readonly R: number;
  readonly mask: Uint8Array;
  readonly inside: Int32Array;
  sorb: Float32Array;
  lith: Float32Array;
  murk: Float32Array;
  heat: Float32Array;
  echoA: Float32Array;
  echoB: Float32Array;
  /** Base light pattern 0..1 (multiplied by intensity and day factor). */
  lightBase: Float32Array;
  feedW: Float32Array;
  heatTarget: Float32Array;
  pairsH: Int32Array;
  pairsV: Int32Array;
  lightSources: LightSource[] = [];
  lightMul = 1;
  patternSeed: number;
  private lastPatterns = '';
  /** Version counter so renderers can cache field textures. */
  version = 0;

  constructor(W = 120, H = 120, patternSeed = 7) {
    this.W = W;
    this.H = H;
    this.cx = (W * GRID_CELL) / 2;
    this.cy = (H * GRID_CELL) / 2;
    this.R = (Math.min(W, H) * GRID_CELL) / 2 - GRID_CELL * 0.6;
    this.patternSeed = patternSeed;
    const N = W * H;
    this.mask = new Uint8Array(N);
    const ins: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const wx = (x + 0.5) * GRID_CELL;
        const wy = (y + 0.5) * GRID_CELL;
        if (Math.hypot(wx - this.cx, wy - this.cy) < this.R + GRID_CELL * 0.5) {
          this.mask[y * W + x] = 1;
          ins.push(y * W + x);
        }
      }
    this.inside = Int32Array.from(ins);
    const ph: number[] = [];
    const pv: number[] = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!this.mask[i]) continue;
        if (x + 1 < W && this.mask[i + 1]) ph.push(i);
        if (y + 1 < H && this.mask[i + W]) pv.push(i);
      }
    this.pairsH = Int32Array.from(ph);
    this.pairsV = Int32Array.from(pv);
    this.sorb = new Float32Array(N);
    this.lith = new Float32Array(N);
    this.murk = new Float32Array(N);
    this.heat = new Float32Array(N).fill(0.5);
    this.echoA = new Float32Array(N);
    this.echoB = new Float32Array(N);
    this.lightBase = new Float32Array(N);
    this.feedW = new Float32Array(N);
    this.heatTarget = new Float32Array(N).fill(0.5);
  }

  get worldW() {
    return this.W * GRID_CELL;
  }
  get worldH() {
    return this.H * GRID_CELL;
  }

  field(f: AnyField): Float32Array {
    switch (f) {
      case 'sorb':
        return this.sorb;
      case 'lith':
        return this.lith;
      case 'murk':
        return this.murk;
      case 'heat':
        return this.heat;
      case 'echoA':
        return this.echoA;
      case 'echoB':
        return this.echoB;
      case 'light':
        return this.lightBase;
    }
  }

  /** Nearest in-dish grid index for a world position (clamped into the dish). */
  index(x: number, y: number): number {
    let gx = Math.floor(x / GRID_CELL);
    let gy = Math.floor(y / GRID_CELL);
    if (gx < 0) gx = 0;
    else if (gx >= this.W) gx = this.W - 1;
    if (gy < 0) gy = 0;
    else if (gy >= this.H) gy = this.H - 1;
    const i = gy * this.W + gx;
    if (this.mask[i]) return i;
    // Pull toward centre until inside
    const dx = this.cx - x;
    const dy = this.cy - y;
    const d = Math.hypot(dx, dy) || 1;
    return this.index(x + (dx / d) * GRID_CELL, y + (dy / d) * GRID_CELL);
  }

  /** Bilinear sample (masked cells treated as the nearest value). */
  sample(f: Float32Array, x: number, y: number): number {
    const fx = x / GRID_CELL - 0.5;
    const fy = y / GRID_CELL - 0.5;
    let x0 = Math.floor(fx);
    let y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    if (x0 < 0) x0 = 0;
    if (y0 < 0) y0 = 0;
    if (x0 > this.W - 2) x0 = this.W - 2;
    if (y0 > this.H - 2) y0 = this.H - 2;
    const W = this.W;
    const i00 = y0 * W + x0;
    const m = this.mask;
    const c = this.index(x, y);
    const v00 = m[i00] ? f[i00] : f[c];
    const v10 = m[i00 + 1] ? f[i00 + 1] : f[c];
    const v01 = m[i00 + W] ? f[i00 + W] : f[c];
    const v11 = m[i00 + W + 1] ? f[i00 + W + 1] : f[c];
    const a = v00 + (v10 - v00) * tx;
    const b = v01 + (v11 - v01) * tx;
    return a + (b - a) * ty;
  }

  lightAt(x: number, y: number): number {
    return this.sample(this.lightBase, x, y) * this.lightMul;
  }

  insideDish(x: number, y: number, margin = 0): boolean {
    return Math.hypot(x - this.cx, y - this.cy) <= this.R - margin;
  }

  /** Recompute pattern-derived fields when relevant params change. */
  updatePatterns(p: SimParams, force = false): void {
    const key = `${p.feedPattern}|${p.lightPattern}|${p.lightIntensity}|${p.heatPattern}|${p.baseHeat}|${p.heatAmplitude}|${JSON.stringify(this.lightSources)}`;
    if (!force && key === this.lastPatterns) return;
    this.lastPatterns = key;
    const rng = new Rng(this.patternSeed);
    const patches = Array.from({ length: 6 }, () => {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * this.R * 0.75;
      return { x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r, s: rng.range(70, 140) };
    });
    const spots = Array.from({ length: 3 }, (_, k) => {
      const a = (k / 3) * Math.PI * 2 + 0.6;
      return { x: this.cx + Math.cos(a) * this.R * 0.5, y: this.cy + Math.sin(a) * this.R * 0.5, s: this.R * 0.28 };
    });
    const vents = Array.from({ length: 4 }, () => {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * this.R * 0.7;
      return { x: this.cx + Math.cos(a) * r, y: this.cy + Math.sin(a) * r, s: rng.range(60, 110) };
    });
    for (const i of this.inside) {
      const x = ((i % this.W) + 0.5) * GRID_CELL;
      const y = (Math.floor(i / this.W) + 0.5) * GRID_CELL;
      const rr = Math.hypot(x - this.cx, y - this.cy) / this.R; // 0..1
      const ux = (x - (this.cx - this.R)) / (2 * this.R); // 0..1 left→right
      const uy = (y - (this.cy - this.R)) / (2 * this.R); // 0..1 top→bottom
      // Feed weights
      let w = 1;
      switch (p.feedPattern) {
        case 'uniform':
          w = 1;
          break;
        case 'center':
          w = Math.max(0, 1 - rr * 1.15) ** 1.5 * 2.2;
          break;
        case 'rim':
          w = Math.max(0, rr - 0.55) * 4.5;
          break;
        case 'patches': {
          w = 0;
          for (const pt of patches) w += Math.exp(-((x - pt.x) ** 2 + (y - pt.y) ** 2) / (2 * pt.s * pt.s)) * 2.4;
          break;
        }
        case 'gradient':
          w = ux * 2;
          break;
        case 'stripes':
          w = Math.sin(uy * Math.PI * 6) > 0.2 ? 2 : 0.05;
          break;
        case 'none':
          w = 0;
          break;
      }
      this.feedW[i] = w;
      // Light
      let l = 1;
      switch (p.lightPattern) {
        case 'uniform':
          l = 1;
          break;
        case 'top':
          l = clamp01(1.15 - uy * 1.3);
          break;
        case 'center':
          l = clamp01(1.2 - rr * 1.4);
          break;
        case 'spots': {
          l = 0.05;
          for (const s of spots) l += Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * s.s * s.s));
          break;
        }
        case 'half':
          l = ux < 0.5 ? 1 : 0.04;
          break;
        case 'dark':
          l = 0;
          break;
      }
      for (const s of this.lightSources) l += s.s * Math.exp(-((x - s.x) ** 2 + (y - s.y) ** 2) / (2 * s.r * s.r));
      this.lightBase[i] = clamp01(l) * p.lightIntensity;
      // Heat target
      let h = 0;
      switch (p.heatPattern) {
        case 'uniform':
          h = 0;
          break;
        case 'radial':
          h = 0.5 - rr;
          break;
        case 'linear':
          h = ux - 0.5;
          break;
        case 'vents': {
          h = -0.15;
          for (const v of vents) h += Math.exp(-((x - v.x) ** 2 + (y - v.y) ** 2) / (2 * v.s * v.s)) * 1.1;
          break;
        }
        case 'rim':
          h = rr - 0.5;
          break;
      }
      this.heatTarget[i] = clamp01(p.baseHeat + h * p.heatAmplitude * 2);
    }
    this.version++;
  }

  /** Fill the dish with an initial state (counts as matter input). */
  initialize(p: SimParams, ledger: Ledger, fill = 0.6): void {
    this.updatePatterns(p, true);
    let added = 0;
    for (const i of this.inside) {
      const w = Math.min(1, 0.25 + 0.75 * Math.min(1, this.feedW[i]));
      const s = p.maxSorb * fill * w;
      const l = p.maxLith * fill * w;
      this.sorb[i] = s;
      this.lith[i] = l;
      this.murk[i] = 0;
      this.heat[i] = this.heatTarget[i];
      this.echoA[i] = 0;
      this.echoB[i] = 0;
      added += s + l;
    }
    ledger.matterIn += added;
    note(ledger, 'initialFill', added);
    this.version++;
  }

  private diffuse(f: Float32Array, D: number): void {
    const ph = this.pairsH;
    const pv = this.pairsV;
    const W = this.W;
    for (let k = 0; k < ph.length; k++) {
      const i = ph[k];
      const flux = D * (f[i] - f[i + 1]);
      f[i] -= flux;
      f[i + 1] += flux;
    }
    for (let k = 0; k < pv.length; k++) {
      const i = pv[k];
      const flux = D * (f[i] - f[i + W]);
      f[i] -= flux;
      f[i + W] += flux;
    }
  }

  step(p: SimParams, tick: number, ledger: Ledger): void {
    this.updatePatterns(p);
    this.lightMul = p.dayLength > 0 ? clamp01(0.5 + 0.75 * Math.sin((tick / p.dayLength) * Math.PI * 2)) : 1;
    let fed = 0;
    let drained = 0;
    const ms = p.maxSorb;
    const ml = p.maxLith;
    const fs = p.feedRate;
    const fl = p.lithFeedRate;
    const md = p.murkDecay;
    const mdr = p.murkDrain;
    const ins = this.inside;
    for (let k = 0; k < ins.length; k++) {
      const i = ins[k];
      const w = this.feedW[i];
      if (w > 0) {
        const s = this.sorb[i];
        if (s < ms) {
          const a = fs * w * (1 - s / ms);
          this.sorb[i] = s + a;
          fed += a;
        }
        const l = this.lith[i];
        if (l < ml) {
          const a = fl * w * (1 - l / ml);
          this.lith[i] = l + a;
          fed += a;
        }
      }
      const m = this.murk[i];
      if (m > 0) {
        const dec = m * md;
        const drn = m * mdr;
        this.murk[i] = m - dec - drn;
        this.sorb[i] += dec;
        drained += drn;
      }
      // Heat relaxes toward the pattern target
      this.heat[i] += (this.heatTarget[i] - this.heat[i]) * 0.004;
      this.echoA[i] *= 0.965;
      this.echoB[i] *= 0.965;
    }
    ledger.matterIn += fed;
    ledger.matterOut += drained;
    note(ledger, 'feed', fed);
    note(ledger, 'murkDrain', drained);
    this.diffuse(this.sorb, 0.05);
    this.diffuse(this.lith, 0.035);
    this.diffuse(this.murk, 0.08);
    this.diffuse(this.heat, 0.12);
    this.diffuse(this.echoA, 0.18);
    this.diffuse(this.echoB, 0.18);
  }

  /**
   * Brush: adds (or removes, if amount < 0) to a field in a soft circle.
   * Returns the net matter added (for the ledger) for matter fields.
   */
  brush(f: AnyField, x: number, y: number, radius: number, amount: number, cap = Infinity): number {
    const arr = this.field(f);
    const g0x = Math.max(0, Math.floor((x - radius) / GRID_CELL));
    const g1x = Math.min(this.W - 1, Math.floor((x + radius) / GRID_CELL));
    const g0y = Math.max(0, Math.floor((y - radius) / GRID_CELL));
    const g1y = Math.min(this.H - 1, Math.floor((y + radius) / GRID_CELL));
    let net = 0;
    for (let gy = g0y; gy <= g1y; gy++)
      for (let gx = g0x; gx <= g1x; gx++) {
        const i = gy * this.W + gx;
        if (!this.mask[i]) continue;
        const wx = (gx + 0.5) * GRID_CELL;
        const wy = (gy + 0.5) * GRID_CELL;
        const d2 = (wx - x) ** 2 + (wy - y) ** 2;
        if (d2 > radius * radius) continue;
        const fall = Math.exp(-d2 / (radius * radius * 0.35));
        const before = arr[i];
        let after = before + amount * fall;
        if (after < 0) after = 0;
        if (f === 'heat') after = clamp01(after);
        else if (amount > 0 && after > cap) after = Math.max(before, cap);
        arr[i] = after;
        net += after - before;
      }
    this.version++;
    return f === 'sorb' || f === 'lith' || f === 'murk' ? net : 0;
  }

  /** Deposit an exact amount of matter spread over grid cells within radius. */
  deposit(f: MatterField, x: number, y: number, amount: number, radius: number): void {
    if (amount <= 0) return;
    const arr = this.field(f);
    const g0x = Math.max(0, Math.floor((x - radius) / GRID_CELL));
    const g1x = Math.min(this.W - 1, Math.floor((x + radius) / GRID_CELL));
    const g0y = Math.max(0, Math.floor((y - radius) / GRID_CELL));
    const g1y = Math.min(this.H - 1, Math.floor((y + radius) / GRID_CELL));
    const idx: number[] = [];
    const wts: number[] = [];
    let tw = 0;
    for (let gy = g0y; gy <= g1y; gy++)
      for (let gx = g0x; gx <= g1x; gx++) {
        const i = gy * this.W + gx;
        if (!this.mask[i]) continue;
        const d2 = ((gx + 0.5) * GRID_CELL - x) ** 2 + ((gy + 0.5) * GRID_CELL - y) ** 2;
        if (d2 > radius * radius) continue;
        const wt = 1 - Math.sqrt(d2) / (radius + 1e-6) + 0.05;
        idx.push(i);
        wts.push(wt);
        tw += wt;
      }
    if (!idx.length) {
      arr[this.index(x, y)] += amount;
      return;
    }
    for (let k = 0; k < idx.length; k++) arr[idx[k]] += (amount * wts[k]) / tw;
  }

  /** Total matter in the dish fields. */
  totalMatter(): number {
    let t = 0;
    for (const i of this.inside) t += this.sorb[i] + this.lith[i] + this.murk[i];
    return t;
  }

  totals() {
    let s = 0;
    let l = 0;
    let m = 0;
    let h = 0;
    for (const i of this.inside) {
      s += this.sorb[i];
      l += this.lith[i];
      m += this.murk[i];
      h += this.heat[i];
    }
    return { sorb: s, lith: l, murk: m, heat: h / this.inside.length };
  }
}
