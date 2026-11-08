/**
 * Component catalogue. Every component listed here has a concrete simulated
 * behaviour implemented in metabolism.ts / physics.ts / multicell.ts.
 * All names and chemistry are fictional.
 */

export type ComponentType =
  | 'core'
  | 'assembler'
  | 'combustor'
  | 'photovore'
  | 'reclaimer'
  | 'capacitor'
  | 'vesicle'
  | 'depot'
  | 'vacuole'
  | 'pore'
  | 'efflux'
  | 'junction'
  | 'chemoreceptor'
  | 'photoreceptor'
  | 'thermoreceptor'
  | 'murksensor'
  | 'echoreceptor'
  | 'proximity'
  | 'homeostat'
  | 'emitter'
  | 'gaprelay'
  | 'oscillator'
  | 'strut'
  | 'adhesion'
  | 'armor'
  | 'flagellum'
  | 'cilia'
  | 'mender'
  | 'thermoshield'
  | 'spike';

export type Category =
  | 'core'
  | 'energy'
  | 'storage'
  | 'transport'
  | 'sensor'
  | 'signal'
  | 'structure'
  | 'movement'
  | 'defense';

export const CATEGORY_LABEL: Record<Category, string> = {
  core: 'Core',
  energy: 'Energy',
  storage: 'Storage',
  transport: 'Transport',
  sensor: 'Sensors',
  signal: 'Signalling',
  structure: 'Structure',
  movement: 'Movement',
  defense: 'Defense & Upkeep',
};

export const CATEGORY_COLOR: Record<Category, string> = {
  core: '#b388ff',
  energy: '#ff9e45',
  storage: '#6fb8ff',
  transport: '#3ef0c6',
  sensor: '#f5f17a',
  signal: '#ff6fd8',
  structure: '#c9d4e0',
  movement: '#7dffa0',
  defense: '#ff6b6b',
};

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  /** Enumerated options; value is an index into this list. */
  options?: string[];
  hint?: string;
}

export interface PortDef {
  key: string;
  label: string;
}

export interface ComponentDef {
  type: ComponentType;
  name: string;
  glyph: string;
  category: Category;
  blurb: string;
  placement: 'membrane' | 'interior';
  /** Biomass needed to build it (raises build mass and division threshold). */
  massCost: (p: Record<string, number>) => number;
  /** Baseline charge per tick when expressed (scaled by activation for actuated parts). */
  upkeep: (p: Record<string, number>) => number;
  /** Local buffer capacity [sorb, lith, charge, murk]. */
  buffer: (p: Record<string, number>) => [number, number, number, number];
  params: ParamDef[];
  outputs: PortDef[];
  /** Has an activation input the circuit can drive (default 1). */
  actuated: boolean;
  unique?: boolean;
  color: string;
}

const P = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  def: number,
  hint?: string,
  options?: string[],
): ParamDef => ({ key, label, min, max, step, default: def, hint, options });

const small = (): [number, number, number, number] => [0.6, 0.3, 1.2, 0.6];

