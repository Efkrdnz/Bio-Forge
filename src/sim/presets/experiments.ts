/**
 * Tutorials (interactive presets with goal checklists) and experiments.
 */
import type { ExperimentDef } from '../experiment';
import type { CellDesign } from '../design';
import { buildDesign } from './builder';
import { chemoGlider, drifter, echoSwarm, filament, lumenLeaf, lumenMat, lysinHunter, murkEater, protocell, pulseSwimmer, sentinel } from './designs';

// ------------------------------------------------------------ tutorial designs
const sparkCell = (): CellDesign =>
  buildDesign('tut-spark', 'Spark Cell', 186, { notes: 'This cell has no way to make charge. Give it a Combustor.' }, (b) => {
    b.add('core', 0, 0);
    b.add('assembler', 200, 0.4);
    b.add('pore', 60);
    b.add('pore', -60);
    b.add('efflux', 180);
  });

const plumbCell = (): CellDesign =>
  buildDesign('tut-plumb', 'Leaky Plumbing', 30, { notes: 'The combustor sits far from the pores. Conduits move resources faster than the cytosol.' }, (b) => {
    b.add('core', 0, 0);
    b.add('assembler', 90, 0.3);
    b.add('combustor', 180, 0.8, { rate: 0.18 });
    b.add('pore', 20, 1, { rate: 0.04 });
    b.add('pore', -20, 1, { rate: 0.04 });
    b.add('efflux', -150);
  });

const blindGlider = (): CellDesign => {
  const d = chemoGlider();
  d.id = 'tut-gradient';
  d.name = 'Blind Glider';
  d.notes = 'Sensors and flagella are installed but not wired. Cross the wires to steer toward food.';
  // keep sensor + actuator nodes, drop the logic in between
  d.circuit.nodes = d.circuit.nodes.filter((n) => n.kind === 'sensor' || n.kind === 'actuator');
  d.circuit.wires = [];
  return d;
};

const looseCells = (): CellDesign => {
  const d = filament();
  d.id = 'tut-bond';
  d.name = 'Loose Cells';
  d.notes = 'Daughters drift apart. Add Adhesion Knobs and switch development to Bonded.';
  d.components = d.components.filter((c) => c.type !== 'adhesion');
  d.development.mode = 'separate';
  d.development.maxCells = 1;
  return d;
};

const sameMat = (): CellDesign => {
  const d = lumenMat();
  d.id = 'tut-tissue';
  d.name = 'Uniform Mat';
  d.notes = 'Every cell becomes a Leaf: no Root cells pump in food, so the sheet starves. Make daughters alternate tissues.';
  d.development.daughterTissue = 'inherit';
  return d;
};

const heatProto = (): CellDesign => {
  const d = protocell();
  d.id = 'tut-evolve';
  d.name = 'Ancestor';
  d.notes = 'A fragile ancestor in a warming dish. Mutation is high: let selection find a way.';
  for (const c of d.components) if (c.type === 'core') c.params.fidelity = 0.1;
  return d;
};

