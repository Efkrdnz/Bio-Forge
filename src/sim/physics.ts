/**
 * Overdamped (low Reynolds number) physics: velocity ∝ force / drag.
 * Collisions use a uniform spatial hash. Bonds are solved as position-based
 * constraints (distance + angular shape memory).
 */
import { TAU, wrapAngle } from './constants';
import type { Cell } from './cell';
import type { Bond } from './bond';
import { restLength } from './bond';
import type { World } from './world';
import { T } from './components';

export class SpatialHash {
  readonly size: number;
  readonly cols: number;
  readonly rows: number;
  head: Int32Array;
  next: Int32Array = new Int32Array(0);
  items: Cell[] = [];

  constructor(worldW: number, worldH: number, size = 32) {
    this.size = size;
    this.cols = Math.ceil(worldW / size) + 1;
    this.rows = Math.ceil(worldH / size) + 1;
    this.head = new Int32Array(this.cols * this.rows);
  }

  rebuild(cells: Cell[]): void {
    this.head.fill(-1);
    if (this.next.length < cells.length) this.next = new Int32Array(Math.max(64, cells.length * 2));
    this.items = cells;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const k = this.key(c.x, c.y);
      this.next[i] = this.head[k];
      this.head[k] = i;
    }
  }

  key(x: number, y: number): number {
    let cx = Math.floor(x / this.size);
    let cy = Math.floor(y / this.size);
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  query(x: number, y: number, r: number, fn: (c: Cell) => void): void {
    const s = this.size;
    const x0 = Math.max(0, Math.floor((x - r) / s));
    const x1 = Math.min(this.cols - 1, Math.floor((x + r) / s));
    const y0 = Math.max(0, Math.floor((y - r) / s));
    const y1 = Math.min(this.rows - 1, Math.floor((y + r) / s));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        let i = this.head[cy * this.cols + cx];
        while (i !== -1) {
          fn(this.items[i]);
          i = this.next[i];
        }
      }
  }

  /** Nearest cell whose body contains (x, y), or within slack. */
  pick(x: number, y: number, slack = 0): Cell | null {
    let best: Cell | null = null;
    let bd = Infinity;
    this.query(x, y, 40 + slack, (c) => {
      const d = Math.hypot(c.x - x, c.y - y) - c.radius;
      if (d < slack && d < bd) {
        bd = d;
        best = c;
      }
    });
    return best;
  }
}

function bonded(a: Cell, b: Cell): boolean {
  const bs = a.bonds.length < b.bonds.length ? a.bonds : b.bonds;
  for (const bd of bs) if ((bd.a === a && bd.b === b) || (bd.a === b && bd.b === a)) return true;
  return false;
}

