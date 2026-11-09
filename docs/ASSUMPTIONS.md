# BIOFORGE — Simplified "Science" and Modelling Assumptions

BIOFORGE is a game-like sandbox, not a biological simulator. Every substance,
organelle and process here is **fictional**. The names are made up on purpose:
sorb, lith, charge, murk, echo, Codex Core, Combustor and the rest. The
model contains **no genetic sequences, no real organisms or pathogens, and no
laboratory procedures**. It borrows only very broad ideas, such as "cells need
energy", "waste is toxic" and "offspring inherit a blueprint with occasional
copying errors", and turns them into simple game rules.

This document lists every simplification the simulation makes, so you can tell
which behaviours are designed rules and which are emergent.

---

## 1. Time, space and units

| Quantity | Model |
|---|---|
| Time | Discrete **ticks**. At 1× the UI runs 30 ticks per second. |
| Space | 2D only. The dish is a circle about 1,180 world units across, laid over a 120×120 grid of 10-unit cells. |
| Cell size | `radius = 3.1 · √mass` (area grows with biomass). |
| Units | Arbitrary. "1 sorb" carries no physical meaning. |

## 2. Resources (all fictional)

| Resource | Role | Conserved? |
|---|---|---|
| **Sorb** | General nutrient; fuel and building matter | Yes (matter) |
| **Lith** | Mineral needed for growth (1/3 of biomass) | Yes (matter) |
| **Murk** | Waste product; toxic when concentrated | Yes (matter) |
| **Biomass** | The cell's body; made of sorb and lith | Yes (matter) |
| **Charge** | Energy currency for all work | No (energy), but logged |
| **Lumen** | Light field that photovores harvest | Field, not a stock |
| **Echo A/B** | Diffusing signal fields | No; decays |

**Matter conservation is exact by construction.** Sorb, lith, murk and
biomass only move between pools or convert into one another. The only
external sources and sinks are dish feeding, brushes, inoculating new
founders, and murk drain. Each one is recorded in the ledger, and both the
test suite and the Environment panel check that
`matter in dish = inputs − outputs`. The drift is about 1e-6, which is float
rounding.

**Energy is not conserved.** Charge is created by combustion, light and
autophagy, and destroyed by upkeep and work. These flows are logged per
component (Inspector → Energy budget) and dish-wide (Population → Charge flux).

## 3. Metabolism

* **Combustor**: `1 sorb → 3 charge + 1 murk`.
* **Photovore Plate**: `charge = light × area × 0.055` per tick. It loses
  efficiency above heat 0.65 and produces no matter and no waste.
* **Murk Reclaimer**: `1 murk + 3.5 charge → 1 sorb`. The cost (3.5)
  deliberately exceeds what burning the product returns (3), so no
  combination of parts forms a perpetual-motion loop.
* **Assembler (growth)**: `2/3 sorb + 1/3 lith + 2.5 charge → 1 biomass`.
* **Autophagy**: when a cell cannot pay its basal upkeep, it digests its own
  biomass, at `1 biomass → 2.5 charge + 1 murk`. Below its minimum mass it
  starts losing integrity.
* **Basal metabolism**: membrane upkeep × √(mass/10), plus 0.0012 × mass per
  tick.
* **Temperature** scales metabolic rates linearly, by `0.6 + 0.8 × heat`. This
  stands in for "warmer is faster". There is no Arrhenius kinetics.
* Every part has a fixed **upkeep** in charge per tick. Parts with an
  activation input pay `25% + 75% × activation` of it. A part that cannot pay
  works at a reduced fraction (its efficiency).
* **Self-priming acquirers.** Combustors, Photovore Plates and Lysin Spikes
  keep working when they cannot pay upkeep. The unpaid upkeep becomes a debt
  settled from what they take in. Without this rule, a cell that ran out of
  charge could never restart, even with food inside it.
* **Growth checkpoint.** The Assembler builds biomass in proportion to its
  local charge level: nothing below 15%, full speed above 50%. A cell never
  turns its last fuel into body mass.
* **Intake pores** can be set to absorb sorb and lith, either one alone, or
  (scavenger mode) only murk.

## 4. The internal resource network

* Each cell has a **cytosol** node, whose capacity scales with mass, plus one
  small **buffer** per component.
* Each component exchanges resources with the cytosol through an implicit
  link. The link's conductance falls with distance from the centre:
  `g = 0.1 + 0.26 · (1 − depth)`.
* User-drawn **conduits** add direct links of conductance 0.5 between two
  components. They cost a little mass and upkeep in proportion to their
  length.
* Flow along every link is **pairwise concentration diffusion**:
  `flow = g · (cA − cB) · capA·capB/(capA+capB)`, solved twice per tick in
  sequence. This cannot overshoot and never makes an amount negative.
* As a result, placement matters. A combustor far from its pores, or a pump
  far from the waste source, is limited by transport. That is the point of
  the plumbing tutorial.

## 5. Membranes and exchange with the dish

* Passive exchange through the membrane is proportional to
  `permeability × area × (dish concentration − cytosol concentration)`
  for sorb, lith and murk.
* Lipoid Veil: leaky both ways, so cheap food comes in and so do toxins.
  Osmotic Lattice: selectively blocks murk. Keratex Shell: nearly sealed,
  tough, slow and costly.
* **Intake pores** absorb a fixed fraction of the matter in the grid cell at
  their position. They pay 0.12 charge per unit absorbed. **Efflux pumps**
  expel murk at 0.1 charge per unit.

## 6. Stress and death

* **Heat stress**: cells are comfortable within ± tolerance of 0.5 heat.
  Outside that band, integrity drops in proportion to the excess. Tolerance
  comes from the membrane, its thickness, and Thermo Shields, which have
  diminishing returns.
