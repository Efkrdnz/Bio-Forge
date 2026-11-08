import { create } from 'zustand';
import { useEffect, useState, useSyncExternalStore } from 'react';
import type { CellDesign } from '../sim/design';
import type { ColorMode, FieldOverlay } from '../render/dishRenderer';
import { engine } from './engine';
import { protocell } from '../sim/presets/designs';
import { Camera } from '../render/camera';

export type View = 'dish' | 'forge' | 'lineage' | 'lab';
export type Tool = 'inspect' | 'pan' | 'inoculate' | 'sorb' | 'lith' | 'murk' | 'heat' | 'cool' | 'cull' | 'light';
export type ForgeTab = 'layout' | 'circuit' | 'development';
export type SideTab = 'inspector' | 'environment' | 'population';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'warn';
}

interface UIState {
  view: View;
  tool: Tool;
  sideTab: SideTab;
  overlay: FieldOverlay;
  colorMode: ColorMode;
  showFlow: boolean;
  showParticles: boolean;
  showBonds: boolean;
  quality: 'high' | 'low';
  selectedId: number | null;
  follow: boolean;
  brushRadius: number;
  inoculateId: string;
  inoculateCount: number;
  highlightRoot: string | null;
  forgeDesign: CellDesign;
  forgeTab: ForgeTab;
  forgeSelected: number | null;
  forgeTissue: number;
  forgeDirty: boolean;
  lineageSelected: number | null;
  toasts: Toast[];
  set: (p: Partial<UIState>) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
}

let toastId = 1;

export const useUI = create<UIState>((set, get) => ({
  view: 'dish',
  tool: 'inspect',
  sideTab: 'inspector',
  overlay: 'none',
  colorMode: 'strain',
  showFlow: false,
  showParticles: true,
  showBonds: true,
  quality: 'high',
  selectedId: null,
  follow: false,
  brushRadius: 50,
  inoculateId: 'protocell',
  inoculateCount: 5,
  highlightRoot: null,
  forgeDesign: protocell(),
  forgeTab: 'layout',
  forgeSelected: null,
  forgeTissue: 0,
  forgeDirty: false,
  lineageSelected: null,
  toasts: [],
  set: (p) => set(p),
  toast: (text, kind = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts, { id, text, kind }].slice(-4) });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3800);
  },
}));

if (typeof window !== 'undefined') (window as unknown as { __bioforgeUI: () => UIState }).__bioforgeUI = () => useUI.getState();

/** Shared microscope camera for the dish view. */
export const dishCamera = new Camera();
if (typeof window !== 'undefined') (window as unknown as { bioforgeCam: Camera }).bioforgeCam = dishCamera;

/** Re-render the calling component whenever the engine notifies. */
export function useEngineVersion(): number {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.version,
  );
}

/** Re-render the calling component at a fixed rate (for live readouts). */
export function useTicker(hz = 8): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
  return n;
}