export function physicsStep(w: World): void {
  const cells = w.cells;
  const p = w.params;
  const env = w.env;
  const rng = w.rng;
  const hash = w.hash;

  // Collisions (soft repulsion)
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    hash.query(a.x, a.y, a.radius + 28, (b) => {
      if (b.id <= a.id) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 < 1e-9) return;
      if (a.bonds.length && b.bonds.length && bonded(a, b)) return;
      const d = Math.sqrt(d2);
      const overlap = rr - d;
      const k = 0.18 * overlap;
      const nx = dx / d;
      const ny = dy / d;
      a.fx -= nx * k;
      a.fy -= ny * k;
      b.fx += nx * k;
      b.fy += ny * k;
    });
  }

  // Integrate (overdamped with a little momentum for smooth motion)
  const R = env.R;
  for (const c of cells) {
    if (p.brownian > 0) {
      c.fx += rng.gauss() * p.brownian * 0.08;
      c.fy += rng.gauss() * p.brownian * 0.08;
      c.torque += rng.gauss() * p.brownian * 0.0015;
    }
    const drag = p.viscosity * (0.6 + c.radius * 0.06) * c.cd.membrane.drag * (1 + c.cd.byType[T.strut].length * 0.08);
    c.vx = c.vx * 0.55 + (c.fx / drag) * 0.45 * 2.2;
    c.vy = c.vy * 0.55 + (c.fy / drag) * 0.45 * 2.2;
    const sp = Math.hypot(c.vx, c.vy);
    if (sp > 6) {
      c.vx *= 6 / sp;
      c.vy *= 6 / sp;
    }
    c.x += c.vx;
    c.y += c.vy;
    const rotDrag = p.viscosity * (0.04 + c.radius * 0.004) * c.cd.membrane.drag;
    c.av = c.av * 0.6 + (c.torque / rotDrag) * 0.4;
    if (c.av > 0.25) c.av = 0.25;
    else if (c.av < -0.25) c.av = -0.25;
    c.angle += c.av;
    if (c.angle > Math.PI) c.angle -= TAU;
    else if (c.angle < -Math.PI) c.angle += TAU;
    // Dish wall
    const dx = c.x - env.cx;
    const dy = c.y - env.cy;
    const d = Math.hypot(dx, dy);
    const lim = R - c.radius;
    if (d > lim && d > 0) {
      c.x = env.cx + (dx / d) * lim;
      c.y = env.cy + (dy / d) * lim;
      const vn = (c.vx * dx + c.vy * dy) / d;
      if (vn > 0) {
        c.vx -= (vn * dx) / d;
        c.vy -= (vn * dy) / d;
      }
    }
    c.fx = 0;
    c.fy = 0;
    c.torque = 0;
  }

  // Bond constraints
  for (let it = 0; it < 3; it++) for (const b of w.bonds) solveBond(b, it === 0);

  // Break overstretched bonds
  for (const b of w.bonds) {
    if (b.stretch > 0.35 + b.strength * 0.9) {
      b.broken = true;
      w.bondsDirty = true;
    }
  }
}

function solveBond(b: Bond, measure: boolean): void {
  const A = b.a;
  const B = b.b;
  const rest = restLength(b);
  let dx = B.x - A.x;
  let dy = B.y - A.y;
  let d = Math.hypot(dx, dy) || 1e-6;
  if (measure) b.stretch = Math.abs(d - rest) / rest;
  const wa = 1 / A.mass;
  const wb = 1 / B.mass;
  const ws = wa + wb;
  // Distance constraint
  const corr = ((d - rest) / d) * 0.5;
  A.x += dx * corr * (wa / ws) * 2 * 0.5;
  A.y += dy * corr * (wa / ws) * 2 * 0.5;
  B.x -= dx * corr * (wb / ws) * 2 * 0.5;
  B.y -= dy * corr * (wb / ws) * 2 * 0.5;
  // Shape memory: each end wants the partner at its attachment angle.
  dx = B.x - A.x;
  dy = B.y - A.y;
  d = Math.hypot(dx, dy) || 1e-6;
  const dir = Math.atan2(dy, dx);
  const k = b.stiffness * 0.12;
  // A's view
  const errA = wrapAngle(dir - (A.angle + b.angA));
  // B's view (direction from B to A)
  const errB = wrapAngle(dir + Math.PI - (B.angle + b.angB));
  // Rotate the cells toward satisfying the attachment (shared correction)
  A.angle += errA * k * 0.5;
  B.angle += errB * k * 0.5;
  // Move partners along the tangent so shapes hold (equal & opposite)
  const tx = -dy / d;
  const ty = dx / d;
  const mA = -errA * d * k * 0.5; // move B toward A's preferred direction
  const mB = -errB * d * k * 0.5; // move A toward B's preferred direction
  B.x += tx * mA * (wb / ws);
  B.y += ty * mA * (wb / ws);
  A.x -= tx * mA * (wa / ws);
  A.y -= ty * mA * (wa / ws);
  A.x -= tx * mB * (wa / ws);
  A.y -= ty * mB * (wa / ws);
  B.x += tx * mB * (wb / ws);
  B.y += ty * mB * (wb / ws);
}
