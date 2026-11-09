/**
 * Growth checks, division (with inheritance + mutation), differentiation
 * and death (with full matter return to the dish).
 */
import { MASS_LITH_FRACTION, NUM_RES, NUM_TISSUES, R_CHARGE, R_LITH, R_MURK, R_SORB } from './constants';
import { ACT_APOPTOSIS, ACT_DIVIDE } from './circuit';
import { Cell, type DeathCause } from './cell';
import { createBond, canBond } from './multicell';
import { note } from './ledger';
import type { World } from './world';

export function canDivide(w: World, c: Cell): boolean {
  const cd = c.cd;
  if (cd.coreIndex < 0) return false;
  if (!c.expressed(cd.coreIndex) || c.activity[cd.coreIndex] < 0.3) return false;
  if (c.mass < cd.divideMass) return false;
  if (w.tick - c.lastDivision < 40) return false;
  if (w.cells.length + w.pendingBirths.length >= w.params.maxPopulation) return false;
  return true;
}

export function wantsDivide(c: Cell): boolean {
  return c.cd.autoDivide || c.circuitOut.actions[ACT_DIVIDE] === 1;
}

/** Split a cell. Returns the daughter. Matter is exactly halved. */
export function divide(w: World, parent: Cell): Cell {
  const rng = w.rng;
  let strain = parent.strain;
  const pm = w.params.mutationRate * (1 - 0.9 * parent.cd.fidelity);
  if (pm > 0 && rng.chance(pm)) strain = w.mutate(parent.strain);
  const dev = parent.cd.design.development;
  const axis = parent.angle + ((dev.divisionAngle + dev.rotateEach * parent.divisions) * Math.PI) / 180;
  const half = parent.mass / 2;
  parent.mass = half;
  parent.updateCaps();
  const off = parent.radius * 0.95;
  const ux = Math.cos(axis);
  const uy = Math.sin(axis);
  const dx = parent.x + ux * off;
  const dy = parent.y + uy * off;
  parent.x -= ux * off * 0.6;
  parent.y -= uy * off * 0.6;

  let tissue = parent.tissue;
  switch (dev.daughterTissue) {
    case 'alternate':
      tissue = parent.tissue === 0 ? 1 : 0;
      break;
    case 'cycle':
      tissue = (parent.tissue + 1) % NUM_TISSUES;
      break;
    case 'random':
      tissue = rng.int(0, NUM_TISSUES);
      break;
    case 'toB':
      tissue = 1;
      break;
  }
  const d = new Cell(w.nextCellId++, strain, dx, dy, parent.angle, half, tissue, w.tick, rng.next() * 6.28);
  d.parentId = parent.id;
  d.generation = parent.generation + 1;
  parent.generation += 1;
  parent.divisions++;
  parent.lastDivision = w.tick;
  d.lastDivision = w.tick;

  // Split buffers. Same layout → copy halves; mutated layout → map by uid,
  // leftovers into the daughter cytosol.
  const pb = parent.buf;
  const db = d.buf;
  const pcd = parent.cd;
  const dcd = d.cd;
  for (let r = 0; r < NUM_RES; r++) {
    const h = pb[r] / 2;
    pb[r] -= h;
    db[r] += h;
  }
  for (let i = 0; i < pcd.n; i++) {
    const j = pcd === dcd ? i : (dcd.uidToIndex.get(pcd.uids[i]) ?? -1);
    for (let r = 0; r < NUM_RES; r++) {
      const k = (i + 1) * NUM_RES + r;
      const h = pb[k] / 2;
      pb[k] -= h;
      if (j >= 0) db[(j + 1) * NUM_RES + r] += h;
      else db[r] += h;
    }
  }
  d.channels.set(parent.channels);
  const frac = parent.integrity / Math.max(0.01, parent.maxIntegrity);
  parent.maxIntegrity = parent.computeMaxIntegrity();
  parent.integrity = frac * parent.maxIntegrity;
  d.maxIntegrity = d.computeMaxIntegrity();
  d.integrity = frac * d.maxIntegrity;

  // Bonded development: stay attached while the organism is below its size limit.
  let bonded = false;
  if (dev.mode === 'bonded' && canBond(parent) && d.cd.bondSlots > 0) {
    const size = parent.organismId ? (w.organisms.get(parent.organismId)?.size ?? 1) : 1;
    if (size < dev.maxCells) {
      w.pendingBonds.push([parent, d, axis - parent.angle, axis + Math.PI - d.angle]);
      bonded = true;
      if (parent.organismId) {
        const o = w.organisms.get(parent.organismId);
        if (o) o.size++;
      }
    }
  }
  if (!bonded) {
    d.vx = ux * 1.2;
    d.vy = uy * 1.2;
    // A bud that founds a new organism restarts development (germline reset).
    if (dev.mode === 'bonded') d.tissue = d.cd.design.development.startTissue;
  }
  w.pendingBirths.push(d);
  w.pushFx('birth', dx, dy, strain.hue);
  return d;
}

