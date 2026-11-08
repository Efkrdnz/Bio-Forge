import { useEffect, useRef } from 'react';
import { useTicker, useUI } from '../store';
import { onFrame } from '../loop';
import { DishRenderer } from '../../render/dishRenderer';
import { Camera } from '../../render/camera';
import { chamber, chamberSettings } from './chamber';
import { R_CHARGE } from '../../sim/constants';

export function TestChamber() {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const renderer = useRef(new DishRenderer(160));
  const cam = useRef(new Camera());
  const ui = useUI();
  useTicker(6);
  const d = ui.forgeDesign;

  // (Re)start the chamber when the design changes (debounced)
  useEffect(() => {
    const id = setTimeout(() => chamber.ensure(d), 250);
    return () => clearTimeout(id);
  }, [d]);

  useEffect(() => {
    const canvas = ref.current!;
    const el = wrap.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    let fitted = false;
    const off = onFrame((t, dt) => {
      if (useUI.getState().view !== 'forge') return;
      if (!chamber.world) chamber.ensure(useUI.getState().forgeDesign);
      chamber.frame(dt);
      const w = chamber.world!;
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(r.width * dpr) || canvas.height !== Math.round(r.height * dpr)) {
        canvas.width = Math.round(r.width * dpr);
        canvas.height = Math.round(r.height * dpr);
        fitted = false;
      }
      cam.current.setViewport(r.width, r.height);
      if (!fitted) {
        cam.current.fit(w.env.cx, w.env.cy, w.env.R);
        fitted = true;
      }
      const f = chamber.focus();
      if (f && useUI.getState().forgeTab !== 'development') {
        cam.current.flyTo(f.x, f.y, Math.max(cam.current.minZoom * 1.6, 3.2 * (12 / f.radius)));
      } else cam.current.flyTo(w.env.cx, w.env.cy, cam.current.minZoom / 0.6);
      cam.current.update(dt);
      renderer.current.render(
        ctx,
        w,
        cam.current,
        { overlay: 'none', colorMode: 'tissue', showFlow: false, showParticles: true, showBonds: true, selectedId: null, hoverId: null, quality: 'high' },
        t,
        dt,
        canvas.width / Math.max(1, r.width),
      );
    });
    return off;
  }, []);

  const w = chamber.world;
  const f = chamber.focus();
  let net = 0;
  if (f) for (let i = 0; i < f.eGen.length; i++) net += f.eGen[i] - f.eUse[i];
  const setS = (k: keyof typeof chamberSettings, v: number | string) => {
    (chamberSettings as unknown as Record<string, number | string>)[k] = v;
    chamber.reset(useUI.getState().forgeDesign);
  };
  return (
    <div>
      <div ref={wrap} className="chamber" data-testid="test-chamber">
        <canvas ref={ref} />
        <div style={{ position: 'absolute', left: 6, top: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)', lineHeight: 1.5 }}>
          <div style={{ color: 'var(--accent)' }}>TEST CHAMBER · t{w?.tick ?? 0}</div>
          <div>cells {w?.cells.length ?? 0}</div>
          {f ? (
            <>
              <div>
                mass {f.mass.toFixed(1)}/{f.cd.divideMass.toFixed(0)}
              </div>
              <div>charge {f.total(R_CHARGE).toFixed(1)}</div>
              <div style={{ color: net >= 0 ? 'var(--good)' : 'var(--danger)' }}>net {(net * 1000).toFixed(1)} mC/t</div>
            </>
          ) : (
            <div style={{ color: 'var(--danger)' }}>{w && w.tick > 5 ? 'extinct' : '…'}</div>
          )}
        </div>
      </div>
      <div className="param" style={{ marginTop: 6 }}>
        <label>Nutrients</label>
        <input type="range" min={0} max={1.2} step={0.05} defaultValue={chamberSettings.sorb} onChange={(e) => setS('sorb', Number(e.target.value))} />
        <span className="val">{chamberSettings.sorb.toFixed(2)}</span>
      </div>
      <div className="param">
        <label>Light</label>
        <input type="range" min={0} max={1.5} step={0.05} defaultValue={chamberSettings.light} onChange={(e) => setS('light', Number(e.target.value))} />
        <span className="val">{chamberSettings.light.toFixed(2)}</span>
      </div>
      <div className="param">
        <label>Heat</label>
        <input type="range" min={0} max={1} step={0.02} defaultValue={chamberSettings.heat} onChange={(e) => setS('heat', Number(e.target.value))} />
        <span className="val">{chamberSettings.heat.toFixed(2)}</span>
      </div>
      <div className="row">
        <button className="btn small" onClick={() => chamber.reset(useUI.getState().forgeDesign)}>
          Restart
        </button>
        <button className={`btn small ${chamberSettings.pattern === 'gradient' ? 'on' : ''}`} onClick={() => setS('pattern', chamberSettings.pattern === 'gradient' ? 'uniform' : 'gradient')}>
          Gradient
        </button>
        <button
          className={`btn small ${chamber.speed > 1 ? 'on' : ''}`}
          onClick={() => {
            chamber.speed = chamber.speed > 1 ? 1 : 6;
          }}
        >
          {chamber.speed > 1 ? '6×' : '1×'}
        </button>
      </div>
    </div>
  );
}
