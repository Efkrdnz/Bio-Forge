/**
 * Intercellular systems: junction resource sharing, gap-relay signalling,
 * adhesion / release, predation by lysin spikes, organism bookkeeping.
 */
import { NUM_CHANNELS, NUM_RES, R_CHARGE, R_LITH, R_SORB, wrapAngle } from './constants';
import { T } from './components';
import { MAX_PARAMS } from './design';
import type { Bond } from './bond';
import { bondPartner } from './bond';
import type { Cell } from './cell';
import type { World } from './world';

const EMA = 0.08;

/**
 * Sum of (conductance × activation) for expressed parts of a type. Channels are
 * gated by the circuit, not by local charge, so a starving cell can still
 * receive help from its neighbours.
 */
export function channelStrength(c: Cell, type: number): number {
  const cd = c.cd;
  let s = 0;
  for (const i of cd.byType[type]) {
    if (!c.expressed(i)) continue;
    s += cd.params[i * MAX_PARAMS] * c.activation[i];
  }
  return Math.min(0.9, s);
}

export function exchangeAcrossBonds(w: World): void {
  for (const b of w.bonds) {
    if (b.broken) continue;
    const A = b.a;
    const B = b.b;
    const g = Math.min(channelStrength(A, T.junction), channelStrength(B, T.junction));
    if (g > 0) {
      for (let r = 0; r < NUM_RES; r++) {
        const capA = A.cytoCap[r];
        const capB = B.cytoCap[r];
        if (capA <= 0 || capB <= 0) continue;
        const flow = g * 0.5 * (A.buf[r] / capA - B.buf[r] / capB) * ((capA * capB) / (capA + capB));
        A.buf[r] -= flow;
        B.buf[r] += flow;
        b.flow[r] += (flow - b.flow[r]) * EMA;
      }
    } else {
      for (let r = 0; r < NUM_RES; r++) b.flow[r] *= 1 - EMA;
    }
    const h = Math.min(channelStrength(A, T.gaprelay), channelStrength(B, T.gaprelay));
    let sig = 0;
    if (h > 0) {
      for (let k = 0; k < NUM_CHANNELS; k++) {
        const d = h * 0.5 * (A.channels[k] - B.channels[k]);
        A.channels[k] -= d;
        B.channels[k] += d;
        sig += d;
      }
    }
    b.signal += (sig - b.signal) * 0.2;
    b.pulse = (b.pulse + 0.02 + Math.abs(sig) * 0.5) % 1;
  }
}

/** Channel dynamics: decay + sources from signal-out nodes. */
export function updateChannels(c: Cell): void {
  const out = c.circuitOut.channelOut;
  for (let k = 0; k < NUM_CHANNELS; k++) {
    let v = c.channels[k] * 0.97;
    if (out[k] > v) v = out[k];
    c.channels[k] = v;
  }
}

export function canBond(c: Cell): boolean {
  return c.bonds.length < c.cd.bondSlots;
}

export function createBond(w: World, a: Cell, b: Cell, angA?: number, angB?: number): Bond | null {
  if (a === b || !a.alive || !b.alive) return null;
  if (!canBond(a) || !canBond(b)) return null;
  for (const bd of a.bonds) if (bondPartner(bd, a) === b) return null;
  const dir = Math.atan2(b.y - a.y, b.x - a.x);
  const bond: Bond = {
    id: w.nextBondId++,
    a,
    b,
    angA: angA ?? wrapAngle(dir - a.angle),
    angB: angB ?? wrapAngle(dir + Math.PI - b.angle),
    strength: (a.cd.bondStrength + b.cd.bondStrength) / 2,
    stiffness: (a.cd.stiffness + b.cd.stiffness) / 2,
    stretch: 0,
    flow: new Float32Array(NUM_RES),
    signal: 0,
    broken: false,
    pulse: 0,
  };
  a.bonds.push(bond);
  b.bonds.push(bond);
  w.bonds.push(bond);
  w.bondsDirty = true;
  return bond;
}

/** Remove broken bonds from cells and the world list. */
export function cleanBonds(w: World): void {
  let any = false;
  for (const b of w.bonds) {
    if (!b.a.alive || !b.b.alive) b.broken = true;
    if (b.broken) any = true;
  }
  if (!any) return;
  for (const b of w.bonds) {
    if (!b.broken) continue;
    b.a.bonds = b.a.bonds.filter((x) => x !== b);
    b.b.bonds = b.b.bonds.filter((x) => x !== b);
    if (b.a.alive && b.b.alive) w.pushFx('snap', (b.a.x + b.b.x) / 2, (b.a.y + b.b.y) / 2, b.a.strain.hue);
  }
  w.bonds = w.bonds.filter((b) => !b.broken);
}

