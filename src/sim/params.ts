/**
 * World parameters. Every key here can be changed live from the UI and by
 * experiment schedule events.
 */
export type FeedPattern = 'uniform' | 'center' | 'rim' | 'patches' | 'gradient' | 'stripes' | 'none';
export type LightPattern = 'uniform' | 'top' | 'center' | 'spots' | 'half' | 'dark';
export type HeatPattern = 'uniform' | 'radial' | 'linear' | 'vents' | 'rim';

export interface SimParams {
  feedRate: number;
  lithFeedRate: number;
  feedPattern: FeedPattern;
  maxSorb: number;
  maxLith: number;
  lightIntensity: number;
  lightPattern: LightPattern;
  dayLength: number;
  baseHeat: number;
  heatPattern: HeatPattern;
  heatAmplitude: number;
  murkDecay: number;
  murkDrain: number;
  viscosity: number;
  mutationRate: number;
  mutationStrength: number;
  structuralMutations: boolean;
  circuitMutations: boolean;
  maxPopulation: number;
  brownian: number;
}

export const DEFAULT_PARAMS: SimParams = {
  feedRate: 0.0012,
  lithFeedRate: 0.0005,
  feedPattern: 'uniform',
  maxSorb: 8,
  maxLith: 4,
  lightIntensity: 0.8,
  lightPattern: 'uniform',
  dayLength: 0,
  baseHeat: 0.5,
  heatPattern: 'uniform',
  heatAmplitude: 0.3,
  murkDecay: 0.0003,
  murkDrain: 0.0008,
  viscosity: 1,
  mutationRate: 0.1,
  mutationStrength: 1,
  structuralMutations: true,
  circuitMutations: true,
  maxPopulation: 900,
  brownian: 0.04,
};

export interface ParamMeta {
  key: keyof SimParams;
  label: string;
  group: 'Nutrients' | 'Light' | 'Heat' | 'Waste' | 'Evolution' | 'Physics';
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  kind: 'number' | 'enum' | 'bool';
  hint?: string;
}

export const PARAM_META: ParamMeta[] = [
  { key: 'feedRate', label: 'Sorb feed', group: 'Nutrients', min: 0, max: 0.06, step: 0.001, kind: 'number', hint: 'Sorb added per grid cell per tick' },
  { key: 'lithFeedRate', label: 'Lith feed', group: 'Nutrients', min: 0, max: 0.03, step: 0.0005, kind: 'number' },
  { key: 'feedPattern', label: 'Feed pattern', group: 'Nutrients', kind: 'enum', options: ['uniform', 'center', 'rim', 'patches', 'gradient', 'stripes', 'none'] },
  { key: 'maxSorb', label: 'Sorb saturation', group: 'Nutrients', min: 1, max: 20, step: 0.5, kind: 'number' },
  { key: 'maxLith', label: 'Lith saturation', group: 'Nutrients', min: 0.5, max: 10, step: 0.5, kind: 'number' },
  { key: 'lightIntensity', label: 'Lumen intensity', group: 'Light', min: 0, max: 1.5, step: 0.05, kind: 'number' },
  { key: 'lightPattern', label: 'Light pattern', group: 'Light', kind: 'enum', options: ['uniform', 'top', 'center', 'spots', 'half', 'dark'] },
  { key: 'dayLength', label: 'Day cycle', group: 'Light', min: 0, max: 6000, step: 100, kind: 'number', hint: 'Ticks per day/night cycle (0 = constant)' },
  { key: 'baseHeat', label: 'Base heat', group: 'Heat', min: 0, max: 1, step: 0.01, kind: 'number', hint: 'Cells are comfortable near 0.5' },
  { key: 'heatPattern', label: 'Heat pattern', group: 'Heat', kind: 'enum', options: ['uniform', 'radial', 'linear', 'vents', 'rim'] },
  { key: 'heatAmplitude', label: 'Heat contrast', group: 'Heat', min: 0, max: 0.8, step: 0.01, kind: 'number' },
  { key: 'murkDecay', label: 'Murk decomposition', group: 'Waste', min: 0, max: 0.01, step: 0.0001, kind: 'number', hint: 'Fraction of murk turning back into sorb per tick' },
  { key: 'murkDrain', label: 'Murk drain', group: 'Waste', min: 0, max: 0.01, step: 0.0001, kind: 'number', hint: 'Fraction of murk washed out of the dish per tick' },
  { key: 'mutationRate', label: 'Mutation rate', group: 'Evolution', min: 0, max: 1, step: 0.01, kind: 'number', hint: 'Chance a division mutates (scaled by Codex fidelity)' },
  { key: 'mutationStrength', label: 'Mutation strength', group: 'Evolution', min: 0.1, max: 3, step: 0.1, kind: 'number' },
  { key: 'structuralMutations', label: 'Structural mutations', group: 'Evolution', kind: 'bool', hint: 'Allow adding/removing components' },
  { key: 'circuitMutations', label: 'Circuit mutations', group: 'Evolution', kind: 'bool' },
  { key: 'maxPopulation', label: 'Population cap', group: 'Evolution', min: 20, max: 1500, step: 10, kind: 'number' },
  { key: 'viscosity', label: 'Viscosity', group: 'Physics', min: 0.3, max: 4, step: 0.1, kind: 'number' },
  { key: 'brownian', label: 'Brownian jitter', group: 'Physics', min: 0, max: 0.3, step: 0.01, kind: 'number' },
];
