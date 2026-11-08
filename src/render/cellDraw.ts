/**
 * Cell drawing shared by the dish, the Forge editor and the Test Chamber.
 * Draws in world coordinates (the caller sets the transform).
 */
import { NUM_RES, TAU } from '../sim/constants';
import { COMPONENT_DEFS, COMPONENT_TYPES, CATEGORY_COLOR, T, type ComponentType } from '../sim/components';
import type { MembraneType } from '../sim/membranes';
import type { Cell } from '../sim/cell';
import type { CellDesign } from '../sim/design';
import { compileDesign, MAX_PARAMS } from '../sim/design';
import { RES_COLORS, TISSUE_COLORS, hsla } from './palette';
import { hueGlow, glowSprite } from './sprites';

export interface CompLook {
  type: number;
  ang: number;
  dist: number;
  act: number;
  on: boolean;
  /** 0..1 fill of its main buffer (storage) */
  fill: number;
  /** sensor/osc value 0..1 */
  value: number;
  p0: number;
  p1: number;
  uid: number;
}

export interface ConduitLook {
  a: number;
  b: number;
  /** signed flow magnitude & dominant resource */
  flow: number;
  res: number;
}

export interface CellLook {
  x: number;
  y: number;
  r: number;
  angle: number;
  hue: number;
  membrane: MembraneType;
  thickness: number;
  phase: number;
  vx: number;
  vy: number;
  comps: CompLook[];
  conduits: ConduitLook[];
  health: number;
  flash: number;
  tissue: number;
  /** Cytosol fill levels (sorb, lith, charge, murk) 0..1 */
  cyto: [number, number, number, number];
  stress: number;
  toxic: number;
}

const TYPE_LIST: ComponentType[] = COMPONENT_TYPES;

/** Build a look from a live cell. */
export function lookFromCell(c: Cell, out?: CellLook): CellLook {
  const cd = c.cd;
  const look: CellLook = out ?? {
    x: 0, y: 0, r: 0, angle: 0, hue: 0, membrane: 'veil', thickness: 1, phase: 0, vx: 0, vy: 0,
    comps: [], conduits: [], health: 1, flash: 0, tissue: 0, cyto: [0, 0, 0, 0], stress: 0, toxic: 0,
  };
  look.x = c.x;
  look.y = c.y;
  look.r = c.radius;
  look.angle = c.angle;
  look.hue = c.strain.hue;
  look.membrane = cd.membrane.type;
  look.thickness = cd.design.membrane.thickness;
  look.phase = c.phase;
  look.vx = c.vx;
  look.vy = c.vy;
  look.health = c.integrity / Math.max(0.01, c.maxIntegrity);
  look.flash = c.flash;
  look.tissue = c.tissue;
  look.stress = c.heatStress;
  look.toxic = c.toxicity;
  for (let r = 0; r < NUM_RES; r++) look.cyto[r] = Math.min(1, c.buf[r] / Math.max(0.01, c.cytoCap[r]));
  look.comps.length = cd.n;
  for (let i = 0; i < cd.n; i++) {
    const t = cd.types[i];
    let fill = 0;
    const o = (i + 1) * NUM_RES;
    const mainRes = t === T.capacitor ? 2 : t === T.vesicle ? 0 : t === T.depot ? 1 : t === T.vacuole ? 3 : 2;
    const cap = cd.caps[i * NUM_RES + mainRes];
    if (cap > 0) fill = Math.min(1, c.buf[o + mainRes] / cap);
    let value = 0;
    const outs = COMPONENT_DEFS[TYPE_LIST[t]].outputs.length;
    if (outs > 0) value = c.sensors[cd.outOffset[i]];
    if (t === T.oscillator) value = c.sensorMem[i * 2];
    const prev = look.comps[i];
    const cl: CompLook = prev ?? { type: 0, ang: 0, dist: 0, act: 0, on: true, fill: 0, value: 0, p0: 0, p1: 0, uid: 0 };
    cl.type = t;
    cl.ang = cd.ang[i];
    cl.dist = cd.dist[i];
    cl.act = c.activity[i];
    cl.on = c.expressed(i);
    cl.fill = fill;
    cl.value = value;
    cl.p0 = cd.params[i * MAX_PARAMS];
    cl.p1 = cd.params[i * MAX_PARAMS + 1];
    cl.uid = cd.uids[i];
    look.comps[i] = cl;
  }
  look.conduits.length = 0;
  for (let e = 0; e < cd.numEdges; e++) {
    if (!cd.edgeConduit[e]) continue;
    let best = 0;
    let res = 0;
    for (let r = 0; r < NUM_RES; r++) {
      const f = c.edgeFlow[e * NUM_RES + r];
      if (Math.abs(f) > Math.abs(best)) {
        best = f;
        res = r;
      }
    }
    look.conduits.push({ a: cd.edgeA[e] - 1, b: cd.edgeB[e] - 1, flow: best, res });
  }
  return look;
}