* **Toxicity**: when total murk exceeds 55% of the cell's murk capacity, the
  cell takes damage. Vacuoles dilute murk by adding capacity.
* **Senescence**: after the Codex lifespan, integrity decays at an
  accelerating rate. This guarantees turnover.
* **Predation**: Lysin Spikes damage foreign cells they touch within their
  sector and siphon cytosol into the spike's buffer. Armor facing the spike
  cuts damage to 25%. When a spike lands the killing blow, the predator
  **digests** 85% of the prey's sorb and lith (including its biomass) and
  half of its charge. Everything else returns to the dish.
* A cell dies when its integrity reaches 0 or its mass falls below its minimum.
  **All of its matter returns to the dish** around it: biomass splits back
  into sorb and lith at the fixed 2:1 ratio. Its remaining charge is lost.
* Natural repair is slow and only happens while charge is above 40%. Menders
  repair faster, at 2 charge per integrity point.

## 7. Sensing, circuits and signals

* Sensors sample the dish **at their own position on the membrane**, using
  bilinear interpolation. Two sensors on opposite sides therefore read a
  gradient across the cell. The chemoreceptor's "rising" output compares
  the current reading with a slow running average (temporal sensing).
* Circuits are **continuous fuzzy logic** on values in [0, 1]. AND is
  `min`, OR is `max`, NOT is `1 − x`. Every value is clamped to [0, 1].
* Feedback loops are allowed. A node that reads a node not yet evaluated
  this tick sees last tick's value, so loops act as one-tick delays. A
  self-wired NOT therefore oscillates.
* **Internal signal channels** (four per cell) decay by 3% per tick. Gap Relays
  diffuse them to bonded neighbours. Waves travel along an organism because
  each hop is a partial, diffusive transfer.
* **Echo** fields diffuse across the dish and decay by about 3.5% per tick.
  Emitting costs charge.

## 8. Movement (low Reynolds number)

* Cells live in a viscous world, so velocity is roughly proportional to
  force divided by drag. A little momentum smoothing is kept for visual
  continuity.
* A flagellum pushes the cell away from its side of the membrane. An
  off-axis flagellum also adds a small turning torque, which stands in for
  the asymmetric beating a disc-shaped model cannot otherwise produce.
* Cilia rotate the cell and nudge it sideways.
* Collisions are soft repulsions. The dish wall is a hard boundary.
  Optional Brownian jitter adds noise.

## 9. Multicellularity

* A **bond** is a distance constraint (rest length ≈ the sum of the radii)
  plus an angular "shape memory". Each end remembers where on its membrane
  the partner attached, and both cells are nudged to keep that geometry.
  Struts and adhesion knobs make bonds stiffer and stronger.
* A bond **breaks** when it is stretched beyond a strength-dependent
  threshold.
* Bond slots come from Adhesion Knobs: two per knob, up to six.
* **Junction Channels** exchange cytosol between bonded cells using the same
  diffusion rule as the internal network. Their conductance is the
  smaller of the two cells' junction strengths. The circuit gates them,
  not local charge, so a starving cell can still be fed.
* **Organisms** are the connected components of the bond graph. In bonded
  development, daughters stay attached until the organism reaches its size
  limit. After that, new daughters bud off and found new organisms.
* **Differentiation**: each component has a tissue mask. Only components
  expressed in a cell's current tissue work or cost upkeep. Tissue comes from
  the founder setting, the daughter rule (inherit, alternate, cycle, random,
  or daughters become B), or the circuit's "Become tissue" action.

## 10. Reproduction and evolution

* Division happens when the cell is above its division mass and its Codex
  Core is working. It is automatic unless the circuit controls it, with a
  40-tick refractory period.
* **Matter is split exactly in half**: biomass and every buffer.
* **Mutation chance per division** = dish mutation rate × (1 − 0.9 ×
  Codex fidelity). Mutation operators tweak parameters, move parts,
  add/remove/duplicate parts, change the membrane, add/remove conduits,
  rewire or retune the circuit, change tissue expression, or alter the
  development settings. Structural and circuit mutations can be switched
  off.
* Every mutant becomes a **new strain** with a parent link, a depth (the
  number of mutations from its founder) and a human-readable note. Strains
  are a game abstraction for "a distinct blueprint". They are not species.
* **Selection is purely emergent.** Nothing scores fitness. Strains persist
  if they gather resources, survive stress and reproduce better than their
  neighbours.
* To keep memory bounded, the oldest extinct strains with no living
  descendants are forgotten once more than 1,500 are stored.

## 11. Environment

* Sorb and lith are fed into the dish according to a spatial pattern. Feeding
  saturates toward a maximum.
* Murk slowly decomposes back into sorb (recycling) and slowly drains out of
  the dish (a sink).
* Heat relaxes toward a pattern, such as a gradient, vents or a hot rim. The
  heat brushes perturb it temporarily.
* Light is a static pattern, multiplied by an optional day/night cycle, plus
  any lumen sources you place.
* All fields diffuse with simple explicit 4-neighbour stencils, restricted to
  cells inside the dish (no-flux boundary).

## 12. Determinism and the timeline

* All randomness comes from one seeded generator stored in the save. So
  restoring a snapshot and replaying it gives exactly the same result (the
  test suite checks this). Your interventions branch the history.
* Rewinding restores a full snapshot. Later snapshots are discarded, because
  the future can change.

## 13. Things deliberately *not* modelled

Genes and sequences, proteins, chemistry and stoichiometry from real
biology, osmotic pressure, fluid flow, 3D shape, cell-cycle phases, immune
systems, horizontal gene transfer, real pathogens, and any real-world
procedure. BIOFORGE's "biology" exists only to make an interesting systems
sandbox.
