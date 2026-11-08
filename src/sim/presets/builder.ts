import { ALL_TISSUES } from '../constants';
import type { ComponentType } from '../components';
import { defaultNodeParams, type NodeKind } from '../circuit';
import { defaultDevelopment, makeComponent, normalizeDesign, type CellDesign, type Development } from '../design';
import type { MembraneType } from '../membranes';

export interface BuildApi {
  /** Add a component; returns its uid. */
  add(type: ComponentType, angleDeg: number, dist?: number, params?: Record<string, number>, tissues?: number): number;
  conduit(a: number, b: number): void;
  node(kind: NodeKind, x: number, y: number, params?: Record<string, number>, ref?: number, port?: string): number;
  wire(from: number, to: number, slot?: number): void;
  sensor(ref: number, port: string, x: number, y: number): number;
  actuator(ref: number, x: number, y: number): number;
}

export function buildDesign(
  id: string,
  name: string,
  hue: number,
  opts: { membrane?: MembraneType; thickness?: number; notes?: string; dev?: Partial<Development> },
  build: (b: BuildApi) => void,
): CellDesign {
  const d: CellDesign = {
    id,
    name,
    hue,
    notes: opts.notes,
    membrane: { type: opts.membrane ?? 'veil', thickness: opts.thickness ?? 1 },
    components: [],
    conduits: [],
    circuit: { nodes: [], wires: [] },
    development: { ...defaultDevelopment(), ...(opts.dev ?? {}) },
  };
  let nid = 1;
  const api: BuildApi = {
    add(type, angleDeg, dist, params, tissues = ALL_TISSUES) {
      return makeComponent(d, type, angleDeg, dist, params, tissues).uid;
    },
    conduit(a, b) {
      d.conduits.push({ a, b });
    },
    node(kind, x, y, params, ref, port) {
      const id2 = nid++;
      d.circuit.nodes.push({ id: id2, kind, x, y, params: { ...defaultNodeParams(kind), ...(params ?? {}) }, ref, port });
      return id2;
    },
    wire(from, to, slot = 0) {
      d.circuit.wires.push({ from, to, slot });
    },
    sensor(ref, port, x, y) {
      return api.node('sensor', x, y, {}, ref, port);
    },
    actuator(ref, x, y) {
      return api.node('actuator', x, y, {}, ref);
    },
  };
  build(api);
  return normalizeDesign(d);
}

export const TISSUE_A = 1;
export const TISSUE_B = 2;
export const TISSUE_C = 4;
export const TISSUE_D = 8;