/** Build a static look from a design (editor). */
export function lookFromDesign(d: CellDesign, x: number, y: number, r: number, tissue = 0, angle = 0): CellLook {
  const cd = compileDesign(d);
  const comps: CompLook[] = [];
  for (let i = 0; i < cd.n; i++) {
    comps.push({
      type: cd.types[i],
      ang: cd.ang[i],
      dist: cd.dist[i],
      act: 0.7,
      on: (cd.tissues[i] & (1 << tissue)) !== 0,
      fill: 0.55,
      value: 0.5,
      p0: cd.params[i * MAX_PARAMS],
      p1: cd.params[i * MAX_PARAMS + 1],
      uid: cd.uids[i],
    });
  }
  const conduits: ConduitLook[] = [];
  for (let e = 0; e < cd.numEdges; e++) if (cd.edgeConduit[e]) conduits.push({ a: cd.edgeA[e] - 1, b: cd.edgeB[e] - 1, flow: 0.05, res: 0 });
  return {
    x, y, r, angle, hue: d.hue, membrane: d.membrane.type, thickness: d.membrane.thickness, phase: 0, vx: 0, vy: 0,
    comps, conduits, health: 1, flash: 0, tissue, cyto: [0.5, 0.4, 0.6, 0.15], stress: 0, toxic: 0,
  };
}

const MEMB_PTS = 40;
const pts = new Float32Array(MEMB_PTS * 2);

function membranePath(ctx: CanvasRenderingContext2D, L: CellLook, t: number, scale = 1) {
  const sp = Math.hypot(L.vx, L.vy);
  const mdir = Math.atan2(L.vy, L.vx);
  const stretch = Math.min(0.12, sp * 0.06);
  const wob = L.membrane === 'shell' ? 0.25 : L.membrane === 'lattice' ? 0.65 : 1;
  for (let k = 0; k < MEMB_PTS; k++) {
    const th = (k / MEMB_PTS) * TAU;
    const w =
      1 +
      wob * (0.035 * Math.sin(3 * th + t * 1.3 + L.phase) + 0.022 * Math.sin(5 * th - t * 0.9 + L.phase * 2) + 0.012 * Math.sin(8 * th + t * 2.1));
    const elong = 1 + stretch * Math.cos(2 * (th - mdir));
    const rr = L.r * w * elong * scale;
    pts[k * 2] = L.x + Math.cos(th) * rr;
    pts[k * 2 + 1] = L.y + Math.sin(th) * rr;
  }
  ctx.beginPath();
  // smooth closed curve through midpoints
  const n = MEMB_PTS;
  let mx = (pts[(n - 1) * 2] + pts[0]) / 2;
  let my = (pts[(n - 1) * 2 + 1] + pts[1]) / 2;
  ctx.moveTo(mx, my);
  for (let k = 0; k < n; k++) {
    const nx = pts[((k + 1) % n) * 2];
    const ny = pts[((k + 1) % n) * 2 + 1];
    mx = (pts[k * 2] + nx) / 2;
    my = (pts[k * 2 + 1] + ny) / 2;
    ctx.quadraticCurveTo(pts[k * 2], pts[k * 2 + 1], mx, my);
  }
  ctx.closePath();
}

export interface DrawOpts {
  t: number;
  /** pixels per world unit */
  zoom: number;
  colorMode?: 'strain' | 'tissue' | 'health';
  selected?: boolean;
  dim?: boolean;
  showFlow?: boolean;
  /** Editor: highlight a component uid */
  highlightUid?: number;
  ghost?: boolean;
}

function baseHue(L: CellLook, o: DrawOpts): number {
  if (o.colorMode === 'tissue') {
    const map = [168, 34, 315, 210];
    return map[L.tissue] ?? L.hue;
  }
  if (o.colorMode === 'health') return 0 + 120 * Math.max(0, Math.min(1, L.health));
  return L.hue;
}

/** Cheap far-zoom dot. */
export function drawCellDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hue: number, health: number) {
  const g = hueGlow(hue, 62, 0.85);
  const s = r * 3.2;
  ctx.globalAlpha = 0.5 + 0.5 * health;
  ctx.drawImage(g as CanvasImageSource, x - s / 2, y - s / 2, s, s);
  ctx.globalAlpha = 1;
}

