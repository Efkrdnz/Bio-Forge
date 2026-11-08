/**
 * Template organisms. Several are tuned to compete with one another.
 */
import { buildDesign, TISSUE_A, TISSUE_B } from './builder';
import type { CellDesign } from '../design';

export const protocell = (): CellDesign =>
  buildDesign('protocell', 'Protocell', 172, { notes: 'A balanced heterotroph: pores feed a combustor, an assembler grows the cell.' }, (b) => {
    const core = b.add('core', 0, 0);
    const asm = b.add('assembler', 210, 0.4);
    const cb = b.add('combustor', 30, 0.38);
    const p1 = b.add('pore', 60);
    const p2 = b.add('pore', -60);
    const ef = b.add('efflux', 180);
    b.conduit(p1, cb);
    b.conduit(p2, cb);
    b.conduit(cb, ef);
    void core;
    void asm;
  });

export const drifter = (): CellDesign =>
  buildDesign('drifter', 'Drifter', 145, { notes: 'Minimal and cheap. Feeds only through its leaky veil. Breeds fast in rich water.' }, (b) => {
    b.add('core', 0, 0, { divideAt: 2.1, fidelity: 0.2 });
    b.add('assembler', 180, 0.35, { rate: 0.05 });
    b.add('combustor', 0, 0.35, { rate: 0.06 });
  });

export const lumenLeaf = (): CellDesign =>
  buildDesign('lumen-leaf', 'Lumen Leaf', 105, { membrane: 'lattice', notes: 'Phototroph. Photovore plates harvest light; pores only gather building matter.' }, (b) => {
    b.add('core', 0, 0);
    b.add('assembler', 180, 0.3);
    b.add('photovore', 90, 0.5, { area: 1.5 });
    b.add('photovore', -90, 0.5, { area: 1.5 });
    b.add('capacitor', 0, 0.45);
    b.add('pore', 0, 1, { rate: 0.015 });
    b.add('pore', 180, 1, { rate: 0.015 });
  });

export const chemoGlider = (): CellDesign =>
  buildDesign('chemo-glider', 'Chemo Glider', 48, { notes: 'Braitenberg-style forager: each chemoreceptor drives the opposite flagellum, steering it up nutrient gradients.' }, (b) => {
    b.add('core', 0, 0);
    b.add('assembler', 180, 0.35);
    const cb = b.add('combustor', 0, 0.3, { rate: 0.12 });
    const p1 = b.add('pore', 70);
    const p2 = b.add('pore', -70);
    const ef = b.add('efflux', 120);
    b.conduit(cb, ef);
    const cl = b.add('chemoreceptor', 35);
    const cr = b.add('chemoreceptor', -35);
    const fl = b.add('flagellum', 150, 1, { power: 1.1 });
    const fr = b.add('flagellum', -150, 1, { power: 1.1 });
    b.conduit(p1, cb);
    b.conduit(p2, cb);
    // Steering: whichever side smells more food drives the opposite flagellum
    // harder (compare), on top of a steady cruising thrust.
    const sl = b.sensor(cl, 'level', 40, 60);
    const sr = b.sensor(cr, 'level', 40, 200);
    const cmpL = b.node('compare', 200, 40);
    const cmpR = b.node('compare', 200, 220);
    const cruise = b.node('const', 200, 130, { value: 0.35 });
    const mixR = b.node('add', 360, 60);
    const mixL = b.node('add', 360, 200);
    b.wire(sl, cmpL, 0);
    b.wire(sr, cmpL, 1);
    b.wire(sr, cmpR, 0);
    b.wire(sl, cmpR, 1);
    b.wire(cmpL, mixR, 0);
    b.wire(cruise, mixR, 1);
    b.wire(cmpR, mixL, 0);
    b.wire(cruise, mixL, 1);
    b.wire(mixR, b.actuator(fr, 520, 60));
    b.wire(mixL, b.actuator(fl, 520, 200));
  });

