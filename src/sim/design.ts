/**
 * Cell designs (blueprints) and compilation into flat, fast runtime data.
 */
import { ALL_TISSUES, MAX_BONDS_PER_CELL, MAX_COMPONENTS, NUM_RES, NUM_TISSUES } from './constants';
import { COMPONENT_DEFS, defaultParams, TYPE_ID, type ComponentType } from './components';
import { MEMBRANE_DEFS, membraneStats, type MembraneType } from './membranes';
import { compileCircuit, type CircuitDef, type CompiledCircuit } from './circuit';

export interface DesignComponent {
  uid: number;
  type: ComponentType;
  /** Angle in the cell frame (radians, 0 = heading / front). */
  angle: number;
  /** Distance from centre as a fraction of radius (membrane parts sit at 1). */
  dist: number;
  params: Record<string, number>;
  /** Bitmask of tissues in which the component is expressed. */
  tissues: number;
}

export interface Conduit {
  a: number;
  b: number;
}

export type DaughterTissueRule = 'inherit' | 'alternate' | 'cycle' | 'random' | 'toB';

export const TISSUE_RULE_LABEL: Record<DaughterTissueRule, string> = {
  inherit: 'Same as parent',
  alternate: 'Alternate A ↔ B',
  cycle: 'Cycle A→B→C→D',
  random: 'Random',
  toB: 'Daughters become B',
};

export interface Development {
  /** Whether daughters stay bonded to the parent. */
  mode: 'separate' | 'bonded';
  /** Maximum cells per organism before daughters bud off as a new organism. */
  maxCells: number;
  /** Division axis relative to heading (degrees). */
  divisionAngle: number;
  /** Added to the axis for each successive division by the same parent (degrees). */
  rotateEach: number;
  daughterTissue: DaughterTissueRule;
  /** Tissue the founding cell starts in. */
  startTissue: number;
  tissueNames: string[];
}

export interface CellDesign {
  id: string;
  name: string;
  hue: number;
  notes?: string;
  membrane: { type: MembraneType; thickness: number };
  components: DesignComponent[];
  conduits: Conduit[];
  circuit: CircuitDef;
  development: Development;
}

export function defaultDevelopment(): Development {
  return {
    mode: 'separate',
    maxCells: 1,
    divisionAngle: 90,
    rotateEach: 0,
    daughterTissue: 'inherit',
    startTissue: 0,
    tissueNames: ['Alpha', 'Beta', 'Gamma', 'Delta'],
  };
}

export function cloneDesign(d: CellDesign): CellDesign {
  return JSON.parse(JSON.stringify(d)) as CellDesign;
}

export function nextUid(d: CellDesign): number {
  let m = 0;
  for (const c of d.components) m = Math.max(m, c.uid);
  return m + 1;
}

export function nextNodeId(d: CellDesign): number {
  let m = 0;
  for (const n of d.circuit.nodes) m = Math.max(m, n.id);
  return m + 1;
}

export function makeComponent(
  d: CellDesign,
  type: ComponentType,
  angleDeg: number,
  dist?: number,
  params?: Record<string, number>,
  tissues = ALL_TISSUES,
): DesignComponent {
  const def = COMPONENT_DEFS[type];
  const c: DesignComponent = {
    uid: nextUid(d),
    type,
    angle: (angleDeg * Math.PI) / 180,
    dist: def.placement === 'membrane' ? 1 : (dist ?? 0.4),
    params: { ...defaultParams(type), ...(params ?? {}) },
    tissues,
  };
  d.components.push(c);
  return c;
}