const smallFill = new Map<number, string>();
const smallRim = new Map<number, string>();
/** Mid-distance LOD: glow + disc + rim + nucleus, no gradients or wobble paths. */
function drawCellSmall(ctx: CanvasRenderingContext2D, L: CellLook, hue: number, alpha: number) {
  const h = Math.round(hue / 6) * 6;
  let fill = smallFill.get(h);
  if (!fill) smallFill.set(h, (fill = hsla(h, 70, 52, 0.3)));
  let rim = smallRim.get(h);
  if (!rim) smallRim.set(h, (rim = hsla(h, 92, 74, 0.85)));
  ctx.globalCompositeOperation = 'lighter';
  const gs = L.r * 3.2;
  ctx.globalAlpha = (0.14 + L.flash * 0.5) * alpha;
  ctx.drawImage(hueGlow(hue, 60, 0.8) as CanvasImageSource, L.x - gs / 2, L.y - gs / 2, gs, gs);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha * (0.55 + 0.45 * L.health);
  ctx.beginPath();
  ctx.arc(L.x, L.y, L.r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = L.r * (L.membrane === 'shell' ? 0.16 : 0.09);
  ctx.strokeStyle = rim;
  ctx.stroke();
  ctx.fillStyle = 'rgba(200,160,255,0.9)';
  ctx.beginPath();
  ctx.arc(L.x, L.y, L.r * 0.28, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Full membrane + body; detail level chosen from on-screen radius. */
export function drawCell(ctx: CanvasRenderingContext2D, L: CellLook, o: DrawOpts) {
  const screenR = L.r * o.zoom;
  const hue = baseHue(L, o);
  const t = o.t;
  const alpha = o.dim ? 0.35 : o.ghost ? 0.6 : 1;

  if (screenR < 2.6) {
    drawCellDot(ctx, L.x, L.y, L.r, hue, L.health * alpha);
    return;
  }

  if (screenR < 8 && !o.selected) {
    drawCellSmall(ctx, L, hue, alpha);
    return;
  }

  // outer bloom
  ctx.globalCompositeOperation = 'lighter';
  const gs = L.r * 3.4;
  ctx.globalAlpha = (0.16 + L.flash * 0.5) * alpha;
  ctx.drawImage(hueGlow(hue, 60, 0.8) as CanvasImageSource, L.x - gs / 2, L.y - gs / 2, gs, gs);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Flagella and external appendages behind the body
  if (screenR > 6) drawAppendages(ctx, L, o, hue, alpha);

  // body
  membranePath(ctx, L, t);
  const grd = ctx.createRadialGradient(L.x - L.r * 0.3, L.y - L.r * 0.35, L.r * 0.05, L.x, L.y, L.r * 1.05);
  const sat = 70 * (0.4 + 0.6 * L.health);
  grd.addColorStop(0, hsla(hue, sat, 72, 0.16 * alpha));
  grd.addColorStop(0.65, hsla(hue, sat, 45, 0.2 * alpha));
  grd.addColorStop(1, hsla(hue, sat, 60, 0.42 * alpha));
  ctx.fillStyle = grd;
  ctx.fill();

  // toxicity tint
  if (L.toxic > 0.45) {
    ctx.fillStyle = `rgba(160,40,200,${Math.min(0.35, (L.toxic - 0.45) * 0.8) * alpha})`;
    ctx.fill();
  }

  // membrane rim
  const lw = Math.max(0.6 / o.zoom, L.r * (L.membrane === 'shell' ? 0.12 : L.membrane === 'lattice' ? 0.07 : 0.045) * Math.sqrt(L.thickness));
  ctx.lineWidth = lw;
  const rimL = L.membrane === 'shell' ? 66 : 74;
  const rimHue = L.membrane === 'shell' ? hue * 0.3 + 30 * 0.7 : hue;
  ctx.strokeStyle = hsla(rimHue, 92, rimL, (0.75 + L.flash * 0.25) * alpha);
  ctx.stroke();
  if (L.membrane === 'lattice' && screenR > 10) {
    membranePath(ctx, L, t, 0.9);
    ctx.setLineDash([L.r * 0.12, L.r * 0.08]);
    ctx.lineWidth = lw * 0.5;
    ctx.strokeStyle = hsla(hue, 80, 80, 0.4 * alpha);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (L.membrane === 'shell' && screenR > 10) {
    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.rotate(L.angle);
    ctx.strokeStyle = `rgba(255,220,160,${0.28 * alpha})`;
    ctx.lineWidth = lw * 0.25;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * L.r * 0.88, Math.sin(a) * L.r * 0.88);
      ctx.lineTo(Math.cos(a) * L.r * 1.06, Math.sin(a) * L.r * 1.06);
      ctx.stroke();
    }
    ctx.restore();
  }

  // heat stress shimmer
  if (L.stress > 0.01 && screenR > 5) {
    ctx.strokeStyle = `rgba(255,120,40,${Math.min(0.6, L.stress * 3) * (0.5 + 0.5 * Math.sin(t * 8 + L.phase))})`;
    ctx.lineWidth = lw * 1.5;
    membranePath(ctx, L, t, 1.08);
    ctx.stroke();
  }

  if (screenR < 9) {
    // mid: nucleus dot only
    ctx.fillStyle = hsla(275, 90, 75, 0.85 * alpha);
    ctx.beginPath();
    ctx.arc(L.x, L.y, L.r * 0.28, 0, TAU);
    ctx.fill();
    return;
  }

  // cytoplasm speckles
  if (screenR > 16) drawCytoplasm(ctx, L, t, hue, alpha);

  // components
  ctx.save();
  ctx.translate(L.x, L.y);
  ctx.rotate(L.angle);
  if (screenR > 12) drawConduits(ctx, L, o, alpha);
  for (let i = 0; i < L.comps.length; i++) {
    const c = L.comps[i];
    if (COMPONENT_DEFS[TYPE_LIST[c.type]].placement === 'membrane') continue;
    drawInterior(ctx, L, c, o, screenR, alpha, i);
  }
  for (let i = 0; i < L.comps.length; i++) {
    const c = L.comps[i];
    if (COMPONENT_DEFS[TYPE_LIST[c.type]].placement !== 'membrane') continue;
    drawMembranePart(ctx, L, c, o, screenR, alpha);
  }
  ctx.restore();

  if (o.selected) drawSelection(ctx, L, o);
}

function drawCytoplasm(ctx: CanvasRenderingContext2D, L: CellLook, t: number, hue: number, alpha: number) {
  ctx.fillStyle = hsla(hue, 60, 80, 0.18 * alpha);
  const n = 14;
  for (let k = 0; k < n; k++) {
    const a = k * 2.399 + L.phase + t * 0.15 * (k % 2 ? 1 : -1);
    const rr = L.r * (0.25 + 0.6 * ((k * 0.618) % 1));
    const s = L.r * 0.016 * (1 + (k % 3));
    ctx.beginPath();
    ctx.arc(L.x + Math.cos(a) * rr, L.y + Math.sin(a) * rr, s, 0, TAU);
    ctx.fill();
  }
  // resource particles drifting in the cytosol (sorb teal, charge blue, murk violet)
  const counts = [L.cyto[0] * 6, L.cyto[1] * 3, L.cyto[2] * 6, L.cyto[3] * 6];
  for (let r = 0; r < 4; r++) {
    ctx.fillStyle = RES_COLORS[r];
    ctx.globalAlpha = 0.55 * alpha;
    const cnt = Math.round(counts[r]);
    for (let k = 0; k < cnt; k++) {
      const a = (k * 2.1 + r * 1.7 + t * (0.3 + r * 0.07)) % TAU;
      const rr = L.r * (0.3 + 0.5 * Math.abs(Math.sin(k * 3.1 + t * 0.4 + r)));
      ctx.beginPath();
      ctx.arc(L.x + Math.cos(a + L.phase) * rr, L.y + Math.sin(a + L.phase) * rr, L.r * 0.035, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function compPos(L: CellLook, c: CompLook): [number, number] {
  const d = c.dist * L.r * (COMPONENT_DEFS[TYPE_LIST[c.type]].placement === 'membrane' ? 1 : 0.92);
  return [Math.cos(c.ang) * d, Math.sin(c.ang) * d];
}

function drawConduits(ctx: CanvasRenderingContext2D, L: CellLook, o: DrawOpts, alpha: number) {
  for (const k of L.conduits) {
    const A = L.comps[k.a];
    const B = L.comps[k.b];
    if (!A || !B) continue;
    const [ax, ay] = compPos(L, A);
    const [bx, by] = compPos(L, B);
    // curve slightly toward the centre
    const mx = (ax + bx) * 0.38;
    const my = (ay + by) * 0.38;
    ctx.strokeStyle = `rgba(160,240,255,${0.32 * alpha})`;
    ctx.lineWidth = L.r * 0.045;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    ctx.strokeStyle = `rgba(10,30,40,${0.5 * alpha})`;
    ctx.lineWidth = L.r * 0.02;
    ctx.stroke();
    // flowing particles
    const mag = Math.min(1, Math.abs(k.flow) * 25);
    if (mag > 0.02 || o.ghost) {
      const n = 4;
      ctx.fillStyle = RES_COLORS[k.res];
      for (let j = 0; j < n; j++) {
        let u = (o.t * (0.25 + mag * 0.9) + j / n) % 1;
        if (k.flow < 0) u = 1 - u;
        const iu = 1 - u;
        const px = iu * iu * ax + 2 * iu * u * mx + u * u * bx;
        const py = iu * iu * ay + 2 * iu * u * my + u * u * by;
        ctx.globalAlpha = (0.4 + 0.6 * mag) * alpha;
        ctx.beginPath();
        ctx.arc(px, py, L.r * 0.028, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

function catColor(c: CompLook): string {
  return COMPONENT_DEFS[TYPE_LIST[c.type]].color ?? CATEGORY_COLOR[COMPONENT_DEFS[TYPE_LIST[c.type]].category];
}

function drawInterior(ctx: CanvasRenderingContext2D, L: CellLook, c: CompLook, o: DrawOpts, screenR: number, alpha: number, idx: number) {
  const [x, y] = compPos(L, c);
  const R = L.r;
  const t = o.t;
  const a = (c.on ? 1 : 0.25) * alpha;
  const col = catColor(c);
  const act = c.on ? c.act : 0;
  const hl = o.highlightUid === c.uid;
  ctx.save();
  ctx.translate(x, y);
  // glow when active
  if (act > 0.05 && screenR > 14) {
    ctx.globalCompositeOperation = 'lighter';
    const s = R * 0.6;
    ctx.globalAlpha = 0.35 * act * a;
    ctx.drawImage(glowSprite(hexToRgba(col, 0.9)) as CanvasImageSource, -s / 2, -s / 2, s, s);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  if (screenR < 14) {
    ctx.fillStyle = hexToRgba(col, 0.8 * a);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.09, 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.lineWidth = R * 0.025;
  switch (c.type) {
    case T.core: {
      const rr = R * 0.24 * (1 + 0.04 * Math.sin(t * 2 + L.phase));
      const g = ctx.createRadialGradient(-rr * 0.3, -rr * 0.3, rr * 0.1, 0, 0, rr);
      g.addColorStop(0, `rgba(230,200,255,${0.95 * a})`);
      g.addColorStop(0.6, `rgba(150,90,255,${0.65 * a})`);
      g.addColorStop(1, `rgba(90,40,200,${0.35 * a})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(220,190,255,${0.8 * a})`;
      ctx.stroke();
      // codex strands
      ctx.strokeStyle = `rgba(255,240,255,${0.55 * a})`;
      ctx.lineWidth = R * 0.015;
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) {
        const u = k / 20;
        const px = (u - 0.5) * rr * 1.4;
        const py = Math.sin(u * 9 + t * 1.5) * rr * 0.25;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      break;
    }
    case T.assembler: {
      ctx.rotate(t * (0.5 + act));
      for (let k = 0; k < 6; k++) {
        const aa = (k / 6) * TAU;
        ctx.fillStyle = hexToRgba(col, (0.5 + 0.4 * act) * a);
        ctx.beginPath();
        ctx.arc(Math.cos(aa) * R * 0.09, Math.sin(aa) * R * 0.09, R * 0.045, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = `rgba(255,255,255,${0.6 * a})`;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.03, 0, TAU);
      ctx.fill();
      break;
    }
    case T.combustor: {
      const rr = R * (0.1 + 0.05 * c.p0 * 4);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
      g.addColorStop(0, `rgba(255,240,180,${(0.4 + 0.6 * act) * a})`);
      g.addColorStop(0.5, `rgba(255,140,40,${(0.3 + 0.5 * act) * a})`);
      g.addColorStop(1, `rgba(200,40,10,${0.1 * a})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,190,90,${0.7 * a})`;
      ctx.rotate(t * (1 + act * 3));
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, rr * 0.75, (k / 3) * TAU, (k / 3) * TAU + 1.2);
        ctx.stroke();
      }
      break;
    }
    case T.photovore: {
      const s = R * (0.1 + 0.06 * c.p0);
      ctx.rotate(t * 0.1);
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const aa = (k / 6) * TAU;
        if (k === 0) ctx.moveTo(Math.cos(aa) * s, Math.sin(aa) * s);
        else ctx.lineTo(Math.cos(aa) * s, Math.sin(aa) * s);
      }
      ctx.closePath();
      ctx.fillStyle = `rgba(120,255,110,${(0.25 + 0.55 * act) * a})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(200,255,160,${0.85 * a})`;
      ctx.stroke();
      ctx.strokeStyle = `rgba(30,90,20,${0.6 * a})`;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const aa = (k / 3) * TAU;
        ctx.moveTo(-Math.cos(aa) * s, -Math.sin(aa) * s);
        ctx.lineTo(Math.cos(aa) * s, Math.sin(aa) * s);
      }
      ctx.stroke();
      break;
    }
    case T.reclaimer: {
      ctx.rotate(-t * (0.5 + act * 2));
      ctx.strokeStyle = hexToRgba(col, 0.9 * a);
      ctx.lineWidth = R * 0.035;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.08, 0, TAU);
      ctx.stroke();
      for (let k = 0; k < 6; k++) {
        const aa = (k / 6) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(aa) * R * 0.08, Math.sin(aa) * R * 0.08);
        ctx.lineTo(Math.cos(aa) * R * 0.13, Math.sin(aa) * R * 0.13);
        ctx.stroke();
      }
      break;
    }
    case T.capacitor:
    case T.vesicle:
    case T.depot:
    case T.vacuole: {
      const resIdx = c.type === T.capacitor ? 2 : c.type === T.vesicle ? 0 : c.type === T.depot ? 1 : 3;
      const size = 0.75 + 0.25 * c.p0;
      const w = R * 0.13 * size;
      const h = R * 0.2 * size;
      ctx.rotate(c.ang + Math.PI / 2);
      roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.45);
      ctx.fillStyle = `rgba(10,20,30,${0.4 * a})`;
      ctx.fill();
      ctx.save();
      ctx.clip();
      ctx.fillStyle = hexToRgba(RES_COLORS[resIdx], 0.75 * a);
      const lvl = h * c.fill;
      ctx.fillRect(-w / 2, h / 2 - lvl + Math.sin(t * 2 + idx) * R * 0.005, w, lvl);
      ctx.restore();
      roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.45);
      ctx.strokeStyle = hexToRgba(RES_COLORS[resIdx], 0.9 * a);
      ctx.stroke();
      break;
    }
    case T.homeostat: {
      ctx.strokeStyle = hexToRgba(col, 0.9 * a);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.07, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const aa = -Math.PI / 2 + (c.value - 0.5) * 2.5;
      ctx.lineTo(Math.cos(aa) * R * 0.06, Math.sin(aa) * R * 0.06);
      ctx.stroke();
      break;
    }
    case T.oscillator: {
      ctx.strokeStyle = `rgba(255,160,245,${0.8 * a})`;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.08, 0, TAU);
      ctx.stroke();
      const aa = c.value * TAU;
      ctx.fillStyle = `rgba(255,220,255,${a})`;
      ctx.beginPath();
      ctx.arc(Math.cos(aa) * R * 0.08, Math.sin(aa) * R * 0.08, R * 0.03, 0, TAU);
      ctx.fill();
      break;
    }
    case T.strut: {
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = `rgba(220,235,255,${0.25 * a})`;
      ctx.lineWidth = R * 0.02;
      const base = c.ang;
      for (let k = 0; k < 3; k++) {
        const aa = base + (k / 3) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(aa + Math.PI) * R * 0.8, Math.sin(aa + Math.PI) * R * 0.8);
        ctx.lineTo(Math.cos(aa) * R * 0.85, Math.sin(aa) * R * 0.85);
        ctx.stroke();
      }
      ctx.translate(x, y);
      ctx.fillStyle = `rgba(220,235,255,${0.6 * a})`;
      ctx.fillRect(-R * 0.03, -R * 0.03, R * 0.06, R * 0.06);
      break;
    }
    case T.mender: {
      ctx.fillStyle = `rgba(255,120,120,${(0.4 + 0.5 * act) * a})`;
      const s = R * 0.05;
      ctx.fillRect(-s * 0.35, -s, s * 0.7, s * 2);
      ctx.fillRect(-s, -s * 0.35, s * 2, s * 0.7);
      break;
    }
    case T.thermoshield: {
      ctx.strokeStyle = `rgba(255,180,100,${0.7 * a})`;
      ctx.setLineDash([R * 0.02, R * 0.02]);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.09, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }
    default: {
      ctx.fillStyle = hexToRgba(col, 0.7 * a);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.07, 0, TAU);
      ctx.fill();
    }
  }
  if (hl) {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = R * 0.02;
    ctx.setLineDash([R * 0.03, R * 0.02]);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.2, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawMembranePart(ctx: CanvasRenderingContext2D, L: CellLook, c: CompLook, o: DrawOpts, screenR: number, alpha: number) {
  const R = L.r;
  const t = o.t;
  const a = (c.on ? 1 : 0.25) * alpha;
  const col = catColor(c);
  const act = c.on ? c.act : 0;
  ctx.save();
  ctx.rotate(c.ang);
  ctx.translate(R, 0);
  if (screenR < 14) {
    ctx.fillStyle = hexToRgba(col, 0.85 * a);
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.07, 0, TAU);
    ctx.fill();
    ctx.restore();
    return;
  }
  ctx.lineWidth = R * 0.03;
  switch (c.type) {
    case T.pore: {
      ctx.strokeStyle = hexToRgba(col, 0.95 * a);
      ctx.fillStyle = `rgba(5,20,25,${0.8 * a})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, R * 0.05, R * 0.09, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      if (act > 0.1) {
        ctx.fillStyle = hexToRgba(col, 0.8 * a);
        for (let k = 0; k < 2; k++) {
          const u = (t * 0.8 + k * 0.5) % 1;
          ctx.beginPath();
          ctx.arc(R * (0.18 - u * 0.3), 0, R * 0.02, 0, TAU);
          ctx.fill();
        }
      }
      break;
    }
    case T.efflux: {
      ctx.fillStyle = hexToRgba(col, 0.85 * a);
      ctx.beginPath();
      ctx.moveTo(-R * 0.06, -R * 0.07);
      ctx.lineTo(R * 0.07, -R * 0.03);
      ctx.lineTo(R * 0.07, R * 0.03);
      ctx.lineTo(-R * 0.06, R * 0.07);
      ctx.closePath();
      ctx.fill();
      if (act > 0.1) {
        for (let k = 0; k < 2; k++) {
          const u = (t * 0.7 + k * 0.5) % 1;
          ctx.globalAlpha = (1 - u) * a;
          ctx.beginPath();
          ctx.arc(R * (0.08 + u * 0.25), 0, R * 0.025, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case T.junction:
    case T.gaprelay: {
      ctx.fillStyle = hexToRgba(col, (0.5 + 0.4 * act) * a);
      if (c.type === T.junction) ctx.fillRect(-R * 0.04, -R * 0.08, R * 0.08, R * 0.16);
      else {
        ctx.beginPath();
        ctx.moveTo(0, -R * 0.08);
        ctx.lineTo(R * 0.06, 0);
        ctx.lineTo(0, R * 0.08);
        ctx.lineTo(-R * 0.06, 0);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case T.chemoreceptor:
    case T.photoreceptor:
    case T.thermoreceptor:
    case T.murksensor:
    case T.echoreceptor:
    case T.proximity: {
      ctx.strokeStyle = hexToRgba(col, 0.8 * a);
      ctx.lineWidth = R * 0.02;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const sway = Math.sin(t * 2 + c.ang * 3) * R * 0.03;
      ctx.quadraticCurveTo(R * 0.12, sway, R * 0.22, sway * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      const s = R * (0.12 + 0.18 * c.value);
      ctx.globalAlpha = (0.3 + 0.7 * c.value) * a;
      ctx.drawImage(glowSprite(hexToRgba(col, 0.95)) as CanvasImageSource, R * 0.22 - s / 2, sway * 2 - s / 2, s, s);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = hexToRgba(col, a);
      ctx.beginPath();
      ctx.arc(R * 0.22, sway * 2, R * 0.03, 0, TAU);
      ctx.fill();
      if (c.type === T.proximity && screenR > 30) {
        ctx.strokeStyle = hexToRgba(col, 0.12 * a);
        ctx.beginPath();
        ctx.arc(-R, 0, R * (1 + c.p0), -Math.PI / 3, Math.PI / 3);
        ctx.stroke();
      }
      break;
    }
    case T.emitter: {
      ctx.fillStyle = hexToRgba(col, 0.8 * a);
      ctx.beginPath();
      ctx.moveTo(-R * 0.03, -R * 0.07);
      ctx.lineTo(R * 0.09, -R * 0.11);
      ctx.lineTo(R * 0.09, R * 0.11);
      ctx.lineTo(-R * 0.03, R * 0.07);
      ctx.closePath();
      ctx.fill();
      if (act > 0.1) {
        ctx.strokeStyle = hexToRgba(col, 0.6 * a);
        for (let k = 0; k < 3; k++) {
          const u = (t * 0.6 + k / 3) % 1;
          ctx.globalAlpha = (1 - u) * act * a;
          ctx.beginPath();
          ctx.arc(R * 0.05, 0, R * (0.1 + u * 0.45), -0.6, 0.6);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      break;
    }
    case T.adhesion: {
      ctx.fillStyle = `rgba(230,240,250,${0.8 * a})`;
      ctx.beginPath();
      ctx.arc(R * 0.02, 0, R * 0.065, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = `rgba(120,140,160,${0.8 * a})`;
      ctx.stroke();
      break;
    }
    case T.armor: {
      ctx.translate(-R, 0);
      ctx.strokeStyle = `rgba(160,180,200,${0.95 * a})`;
      ctx.lineWidth = R * 0.11;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.02, -0.5, 0.5);
      ctx.stroke();
      ctx.strokeStyle = `rgba(230,240,255,${0.6 * a})`;
      ctx.lineWidth = R * 0.02;
      ctx.beginPath();
      ctx.arc(0, 0, R * 1.07, -0.45, 0.45);
      ctx.stroke();
      break;
    }
    case T.spike: {
      ctx.fillStyle = `rgba(255,${80 + 80 * (1 - act)},100,${0.9 * a})`;
      const len = R * (0.22 + 0.1 * c.p0);
      ctx.beginPath();
      ctx.moveTo(-R * 0.02, -R * 0.07);
      ctx.lineTo(len, 0);
      ctx.lineTo(-R * 0.02, R * 0.07);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case T.flagellum:
    case T.cilia:
      // drawn as appendages
      ctx.fillStyle = hexToRgba(col, 0.9 * a);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.045, 0, TAU);
      ctx.fill();
      break;
    default:
      ctx.fillStyle = hexToRgba(col, 0.8 * a);
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.05, 0, TAU);
      ctx.fill();
  }
  ctx.restore();
}

function drawAppendages(ctx: CanvasRenderingContext2D, L: CellLook, o: DrawOpts, hue: number, alpha: number) {
  const R = L.r;
  const t = o.t;
  for (const c of L.comps) {
    if (c.type !== T.flagellum && c.type !== T.cilia) continue;
    const a = (c.on ? 1 : 0.25) * alpha;
    const act = c.on ? c.act : 0;
    const ang = L.angle + c.ang;
    const bx = L.x + Math.cos(ang) * R;
    const by = L.y + Math.sin(ang) * R;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    if (c.type === T.flagellum) {
      const len = R * (1.2 + 0.4 * c.p0);
      const amp = R * 0.16 * (0.3 + act);
      const speed = 3 + act * 12;
      ctx.strokeStyle = hsla(hue + 30, 80, 75, (0.35 + 0.5 * act) * a);
      ctx.lineWidth = R * 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let k = 0; k <= 16; k++) {
        const u = k / 16;
        const w = Math.sin(u * 7 - t * speed + L.phase) * amp * u;
        const px = bx + ux * len * u - uy * w;
        const py = by + uy * len * u + ux * w;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else {
      ctx.strokeStyle = hsla(hue + 60, 70, 80, (0.3 + 0.5 * act) * a);
      ctx.lineWidth = R * 0.018;
      for (let k = -4; k <= 4; k++) {
        const aa = ang + k * 0.12;
        const sx = L.x + Math.cos(aa) * R;
        const sy = L.y + Math.sin(aa) * R;
        const beat = Math.sin(t * (6 + act * 10) + k) * 0.5 * (0.3 + act);
        const ex = sx + Math.cos(aa + beat) * R * 0.22;
        const ey = sy + Math.sin(aa + beat) * R * 0.22;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }
  }
}

export function drawSelection(ctx: CanvasRenderingContext2D, L: CellLook, o: DrawOpts) {
  const R = L.r * 1.45;
  const t = o.t;
  ctx.save();
  ctx.translate(L.x, L.y);
  // soft halo so the selection reads even in a crowd
  ctx.globalCompositeOperation = 'lighter';
  const hs = R * 3;
  ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 3);
  ctx.drawImage(glowSprite('rgba(120,255,230,0.9)') as CanvasImageSource, -hs / 2, -hs / 2, hs, hs);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(160,255,240,0.95)';
  ctx.lineWidth = 2.2 / o.zoom;
  ctx.setLineDash([6 / o.zoom, 5 / o.zoom]);
  ctx.rotate(t * 0.4);
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.rotate(-t * 0.8);
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 2);
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.12, -0.25, 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

const rgbaCache = new Map<string, string>();
export function hexToRgba(hex: string, a: number): string {
  const key = hex + a.toFixed(2);
  let v = rgbaCache.get(key);
  if (v) return v;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  v = `rgba(${r},${g},${b},${a.toFixed(2)})`;
  if (rgbaCache.size > 4000) rgbaCache.clear();
  rgbaCache.set(key, v);
  return v;
}

export { TISSUE_COLORS };
