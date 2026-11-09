# BIOFORGE

**An interactive synthetic-life sandbox.** You build fictional cells from
functional components, wire them up with logic circuits, grow them into
multicellular organisms, and release them into a living petri dish. There they
compete, mutate and evolve.

> All substances and parts are fictional: sorb, lith, charge, murk, echo,
> Codex Cores, Combustors and so on. BIOFORGE uses no genetic sequences, real
> organisms or lab procedures. Every simplification is listed in
> [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md).

## Quick start

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL. The first visit shows six interactive tutorials. Each
one is a living dish with a short goal checklist, not a wall of text.

Other scripts:

```bash
npm test
```

```bash
npm run build
```

```bash
npm run smoke
```

```bash
npm run audit
```

* `npm test` runs 80+ simulation tests (Vitest).
* `npm run build` typechecks and produces a production bundle in `dist/`.
* `npm run smoke` runs two end-to-end browser tests. It needs `npm run dev`
  running and Playwright installed.
* `npm run audit` plays every experiment headlessly for 8,000 ticks and
  reports populations and goal status per lineage (a balance check).
* Balancing tools: `npm run audit:tutorials`, `npm run viability`, and
  `npm run bench` (per-phase timings), plus `scripts/trace1.ts` and
  `scripts/budget.ts`, which trace one lineage inside an experiment.

## What you can do

### Cell Forge (F2)

* **Visual cell editor.** Drag parts from the palette onto a blueprint of
  the cell. Membrane parts snap to the rim; organelles sit inside. Drag to
  move a part. The front of the cell is to the right.
* **30 components in 9 categories**, each with a mass cost, a charge upkeep,
  buffers, tunable parameters and a real simulated function:
  * Core: Codex Core, Assembler
  * Energy: Combustor, Photovore Plate, Murk Reclaimer
  * Storage: Capacitor, Sorb Vesicle, Lith Depot, Murk Vacuole
  * Transport: Intake Pore, Efflux Pump, Junction Channel
  * Sensors: Chemo-, Photo- and Thermoreceptor, Murk Sensor, Echo Receptor,
    Proximity Sensor, Homeostat
  * Signalling: Echo Emitter, Gap Relay, Oscillator
  * Structure: Strut Frame, Adhesion Knob, Armor Plate
  * Movement: Flagellum, Cilia Band
  * Defense and upkeep: Mender, Thermo Shield, Lysin Spike
* **Three membranes** (Lipoid Veil, Osmotic Lattice, Keratex Shell) plus a
  thickness setting.
* **Resource network.** Every part has its own small buffer, linked to the
  cytosol. The conduit tool lays express pipes between parts, and you can
  watch resources flow along them.
* **Circuit editor.** A node graph of sensors, logic, memory and actuators:
  * Logic: AND/OR/NOT, threshold, compare, gain, add, subtract, multiply
  * Memory: delay, latch, clock, edge pulse
  * Outputs: component activation, divide, adhere, release, apoptosis,
    become-tissue and signal-out
  * Wires glow with **live values** streamed from the test chamber.
* **Development editor.** Choose unicellular or bonded multicellular growth,
  organism size, division axis and per-division rotation, and daughter tissue
  rules. It includes a growth preview and an **expression matrix** that sets
  which parts each of the four tissues builds.
* **Blueprint stats and validation**: build mass, division mass, upkeep,
  peak budget, heat tolerance, bond slots, warnings.
* **Test Chamber.** A private mini-dish runs the real engine on your design
  as you edit, with nutrient, light, heat and gradient controls.
* Save designs to your library, import/export JSON, and **Deploy** to the dish.

### Dish (F1): the petri-dish ecosystem

* **Microscope**: smooth zoom with 4×/10×/40×/100× objectives (keys 1–4),
  pan, a follow camera, and level of detail from glowing dots up to fully
  animated organelles.
* **Field overlays**: natural, sorb, lith, murk, heat, light, echo A/B (with
  legends). Cells can be coloured by strain, tissue or health. A flow overlay
  shows membrane exchange and bond flows.
* **Tools**:
  * Inspect and pan
  * Inoculate any design
  * Brushes: nutrient, lith, toxin, heat, cool
  * Place lumen sources
  * Cull brush
* **Inspector**:
  * Vitals and resource bars
  * Activity graphs
  * Per-component energy budget (produced vs consumed)
  * Component activity and sensor readings
  * Live circuit values and signal channels
  * Membrane exchange and bonds
  * Actions: follow, open blueprint, highlight lineage, kill
* **Environment**: every parameter adjustable live (feed rates and patterns,
  saturation, light pattern and day cycle, heat pattern and contrast, murk
  decay and drain, mutation settings, population cap, viscosity). It also has
  quick events (heat wave, famine, bloom, toxic spill, sterilise) and a matter
  ledger readout.
* **Population**: lineage stacked chart, dish resources, charge flux, leading
  strains, death causes.
* **Timeline**: play, pause, step, 0.25×–16× speed, automatic snapshots,
  rewind, bookmarks.

### Lineage (F3)

A phylogeny of every strain, with lifespan bars, peak populations and
extinctions. Select a strain to see its blueprint, its mutation note, a
structural **diff against its parent**, and its descendants. From there you
can open it in the Forge (adopting an evolved design), find it in the dish,
or cull it. A stacked abundance chart tracks the dominant strains.

### Experiments (F4)

* **6 tutorials**: First Spark, Plumbing, Follow the Gradient, Many Become
  One, Division of Labour, Survival of the Fittest.
