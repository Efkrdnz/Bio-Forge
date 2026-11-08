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
    engine.frame(dt);
    for (const fn of renderers) {
      try {
        fn(t, dt);
      } catch (e) {
        console.error(e);
      }
    }
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
