# BIOFORGE — Implementation Plan

BIOFORGE is a browser sandbox for building **fictional** cells out of functional
components, wiring them with logic circuits, growing them into multicellular
organisms and letting them compete and evolve in a petri-dish ecosystem.

All chemistry is invented ("sorb", "lith", "charge", "murk", "echo"). Nothing here
models real genes, real pathogens or real lab procedures.

---

## 1. Architecture

```
src/
  sim/            Pure TypeScript simulation, no DOM. Fully unit tested.
    constants.ts    Resource indices, tunables
    rng.ts          Seeded, serialisable PRNG (deterministic replays)
    components.ts   Component catalogue: purpose, costs, buffers, params, ports
    membranes.ts    Membrane catalogue
    design.ts       CellDesign (blueprint), validation, compile -> CompiledDesign
    circuit.ts      Logic circuit compile + evaluation
    environment.ts  Grid fields (sorb, lith, murk, heat, echoA/B, light), diffusion
    metabolism.ts   Per-cell resource network: components, internal transport,
                    membrane exchange, upkeep, autophagy, damage
    physics.ts      Spatial hash, collisions, bonds, thrust, dish wall
    multicell.ts    Bond exchange (junctions), gap-relay signalling, organisms
    lifecycle.ts    Growth, division, differentiation, death
    evolution.ts    Mutation operators, strain registry, lineage records
    world.ts        World container, tick orchestration, ledger, events
    experiment.ts   Experiment definition, schedule events, goals
    serialize.ts    Save / load / snapshot (timeline)
    presets/        Template designs, tutorial & experiment presets
  render/         Canvas2D renderer (dish, cells, overlays, glow sprites)
  ui/             React UI (lab chrome, dish, forge, lineage, experiments)
  tests/          Vitest suites
docs/ASSUMPTIONS.md  Every simplified "science" assumption, written down
```

The simulation runs on the main thread with a fixed tick and a per-frame time
budget, so the UI can read live state directly. React re-renders panels at
about 8 Hz. The canvas draws on its own requestAnimationFrame loop.

## 2. Simulation model

### Resources
* **Matter**: `sorb` (nutrient), `lith` (structural mineral), `murk` (waste),
  and cell `mass` (biomass). Matter is **conserved**. Every creation or
  destruction is a ledger entry (feeders, drains), and a test checks the books.
* **Energy**: `charge`. It comes from combustion and light, and is spent on upkeep,
  pumping, thrust, growth and repair. It is not conserved, but it is ledgered.
* **Signals**: environmental `echoA`/`echoB` fields, and four internal morphogen
  channels per cell.

### Cell resource network
Each component is a node with small local buffers. The cytosol is a central node
whose capacity scales with mass. Every component has an implicit cytosol link,
and its conductance falls with distance from the centre. Users can draw
**conduits** for high-conductance links. Each tick, transport runs as
conservative pairwise diffusion of concentrations (Gauss-Seidel, no overshoot),
and per-edge flows are recorded for overlays.

### Components (category → examples)
* Membranes (cell level): Lipoid Veil, Osmotic Lattice, Keratex Shell
* Energy: Combustor, Photovore Plate, Murk Reclaimer
* Storage: Capacitor, Sorb Vesicle, Lith Depot, Murk Vacuole
* Transport: Intake Pore, Efflux Pump, Junction (intercellular), conduits
* Sensors: Chemoreceptor, Photoreceptor, Thermoreceptor, Murk Sensor,
  Echo Receptor, Proximity Sensor, Homeostat (internal state)
* Signalling: Echo Emitter, Gap Relay, Oscillator
* Structure: Strut Frame, Adhesion Knob, Armor Plate
* Movement: Flagellum, Cilia Band
* Core / special: Codex Core (required, controls division and fidelity),
  Assembler (growth), Mender (repair), Thermo Shield, Lysin Spike (predation)

Every component has a mass cost, which raises the build mass and therefore the
division threshold. Each also has a charge upkeep, a buffer, tunable parameters
and circuit ports.

### Behaviour
Sensors feed a per-cell logic circuit. Circuit nodes are const, internal
values, signal-in, AND, OR, NOT, threshold, compare, gain, add, sub, delay,
latch, oscillator, pulse and random. The circuit drives component activations
and cell actions: divide, adhere, release, apoptosis, become tissue, and
signal-out. Back edges are evaluated as one-tick delays.