/** Apply pending bonds after newborns are in the world. */
export function flushPendingBonds(w: World): void {
  for (const [a, b, angA, angB] of w.pendingBonds) createBond(w, a, b, angA, angB);
  w.pendingBonds.length = 0;
}

export function deathCause(c: Cell): DeathCause {
  if (c.deathCause) return c.deathCause;
  if (c.mass < c.cd.minMass) return 'starvation';
  const d = c.damage;
  let best: DeathCause = 'integrity';
  let v = 0;
  for (const k of ['heat', 'toxicity', 'predation', 'starvation', 'senescence'] as const)
    if (d[k] > v) {
      v = d[k];
      best = k;
    }
  return best;
}

/** Kill a cell, returning all its matter to the dish around it. */
export function kill(w: World, c: Cell, cause?: DeathCause): void {
  if (!c.alive) return;
  c.alive = false;
  if (cause) c.deathCause = cause;
  c.deathCause = deathCause(c);
  let sorb = c.total(R_SORB) + c.mass * (1 - MASS_LITH_FRACTION);
  let lith = c.total(R_LITH) + c.mass * MASS_LITH_FRACTION;
  const murk = c.total(R_MURK);
  let fedCharge = 0;
  // Feast: a predator that lands the killing blow digests most of the prey
  // (sorb and lith go straight into its cytosol; matter is conserved).
  if (c.deathCause === 'predation' && c.lastAttacker) {
    const k = w.cellById(c.lastAttacker);
    if (k && k.alive) {
      const gs = sorb * 0.85;
      const gl = lith * 0.85;
      k.buf[R_SORB] += gs;
      k.buf[R_LITH] += gl;
      fedCharge = c.total(R_CHARGE) * 0.5;
      k.buf[R_CHARGE] += fedCharge;
      sorb -= gs;
      lith -= gl;
      k.flash = 1;
      w.feasts++;
    }
  }
  const r = Math.max(12, c.radius * 1.4);
  w.env.deposit('sorb', c.x, c.y, sorb, r);
  w.env.deposit('lith', c.x, c.y, lith, r);
  w.env.deposit('murk', c.x, c.y, murk, r);
  const charge = c.total(R_CHARGE) - fedCharge; // the rest is lost with the corpse
  w.ledger.energyOut += charge;
  note(w.ledger, 'deathCharge', charge);
  c.buf.fill(0);
  c.mass = 0;
  for (const b of c.bonds) b.broken = true;
  if (c.bonds.length) w.bondsDirty = true;
  w.deaths[c.deathCause] = (w.deaths[c.deathCause] ?? 0) + 1;
  w.pushFx('death', c.x, c.y, c.strain.hue);
}

export function lifecycle(w: World, c: Cell): void {
  // Differentiation
  const tt = c.circuitOut.tissueTarget;
  if (tt >= 0 && tt < NUM_TISSUES && tt !== c.tissue) {
    c.tissue = tt;
    c.flash = 1;
  }
  if (c.circuitOut.actions[ACT_APOPTOSIS]) {
    kill(w, c, 'apoptosis');
    return;
  }
  if (c.integrity <= 0 || c.mass < c.cd.minMass) {
    kill(w, c);
    return;
  }
  if (wantsDivide(c) && canDivide(w, c)) divide(w, c);
}
