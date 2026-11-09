/**
 * Per-cell metabolism: sensing → circuit → components → internal transport →
 * membrane exchange → base upkeep / autophagy → stress & repair.
 *
 * Matter is conserved everywhere in this file: every unit removed from one
 * pool is added to another (or to the dish). Charge (energy) is created by
 * combustion / light / autophagy and destroyed by upkeep and work.
 */
import { NUM_RES, R_CHARGE, R_LITH, R_MURK, R_SORB, MASS_LITH_FRACTION, TAU, clamp01, wrapAngle } from './constants';
import { T } from './components';
import { evaluateCircuit, type CircuitIO } from './circuit';
import { MAX_PARAMS } from './design';
import type { Cell } from './cell';
import type { World } from './world';

const MURK_REF = 6;
export const RECLAIM_COST = 3.5;
export const BURN_YIELD = 3;
const EMA = 0.06;

/** Shared IO adaptor (re-pointed per cell to avoid allocation). */
class IO implements CircuitIO {
  c!: Cell;
  w!: World;
  tick = 0;
  sensorValue(ci: number, pi: number): number {
    return this.c.sensors[this.c.cd.outOffset[ci] + pi];
  }
  channel(ch: number): number {
    return this.c.channels[ch] ?? 0;
  }
  internal(which: number, k: number): number {
    const c = this.c;
    switch (which) {
      case 0:
        return c.bonds.length / 6;
      case 1:
        return clamp01(c.age / (Math.max(1, k) * 100));
      case 2:
        return c.tissue === (k | 0) ? 1 : 0;
      case 3: {
        const o = this.w.organisms.get(c.organismId);
        return clamp01((o ? o.size : 1) / Math.max(1, k));
      }
    }
    return 0;
  }
  random(): number {
    return this.w.rng.next();
  }
}
const io = new IO();

function sat(v: number, half: number): number {
  return v <= 0 ? 0 : v / (v + half);
}

/** Expose the world position of component i. */
export function componentWorldPos(c: Cell, i: number): [number, number] {
  const a = c.angle + c.cd.ang[i];
  const r = c.radius * c.cd.dist[i];
  return [c.x + Math.cos(a) * r, c.y + Math.sin(a) * r];
}

/** Grid index at component i's position (allocation-free hot path). */
function compGridIndex(w: World, c: Cell, i: number): number {
  const a = c.angle + c.cd.ang[i];
  const r = c.radius * c.cd.dist[i];
  return w.env.index(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r);
}

// Reusable neighbour buffer for proximity sensing (one spatial query per cell)
let nbBuf: Cell[] = [];
let nbCount = 0;
function gatherNeighbours(w: World, c: Cell, range: number) {
  nbCount = 0;
  const r = range + c.radius + 16;
  const r2 = (range + c.radius + 14) ** 2;
  w.hash.query(c.x, c.y, r, (o) => {
    if (o === c || !o.alive) return;
    const dx = o.x - c.x;
    const dy = o.y - c.y;
    if (dx * dx + dy * dy > r2 + o.radius * o.radius * 4) return;
    if (nbCount >= nbBuf.length) nbBuf = nbBuf.concat(new Array<Cell>(64));
    nbBuf[nbCount++] = o;
  });
}
function maxProximityRange(cd: Cell['cd'], radius: number): number {
  let m = 0;
  for (const i of cd.byType[T.proximity]) m = Math.max(m, cd.params[i * MAX_PARAMS]);
  return m * radius;
}