* **8 experiments**: Open Dish, Predator & Prey, Light & Shadow, Thermal
  Frontier, Famine Cycles, Toxic Bloom, Colonial Life, Blank Dish.
* **Experiment editor**:
  * Environment overrides
  * Founder groups with positions
  * A timed schedule: set a parameter, pulse a field, or inoculate
  * Goals: population, survival, organism size, tissues, diversity,
    mutation depth, extinction, component present, conduits, zone
    occupancy, net energy, evolved heat tolerance
* Save your own experiments, export/import them, and run them.
* **Save slots** for whole worlds (in browser storage) plus world export/import
  as JSON. Saves are deterministic: a reloaded world continues exactly as the
  original would.

## Template organisms

| Organism | Strategy |
|---|---|
| Protocell | Balanced heterotroph; pores piped straight into a combustor |
| Drifter | Minimal, leaky and cheap; booms and busts |
| Lumen Leaf | Phototroph; pores only gather building matter |
| Chemo Glider | Braitenberg forager; compare-based steering up gradients |
| Lysin Hunter | Predator; proximity sensors steer it, spikes drain prey |
| Filament | Bonded chain; junctions share food along the strand; buds at 8 |
| Lumen Mat | Differentiated sheet: Leaf tissue photosynthesises, Root tissue feeds |
| Pulse Swimmer | Pacemaker head clocks a signal that ripples down gap relays and beats body flagella |
| Murk Eater | Uses light to refine waste into building matter |
| Keratex Sentinel | Armoured, heat-tolerant extremophile |
| Echo Swarmer | Calls kin on Echo B and swims toward the loudest call |

## Architecture

```
src/sim/       Pure TypeScript simulation (no DOM), fully unit-tested
  components.ts  catalogue: purpose, costs, buffers, params, ports
  design.ts      blueprints, validation, compilation to flat typed arrays
  circuit.ts     fuzzy-logic circuits (topological order + 1-tick feedback)
  environment.ts dish grid: feeding, diffusion, heat, light, echo, brushes
  metabolism.ts  sensing → circuit → components → transport → membrane → stress
  physics.ts     spatial hash, overdamped motion, bonds with shape memory
  multicell.ts   junction exchange, gap relays, adhesion, predation, organisms
  lifecycle.ts   division (exact matter split, inheritance, mutation), death
  evolution.ts   mutation operators, design diffs
  world.ts       tick orchestration, ledger, strains, history, experiments
  serialize.ts   snapshots (timeline) and JSON save/load
  presets/       template organisms, tutorials, experiments
src/render/    Canvas 2D renderer: dish, field textures, particles, cells (LOD)
src/ui/        React UI: dish, Forge, Lineage, Experiments; zustand store
src/tests/     Vitest suites
scripts/       smoke test, screenshot helper, balancing scripts
```

The simulation runs on the main thread inside a per-frame time budget, so the
UI can read and edit live state directly. React panels refresh at about 6–10
Hz. The canvas draws on its own `requestAnimationFrame` loop with additive
glow sprites and a cell-count–aware detail budget.

## Quality checks

* **`npm test`, 82 tests:**
  * Accounting: matter conservation in a busy ecosystem; brushes, culls and
    inoculations ledgered; exact halving on division; full matter return on
    death; conservation through predator feasts.
  * Components: every component's behaviour; conduits speed transport; no
    perpetual-motion loops; self-priming restart; growth checkpoint;
    scavenger pores.
  * Circuits: truth tables, hysteresis, latch, delay, clock, edge pulse,
    feedback loops, actuators; sensor-driven chemotaxis; Murk Eater
    homeostasis.
  * Division: core and mass rules, fidelity, mutation and strains, bonded
    development and budding, tissue rules, circuit-driven differentiation.
  * Multicellular: bonds, slots, junction sharing, bond breakage, organism
    graph splitting, adhesion action, signal waves down a chain, coordinated
    swimming driven by a pacemaker.
  * Persistence: snapshot → restore → replay is bit-identical; JSON
    round-trip; robust loading of damaged designs.
  * Evolution: mutation validity, lineage integrity, selection in a hot dish.
  * Presets: every preset runs; tutorials 1, 2, 4 and 5 are solvable (and 2
    is not solvable without the fix).
  * Performance: a dense 700-cell dish in a few ms per tick; long-run
    numerical stability; 28-component cells.
* **`npm run smoke`, two Playwright passes:**
  * The first plays tutorial 1 like a user and exercises the conduit tool,
    the inspector, brushes with the ledger, rewind, save/load slots, circuit
    wiring by drag, the development tab, lineage, and a multicellular preset.
  * The second covers palette drag-and-drop, moving and deleting parts,
    inoculate and lumen tools, every overlay, the environment controls, and
    a dense-dish performance budget (renderer < 30 ms/frame of script,
    sim < 9 ms/tick).
  * Both fail on any console error.
* **`npm run audit`**: every experiment's goals are reachable on its
  default seed. Runs are deterministic, so the audit is reproducible.

## Keyboard

| Key | Action |
|---|---|
| F1–F4 | Dish / Forge / Lineage / Experiments |
| Space | Play / pause |
| `.` | Step one tick |
| 1–4 | Microscope objectives |
| I H N S L M T C G X | Dish tools |
| V | Flow overlay |
| F | Follow selection |
| `[` `]` | Brush size |
| Del | Kill selected cell, or remove the selected part/node in the Forge |
| Esc | Deselect |
