/**
 * Single requestAnimationFrame loop: advances the engine and lets visible
 * canvases draw. Rendering is decoupled from React.
 */
import { engine } from './engine';

type FrameFn = (t: number, dt: number) => void;
const renderers = new Set<FrameFn>();
let started = false;
let last = 0;
let uiAcc = 0;

/** Live frame statistics (EMA), shown in the HUD and used by tests. */
export const frameStats = { fps: 60, simMs: 0, renderMs: 0 };
if (typeof window !== 'undefined') (window as unknown as { __frameStats: typeof frameStats }).__frameStats = frameStats;

export function onFrame(fn: FrameFn): () => void {
  renderers.add(fn);
  return () => renderers.delete(fn);
}

export function startLoop() {
  if (started) return;
  started = true;
  const loop = (now: number) => {
    const t = now / 1000;
    const dt = last ? Math.min(0.1, t - last) : 1 / 60;
    last = t;
    const t0 = performance.now();
    engine.frame(dt);
    const t1 = performance.now();
    for (const fn of renderers) {
      try {
        fn(t, dt);
      } catch (e) {
        console.error(e);
      }
    }
    const t2 = performance.now();
    frameStats.simMs += (t1 - t0 - frameStats.simMs) * 0.1;
    frameStats.renderMs += (t2 - t1 - frameStats.renderMs) * 0.1;
    if (dt > 0) frameStats.fps += (1 / dt - frameStats.fps) * 0.05;
    // Notify React-side readouts at ~6 Hz while running
    uiAcc += dt;
    if (uiAcc > 0.16) {
      uiAcc = 0;
      if (engine.running) engine.notify();
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