export function sense(w: World, c: Cell): void {
  const cd = c.cd;
  const env = w.env;
  const s = c.sensors;
  let gathered = false;
  const list = cd.sensorIdx;
  for (let k = 0; k < list.length; k++) {
    const i = list[k];
    const t = cd.types[i];
    const o = cd.outOffset[i];
    if (!c.expressed(i)) {
      const nOut = t === T.homeostat ? 6 : t === T.proximity ? 3 : t === T.photoreceptor || t === T.echoreceptor ? 1 : 2;
      for (let k = 0; k < nOut; k++) s[o + k] = 0;
      continue;
    }
    const a = c.angle + cd.ang[i];
    const px = c.x + Math.cos(a) * c.radius;
    const py = c.y + Math.sin(a) * c.radius;
    const p0 = cd.params[i * MAX_PARAMS];
    const p1 = cd.params[i * MAX_PARAMS + 1];
    switch (t) {
      case T.chemoreceptor: {
        const field = p0 > 0.5 ? env.lith : env.sorb;
        const v = sat(env.sample(field, px, py), p1);
        const prev = c.sensorMem[i * 2];
        c.sensorMem[i * 2] = prev + (v - prev) * 0.08;
        s[o] = v;
        s[o + 1] = v > prev + 0.002 ? 1 : 0;
        break;
      }
      case T.photoreceptor:
        s[o] = clamp01(env.lightAt(px, py) * p0);
        break;
      case T.thermoreceptor: {
        const h = env.sample(env.heat, px, py);
        s[o] = clamp01(h);
        s[o + 1] = clamp01((Math.abs(h - 0.5) - cd.membrane.heatTolerance) * 4 + 0.0);
        break;
      }
      case T.murksensor:
        s[o] = sat(env.sample(env.murk, px, py), p0);
        s[o + 1] = clamp01(c.total(R_MURK) / Math.max(0.01, c.totalCap(R_MURK)));
        break;
      case T.echoreceptor:
        s[o] = sat(env.sample(p0 > 0.5 ? env.echoB : env.echoA, px, py), p1);
        break;
      case T.proximity: {
        const range = p0 * c.radius;
        if (!gathered) {
          gatherNeighbours(w, c, maxProximityRange(cd, c.radius));
          gathered = true;
        }
        let any = 0;
        let kin = 0;
        let foreign = 0;
        for (let k = 0; k < nbCount; k++) {
          const other = nbBuf[k];
          const dx = other.x - c.x;
          const dy = other.y - c.y;
          const lim = range + other.radius + c.radius;
          const d2 = dx * dx + dy * dy;
          if (d2 > lim * lim) continue;
          const d = Math.sqrt(d2) - other.radius - c.radius;
          const rel = Math.abs(wrapAngle(Math.atan2(dy, dx) - a));
          if (rel > Math.PI / 3) continue;
          const wgt = 1 - Math.max(0, d) / range;
          any += wgt;
          if (other.strain === c.strain || (other.organismId === c.organismId && c.organismId !== 0)) kin += wgt;
          else foreign += wgt;
        }
        s[o] = clamp01(any / 2);
        s[o + 1] = clamp01(kin / 2);
        s[o + 2] = clamp01(foreign / 2);
        break;
      }
      case T.homeostat:
        s[o] = clamp01(c.total(R_CHARGE) / Math.max(0.01, c.totalCap(R_CHARGE)));
        s[o + 1] = clamp01(c.total(R_SORB) / Math.max(0.01, c.totalCap(R_SORB)));
        s[o + 2] = clamp01(c.total(R_LITH) / Math.max(0.01, c.totalCap(R_LITH)));
        s[o + 3] = clamp01(c.total(R_MURK) / Math.max(0.01, c.totalCap(R_MURK)));
        s[o + 4] = clamp01(c.integrity / Math.max(0.01, c.maxIntegrity));
        s[o + 5] = clamp01(c.mass / c.cd.divideMass);
        break;
    }
  }
}

export function runCircuit(w: World, c: Cell): void {
  const cd = c.cd;
  const act = c.activation;
  for (let i = 0; i < cd.n; i++) act[i] = cd.circuit.hasActuator[i] ? 0 : 1;
  if (cd.circuit.n === 0) {
    c.circuitOut.actions.fill(0);
    c.circuitOut.tissueTarget = -1;
    c.circuitOut.channelOut.fill(0);
    return;
  }
  io.c = c;
  io.w = w;
  io.tick = w.tick;
  evaluateCircuit(cd.circuit, c.circuit, io, c.circuitOut);
}

