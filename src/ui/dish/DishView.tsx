import { useEffect, useRef, useState } from 'react';
import { engine } from '../engine';
import { dishCamera, useEngineVersion, useUI, type Tool } from '../store';
import { onFrame } from '../loop';
import { DishRenderer } from '../../render/dishRenderer';
import { Icon } from '../Icon';
import { Timeline } from './Timeline';
import { SidePanel } from './SidePanel';
import { Objectives } from './Objectives';
import { RAMPS } from '../../render/palette';
import type { FieldOverlay } from '../../render/dishRenderer';
import { kill } from '../../sim/lifecycle';

const TOOLS: { id: Tool; label: string; key: string; icon: string }[] = [
  { id: 'inspect', label: 'Inspect / select (I)', key: 'i', icon: 'inspect' },
  { id: 'pan', label: 'Pan (H)', key: 'h', icon: 'pan' },
  { id: 'inoculate', label: 'Inoculate design (N)', key: 'n', icon: 'inoculate' },
  { id: 'sorb', label: 'Nutrient brush: sorb (S)', key: 's', icon: 'sorb' },
  { id: 'lith', label: 'Mineral brush: lith (L)', key: 'l', icon: 'lith' },
  { id: 'murk', label: 'Toxin brush: murk (M)', key: 'm', icon: 'murk' },
  { id: 'heat', label: 'Heat brush (T)', key: 't', icon: 'heat' },
  { id: 'cool', label: 'Cool brush (C)', key: 'c', icon: 'cool' },
  { id: 'light', label: 'Place lumen source (G) · shift-click removes', key: 'g', icon: 'light' },
  { id: 'cull', label: 'Cull brush (X)', key: 'x', icon: 'cull' },
];

const BRUSH_COLOR: Partial<Record<Tool, string>> = {
  sorb: 'rgba(62,240,198,0.9)',
  lith: 'rgba(255,198,92,0.9)',
  murk: 'rgba(208,92,255,0.9)',
  heat: 'rgba(255,120,60,0.9)',
  cool: 'rgba(90,170,255,0.9)',
  cull: 'rgba(255,84,112,0.9)',
  inoculate: 'rgba(120,255,230,0.9)',
  light: 'rgba(255,240,160,0.9)',
};

const OVERLAYS: { id: FieldOverlay; label: string }[] = [
  { id: 'none', label: 'Natural' },
  { id: 'sorb', label: 'Sorb' },
  { id: 'lith', label: 'Lith' },
  { id: 'murk', label: 'Murk' },
  { id: 'heat', label: 'Heat' },
  { id: 'light', label: 'Light' },
  { id: 'echoA', label: 'EchoA' },
  { id: 'echoB', label: 'EchoB' },
];

const MAGS = [4, 10, 40, 100];

export function DishView() {
  const ui = useUI();
  return (
    <div className="dish-view">
      <div className="toolbar">
        {TOOLS.map((t) => (
          <button key={t.id} className={`tool ${ui.tool === t.id ? 'active' : ''}`} onClick={() => ui.set({ tool: t.id })} aria-label={t.label}>
            <Icon name={t.icon} size={18} />
            <span className="tip">{t.label}</span>
          </button>
        ))}
        <div className="tool-sep" />
        <button className={`tool ${ui.showFlow ? 'active' : ''}`} onClick={() => ui.set({ showFlow: !ui.showFlow })} aria-label="Resource flow overlay">
          <Icon name="conduit" size={18} />
          <span className="tip">Resource-flow overlay (V)</span>
        </button>
        <button className={`tool ${ui.follow ? 'active' : ''}`} onClick={() => ui.set({ follow: !ui.follow })} aria-label="Follow selected">
          <Icon name="follow" size={18} />
          <span className="tip">Follow selected cell (F)</span>
        </button>
      </div>
      <Stage />
      <SidePanel />
      <Timeline />
    </div>
  );
}

