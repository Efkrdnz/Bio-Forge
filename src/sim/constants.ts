/**
 * Core constants for the BIOFORGE simulation.
 * All resources are fictional abstractions (see docs/ASSUMPTIONS.md).
 */

/** Resource indices for typed-array buffers. */
export const R_SORB = 0; // nutrient matter
export const R_LITH = 1; // structural mineral matter
export const R_CHARGE = 2; // energy currency (not matter)
export const R_MURK = 3; // waste matter
export const NUM_RES = 4;

export type ResourceKey = 'sorb' | 'lith' | 'charge' | 'murk';
export const RES_KEYS: ResourceKey[] = ['sorb', 'lith', 'charge', 'murk'];
export const RES_INDEX: Record<ResourceKey, number> = { sorb: 0, lith: 1, charge: 2, murk: 3 };
export const RES_LABEL: Record<ResourceKey, string> = {
  sorb: 'Sorb',
  lith: 'Lith',
  charge: 'Charge',
  murk: 'Murk',
};
export const RES_COLOR: Record<ResourceKey, string> = {
  sorb: '#3ef0c6',
  lith: '#ffc65c',
  charge: '#6fb8ff',
  murk: '#d05cff',
};
/** Matter resources participate in conservation accounting. */
export const MATTER_RES = [R_SORB, R_LITH, R_MURK] as const;

/** Mass composition: biomass decomposes into sorb and lith with this lith fraction. */
export const MASS_LITH_FRACTION = 1 / 3;

/** Number of internal morphogen (signal) channels per cell. */
export const NUM_CHANNELS = 4;
/** Number of tissue types a design can define. */
export const NUM_TISSUES = 4;
export const ALL_TISSUES = (1 << NUM_TISSUES) - 1;

/** Environment field identifiers. */
export type FieldKey = 'sorb' | 'lith' | 'murk' | 'heat' | 'echoA' | 'echoB' | 'light';
export const FIELD_KEYS: FieldKey[] = ['sorb', 'lith', 'murk', 'heat', 'echoA', 'echoB', 'light'];

/** World geometry */
export const GRID_CELL = 10; // world units per grid cell

/** Cell geometry: radius = RADIUS_K * sqrt(mass). */
export const RADIUS_K = 3.1;
export const MAX_COMPONENTS = 28;
export const MAX_BONDS_PER_CELL = 6;

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