export const lysinHunter = (): CellDesign =>
  buildDesign('lysin-hunter', 'Lysin Hunter', 352, { membrane: 'lattice', notes: 'Predator. Proximity sensors steer it toward foreign cells; spikes drain them.' }, (b) => {
    b.add('core', 0, 0, { divideAt: 2.6 });
    b.add('assembler', 180, 0.35, { rate: 0.07 });
    const cb = b.add('combustor', 0, 0.3, { rate: 0.12 });
    b.add('vesicle', 90, 0.45);
    b.add('pore', 100, 1, { rate: 0.01 });
    b.conduit(cb, b.add('efflux', -100));
    const s1 = b.add('spike', 15, 1, { power: 1.3 });
    const s2 = b.add('spike', -15, 1, { power: 1.3 });
    const xl = b.add('proximity', 40, 1, { range: 6 });
    const xr = b.add('proximity', -40, 1, { range: 6 });
    const fl = b.add('flagellum', 160, 1, { power: 1.3 });
    const fr = b.add('flagellum', -160, 1, { power: 1.3 });
    b.conduit(s1, cb);
    b.conduit(s2, cb);
    const nl = b.sensor(xl, 'foreign', 40, 40);
    const nr = b.sensor(xr, 'foreign', 40, 160);
    const osc = b.node('osc', 40, 280, { period: 90, duty: 0.5 });
    const mixL = b.node('add', 210, 40);
    const mixR = b.node('add', 210, 160);
    const half = b.node('gain', 120, 280, { k: 0.45, bias: 0.15 });
    b.wire(osc, half);
    b.wire(nl, mixR, 0);
    b.wire(half, mixR, 1);
    b.wire(nr, mixL, 0);
    b.wire(half, mixL, 1);
    b.wire(mixR, b.actuator(fr, 380, 40));
    b.wire(mixL, b.actuator(fl, 380, 160));
  });

export const filament = (): CellDesign =>
  buildDesign(
    'filament',
    'Filament',
    205,
    { dev: { mode: 'bonded', maxCells: 8, divisionAngle: 0, rotateEach: 0 }, notes: 'Grows as a chain. Junctions share food along the strand; when 8 long, new cells bud off.' },
    (b) => {
      b.add('core', 0, 0);
      b.add('assembler', 90, 0.35);
      const cb = b.add('combustor', -90, 0.35);
      const p1 = b.add('pore', 90);
      const p2 = b.add('pore', -90);
      b.conduit(cb, b.add('efflux', 135));
      b.add('adhesion', 0);
      b.add('adhesion', 180);
      b.add('junction', 30, 1, { conductance: 0.35 });
      b.add('gaprelay', -30);
      b.conduit(p1, cb);
      b.conduit(p2, cb);
    },
  );

export const lumenMat = (): CellDesign =>
  buildDesign(
    'lumen-mat',
    'Lumen Mat',
    128,
    {
      membrane: 'lattice',
      dev: { mode: 'bonded', maxCells: 14, divisionAngle: 60, rotateEach: 120, daughterTissue: 'alternate', tissueNames: ['Leaf', 'Root', 'Gamma', 'Delta'] },
      notes: 'Differentiated sheet: Leaf cells photosynthesise, Root cells feed. Junctions pool everything.',
    },
    (b) => {
      b.add('core', 0, 0);
      b.add('assembler', 180, 0.35);
      b.add('photovore', 60, 0.5, { area: 1.6 }, TISSUE_A);
      b.add('photovore', -60, 0.5, { area: 1.6 }, TISSUE_A);
      b.add('capacitor', 0, 0.45, { size: 1.2 }, TISSUE_A);
      const cb = b.add('combustor', 60, 0.45, { rate: 0.1 }, TISSUE_B);
      const p1 = b.add('pore', 30, 1, { rate: 0.03 }, TISSUE_B);
      const p2 = b.add('pore', -30, 1, { rate: 0.03 }, TISSUE_B);
      b.conduit(cb, b.add('efflux', 150, 1, {}, TISSUE_B));
      b.add('adhesion', 0);
      b.add('adhesion', 120);
      b.add('adhesion', 240);
      b.add('junction', 90, 1, { conductance: 0.45 });
      b.add('junction', -90, 1, { conductance: 0.45 });
      b.conduit(p1, cb);
      b.conduit(p2, cb);
    },
  );

export const pulseSwimmer = (): CellDesign =>
  buildDesign(
    'pulse-swimmer',
    'Pulse Swimmer',
    268,
    {
      dev: { mode: 'bonded', maxCells: 5, divisionAngle: 180, rotateEach: 0, daughterTissue: 'toB', tissueNames: ['Pacemaker', 'Body', 'Gamma', 'Delta'] },
      notes: 'A chain swimmer. The pacemaker head clocks a signal that ripples down the gap relays, beating the body flagella in a travelling wave.',
    },
    (b) => {
      b.add('core', 0, 0);
      b.add('assembler', 90, 0.35);
      const cb = b.add('combustor', -90, 0.35, { rate: 0.12 });
      const p1 = b.add('pore', 60);
      const p2 = b.add('pore', -60);
      b.conduit(cb, b.add('efflux', 120));
      b.add('adhesion', 0);
      b.add('adhesion', 180);
      b.add('junction', 30);
      b.add('gaprelay', -30, 1, { conductance: 0.8 });
      const fl = b.add('flagellum', 150, 1, { power: 1.2 });
      const fr = b.add('flagellum', -150, 1, { power: 1.2 });
      const osc = b.add('oscillator', 180, 0.4, { period: 70, duty: 0.4 }, TISSUE_A);
      b.conduit(p1, cb);
      b.conduit(p2, cb);
      // Pacemaker: oscillator → channel 1. Everyone: channel 1 → flagella.
      const so = b.sensor(osc, 'square', 40, 40);
      const out = b.node('signalOut', 220, 40, { ch: 0 });
      b.wire(so, out);
      const si = b.node('signalIn', 40, 160, { ch: 0 });
      const th = b.node('threshold', 200, 160, { t: 0.55, h: 0.05 });
      b.wire(si, th);
      b.wire(th, b.actuator(fl, 380, 120));
      b.wire(th, b.actuator(fr, 380, 200));
    },
  );