export const COMPONENT_DEFS: Record<ComponentType, ComponentDef> = {
  core: {
    type: 'core',
    name: 'Codex Core',
    glyph: 'CX',
    category: 'core',
    blurb: 'Holds the blueprint. Required for division; sets division size, fidelity and lifespan.',
    placement: 'interior',
    massCost: () => 2.2,
    upkeep: () => 0.012,
    buffer: small,
    params: [
      P('divideAt', 'Divide at', 2.05, 4, 0.05, 2.4, 'Division mass as a multiple of build mass'),
      P('autoDivide', 'Auto divide', 0, 1, 1, 1, 'Divide automatically when large enough', ['Off', 'On']),
      P('fidelity', 'Fidelity', 0, 1, 0.05, 0.5, 'Higher fidelity copies the blueprint with fewer mutations'),
      P('lifespan', 'Lifespan', 800, 15000, 100, 3000, 'Ticks before senescence begins'),
    ],
    outputs: [],
    actuated: false,
    unique: true,
    color: '#b388ff',
  },
  assembler: {
    type: 'assembler',
    name: 'Assembler',
    glyph: 'AS',
    category: 'core',
    blurb: 'Builds biomass from sorb + lith using charge. The only way a cell grows.',
    placement: 'interior',
    massCost: (p) => 0.6 + p.rate * 6,
    upkeep: (p) => 0.004 + p.rate * 0.04,
    buffer: () => [1.2, 0.8, 1.6, 0.4],
    params: [P('rate', 'Build rate', 0.02, 0.14, 0.01, 0.06, 'Biomass per tick at full power')],
    outputs: [],
    actuated: true,
    color: '#a6ffcb',
  },
  combustor: {
    type: 'combustor',
    name: 'Combustor',
    glyph: 'CB',
    category: 'energy',
    blurb: 'Burns sorb into charge, releasing murk waste (1 sorb → 3 charge + 1 murk).',
    placement: 'interior',
    massCost: (p) => 0.5 + p.rate * 6,
    upkeep: (p) => 0.003 + p.rate * 0.03,
    buffer: () => [1.2, 0.2, 2.4, 1.2],
    params: [P('rate', 'Burn rate', 0.02, 0.24, 0.01, 0.1, 'Sorb burned per tick at full power')],
    outputs: [],
    actuated: true,
    color: '#ff9e45',
  },
  photovore: {
    type: 'photovore',
    name: 'Photovore Plate',
    glyph: 'PV',
    category: 'energy',
    blurb: 'Harvests lumen light into charge with no waste. Loses efficiency when hot.',
    placement: 'interior',
    massCost: (p) => 0.6 + p.area * 1.1,
    upkeep: (p) => 0.006 + p.area * 0.006,
    buffer: () => [0.2, 0.2, 2.4, 0.2],
    params: [P('area', 'Plate area', 0.4, 2.5, 0.1, 1, 'Light-collecting area')],
    outputs: [],
    actuated: true,
    color: '#7dff6a',
  },
  reclaimer: {
    type: 'reclaimer',
    name: 'Murk Reclaimer',
    glyph: 'RC',
    category: 'energy',
    blurb: 'Spends 3.5 charge per unit to refine murk back into sorb: detox and building matter.',
    placement: 'interior',
    massCost: (p) => 0.6 + p.rate * 6,
    upkeep: () => 0.005,
    buffer: () => [1, 0.2, 1.6, 1.4],
    params: [P('rate', 'Refine rate', 0.01, 0.12, 0.01, 0.05, 'Murk refined per tick')],
    outputs: [],
    actuated: true,
    color: '#e18cff',
  },
  capacitor: {
    type: 'capacitor',
    name: 'Charge Capacitor',
    glyph: 'CP',
    category: 'storage',
    blurb: 'Large charge reservoir that buffers bursts of activity. Leaks slowly.',
    placement: 'interior',
    massCost: (p) => 0.3 + p.size * 0.5,
    upkeep: () => 0.001,
    buffer: (p) => [0.1, 0.1, 6 * p.size, 0.1],
    params: [P('size', 'Size', 0.5, 3, 0.1, 1, 'Storage volume')],
    outputs: [],
    actuated: false,
    color: '#6fb8ff',
  },
  vesicle: {
    type: 'vesicle',
    name: 'Sorb Vesicle',
    glyph: 'SV',
    category: 'storage',
    blurb: 'Stores sorb for lean times.',
    placement: 'interior',
    massCost: (p) => 0.3 + p.size * 0.5,
    upkeep: () => 0.001,
    buffer: (p) => [6 * p.size, 0.1, 0.4, 0.1],
    params: [P('size', 'Size', 0.5, 3, 0.1, 1, 'Storage volume')],
    outputs: [],
    actuated: false,
    color: '#3ef0c6',
  },
  depot: {
    type: 'depot',
    name: 'Lith Depot',
    glyph: 'LD',
    category: 'storage',
    blurb: 'Stores lith, the scarce mineral needed for growth.',
    placement: 'interior',
    massCost: (p) => 0.3 + p.size * 0.5,
    upkeep: () => 0.001,
    buffer: (p) => [0.1, 4 * p.size, 0.4, 0.1],
    params: [P('size', 'Size', 0.5, 3, 0.1, 1, 'Storage volume')],
    outputs: [],
    actuated: false,
    color: '#ffc65c',
  },
  vacuole: {
    type: 'vacuole',
    name: 'Murk Vacuole',
    glyph: 'MV',
    category: 'storage',
    blurb: 'Sequesters murk, diluting internal toxicity.',
    placement: 'interior',
    massCost: (p) => 0.3 + p.size * 0.5,
    upkeep: () => 0.001,
    buffer: (p) => [0.1, 0.1, 0.4, 6 * p.size],
    params: [P('size', 'Size', 0.5, 3, 0.1, 1, 'Storage volume')],
    outputs: [],
    actuated: false,
    color: '#d05cff',
  },
  pore: {
    type: 'pore',
    name: 'Intake Pore',
    glyph: 'IP',
    category: 'transport',
    blurb: 'Actively absorbs sorb and/or lith from the dish at its location. Costs charge per unit.',
    placement: 'membrane',
    massCost: (p) => 0.3 + p.rate * 10,
    upkeep: () => 0.002,
    buffer: () => [1.2, 0.8, 0.8, 0.3],
    params: [
      P('rate', 'Uptake rate', 0.005, 0.06, 0.005, 0.025, 'Fraction of local dish content absorbed per tick'),
      P('select', 'Selectivity', 0, 2, 1, 0, 'Which matter to absorb', ['Sorb + Lith', 'Sorb only', 'Lith only']),
    ],
    outputs: [],
    actuated: true,
    color: '#3ef0c6',
  },
  efflux: {
    type: 'efflux',
    name: 'Efflux Pump',
    glyph: 'EP',
    category: 'transport',
    blurb: 'Pumps murk out of the cell into the dish. Costs charge per unit.',
    placement: 'membrane',
    massCost: (p) => 0.3 + p.rate * 2,
    upkeep: () => 0.002,
    buffer: () => [0.2, 0.2, 0.8, 1.4],
    params: [P('rate', 'Pump rate', 0.02, 0.3, 0.01, 0.1, 'Murk expelled per tick')],
    outputs: [],
    actuated: true,
    color: '#d05cff',
  },
  junction: {
    type: 'junction',
    name: 'Junction Channel',
    glyph: 'JN',
    category: 'transport',
    blurb: 'Opens cytosol channels to bonded neighbours so cells share resources.',
    placement: 'membrane',
    massCost: () => 0.4,
    upkeep: () => 0.002,
    buffer: small,
    params: [P('conductance', 'Conductance', 0.05, 0.5, 0.05, 0.25, 'Exchange rate with bonded cells')],
    outputs: [],
    actuated: true,
    color: '#42ffe6',
  },
  chemoreceptor: {
    type: 'chemoreceptor',
    name: 'Chemoreceptor',
    glyph: 'CR',
    category: 'sensor',
    blurb: 'Senses dish sorb or lith at its position; also reports whether it is rising.',
    placement: 'membrane',
    massCost: () => 0.2,
    upkeep: () => 0.001,
    buffer: small,
    params: [
      P('target', 'Target', 0, 1, 1, 0, 'Which matter to sense', ['Sorb', 'Lith']),
      P('halfSat', 'Sensitivity', 0.2, 8, 0.1, 2, 'Concentration that reads 0.5'),
    ],
    outputs: [
      { key: 'level', label: 'Level' },
      { key: 'rise', label: 'Rising' },
    ],
    actuated: false,
    color: '#f5f17a',
  },
  photoreceptor: {
    type: 'photoreceptor',
    name: 'Photoreceptor',
    glyph: 'PR',
    category: 'sensor',
    blurb: 'Senses lumen intensity at its position.',
    placement: 'membrane',
    massCost: () => 0.2,
    upkeep: () => 0.001,
    buffer: small,
    params: [P('gain', 'Gain', 0.5, 4, 0.1, 1.5)],
    outputs: [{ key: 'level', label: 'Light' }],
    actuated: false,
    color: '#fff59a',
  },
  thermoreceptor: {
    type: 'thermoreceptor',
    name: 'Thermoreceptor',
    glyph: 'TR',
    category: 'sensor',
    blurb: 'Senses local heat and how far it is outside the cell tolerance band.',
    placement: 'membrane',
    massCost: () => 0.2,
    upkeep: () => 0.001,
    buffer: small,
    params: [],
    outputs: [
      { key: 'heat', label: 'Heat' },
      { key: 'stress', label: 'Stress' },
    ],
    actuated: false,
    color: '#ffb36b',
  },
  murksensor: {
    type: 'murksensor',
    name: 'Murk Sensor',
    glyph: 'MS',
    category: 'sensor',
    blurb: 'Senses murk outside (at its position) and inside the cell.',
    placement: 'membrane',
    massCost: () => 0.2,
    upkeep: () => 0.001,
    buffer: small,
    params: [P('halfSat', 'Sensitivity', 0.2, 8, 0.1, 2)],
    outputs: [
      { key: 'outside', label: 'Outside' },
      { key: 'inside', label: 'Inside' },
    ],
    actuated: false,
    color: '#e6a0ff',
  },
  echoreceptor: {
    type: 'echoreceptor',
    name: 'Echo Receptor',
    glyph: 'ER',
    category: 'sensor',
    blurb: 'Hears diffusing echo signals (channel A or B) in the dish.',
    placement: 'membrane',
    massCost: () => 0.2,
    upkeep: () => 0.001,
    buffer: small,
    params: [
      P('channel', 'Channel', 0, 1, 1, 0, undefined, ['Echo A', 'Echo B']),
      P('halfSat', 'Sensitivity', 0.05, 4, 0.05, 0.5),
    ],
    outputs: [{ key: 'level', label: 'Level' }],
    actuated: false,
    color: '#ff9cf0',
  },
  proximity: {
    type: 'proximity',
    name: 'Proximity Sensor',
    glyph: 'PX',
    category: 'sensor',
    blurb: 'Detects nearby cells in its sector, split into kin and foreign.',
    placement: 'membrane',
    massCost: () => 0.35,
    upkeep: () => 0.002,
    buffer: small,
    params: [P('range', 'Range', 1, 8, 0.5, 4, 'In cell radii')],
    outputs: [
      { key: 'any', label: 'Any' },
      { key: 'kin', label: 'Kin' },
      { key: 'foreign', label: 'Foreign' },
    ],
    actuated: false,
    color: '#fff176',
  },
  homeostat: {
    type: 'homeostat',
    name: 'Homeostat',
    glyph: 'HS',
    category: 'sensor',
    blurb: 'Reports internal state: charge, sorb, lith, murk, integrity and size.',
    placement: 'interior',
    massCost: () => 0.3,
    upkeep: () => 0.002,
    buffer: small,
    params: [],
    outputs: [
      { key: 'charge', label: 'Charge' },
      { key: 'sorb', label: 'Sorb' },
      { key: 'lith', label: 'Lith' },
      { key: 'murk', label: 'Murk' },
      { key: 'integrity', label: 'Integrity' },
      { key: 'size', label: 'Size' },
    ],
    actuated: false,
    color: '#e8ff8a',
  },
  emitter: {
    type: 'emitter',
    name: 'Echo Emitter',
    glyph: 'EE',
    category: 'signal',
    blurb: 'Releases echo signal into the dish. Others can hear it (and so can predators).',
    placement: 'membrane',
    massCost: () => 0.3,
    upkeep: () => 0.002,
    buffer: small,
    params: [
      P('channel', 'Channel', 0, 1, 1, 0, undefined, ['Echo A', 'Echo B']),
      P('rate', 'Strength', 0.05, 1, 0.05, 0.3),
    ],
    outputs: [],
    actuated: true,
    color: '#ff6fd8',
  },
  gaprelay: {
    type: 'gaprelay',
    name: 'Gap Relay',
    glyph: 'GR',
    category: 'signal',
    blurb: 'Lets internal signal channels flow to bonded neighbours (intercellular messaging).',
    placement: 'membrane',
    massCost: () => 0.3,
    upkeep: () => 0.002,
    buffer: small,
    params: [P('conductance', 'Conductance', 0.05, 0.9, 0.05, 0.5)],
    outputs: [],
    actuated: true,
    color: '#ff8ae0',
  },
  oscillator: {
    type: 'oscillator',
    name: 'Oscillator',
    glyph: 'OS',
    category: 'signal',
    blurb: 'Internal clock producing a wave and a square pulse. Slows when starved.',
    placement: 'interior',
    massCost: () => 0.25,
    upkeep: () => 0.002,
    buffer: small,
    params: [
      P('period', 'Period', 10, 600, 5, 120, 'Ticks per cycle'),
      P('duty', 'Duty', 0.05, 0.95, 0.05, 0.5, 'Fraction of the cycle the square output is high'),
      P('phase', 'Phase', 0, 1, 0.05, 0),
    ],
    outputs: [
      { key: 'wave', label: 'Wave' },
      { key: 'square', label: 'Square' },
    ],
    actuated: true,
    color: '#ff9bf5',
  },
  strut: {
    type: 'strut',
    name: 'Strut Frame',
    glyph: 'SF',
    category: 'structure',
    blurb: 'Cytoskeletal frame: more integrity, stronger and stiffer bonds, more drag.',
    placement: 'interior',
    massCost: () => 1.0,
    upkeep: () => 0.003,
    buffer: small,
    params: [],
    outputs: [],
    actuated: false,
    color: '#c9d4e0',
  },
  adhesion: {
    type: 'adhesion',
    name: 'Adhesion Knob',
    glyph: 'AK',
    category: 'structure',
    blurb: 'Bond sites. Each knob allows two bonds and adds bond strength.',
    placement: 'membrane',
    massCost: () => 0.4,
    upkeep: () => 0.002,
    buffer: small,
    params: [],
    outputs: [],
    actuated: false,
    color: '#dfe7ef',
  },
  armor: {
    type: 'armor',
    name: 'Armor Plate',
    glyph: 'AR',
    category: 'structure',
    blurb: 'Hard plate: blocks spikes from its side and adds integrity. Heavy.',
    placement: 'membrane',
    massCost: () => 0.9,
    upkeep: () => 0.002,
    buffer: small,
    params: [],
    outputs: [],
    actuated: false,
    color: '#8ea0b5',
  },
  flagellum: {
    type: 'flagellum',
    name: 'Flagellum',
    glyph: 'FL',
    category: 'movement',
    blurb: 'Whip tail that pushes the cell away from its side. Charge cost grows with power.',
    placement: 'membrane',
    massCost: (p) => 0.3 + p.power * 0.4,
    upkeep: (p) => 0.003 + p.power * 0.016,
    buffer: () => [0.2, 0.2, 1.6, 0.2],
    params: [P('power', 'Power', 0.2, 2.5, 0.1, 1)],
    outputs: [],
    actuated: true,
    color: '#7dffa0',
  },
  cilia: {
    type: 'cilia',
    name: 'Cilia Band',
    glyph: 'CI',
    category: 'movement',
    blurb: 'Beating hairs that rotate the cell and nudge it sideways.',
    placement: 'membrane',
    massCost: () => 0.4,
    upkeep: (p) => 0.002 + p.power * 0.008,
    buffer: () => [0.2, 0.2, 1.2, 0.2],
    params: [
      P('power', 'Power', 0.2, 2, 0.1, 1),
      P('dir', 'Direction', 0, 1, 1, 0, undefined, ['Clockwise', 'Counter-clockwise']),
    ],
    outputs: [],
    actuated: true,
    color: '#b6ffc7',
  },
  mender: {
    type: 'mender',
    name: 'Mender',
    glyph: 'MD',
    category: 'defense',
    blurb: 'Repairs integrity using charge (2 charge per integrity point).',
    placement: 'interior',
    massCost: () => 0.5,
    upkeep: () => 0.002,
    buffer: () => [0.2, 0.2, 1.6, 0.2],
    params: [P('rate', 'Repair rate', 0.01, 0.12, 0.01, 0.04)],
    outputs: [],
    actuated: true,
    color: '#ff8f8f',
  },
  thermoshield: {
    type: 'thermoshield',
    name: 'Thermo Shield',
    glyph: 'TS',
    category: 'defense',
    blurb: 'Chaperone matrix that widens the heat tolerance band. Constant upkeep.',
    placement: 'interior',
    massCost: () => 0.6,
    upkeep: () => 0.008,
    buffer: small,
    params: [],
    outputs: [],
    actuated: false,
    color: '#ffb36b',
  },
  spike: {
    type: 'spike',
    name: 'Lysin Spike',
    glyph: 'LS',
    category: 'defense',
    blurb: 'Damages touching foreign cells in its sector and siphons their contents.',
    placement: 'membrane',
    massCost: (p) => 0.5 + p.power * 0.5,
    upkeep: (p) => 0.003 + p.power * 0.01,
    buffer: () => [1.4, 0.8, 1.6, 0.6],
    params: [
      P('power', 'Power', 0.2, 2, 0.1, 1),
      P('spare', 'Spare', 0, 1, 1, 1, 'Never attack own strain', ['Attack all foreign', 'Spare same strain']),
    ],
    outputs: [],
    actuated: true,
    color: '#ff5470',
  },
};

export const COMPONENT_TYPES = Object.keys(COMPONENT_DEFS) as ComponentType[];

/** Numeric type ids for fast switching in hot loops. */
export const TYPE_ID: Record<ComponentType, number> = Object.fromEntries(
  COMPONENT_TYPES.map((t, i) => [t, i]),
) as Record<ComponentType, number>;

export const T = TYPE_ID;

export function defaultParams(type: ComponentType): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of COMPONENT_DEFS[type].params) out[p.key] = p.default;
  return out;
}

export function componentsByCategory(): Record<Category, ComponentDef[]> {
  const out = {} as Record<Category, ComponentDef[]>;
  for (const t of COMPONENT_TYPES) {
    const d = COMPONENT_DEFS[t];
    (out[d.category] ||= []).push(d);
  }
  return out;
}
