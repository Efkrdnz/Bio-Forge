/**
 * Accounting ledger. Matter (sorb, lith, murk, biomass) is conserved inside the
 * dish; every external source or sink is recorded here so totals can be audited.
 * Energy (charge) is not conserved but its sources and sinks are recorded too.
 */
export interface Ledger {
  matterIn: number;
  matterOut: number;
  energyIn: number;
  energyOut: number;
  /** Per-category detail, cumulative. */
  detail: Record<string, number>;
}

export function makeLedger(): Ledger {
  return { matterIn: 0, matterOut: 0, energyIn: 0, energyOut: 0, detail: {} };
}

export function note(l: Ledger, key: string, v: number): void {
  l.detail[key] = (l.detail[key] ?? 0) + v;
}