export const murkEater = (): CellDesign =>
  buildDesign('murk-eater', 'Murk Eater', 292, { notes: 'Uses light to refine dish murk into building sorb. Thrives where others pollute.' }, (b) => {
    b.add('core', 0, 0);
    b.add('assembler', 180, 0.35);
    b.add('photovore', 0, 0.5, { area: 1.8 });
    const r1 = b.add('reclaimer', 90, 0.45, { rate: 0.06 });
    b.add('vacuole', -90, 0.45, { size: 1.4 });
    b.add('pore', 120, 1, { select: 2, rate: 0.02 });
    b.add('capacitor', 135, 0.5);
    void r1;
  });

export const sentinel = (): CellDesign =>
  buildDesign('sentinel', 'Keratex Sentinel', 32, { membrane: 'shell', thickness: 1.2, notes: 'Armoured extremophile: survives heat and predators, but grows slowly.' }, (b) => {
    b.add('core', 0, 0, { lifespan: 6000 });
    b.add('assembler', 180, 0.35);
    const cb = b.add('combustor', 0, 0.3, { rate: 0.12 });
    const p1 = b.add('pore', 45, 1, { rate: 0.03 });
    const p2 = b.add('pore', -45, 1, { rate: 0.03 });
    const p3 = b.add('pore', 180, 1, { rate: 0.03 });
    b.conduit(cb, b.add('efflux', 135, 1, { rate: 0.14 }));
    b.add('thermoshield', 90, 0.45);
    b.add('mender', -90, 0.45);
    b.add('armor', 90);
    b.add('armor', -90);
    b.conduit(p1, cb);
    b.conduit(p2, cb);
    b.conduit(p3, cb);
  });

export const echoSwarm = (): CellDesign =>
  buildDesign('echo-swarm', 'Echo Swarmer', 320, { notes: 'Calls kin with Echo B and swims toward the loudest call: forms roaming swarms.' }, (b) => {
    b.add('core', 0, 0);
    b.add('assembler', 180, 0.35);
    const cb = b.add('combustor', 0, 0.3);
    const p1 = b.add('pore', 90);
    const p2 = b.add('pore', -90);
    b.conduit(cb, b.add('efflux', 180));
    const em = b.add('emitter', 135, 1, { channel: 1, rate: 0.25 });
    const el = b.add('echoreceptor', 40, 1, { channel: 1, halfSat: 0.4 });
    const er = b.add('echoreceptor', -40, 1, { channel: 1, halfSat: 0.4 });
    const fl = b.add('flagellum', 160, 1, { power: 0.9 });
    const fr = b.add('flagellum', -160, 1, { power: 0.9 });
    b.conduit(p1, cb);
    b.conduit(p2, cb);
    const sl = b.sensor(el, 'level', 40, 40);
    const sr = b.sensor(er, 'level', 40, 160);
    b.wire(sl, b.actuator(fr, 320, 40));
    b.wire(sr, b.actuator(fl, 320, 160));
    const clk = b.node('osc', 40, 280, { period: 160, duty: 0.3 });
    b.wire(clk, b.actuator(em, 320, 280));
  });

export const blankCell = (): CellDesign =>
  buildDesign('custom', 'New Cell', 190, { notes: 'Start here: add parts from the palette.' }, (b) => {
    b.add('core', 0, 0);
  });

export const TEMPLATE_FACTORIES = [
  protocell,
  drifter,
  lumenLeaf,
  chemoGlider,
  lysinHunter,
  filament,
  lumenMat,
  pulseSwimmer,
  murkEater,
  sentinel,
  echoSwarm,
];

export function templateDesigns(): CellDesign[] {
  return TEMPLATE_FACTORIES.map((f) => f());
}