/** Fill in missing params with defaults and clamp to ranges (robust loading). */
export function normalizeDesign(d: CellDesign): CellDesign {
  d.membrane ||= { type: 'veil', thickness: 1 };
  if (!MEMBRANE_DEFS[d.membrane.type]) d.membrane.type = 'veil';
  d.membrane.thickness = Math.max(0.5, Math.min(2, d.membrane.thickness || 1));
  d.components = (d.components || []).filter((c) => COMPONENT_DEFS[c.type]);
  for (const c of d.components) {
    const def = COMPONENT_DEFS[c.type];
    const p: Record<string, number> = {};
    for (const pd of def.params) {
      const v = c.params?.[pd.key];
      p[pd.key] = typeof v === 'number' && isFinite(v) ? Math.max(pd.min, Math.min(pd.max, v)) : pd.default;
    }
    c.params = p;
    if (def.placement === 'membrane') c.dist = 1;
    else c.dist = Math.max(0, Math.min(0.8, c.dist));
    if (typeof c.tissues !== 'number' || (c.tissues & ALL_TISSUES) === 0) c.tissues = ALL_TISSUES;
  }
  const uids = new Set(d.components.map((c) => c.uid));
  d.conduits = (d.conduits || []).filter((k) => uids.has(k.a) && uids.has(k.b) && k.a !== k.b);
  d.circuit ||= { nodes: [], wires: [] };
  d.circuit.nodes ||= [];
  d.circuit.wires ||= [];
  const dev = { ...defaultDevelopment(), ...(d.development || {}) };
  dev.maxCells = Math.max(1, Math.min(64, Math.round(dev.maxCells)));
  dev.startTissue = Math.max(0, Math.min(NUM_TISSUES - 1, dev.startTissue | 0));
  while (dev.tissueNames.length < NUM_TISSUES) dev.tissueNames.push(`T${dev.tissueNames.length}`);
  d.development = dev;
  if (typeof d.hue !== 'number') d.hue = 180;
  return d;
}

export interface DesignIssue {
  level: 'error' | 'warn' | 'info';
  text: string;
}

export function validateDesign(d: CellDesign): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const count = (t: ComponentType) => d.components.filter((c) => c.type === t).length;
  if (count('core') === 0) issues.push({ level: 'error', text: 'No Codex Core: the cell can never divide.' });
  if (count('core') > 1) issues.push({ level: 'error', text: 'Only one Codex Core is allowed.' });
  if (d.components.length > MAX_COMPONENTS)
    issues.push({ level: 'error', text: `Too many components (max ${MAX_COMPONENTS}).` });
  if (count('combustor') + count('photovore') === 0)
    issues.push({ level: 'warn', text: 'No energy organelle (Combustor or Photovore): charge will run out.' });
  if (count('assembler') === 0) issues.push({ level: 'warn', text: 'No Assembler: the cell cannot grow.' });
  if (count('combustor') > 0 && count('efflux') + count('vacuole') + count('reclaimer') === 0 && d.membrane.type !== 'veil')
    issues.push({ level: 'warn', text: 'Combustion makes murk but nothing removes it (add an Efflux Pump).' });
  if (count('pore') === 0 && d.membrane.type === 'shell')
    issues.push({ level: 'warn', text: 'A Keratex Shell barely leaks: add Intake Pores to feed.' });
  if (d.development.mode === 'bonded' && count('adhesion') === 0)
    issues.push({ level: 'warn', text: 'Bonded development needs Adhesion Knobs to form bonds.' });
  if (d.development.mode === 'bonded' && count('junction') === 0 && d.development.maxCells > 1)
    issues.push({ level: 'info', text: 'Without Junctions, bonded cells cannot share resources.' });
  const uids = new Set(d.components.map((c) => c.uid));
  for (const n of d.circuit.nodes) {
    if ((n.kind === 'sensor' || n.kind === 'actuator') && (n.ref === undefined || !uids.has(n.ref)))
      issues.push({ level: 'warn', text: `Circuit node #${n.id} points at a missing component.` });
  }
  return issues;
}