/** Main per-cell metabolic step. */
export function metabolize(w: World, c: Cell): void {
  const cd = c.cd;
  const n = cd.n;
  const buf = c.buf;
  const env = w.env;
  const L = w.ledger;
  const ei = env.index(c.x, c.y);
  const heat = env.heat[ei];
  const rateMul = 0.6 + 0.8 * heat;
  const caps = cd.caps;
  const prm = cd.params;
  const eGen = c.eGen;
  const eUse = c.eUse;
  let energyIn = 0;
  let energyOut = 0;

  c.updateCaps();

  // ---------- Components ----------
  for (let i = 0; i < n; i++) {
    const nb = (i + 1) * NUM_RES;
    let gen = 0;
    let use = 0;
    if (!c.expressed(i)) {
      c.activity[i] = 0;
      eGen[i] += (0 - eGen[i]) * EMA;
      eUse[i] += (0 - eUse[i]) * EMA;
      continue;
    }
    const t = cd.types[i];
    const actv = cd.actuated[i] ? c.activation[i] : 1;
    const u = cd.upkeep[i] * rateMul * (cd.actuated[i] ? 0.25 + 0.75 * actv : 1);
    const avail = buf[nb + R_CHARGE];
    let eff = u > 0 ? Math.min(1, avail / u) : 1;
    buf[nb + R_CHARGE] = avail - eff * u;
    use += eff * u;
    // Energy acquirers (combustors, photovores, spikes) are self-priming: an
    // unpaid upkeep becomes a debt settled from their own intake, so a
    // drained cell can restart instead of locking up.
    let debt = 0;
    if (eff < 1 && (t === T.combustor || t === T.photovore || t === T.spike)) {
      debt = (1 - eff) * u;
      eff = 1;
    }
    const s = actv * eff;
    const p0 = prm[i * MAX_PARAMS];
    const p1 = prm[i * MAX_PARAMS + 1];

    switch (t) {
      case T.assembler: {
        if (c.mass >= cd.maxMass) break;
        // Growth checkpoint: build only while charge is healthy, so a cell never
        // turns its last fuel into biomass (0 below 15% charge, full above 50%).
        const chargeFrac = buf[nb + R_CHARGE] / Math.max(1e-6, caps[nb - NUM_RES + R_CHARGE]);
        const gate = Math.max(0, Math.min(1, (chargeFrac - 0.15) / 0.35));
        let g = p0 * s * rateMul * gate;
        const needS = 1 - MASS_LITH_FRACTION;
        const needL = MASS_LITH_FRACTION;
        g = Math.min(g, buf[nb + R_SORB] / needS, buf[nb + R_LITH] / needL, buf[nb + R_CHARGE] / 2.5, cd.maxMass - c.mass);
        if (g > 0) {
          buf[nb + R_SORB] -= g * needS;
          buf[nb + R_LITH] -= g * needL;
          buf[nb + R_CHARGE] -= g * 2.5;
          use += g * 2.5;
          c.mass += g;
          c.growth += (g - c.growth) * 0.05;
        }
        break;
      }
      case T.combustor: {
        let b = p0 * s * rateMul;
        b = Math.min(b, buf[nb + R_SORB], (caps[nb - NUM_RES + R_CHARGE] - buf[nb + R_CHARGE]) / 3, caps[nb - NUM_RES + R_MURK] * 1.5 - buf[nb + R_MURK]);
        if (b > 0) {
          buf[nb + R_SORB] -= b;
          buf[nb + R_MURK] += b;
          buf[nb + R_CHARGE] += 3 * b;
          gen += 3 * b;
        }
        break;
      }
      case T.photovore: {
        let eff2 = 1;
        if (heat > 0.65) eff2 = Math.max(0.15, 1 - (heat - 0.65) * 3);
        let e = env.lightBase[compGridIndex(w, c, i)] * env.lightMul * p0 * 0.055 * s * eff2;
        e = Math.min(e, Math.max(0, caps[nb - NUM_RES + R_CHARGE] - buf[nb + R_CHARGE]));
        if (e > 0) {
          buf[nb + R_CHARGE] += e;
          gen += e;
        }
        break;
      }
      case T.reclaimer: {
        let x = p0 * s * rateMul;
        // Refining costs more charge (3.5) than burning the product yields (3):
        // no free energy loops.
        x = Math.min(x, buf[nb + R_MURK], buf[nb + R_CHARGE] / RECLAIM_COST, caps[nb - NUM_RES + R_SORB] * 1.5 - buf[nb + R_SORB]);
        if (x > 0) {
          buf[nb + R_MURK] -= x;
          buf[nb + R_SORB] += x;
          buf[nb + R_CHARGE] -= x * RECLAIM_COST;
          use += x * RECLAIM_COST;
        }
        break;
      }
      case T.capacitor: {
        const leak = buf[nb + R_CHARGE] * 0.0008;
        buf[nb + R_CHARGE] -= leak;
        use += leak;
        break;
      }
      case T.pore: {
        const gi = compGridIndex(w, c, i);
        if (p1 === 3) {
          // Murk-only mode: a scavenger pore that pumps waste in (for reclaimers)
          let dm = Math.max(0, Math.min(p0 * s * env.murk[gi], caps[nb - NUM_RES + R_MURK] * 1.5 - buf[nb + R_MURK]));
          const cm = dm * 0.12;
          if (cm > buf[nb + R_CHARGE]) dm = buf[nb + R_CHARGE] / 0.12;
          if (dm > 0) {
            buf[nb + R_CHARGE] -= dm * 0.12;
            use += dm * 0.12;
            env.murk[gi] -= dm;
            buf[nb + R_MURK] += dm;
          }
          break;
        }
        const wantS = p1 === 2 ? 0 : 1;
        const wantL = p1 === 1 ? 0 : 1;
        let ds = wantS * p0 * s * env.sorb[gi];
        let dl = wantL * p0 * s * env.lith[gi];
        ds = Math.max(0, Math.min(ds, caps[nb - NUM_RES + R_SORB] - buf[nb + R_SORB]));
        dl = Math.max(0, Math.min(dl, caps[nb - NUM_RES + R_LITH] - buf[nb + R_LITH]));
        const cost = (ds + dl) * 0.12;
        const ch = buf[nb + R_CHARGE];
        if (cost > ch) {
          const k = cost > 0 ? ch / cost : 0;
          ds *= k;
          dl *= k;
        }
        const realCost = (ds + dl) * 0.12;
        buf[nb + R_CHARGE] -= realCost;
        use += realCost;
        env.sorb[gi] -= ds;
        env.lith[gi] -= dl;
        buf[nb + R_SORB] += ds;
        buf[nb + R_LITH] += dl;
        break;
      }
      case T.efflux: {
        const gi = compGridIndex(w, c, i);
        let m = Math.min(p0 * s, buf[nb + R_MURK]);
        const cost = m * 0.1;
        if (cost > buf[nb + R_CHARGE]) m = buf[nb + R_CHARGE] / 0.1;
        if (m > 0) {
          buf[nb + R_MURK] -= m;
          buf[nb + R_CHARGE] -= m * 0.1;
          use += m * 0.1;
          env.murk[gi] += m;
        }
        break;
      }
      case T.emitter: {
        const gi = compGridIndex(w, c, i);
        env.echoAge = 0;
        const amt = p1 * s * 0.4;
        if (amt > 0.001) {
          const cost = amt * 0.15;
          const k = Math.min(1, buf[nb + R_CHARGE] / Math.max(1e-9, cost));
          buf[nb + R_CHARGE] -= cost * k;
          use += cost * k;
          if (p0 > 0.5) env.echoB[gi] += amt * k;
          else env.echoA[gi] += amt * k;
          if (amt * k > 0.05) c.flash = Math.max(c.flash, 0.6);
        }
        break;
      }
      case T.oscillator: {
        const period = Math.max(2, p0);
        const ph = (c.sensorMem[i * 2] + s / period) % 1;
        c.sensorMem[i * 2] = ph;
        const o = cd.outOffset[i];
        c.sensors[o] = 0.5 + 0.5 * Math.sin(ph * TAU);
        c.sensors[o + 1] = ph < p1 ? 1 : 0;
        break;
      }
      case T.flagellum: {
        const a = c.angle + cd.ang[i];
        const f = p0 * s * 0.07;
        const extra = p0 * s * 0.012 * rateMul;
        const pay = Math.min(extra, buf[nb + R_CHARGE]);
        buf[nb + R_CHARGE] -= pay;
        use += pay;
        const k = extra > 0 ? pay / extra : 1;
        c.fx -= Math.cos(a) * f * k;
        c.fy -= Math.sin(a) * f * k;
        c.torque -= Math.sin(cd.ang[i]) * f * k * 0.06;
        break;
      }
      case T.cilia: {
        const dir = p1 > 0.5 ? 1 : -1;
        const f = p0 * s;
        c.torque += dir * f * 0.004;
        const a = c.angle + cd.ang[i] + (dir * Math.PI) / 2;
        c.fx += Math.cos(a) * f * 0.012;
        c.fy += Math.sin(a) * f * 0.012;
        break;
      }
      case T.mender: {
        const missing = c.maxIntegrity - c.integrity;
        if (missing > 0) {
          let r = Math.min(p0 * s * 0.5, missing, buf[nb + R_CHARGE] / 2);
          if (r < 0) r = 0;
          buf[nb + R_CHARGE] -= r * 2;
          use += r * 2;
          c.integrity += r;
        }
        break;
      }
      default:
        break;
    }
    if (debt > 0) {
      const pay = Math.min(debt, buf[nb + R_CHARGE]);
      buf[nb + R_CHARGE] -= pay;
      use += pay;
    }
    c.activity[i] += (s - c.activity[i]) * 0.3;
    energyIn += gen;
    energyOut += use;
    eGen[i] += (gen - eGen[i]) * EMA;
    eUse[i] += (use - eUse[i]) * EMA;
  }

  // ---------- Internal transport (resource network) ----------
  const ne = cd.numEdges;
  const cyto = c.cytoCap;
  const flows = c.edgeFlow;
  for (let e = 0; e < ne; e++) for (let r = 0; r < NUM_RES; r++) flows[e * NUM_RES + r] *= 1 - EMA;
  for (let sub = 0; sub < 2; sub++) {
    for (let e = 0; e < ne; e++) {
      const a = cd.edgeA[e];
      const b = cd.edgeB[e];
      const g = cd.edgeG[e] * 0.5;
      for (let r = 0; r < NUM_RES; r++) {
        const capA = a === 0 ? cyto[r] : caps[(a - 1) * NUM_RES + r];
        const capB = b === 0 ? cyto[r] : caps[(b - 1) * NUM_RES + r];
        if (capA <= 0 || capB <= 0) continue;
        const ia = a * NUM_RES + r;
        const ib = b * NUM_RES + r;
        const flow = g * (buf[ia] / capA - buf[ib] / capB) * ((capA * capB) / (capA + capB));
        buf[ia] -= flow;
        buf[ib] += flow;
        flows[e * NUM_RES + r] += flow * EMA;
      }
    }
  }

  // ---------- Membrane passive exchange (cytosol <-> dish) ----------
  const perm = cd.membrane.perm;
  const area = Math.sqrt(c.mass / 10) * 3;
  for (let r = 0; r < NUM_RES; r++) {
    if (r === R_CHARGE) continue;
    const f = r === R_SORB ? env.sorb : r === R_LITH ? env.lith : env.murk;
    const ref = r === R_SORB ? w.params.maxSorb : r === R_LITH ? w.params.maxLith : MURK_REF;
    const envAmt = f[ei];
    const cellAmt = buf[r];
    const cap = cyto[r];
    let flow = perm[r] * area * (envAmt / ref - cellAmt / cap);
    if (flow > 0) flow = Math.min(flow, envAmt * 0.25, Math.max(0, cap * 1.2 - cellAmt));
    else flow = -Math.min(-flow, cellAmt);
    buf[r] += flow;
    f[ei] -= flow;
    c.membraneFlow[r] += (flow - c.membraneFlow[r]) * EMA;
  }

  // ---------- Base upkeep & autophagy ----------
  // Basal metabolism: membrane upkeep plus biomass turnover proportional to mass.
  const base = (cd.membrane.upkeep * Math.sqrt(c.mass / 10) + 0.002 + c.mass * 0.0012) * rateMul;
  let cellUse = 0;
  let autoGen = 0;
  const ch = buf[R_CHARGE];
  if (ch >= base) {
    buf[R_CHARGE] = ch - base;
    cellUse += base;
  } else {
    buf[R_CHARGE] = 0;
    cellUse += ch;
    const deficit = base - ch;
    // Autophagy: digest biomass into charge; the matter becomes murk.
    const dm = Math.min(deficit / 2.5, Math.max(0, c.mass - c.cd.minMass * 0.98));
    if (dm > 0) {
      c.mass -= dm;
      buf[R_MURK] += dm;
      autoGen += dm * 2.5;
      cellUse += dm * 2.5;
    }
    if (deficit - dm * 2.5 > 1e-6) {
      c.integrity -= 0.04;
      c.damage.starvation += 0.04;
    }
  }

  // ---------- Stress, toxicity, senescence, natural repair ----------
  const resist = cd.membrane.damageResist;
  const stress = Math.max(0, Math.abs(heat - 0.5) - cd.membrane.heatTolerance);
  c.heatStress = stress;
  if (stress > 0) {
    const d = stress * 0.55 * (1 - resist * 0.5);
    c.integrity -= d;
    c.damage.heat += d;
  }
  const murkC = c.total(R_MURK) / Math.max(0.01, c.totalCap(R_MURK));
  c.toxicity = murkC;
  if (murkC > 0.55) {
    const d = (murkC - 0.55) * 0.3 * (1 - resist);
    c.integrity -= d;
    c.damage.toxicity += d;
  }
  if (c.age > cd.lifespan) {
    const d = 0.006 + ((c.age - cd.lifespan) / 1000) * 0.01;
    c.integrity -= d;
    c.damage.senescence += d;
  }
  if (c.integrity < c.maxIntegrity && buf[R_CHARGE] > cyto[R_CHARGE] * 0.4) {
    const r = Math.min(0.004, c.maxIntegrity - c.integrity);
    buf[R_CHARGE] -= r * 2;
    cellUse += r * 2;
    c.integrity += r;
  }
  c.maxIntegrity = c.computeMaxIntegrity();
  if (c.integrity > c.maxIntegrity) c.integrity = c.maxIntegrity;

  energyIn += autoGen;
  energyOut += cellUse;
  eUse[n] += (cellUse - eUse[n]) * EMA;
  eGen[n + 1] += (autoGen - eGen[n + 1]) * EMA;
  L.energyIn += energyIn;
  L.energyOut += energyOut;
  w.tickEnergyIn += energyIn;
  w.tickEnergyOut += energyOut;
  if (c.flash > 0) c.flash *= 0.94;
}
