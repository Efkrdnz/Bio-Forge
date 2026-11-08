/**
 * Adhesion bonds between cells. A bond is a distance constraint plus an
 * angular "shape memory" (each end remembers where on its membrane the
 * partner is attached), which lets organisms hold their form.
 */
import type { Cell } from './cell';

export interface Bond {
  id: number;
  a: Cell;
  b: Cell;
  /** Attachment angle in a's frame and in b's frame. */
  angA: number;
  angB: number;
  strength: number;
  stiffness: number;
  /** Current relative stretch (|d − rest| / rest). */
  stretch: number;
  /** Resource exchange EMA a→b per resource [sorb, lith, charge, murk]. */
  flow: Float32Array;
  /** Signal exchange EMA a→b (sum over channels). */
  signal: number;
  broken: boolean;
  /** Visual pulse phase. */
  pulse: number;
}

export function bondPartner(b: Bond, c: Cell): Cell {
  return b.a === c ? b.b : b.a;
}

export function restLength(b: Bond): number {
  return (b.a.radius + b.b.radius) * 0.92;
}