export interface CompiledDesign {
  design: CellDesign;
  n: number;
  types: Int8Array;
  uids: Int32Array;
  ang: Float32Array;
  cos: Float32Array;
  sin: Float32Array;
  dist: Float32Array;
  /** Up to 4 params per component, in catalogue order. */
  params: Float32Array;
  tissues: Uint8Array;
  /** Buffer caps for nodes 1..n (node 0 = cytosol is mass-scaled). */
  caps: Float32Array;
  upkeep: Float32Array;
  actuated: Uint8Array;
  /** Output port offsets into the per-cell sensor array. */
  outOffset: Int32Array;
  numOutputs: number;
  edgeA: Int16Array;
  edgeB: Int16Array;
  edgeG: Float32Array;
  /** Edge flag: 1 for user conduits. */
  edgeConduit: Uint8Array;
  numEdges: number;
  uidToIndex: Map<number, number>;
  circuit: CompiledCircuit;
  buildMass: number;
  divideMass: number;
  minMass: number;
  maxMass: number;
  coreIndex: number;
  membrane: ReturnType<typeof membraneStats> & { type: MembraneType };
  baseIntegrity: number;
  bondSlots: number;
  bondStrength: number;
  stiffness: number;
  /** Reference upkeep (all parts expressed in tissue 0). */
  totalUpkeep: number;
  autoDivide: boolean;
  fidelity: number;
  lifespan: number;
  /** Indices of components by type id (for quick iteration). */
  byType: number[][];
}

export const MAX_PARAMS = 4;

/** Base cytosol capacity per 10 mass [sorb, lith, charge, murk]. */
export const CYTO_CAP_BASE: [number, number, number, number] = [6, 3, 8, 5];