### Multicellularity
Division can be detached or bonded. A bond is a distance constraint plus an
angular shape memory, and its strength comes from adhesion knobs and struts.
Bonds break under over-stretch. Junctions exchange cytosol between bonded
cells, and gap relays diffuse morphogen channels between them. Organisms are
the connected components of the bond graph. When an organism reaches its
maximum size, new daughters bud off and found new organisms. Tissue masks
choose which components are expressed in each cell.

### Environment
A circular dish over a 120×120 grid holds the fields sorb, lith, murk, heat,
echoA and echoB, plus a computed light field. The dish has feeders with
patterns, murk decomposition, diffusion, heat relaxation toward a pattern, a
day/night cycle and brushes. Heat stress damages cells outside their tolerance
band, and murk concentration is toxic.

### Evolution
Each division can mutate the design with the experiment's mutation rate scaled
by the Codex fidelity. Mutation operators cover parameters, position,
adding, removing or duplicating components, circuit wires and thresholds,
membrane, conduits and development. Every mutant becomes a new strain with a
parent link, a human-readable mutation note, and population history for the
lineage view.

## 3. Tools and UI
* Lab chrome with the views Dish / Forge / Lineage / Experiments.
* Dish: microscope zoom presets (4×–100×) and continuous zoom, pan, a follow
  cam, brushes (nutrient, lith, toxin, heat, cool, cull, inoculate), field
  overlays, a flow overlay, a tissue overlay and objectives.
* Inspector: vitals, resource pools, per-component activity, buffers and
  energy, live circuit values, activity graphs and an energy budget.
* Timeline: play/pause/step/speed, rolling snapshots with rewind, bookmarks.
* Forge: component palette, visual cell editor (drag, place, conduits),
  circuit node editor, development and tissue editor, design stats and
  warnings, and a live Test Chamber running the real engine.
* Lineage: phylogeny tree, strain population chart, mutation diffs.
* Experiments: presets, tutorials with live goal checklists, an experiment
  editor (environment, schedule events, inoculations, goals), save slots,
  and JSON import/export.

## 4. Phases
1. Scaffold (Vite, React, TS, Vitest), PLAN, core types, RNG.
2. Components, membranes, design, compile, validation.
3. Environment fields and diffusion; metabolism and resource network; ledger.
4. Circuit engine; sensors and actuators.
5. Physics, bonds, multicellular exchange, organisms.
6. Lifecycle: growth, division, differentiation, death; evolution and lineage.
7. World orchestration, experiments, schedule, goals, serialisation, snapshots.
8. Presets: templates, competing organisms, tutorials, experiments.
9. Renderer: dish, fields, cells (LOD), organelles, particles, signals, overlays.
10. UI: chrome, dish tools, inspector, graphs, timeline.
11. Forge: palette, cell editor, circuit editor, development, test chamber.
12. Lineage and Experiments views; save/load.
13. QA: unit tests (accounting, components, division, signalling, bonds,
    persistence, performance), a Playwright smoke run with screenshots, tuning
    so the presets actually live and die, and a polish pass.
14. Docs: README, ASSUMPTIONS.md.

## 5. Status

All 14 phases are complete:

* Simulation core (30 components, 3 membranes, circuits, physics,
  multicellularity, evolution, experiments, persistence)
* Presets (11 organisms, 6 tutorials, 8 experiments)
* Canvas renderer
* Dish, Forge, Lineage and Experiments UIs
* Documentation

QA covers 82 unit tests, two browser smoke tests, and a balance audit of
every experiment.

Balancing changes made during QA, each found by tracing a failing lineage
headlessly:

* Self-priming energy acquirers fix a zero-charge deadlock.
* A growth checkpoint stops cells from building biomass out of their last
  fuel.
* Predators feast on their kills, which allows stable predator–prey
  coexistence.
* Scavenger pores plus a homeostasis circuit make the Murk Eater niche
  viable.
* Lumen Mat founders can now feed.
* Buds that found a new organism reset to the founder tissue, so swimmers
  keep a pacemaker.
* Tutorials 1–5 run without mutation, so the lessons stay controlled.
