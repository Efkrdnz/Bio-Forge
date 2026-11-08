/**
 * Membrane catalogue (one membrane per cell, with a thickness multiplier).
 * Permeability governs passive exchange of matter with the dish.
 */
export type MembraneType = 'veil' | 'lattice' | 'shell';

export interface MembraneDef {
  type: MembraneType;
  name: string;
  blurb: string;
  /** Passive permeability per matter resource [sorb, lith, charge(unused), murk]. */
  perm: [number, number, number, number];
  heatTolerance: number;
  integrityBonus: number;
  damageResist: number;
  massCost: number;
  upkeep: number;
  drag: number;
  color: string;
}

export const MEMBRANE_DEFS: Record<MembraneType, MembraneDef> = {
  veil: {
    type: 'veil',
    name: 'Lipoid Veil',
    blurb: 'Thin and cheap. Leaks food in passively, but toxins too. Fragile in heat.',
    perm: [0.03, 0.015, 0, 0.03],
    heatTolerance: 0.13,
    integrityBonus: 0,
    damageResist: 0,
    massCost: 1.0,
    upkeep: 0.004,
    drag: 1.0,
    color: '#7fe9ff',
  },
  lattice: {
    type: 'lattice',
    name: 'Osmotic Lattice',
    blurb: 'Selective: admits nutrients but resists murk. Moderate protection.',
    perm: [0.018, 0.012, 0, 0.006],
    heatTolerance: 0.18,
    integrityBonus: 4,
    damageResist: 0.15,
    massCost: 1.7,
    upkeep: 0.008,
    drag: 1.1,
    color: '#9dffcf',
  },
  shell: {
    type: 'shell',
    name: 'Keratex Shell',
    blurb: 'Thick armoured hull. Almost sealed, very heat tolerant, slow and costly.',
    perm: [0.004, 0.003, 0, 0.002],
    heatTolerance: 0.3,
    integrityBonus: 12,
    damageResist: 0.4,
    massCost: 3.0,
    upkeep: 0.012,
    drag: 1.35,
    color: '#ffd59a',
  },
};

export const MEMBRANE_TYPES = Object.keys(MEMBRANE_DEFS) as MembraneType[];

/** Effective membrane values after the thickness multiplier (0.5 – 2). */
export function membraneStats(type: MembraneType, thickness: number) {
  const d = MEMBRANE_DEFS[type];
  const t = Math.max(0.5, Math.min(2, thickness));
  return {
    perm: d.perm.map((p) => p / t) as [number, number, number, number],
    heatTolerance: d.heatTolerance * (0.75 + 0.25 * t),
    integrityBonus: d.integrityBonus * t + 2 * (t - 1),
    damageResist: Math.min(0.75, d.damageResist * (0.6 + 0.4 * t)),
    massCost: d.massCost * t,
    upkeep: d.upkeep * t,
    drag: d.drag * (0.85 + 0.15 * t),
  };
}