export function compileDesign(design: CellDesign): CompiledDesign {
  const d = normalizeDesign(design);
  const comps = d.components.slice(0, MAX_COMPONENTS);
  const n = comps.length;
  const types = new Int8Array(n);
  const uids = new Int32Array(n);
  const ang = new Float32Array(n);
  const cos = new Float32Array(n);
  const sin = new Float32Array(n);
  const dist = new Float32Array(n);
  const params = new Float32Array(n * MAX_PARAMS);
  const tissues = new Uint8Array(n);
  const caps = new Float32Array(n * NUM_RES);
  const upkeep = new Float32Array(n);
  const actuated = new Uint8Array(n);
  const outOffset = new Int32Array(n);
  const uidToIndex = new Map<number, number>();
  const byType: number[][] = Array.from({ length: Object.keys(TYPE_ID).length }, () => []);

  const mstats = membraneStats(d.membrane.type, d.membrane.thickness);
  let buildMass = mstats.massCost + 1.5; // 1.5 = baseline cytoplasm
  let numOutputs = 0;
  let coreIndex = -1;
  let struts = 0;
  let knobs = 0;
  let armor = 0;
  let shields = 0;
  let totalUpkeep = mstats.upkeep;
  let autoDivide = true;
  let fidelity = 0;
  let lifespan = 3000;
  let divideAt = 2.4;

  comps.forEach((c, i) => {
    const def = COMPONENT_DEFS[c.type];
    types[i] = TYPE_ID[c.type];
    uids[i] = c.uid;
    uidToIndex.set(c.uid, i);
    ang[i] = c.angle;
    cos[i] = Math.cos(c.angle);
    sin[i] = Math.sin(c.angle);
    dist[i] = c.dist;
    def.params.forEach((pd, j) => {
      if (j < MAX_PARAMS) params[i * MAX_PARAMS + j] = c.params[pd.key] ?? pd.default;
    });
    tissues[i] = c.tissues & ALL_TISSUES;
    const buf = def.buffer(c.params);
    for (let r = 0; r < NUM_RES; r++) caps[i * NUM_RES + r] = buf[r];
    upkeep[i] = def.upkeep(c.params);
    actuated[i] = def.actuated ? 1 : 0;
    outOffset[i] = numOutputs;
    numOutputs += def.outputs.length;
    buildMass += def.massCost(c.params);
    byType[types[i]].push(i);
    if (tissues[i] & 1) totalUpkeep += upkeep[i];
    if (c.type === 'core' && coreIndex < 0) {
      coreIndex = i;
      divideAt = c.params.divideAt;
      autoDivide = c.params.autoDivide > 0.5;
      fidelity = c.params.fidelity;
      lifespan = c.params.lifespan;
    }
    if (c.type === 'strut') struts++;
    if (c.type === 'adhesion') knobs++;
    if (c.type === 'armor') armor++;
    if (c.type === 'thermoshield') shields++;
  });

  // Edges: implicit cytosol links + conduits. Node 0 = cytosol, node i+1 = component i.
  const ea: number[] = [];
  const eb: number[] = [];
  const eg: number[] = [];
  const ec: number[] = [];
  for (let i = 0; i < n; i++) {
    ea.push(0);
    eb.push(i + 1);
    eg.push(0.1 + 0.26 * (1 - Math.min(1, dist[i])));
    ec.push(0);
  }
  const seen = new Set<string>();
  for (const k of d.conduits) {
    const a = uidToIndex.get(k.a);
    const b = uidToIndex.get(k.b);
    if (a === undefined || b === undefined || a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ea.push(a + 1);
    eb.push(b + 1);
    eg.push(0.5);
    ec.push(1);
    // Conduits are tubes: they cost a little mass and upkeep proportional to length.
    const len = Math.hypot(
      dist[a] * cos[a] - dist[b] * cos[b],
      dist[a] * sin[a] - dist[b] * sin[b],
    );
    buildMass += 0.08 + 0.12 * len;
    totalUpkeep += 0.0006 + 0.0008 * len;
  }

  const circuit = compileCircuit(
    d.circuit,
    uidToIndex,
    (ci, port) => {
      const outs = COMPONENT_DEFS[comps[ci].type].outputs;
      const idx = outs.findIndex((o) => o.key === port);
      return idx;
    },
    n,
  );

  const shieldBonus = shields > 0 ? 0.12 * (1 - Math.pow(0.6, shields)) / 0.4 : 0;
  const membrane = { ...mstats, type: d.membrane.type, heatTolerance: mstats.heatTolerance + shieldBonus };

  const divideMass = Math.max(divideAt, 2.05) * buildMass;
  return {
    design: d,
    n,
    types,
    uids,
    ang,
    cos,
    sin,
    dist,
    params,
    tissues,
    caps,
    upkeep,
    actuated,
    outOffset,
    numOutputs,
    edgeA: Int16Array.from(ea),
    edgeB: Int16Array.from(eb),
    edgeG: Float32Array.from(eg),
    edgeConduit: Uint8Array.from(ec),
    numEdges: ea.length,
    uidToIndex,
    circuit,
    buildMass,
    divideMass,
    minMass: buildMass * 0.45,
    maxMass: divideMass * 1.15,
    coreIndex,
    membrane,
    baseIntegrity: 8 + membrane.integrityBonus + struts * 5 + armor * 2,
    bondSlots: Math.min(MAX_BONDS_PER_CELL, knobs * 2),
    bondStrength: 0.25 + knobs * 0.18 + struts * 0.3,
    stiffness: Math.min(0.9, 0.25 + struts * 0.15 + knobs * 0.05),
    totalUpkeep,
    autoDivide,
    fidelity,
    lifespan,
    byType,
  };
}

/** Rough steady-state budget for the editor (charge per tick). */
export function estimateBudget(cd: CompiledDesign, env: { sorb: number; light: number; heat: number }, tissue = 0) {
  const T = TYPE_ID;
  let production = 0;
  let upkeep = cd.membrane.upkeep;
  let intake = 0;
  let burnCap = 0;
  const rateMul = 0.6 + 0.8 * env.heat;
  for (let i = 0; i < cd.n; i++) {
    if (!(cd.tissues[i] & (1 << tissue))) continue;
    upkeep += cd.upkeep[i] * rateMul;
    const p = cd.params[i * MAX_PARAMS];
    const t = cd.types[i];
    if (t === T.pore) intake += p * env.sorb * 0.85;
    if (t === T.combustor) burnCap += p * rateMul;
    if (t === T.photovore) production += env.light * p * 0.055 * rateMul;
    if (t === T.flagellum) upkeep += 0.016 * p * rateMul * 0.5;
  }
  intake += cd.membrane.perm[0] * env.sorb * 0.4;
  const burned = Math.min(burnCap, intake);
  production += burned * 3 - intake * 0.12;
  return { production, upkeep, net: production - upkeep, burned, intake };
}
