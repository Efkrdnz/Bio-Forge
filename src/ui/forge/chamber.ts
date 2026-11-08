/**
 * Test Chamber: a tiny private World that runs the design being forged so the
 * editor can show live behaviour (and live circuit values).
 */
import { World } from '../../sim/world';
import { cloneDesign, type CellDesign } from '../../sim/design';
import type { Cell } from '../../sim/cell';

export interface ChamberSettings {
  sorb: number;
  light: number;
  heat: number;
  pattern: 'uniform' | 'gradient';
}

export const chamberSettings: ChamberSettings = { sorb: 0.6, light: 0.8, heat: 0.5, pattern: 'uniform' };

class Chamber {
  world: World | null = null;
  designJson = '';
  focusId: number | null = null;
  running = true;
  speed = 1;
  private acc = 0;

  reset(d: CellDesign) {
    const s = chamberSettings;
    const w = new World({
      seed: 5,
      gridW: 44,
      gridH: 44,
      fill: s.sorb,
      params: {
        feedRate: 0.004 * s.sorb,
        lithFeedRate: 0.002 * s.sorb,
        feedPattern: s.pattern,
        lightIntensity: s.light,
        baseHeat: s.heat,
        mutationRate: 0,
        maxPopulation: 60,
        maxSorb: 8,
      },
    });
    const copy = cloneDesign(d);
    w.registerDesign(copy);
    const cells = w.inoculate(copy, 1, w.env.cx, w.env.cy, 0);
    this.focusId = cells[0]?.id ?? null;
    this.world = w;
    this.designJson = JSON.stringify(d);
    this.acc = 0;
  }

  ensure(d: CellDesign) {
    const j = JSON.stringify(d);
    if (!this.world || j !== this.designJson) this.reset(d);
  }

  frame(dt: number) {
    if (!this.world || !this.running) return;
    this.acc += Math.min(0.1, dt) * 30 * this.speed;
    let n = 0;
    while (this.acc >= 1 && n < 40) {
      this.world.step();
      this.acc -= 1;
      n++;
    }
  }

  /** The cell the editor tracks (falls back to the oldest living cell). */
  focus(): Cell | null {
    const w = this.world;
    if (!w) return null;
    let c = this.focusId !== null ? w.cellById(this.focusId) : undefined;
    if (!c && w.cells.length) {
      c = w.cells[0];
      this.focusId = c.id;
    }
    return c ?? null;
  }

  /** Live circuit values if the chamber is running exactly this design. */
  liveValues(d: CellDesign): Float32Array | null {
    if (!this.world || JSON.stringify(d) !== this.designJson) return null;
    const c = this.focus();
    return c ? c.circuit.values : null;
  }
}

export const chamber = new Chamber();