// ------------------------------------------------------------ tutorials
export function tutorials(): ExperimentDef[] {
  return [
    {
      id: 'tut-1',
      name: '01 · First Spark',
      summary: 'A cell without an energy organelle starves. Fix its blueprint.',
      category: 'tutorial',
      seed: 11,
      params: { feedPattern: 'uniform', mutationRate: 0 },
      inoculations: [{ designId: 'tut-spark', count: 6, angle: 0, dist: 0, spread: 0.3 }],
      schedule: [],
      designs: [sparkCell()],
      focusDesignId: 'tut-spark',
      goals: [
        { id: 'g1', kind: 'hasComponent', designId: 'tut-spark', component: 'combustor', n: 1, label: 'Add a Combustor in the Forge and deploy', hint: 'Forge → drag Combustor into the cell → Deploy to Dish' },
        { id: 'g2', kind: 'population', designId: 'tut-spark', n: 20, label: 'Grow a colony of 20 cells' },
      ],
    },
    {
      id: 'tut-2',
      name: '02 · Plumbing',
      summary: 'Resources crawl through cytosol. Conduits make express routes.',
      category: 'tutorial',
      seed: 12,
      params: { mutationRate: 0 },
      inoculations: [{ designId: 'tut-plumb', count: 6, angle: 0, dist: 0, spread: 0.3 }],
      schedule: [],
      designs: [plumbCell()],
      focusDesignId: 'tut-plumb',
      goals: [
        { id: 'g1', kind: 'conduits', designId: 'tut-plumb', n: 2, label: 'Lay two conduits and deploy the cell', hint: 'Forge → Conduit tool → drag each Pore → Combustor' },
        { id: 'g2', kind: 'netEnergy', designId: 'tut-plumb', n: 55, label: 'Reach a net energy of +55 mC/tick in one cell', hint: 'Inspector → Energy budget shows each part’s share' },
      ],
    },
    {
      id: 'tut-3',
      name: '03 · Follow the Gradient',
      summary: 'Food lies to the east. Wire sensors to flagella so cells steer.',
      category: 'tutorial',
      seed: 13,
      params: { feedPattern: 'gradient', feedRate: 0.003, mutationRate: 0 },
      inoculations: [{ designId: 'tut-gradient', count: 8, angle: 180, dist: 0.65, spread: 0.12 }],
      schedule: [],
      designs: [blindGlider()],
      focusDesignId: 'tut-gradient',
      goals: [
        { id: 'g1', kind: 'region', designId: 'tut-gradient', angle: 0, dist: 0.6, r: 0.35, n: 12, label: 'Get 12 cells into the eastern feeding ground', hint: 'Circuit tab: left sensor → right flagellum, right sensor → left flagellum' },
      ],
    },
    {
      id: 'tut-4',
      name: '04 · Many Become One',
      summary: 'Bond daughters together to build a multicellular filament.',
      category: 'tutorial',
      seed: 14,
      params: { mutationRate: 0 },
      inoculations: [{ designId: 'tut-bond', count: 5, angle: 0, dist: 0, spread: 0.3 }],
      schedule: [],
      designs: [looseCells()],
      focusDesignId: 'tut-bond',
      goals: [
        { id: 'g1', kind: 'hasComponent', designId: 'tut-bond', component: 'adhesion', n: 2, label: 'Give the cell two Adhesion Knobs', hint: 'Place knobs at the front and back of the membrane' },
        { id: 'g2', kind: 'organism', designId: 'tut-bond', n: 6, label: 'Grow an organism of 6 bonded cells', hint: 'Development tab → Bonded, max size 8' },
      ],
    },
    {
      id: 'tut-5',
      name: '05 · Division of Labour',
      summary: 'Specialised tissues: leaves harvest light, roots feed the sheet.',
      category: 'tutorial',
      seed: 15,
      params: { lightIntensity: 1, feedRate: 0.0015, mutationRate: 0 },
      inoculations: [{ designId: 'tut-tissue', count: 4, angle: 0, dist: 0, spread: 0.3 }],
      schedule: [],
      designs: [sameMat()],
      focusDesignId: 'tut-tissue',
      goals: [
        { id: 'g1', kind: 'tissues', designId: 'tut-tissue', n: 2, label: 'Grow an organism with two tissue types', hint: 'Development → daughter tissue: Alternate A ↔ B' },
        { id: 'g2', kind: 'organism', designId: 'tut-tissue', n: 10, label: 'Reach a 10-cell organism' },
      ],
    },
    {
      id: 'tut-6',
      name: '06 · Survival of the Fittest',
      summary: 'The dish heats up. High mutation lets selection adapt the lineage.',
      category: 'tutorial',
      seed: 16,
      params: { mutationRate: 0.4, mutationStrength: 1.4 },
      inoculations: [{ designId: 'tut-evolve', count: 20, angle: 0, dist: 0, spread: 0.6 }],
      schedule: [
        { tick: 1500, kind: 'set', key: 'baseHeat', value: 0.64, label: 'Heat wave begins' },
        { tick: 4000, kind: 'set', key: 'baseHeat', value: 0.7, label: 'Heat intensifies' },
      ],
      designs: [heatProto()],
      goals: [
        { id: 'g1', kind: 'depth', designId: 'tut-evolve', n: 4, label: 'Evolve a strain 4 mutations deep', hint: 'Watch the Lineage view as strains branch' },
        { id: 'g2', kind: 'survive', designId: 'tut-evolve', ticks: 7000, label: 'Keep the lineage alive to tick 7000', hint: 'Heat-tolerant mutants (thicker membranes, shields) should take over' },
      ],
    },
  ];
}