/** Adhere (bond to touching kin) and release requests from circuits. */
export function adhesionActions(w: World, c: Cell): void {
  const act = c.circuitOut.actions;
  if (act[2]) {
    for (const b of c.bonds) b.broken = true;
    if (c.bonds.length) w.bondsDirty = true;
  }
  if (act[1] && canBond(c)) {
    w.hash.query(c.x, c.y, c.radius + 30, (o) => {
      if (o === c || !o.alive || !canBond(c) || !canBond(o)) return;
      if (o.strain.rootId !== c.strain.rootId) return;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      if (d > (o.radius + c.radius) * 1.08) return;
      createBond(w, c, o);
    });
  }
}

/** Lysin spikes: damage and siphon touching foreign cells inside the sector. */
export function predation(w: World, c: Cell): void {
  const spikes = c.cd.byType[T.spike];
  if (!spikes.length) return;
  for (const i of spikes) {
    if (!c.expressed(i) || c.activity[i] < 0.05) continue;
    const power = c.cd.params[i * MAX_PARAMS];
    const spare = c.cd.params[i * MAX_PARAMS + 1] > 0.5;
    const a = c.angle + c.cd.ang[i];
    const nb = (i + 1) * NUM_RES;
    w.hash.query(c.x, c.y, c.radius + 30, (v) => {
      if (v === c || !v.alive) return;
      if (c.organismId !== 0 && v.organismId === c.organismId) return;
      if (v.strain === c.strain && spare) return;
      if (v.strain.rootId === c.strain.rootId && spare) return;
      const dx = v.x - c.x;
      const dy = v.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d > c.radius + v.radius + 4) return;
      const rel = Math.abs(wrapAngle(Math.atan2(dy, dx) - a));
      if (rel > 0.9) return;
      // Armor on the victim facing the attacker blocks most damage
      const back = Math.atan2(-dy, -dx);
      let armor = 1;
      for (const j of v.cd.byType[T.armor]) {
        if (!v.expressed(j)) continue;
        if (Math.abs(wrapAngle(back - (v.angle + v.cd.ang[j]))) < 0.9) armor = 0.25;
      }
      const s = c.activity[i] * power;
      const dmg = s * 0.1 * armor * (1 - v.cd.membrane.damageResist * 0.6);
      v.integrity -= dmg;
      v.damage.predation += dmg;
      // Siphon contents into the spike buffer (conserving matter)
      const f = Math.min(0.5, s * 0.05 * armor);
      for (const r of [R_SORB, R_LITH, R_CHARGE]) {
        const space = Math.max(0, c.cd.caps[i * NUM_RES + r] * 1.5 - c.buf[nb + r]);
        const take = Math.min(v.buf[r] * f, space);
        if (take > 0) {
          v.buf[r] -= take;
          c.buf[nb + r] += take;
        }
      }
      if (dmg > 0.02 && w.rng.chance(0.15)) w.pushFx('hit', v.x, v.y, c.strain.hue);
    });
  }
}

export interface OrganismInfo {
  id: number;
  size: number;
  rootId: string;
  strainId: number;
  cx: number;
  cy: number;
  tissues: number;
  birthTick: number;
}

/** Recompute organisms as connected components of the bond graph. */
export function recomputeOrganisms(w: World): void {
  const cells = w.cells;
  const idx = new Map<Cell, number>();
  cells.forEach((c, i) => idx.set(c, i));
  const parent = new Int32Array(cells.length);
  for (let i = 0; i < cells.length; i++) parent[i] = i;
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (const b of w.bonds) {
    const ia = idx.get(b.a);
    const ib = idx.get(b.b);
    if (ia === undefined || ib === undefined) continue;
    const ra = find(ia);
    const rb = find(ib);
    if (ra !== rb) parent[ra] = rb;
  }
  const groups = new Map<number, Cell[]>();
  for (let i = 0; i < cells.length; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(cells[i]);
  }
  const old = w.organisms;
  const next = new Map<number, OrganismInfo>();
  const taken = new Set<number>();
  // Larger groups claim ids first (deterministic order by first cell index)
  const list = [...groups.values()].sort((a, b) => b.length - a.length || idx.get(a[0])! - idx.get(b[0])!);
  for (const g of list) {
    if (g.length < 2) {
      g[0].organismId = 0;
      continue;
    }
    const counts = new Map<number, number>();
    for (const c of g) if (c.organismId && !taken.has(c.organismId)) counts.set(c.organismId, (counts.get(c.organismId) ?? 0) + 1);
    let id = 0;
    let best = 0;
    for (const [k, v] of counts) if (v > best || (v === best && k < id)) {
      best = v;
      id = k;
    }
    if (!id) id = w.nextOrganismId++;
    taken.add(id);
    let cx = 0;
    let cy = 0;
    let tissues = 0;
    for (const c of g) {
      c.organismId = id;
      cx += c.x;
      cy += c.y;
      tissues |= 1 << c.tissue;
    }
    next.set(id, {
      id,
      size: g.length,
      rootId: g[0].strain.rootId,
      strainId: g[0].strain.id,
      cx: cx / g.length,
      cy: cy / g.length,
      tissues,
      birthTick: old.get(id)?.birthTick ?? w.tick,
    });
  }
  w.organisms = next;
}