function Stage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef(new DishRenderer());
  const pointer = useRef({ x: 0, y: 0, wx: 0, wy: 0, down: false, button: 0, panning: false, lastX: 0, lastY: 0, moved: 0, shift: false, inside: false });
  const [hoverId, setHoverId] = useState<number | null>(null);
  const hoverRef = useRef<number | null>(null);
  useEngineVersion();
  const ui = useUI();
  const uiRef = useRef(ui);
  uiRef.current = ui;

  // Fit dish on first mount / world change
  const epoch = engine.worldEpoch;
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    dishCamera.setViewport(r.width, r.height);
    if (!(dishCamera as unknown as { _fitted?: number })._fitted || (dishCamera as unknown as { _fitted?: number })._fitted !== epoch) {
      dishCamera.fit(engine.world.env.cx, engine.world.env.cy, engine.world.env.R);
      (dishCamera as unknown as { _fitted?: number })._fitted = epoch;
    }
  }, [epoch]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const stage = stageRef.current!;
    const ctx = canvas.getContext('2d', { alpha: false })!;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      dishCamera.setViewport(r.width, r.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);

    let brushAcc = 0;
    const off = onFrame((t, dt) => {
      const u = uiRef.current;
      const w = engine.world;
      const p = pointer.current;
      // Follow cam
      if (u.follow && u.selectedId !== null) {
        const c = w.cellById(u.selectedId);
        if (c) dishCamera.flyTo(c.x, c.y);
      }
      dishCamera.update(dt);
      // Continuous brushes
      if (p.down && !p.panning && p.button === 0) {
        brushAcc += dt;
        if (brushAcc > 1 / 30) {
          const k = Math.min(3, Math.round(brushAcc * 30));
          brushAcc = 0;
          applyBrush(u.tool, p.wx, p.wy, u.brushRadius, k);
        }
      }
      // hover pick (cheap)
      if (p.inside && !p.down) {
        const hc = w.hash.pick(p.wx, p.wy, 4 / dishCamera.zoom);
        const id = hc ? hc.id : null;
        if (id !== hoverRef.current) {
          hoverRef.current = id;
          setHoverId(id);
        }
      }
      const dpr = canvas.width / Math.max(1, dishCamera.width);
      const showBrush = u.tool !== 'inspect' && u.tool !== 'pan' && p.inside;
      rendererRef.current.render(
        ctx,
        w,
        dishCamera,
        {
          overlay: u.overlay,
          colorMode: u.colorMode,
          showFlow: u.showFlow,
          showParticles: u.showParticles,
          showBonds: u.showBonds,
          selectedId: u.selectedId,
          hoverId: hoverRef.current,
          brush: showBrush ? { x: p.wx, y: p.wy, r: u.tool === 'inoculate' ? 20 + u.inoculateCount * 4 : u.tool === 'light' ? 120 : u.brushRadius, color: BRUSH_COLOR[u.tool] ?? '#fff' } : null,
          highlightRoot: u.highlightRoot,
          quality: u.quality,
        },
        t,
        dt,
        dpr,
      );
    });
    return () => {
      off();
      ro.disconnect();
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const u = useUI.getState();
      if (u.view !== 'dish') return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        engine.running = !engine.running;
        engine.notify();
        e.preventDefault();
        return;
      }
      if (k === '.') {
        engine.running = false;
        engine.step(1);
        return;
      }
      const tool = TOOLS.find((t) => t.key === k);
      if (tool && !e.ctrlKey && !e.metaKey) return u.set({ tool: tool.id });
      if (k === 'v') return u.set({ showFlow: !u.showFlow });
      if (k === 'f') return u.set({ follow: !u.follow });
      if (k === 'escape') return u.set({ selectedId: null, follow: false });
      if (k === '[') return u.set({ brushRadius: Math.max(10, u.brushRadius - 10) });
      if (k === ']') return u.set({ brushRadius: Math.min(300, u.brushRadius + 10) });
      if (['1', '2', '3', '4'].includes(k)) setMag(MAGS[Number(k) - 1]);
      if ((k === 'delete' || k === 'backspace') && u.selectedId !== null) {
        const c = engine.world.cellById(u.selectedId);
        if (c) {
          kill(engine.world, c, 'culled');
          engine.world.purgeDead();
        }
        u.set({ selectedId: null });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function setMag(m: number) {
    const u = useUI.getState();
    const sel = u.selectedId !== null ? engine.world.cellById(u.selectedId) : null;
    const target = m / 10;
    if (sel) dishCamera.flyTo(sel.x, sel.y, target);
    else dishCamera.flyTo(dishCamera.tx, dishCamera.ty, target);
  }

  function applyBrush(tool: Tool, x: number, y: number, r: number, k: number) {
    const w = engine.world;
    switch (tool) {
      case 'sorb':
        w.brush('sorb', x, y, r, 0.35 * k);
        break;
      case 'lith':
        w.brush('lith', x, y, r, 0.2 * k);
        break;
      case 'murk':
        w.brush('murk', x, y, r, 0.4 * k);
        break;
      case 'heat':
        w.brush('heat', x, y, r, 0.02 * k);
        break;
      case 'cool':
        w.brush('heat', x, y, r, -0.02 * k);
        break;
      case 'cull':
        w.cull(x, y, r);
        break;
    }
  }

  function updatePointer(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const p = pointer.current;
    p.x = e.clientX - rect.left;
    p.y = e.clientY - rect.top;
    const [wx, wy] = dishCamera.toWorld(p.x, p.y);
    p.wx = wx;
    p.wy = wy;
    p.shift = e.shiftKey;
  }

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePointer(e);
    const p = pointer.current;
    p.down = true;
    p.button = e.button;
    p.lastX = p.x;
    p.lastY = p.y;
    p.moved = 0;
    const u = useUI.getState();
    p.panning = e.button !== 0 || u.tool === 'pan' || (u.tool === 'inspect' && !engine.world.hash.pick(p.wx, p.wy, 4 / dishCamera.zoom));
    if (e.button === 0 && !p.panning) {
      const w = engine.world;
      if (u.tool === 'inoculate') {
        const d = engine.allDesigns().find((x) => x.id === u.inoculateId);
        if (d) {
          w.registerDesign(d);
          const got = w.inoculate(w.designs.get(d.id)!, u.inoculateCount, p.wx, p.wy, 10 + u.inoculateCount * 4);
          u.toast(got.length ? `Inoculated ${got.length} × ${d.name}` : 'Population cap reached', got.length ? 'good' : 'warn');
          engine.notify();
        }
        p.down = false;
      } else if (u.tool === 'light') {
        const env = w.env;
        if (e.shiftKey) {
          let best = -1;
          let bd = Infinity;
          env.lightSources.forEach((s, i) => {
            const d = Math.hypot(s.x - p.wx, s.y - p.wy);
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          if (best >= 0 && bd < 200) env.lightSources.splice(best, 1);
        } else env.lightSources.push({ x: p.wx, y: p.wy, r: 120, s: 1 });
        env.updatePatterns(w.params, true);
        p.down = false;
      } else if (u.tool === 'inspect') {
        const c = w.hash.pick(p.wx, p.wy, 4 / dishCamera.zoom);
        u.set({ selectedId: c ? c.id : null, sideTab: c ? 'inspector' : u.sideTab });
        p.down = false;
      } else {
        applyBrush(u.tool, p.wx, p.wy, u.brushRadius, 1);
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    updatePointer(e);
    const p = pointer.current;
    p.inside = true;
    if (p.down && p.panning) {
      dishCamera.pan(p.x - p.lastX, p.y - p.lastY);
      p.moved += Math.abs(p.x - p.lastX) + Math.abs(p.y - p.lastY);
      p.lastX = p.x;
      p.lastY = p.y;
      if (useUI.getState().follow) useUI.getState().set({ follow: false });
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const p = pointer.current;
    if (p.down && p.panning && p.moved < 4 && useUI.getState().tool === 'inspect' && e.button === 0) {
      useUI.getState().set({ selectedId: null });
    }
    p.down = false;
    p.panning = false;
  };

  const onWheel = (e: React.WheelEvent) => {
    updatePointer(e as unknown as React.PointerEvent);
    const f = Math.exp(-e.deltaY * 0.0015);
    dishCamera.zoomAt(pointer.current.x, pointer.current.y, f, true);
  };

  const hoverCell = hoverId !== null ? engine.world.cellById(hoverId) : null;
  const w = engine.world;
  const s = w.stats();
  const mag = dishCamera.zoom * 10;
  return (
    <div className="stage" ref={stageRef}>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (pointer.current.inside = false)}
        onWheel={onWheel}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: ui.tool === 'pan' ? 'grab' : ui.tool === 'inspect' ? (hoverCell ? 'pointer' : 'default') : 'crosshair' }}
        data-testid="dish-canvas"
      />
      <div className="hud tl">
        <div className="panel bracket readout">
          <span>Tick</span>
          <span>{w.tick.toLocaleString()}</span>
          <span>Cells</span>
          <span>{s.cells}</span>
          <span>Organisms</span>
          <span>{s.organisms}</span>
          <span>Strains</span>
          <span>{s.strains}</span>
          <span>Biomass</span>
          <span>{s.biomass.toFixed(0)}</span>
          <span>Charge flux</span>
          <span style={{ color: 'var(--good)' }}>+{s.energyIn.toFixed(1)}</span>
          <span>Charge use</span>
          <span style={{ color: 'var(--danger)' }}>−{s.energyOut.toFixed(1)}</span>
          <span>Sim rate</span>
          <span>{engine.running ? `${engine.tps.toFixed(0)} t/s` : 'paused'}</span>
        </div>
        {hoverCell && (
          <div className="panel readout" style={{ marginTop: 6 }}>
            <span>Hover</span>
            <span style={{ color: `hsl(${hoverCell.strain.hue},90%,70%)` }}>{hoverCell.strain.name}</span>
            <span>Mass</span>
            <span>{hoverCell.mass.toFixed(1)}</span>
            <span>Integrity</span>
            <span>{((hoverCell.integrity / hoverCell.maxIntegrity) * 100).toFixed(0)}%</span>
          </div>
        )}
      </div>
      <div className="hud tc">
        <div className="panel overlay-bar">
          {OVERLAYS.map((o) => (
            <button key={o.id} className={ui.overlay === o.id ? 'on' : ''} onClick={() => ui.set({ overlay: o.id })}>
              {o.label}
            </button>
          ))}
          <span className="sep" />
          {(['strain', 'tissue', 'health'] as const).map((m) => (
            <button key={m} className={ui.colorMode === m ? 'on' : ''} onClick={() => ui.set({ colorMode: m })}>
              {m}
            </button>
          ))}
        </div>
        {ui.overlay !== 'none' && <Legend overlay={ui.overlay} />}
        {ui.highlightRoot && (
          <div className="panel legend" style={{ justifyContent: 'center' }}>
            Highlighting lineage <b style={{ color: 'var(--accent)' }}>{ui.highlightRoot}</b>
            <button className="btn small" onClick={() => ui.set({ highlightRoot: null })}>
              clear
            </button>
          </div>
        )}
      </div>
      <div className="hud tr">
        <Objectives />
      </div>
      <div className="hud bl">
        <div className="panel bracket microscope">
          <div className="mag-label">
            <span>{mag < 10 ? mag.toFixed(1) : mag.toFixed(0)}×</span>
            <small>OBJECTIVE</small>
          </div>
          <div className="mag-buttons">
            {MAGS.map((m) => (
              <button key={m} className={Math.abs(mag - m) / m < 0.15 ? 'on' : ''} onClick={() => setMag(m)}>
                {m}×
              </button>
            ))}
          </div>
          <input
            type="range"
            min={Math.log(dishCamera.minZoom)}
            max={Math.log(dishCamera.maxZoom)}
            step={0.01}
            value={Math.log(dishCamera.tzoom)}
            onChange={(e) => dishCamera.flyTo(dishCamera.tx, dishCamera.ty, Math.exp(Number(e.target.value)))}
            aria-label="Zoom"
          />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <button className="btn small" onClick={() => dishCamera.fit(w.env.cx, w.env.cy, w.env.R)}>
              Fit dish
            </button>
            <button className={`btn small ${ui.quality === 'high' ? 'on' : ''}`} onClick={() => ui.set({ quality: ui.quality === 'high' ? 'low' : 'high' })}>
              {ui.quality === 'high' ? 'HQ' : 'Fast'}
            </button>
          </div>
        </div>
      </div>
      <ToolOptions />
    </div>
  );
}

function Legend({ overlay }: { overlay: FieldOverlay }) {
  const key = overlay === 'echoA' || overlay === 'echoB' ? 'echo' : overlay;
  const stops = RAMPS[key];
  if (!stops) return null;
  const grad = `linear-gradient(90deg, ${stops.map((s) => `rgb(${s.join(',')})`).join(',')})`;
  const labels: Record<string, [string, string]> = {
    sorb: ['empty', 'saturated'],
    lith: ['empty', 'saturated'],
    murk: ['clean', 'toxic'],
    heat: ['cold', 'hot'],
    light: ['dark', 'bright'],
    echo: ['silent', 'loud'],
  };
  const [a, b] = labels[key] ?? ['low', 'high'];
  return (
    <div className="panel legend" style={{ justifyContent: 'center' }}>
      <span className="dim">{a}</span>
      <div className="ramp" style={{ background: grad }} />
      <span className="dim">{b}</span>
      {key === 'heat' && <span className="dim">· comfort ≈ 0.5</span>}
    </div>
  );
}

function ToolOptions() {
  const ui = useUI();
  useEngineVersion();
  if (ui.tool === 'inspect' || ui.tool === 'pan') return null;
  const designs = engine.allDesigns();
  return (
    <div className="hud br">
      <div className="panel bracket" style={{ padding: 10, width: 250 }}>
        <div className="section-title">{TOOLS.find((t) => t.id === ui.tool)?.label.split('(')[0]}</div>
        {ui.tool === 'inoculate' ? (
          <div className="col">
            <select value={ui.inoculateId} onChange={(e) => ui.set({ inoculateId: e.target.value })} aria-label="Design to inoculate">
              {designs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <div className="param">
              <label>Cells per click</label>
              <input type="range" min={1} max={30} value={ui.inoculateCount} onChange={(e) => ui.set({ inoculateCount: Number(e.target.value) })} />
              <span className="val">{ui.inoculateCount}</span>
            </div>
            <div className="tiny dim">Click in the dish to release cells.</div>
          </div>
        ) : ui.tool === 'light' ? (
          <div className="tiny dim">Click to place a lumen source; shift-click near one to remove it. Sources: {engine.world.env.lightSources.length}</div>
        ) : (
          <div className="param">
            <label>Brush radius</label>
            <input type="range" min={10} max={300} value={ui.brushRadius} onChange={(e) => ui.set({ brushRadius: Number(e.target.value) })} />
            <span className="val">{ui.brushRadius}</span>
          </div>
        )}
      </div>
    </div>
  );
}