// ------------------------------------------------------------ experiments
export function experiments(): ExperimentDef[] {
  return [
    {
      id: 'exp-open',
      name: 'Open Dish',
      summary: 'Four founders share an even, gentle dish.',
      category: 'sandbox',
      seed: 21,
      params: {},
      inoculations: [
        { designId: 'protocell', count: 8, angle: 0, dist: 0.45, spread: 0.15 },
        { designId: 'lumen-leaf', count: 6, angle: 90, dist: 0.45, spread: 0.15 },
        { designId: 'chemo-glider', count: 6, angle: 180, dist: 0.45, spread: 0.15 },
        { designId: 'drifter', count: 8, angle: 270, dist: 0.45, spread: 0.15 },
      ],
      schedule: [],
      designs: [protocell(), lumenLeaf(), chemoGlider(), drifter()],
      goals: [{ id: 'g1', kind: 'diversity', n: 12, label: 'Reach 12 living strains' }],
    },
    {
      id: 'exp-predator',
      name: 'Predator & Prey',
      summary: 'Lysin Hunters arrive in a thriving grazer colony.',
      category: 'experiment',
      seed: 22,
      params: { feedRate: 0.0016, maxPopulation: 700 },
      inoculations: [
        { designId: 'protocell', count: 25, angle: 0, dist: 0, spread: 0.7 },
        { designId: 'drifter', count: 20, angle: 0, dist: 0, spread: 0.7 },
      ],
      schedule: [{ tick: 800, kind: 'inoculate', designId: 'lysin-hunter', count: 6, angle: 0, dist: 0, spread: 0.2, label: 'Hunters released' }],
      designs: [protocell(), drifter(), lysinHunter()],
      goals: [
        { id: 'g1', kind: 'population', designId: 'lysin-hunter', n: 18, label: 'Hunters establish a population of 18' },
        { id: 'g2', kind: 'survive', designId: 'protocell', ticks: 8000, label: 'Prey persists to tick 8000' },
      ],
    },
    {
      id: 'exp-light',
      name: 'Light & Shadow',
      summary: 'Half the dish is lit, food is scarce. Phototrophs vs heterotrophs.',
      category: 'experiment',
      seed: 23,
      params: { lightPattern: 'half', feedRate: 0.0009, lightIntensity: 1.1 },
      inoculations: [
        { designId: 'lumen-leaf', count: 10, angle: 0, dist: 0, spread: 0.6 },
        { designId: 'protocell', count: 10, angle: 0, dist: 0, spread: 0.6 },
        { designId: 'murk-eater', count: 6, angle: 0, dist: 0, spread: 0.6 },
      ],
      schedule: [],
      designs: [lumenLeaf(), protocell(), murkEater()],
      goals: [{ id: 'g1', kind: 'region', designId: 'lumen-leaf', angle: 180, dist: 0.5, r: 0.4, n: 40, label: '40 Leaves settle the lit west' }],
    },
    {
      id: 'exp-thermal',
      name: 'Thermal Frontier',
      summary: 'A steep west–east heat gradient. Protocells evolve heat tolerance while armoured Sentinels hold the hot side.',
      category: 'experiment',
      seed: 24,
      params: { heatPattern: 'linear', heatAmplitude: 0.45, mutationRate: 0.3 },
      inoculations: [
        { designId: 'protocell', count: 14, angle: 180, dist: 0.3, spread: 0.3 },
        { designId: 'sentinel', count: 6, angle: 0, dist: 0.3, spread: 0.2 },
      ],
      schedule: [],
      designs: [protocell(), sentinel()],
      goals: [
        { id: 'g1', kind: 'heatTolerance', designId: 'protocell', n: 15, label: 'Protocells evolve mean heat tolerance ±0.15', hint: 'Lineage → look for thicker membranes and shields' },
        { id: 'g2', kind: 'region', designId: 'sentinel', angle: 0, dist: 0.3, r: 0.2, n: 25, label: 'Armoured Sentinels hold the hot frontier' },
        { id: 'g3', kind: 'depth', designId: 'protocell', n: 6, label: 'Lineage 6 mutations deep' },
      ],
    },
    {
      id: 'exp-famine',
      name: 'Famine Cycles',
      summary: 'Feeding stops and restarts. Storage and frugality pay off.',
      category: 'experiment',
      seed: 25,
      params: { feedRate: 0.0025, mutationRate: 0.2 },
      inoculations: [
        { designId: 'protocell', count: 12, angle: 0, dist: 0, spread: 0.6 },
        { designId: 'drifter', count: 12, angle: 0, dist: 0, spread: 0.6 },
        { designId: 'sentinel', count: 6, angle: 0, dist: 0, spread: 0.6 },
      ],
      schedule: [
        { tick: 2500, kind: 'set', key: 'feedRate', value: 0, label: 'Famine: feeding stops' },
        { tick: 4500, kind: 'set', key: 'feedRate', value: 0.0025, label: 'Feeding resumes' },
        { tick: 7000, kind: 'set', key: 'feedRate', value: 0, label: 'Second famine' },
        { tick: 9000, kind: 'set', key: 'feedRate', value: 0.0025, label: 'Feeding resumes' },
      ],
      designs: [protocell(), drifter(), sentinel()],
      goals: [{ id: 'g1', kind: 'survive', ticks: 10000, label: 'Any life survives both famines' }],
    },
    {
      id: 'exp-toxic',
      name: 'Toxic Bloom',
      summary: 'Murk floods the dish and no longer drains. Who can clean up?',
      category: 'experiment',
      seed: 26,
      params: { murkDrain: 0, murkDecay: 0.0004, lightIntensity: 1.4, feedRate: 0.0009 },
      inoculations: [
        { designId: 'protocell', count: 15, angle: 0, dist: 0, spread: 0.6 },
        { designId: 'murk-eater', count: 8, angle: 0, dist: 0, spread: 0.6 },
      ],
      schedule: [
        { tick: 600, kind: 'pulse', field: 'murk', angle: 0, dist: 0, r: 0.6, amount: 8, label: 'Murk bloom' },
        { tick: 2000, kind: 'pulse', field: 'murk', angle: 0, dist: 0, r: 0.9, amount: 12, label: 'Dish-wide bloom' },
        { tick: 3500, kind: 'pulse', field: 'murk', angle: 90, dist: 0.3, r: 0.8, amount: 12, label: 'Third bloom' },
        { tick: 5000, kind: 'pulse', field: 'murk', angle: 200, dist: 0.3, r: 0.8, amount: 12, label: 'Fourth bloom' },
        { tick: 6500, kind: 'pulse', field: 'murk', angle: 0, dist: 0, r: 0.9, amount: 12, label: 'Fifth bloom' },
      ],
      designs: [protocell(), murkEater()],
      goals: [{ id: 'g1', kind: 'population', designId: 'murk-eater', n: 60, label: 'Murk Eaters reach 60' }],
    },
    {
      id: 'exp-colonial',
      name: 'Colonial Life',
      summary: 'Multicellular forms compete: filaments, mats, swimmers and swarms.',
      category: 'experiment',
      seed: 27,
      params: { lightPattern: 'top', feedPattern: 'patches', feedRate: 0.004 },
      inoculations: [
        { designId: 'filament', count: 4, angle: 0, dist: 0.4, spread: 0.1 },
        { designId: 'lumen-mat', count: 4, angle: 270, dist: 0.5, spread: 0.1 },
        { designId: 'pulse-swimmer', count: 4, angle: 180, dist: 0.4, spread: 0.1 },
        { designId: 'echo-swarm', count: 8, angle: 90, dist: 0.4, spread: 0.1 },
      ],
      schedule: [],
      designs: [filament(), lumenMat(), pulseSwimmer(), echoSwarm()],
      goals: [{ id: 'g1', kind: 'organism', n: 10, label: 'An organism of 10+ cells' }],
    },
    {
      id: 'exp-blank',
      name: 'Blank Dish',
      summary: 'An empty, sterile dish. Inoculate your own designs.',
      category: 'sandbox',
      seed: 28,
      params: {},
      inoculations: [],
      schedule: [],
      designs: [],
      goals: [],
    },
  ];
}

export function allPresets(): ExperimentDef[] {
  return [...tutorials(), ...experiments()];
}
