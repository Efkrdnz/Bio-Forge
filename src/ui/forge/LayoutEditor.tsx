import { useEffect, useRef, useState } from 'react';
import { useUI } from '../store';
import { onFrame } from '../loop';
import { drawCell, lookFromDesign, type CellLook } from '../../render/cellDraw';
import { COMPONENT_DEFS, type ComponentType } from '../../sim/components';
import { TAU } from '../../sim/constants';
import { addComponentAt, edit, removeComponent, toggleConduit } from './designOps';
import type { CellDesign } from '../../sim/design';
import { TISSUE_COLORS } from '../../render/palette';

interface Geo {
  cx: number;
  cy: number;
  R: number;
}

function compScreen(d: CellDesign, uid: number, g: Geo): [number, number] | null {
  const c = d.components.find((x) => x.uid === uid);
  if (!c) return null;
  const m = COMPONENT_DEFS[c.type].placement === 'membrane' ? 1 : 0.92;
  return [g.cx + Math.cos(c.angle) * c.dist * m * g.R, g.cy + Math.sin(c.angle) * c.dist * m * g.R];
}

function hitComp(d: CellDesign, x: number, y: number, g: Geo): number | null {
  let best: number | null = null;
  let bd = Infinity;
  for (const c of d.components) {
    const p = compScreen(d, c.uid, g)!;
    const dd = Math.hypot(p[0] - x, p[1] - y);
    const lim = g.R * (COMPONENT_DEFS[c.type].placement === 'membrane' ? 0.1 : c.type === 'core' ? 0.22 : 0.11);
    if (dd < lim && dd < bd) {
      bd = dd;
      best = c.uid;
    }
  }
  return best;
}

export function LayoutEditor({ conduitMode }: { conduitMode: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const ui = useUI();
  const uiRef = useRef(ui);
  uiRef.current = ui;
  const conduitRef = useRef(conduitMode);
  conduitRef.current = conduitMode;
  const geo = useRef<Geo>({ cx: 300, cy: 300, R: 200 });
  const drag = useRef<{ uid: number | null; mode: 'move' | 'conduit' | null; x: number; y: number; moved: boolean }>({ uid: null, mode: null, x: 0, y: 0, moved: false });
  const [hover, setHover] = useState<{ uid: number; x: number; y: number } | null>(null);
  const lookCache = useRef<{ d: CellDesign | null; tissue: number; look: CellLook | null }>({ d: null, tissue: -1, look: null });

  useEffect(() => {
    const canvas = ref.current!;
    const el = wrap.current!;
    const ctx = canvas.getContext('2d')!;
    const resize = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      geo.current = { cx: r.width / 2, cy: r.height / 2 + 6, R: Math.min(r.width, r.height) * 0.33 };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const off = onFrame((t) => {
      const u = uiRef.current;
      const d = u.forgeDesign;
      const g = geo.current;
      const dpr = canvas.width / Math.max(1, el.clientWidth);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = el.clientWidth;
      const H = el.clientHeight;
      // backdrop
      const bg = ctx.createRadialGradient(g.cx, g.cy, 0, g.cx, g.cy, Math.max(W, H) * 0.7);
      bg.addColorStop(0, '#08202a');
      bg.addColorStop(1, '#02060a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      // polar blueprint grid
      ctx.strokeStyle = 'rgba(80,220,230,0.08)';
      ctx.lineWidth = 1;
      for (const k of [0.25, 0.5, 0.75, 1, 1.35]) {
        ctx.beginPath();
        ctx.arc(g.cx, g.cy, g.R * k, 0, TAU);
        ctx.stroke();
      }
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * TAU;
        ctx.beginPath();
        ctx.moveTo(g.cx + Math.cos(a) * g.R * 0.25, g.cy + Math.sin(a) * g.R * 0.25);
        ctx.lineTo(g.cx + Math.cos(a) * g.R * (k % 6 === 0 ? 1.5 : 1.38), g.cy + Math.sin(a) * g.R * (k % 6 === 0 ? 1.5 : 1.38));
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(120,230,230,0.45)';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * TAU;
        ctx.fillText(`${k * 90}°`, g.cx + Math.cos(a) * g.R * 1.58, g.cy + Math.sin(a) * g.R * 1.58 + 3);
      }
      // heading arrow
      ctx.strokeStyle = 'rgba(62,240,198,0.5)';
      ctx.fillStyle = 'rgba(62,240,198,0.7)';
      ctx.beginPath();
      ctx.moveTo(g.cx + g.R * 1.62, g.cy - 22);
      ctx.lineTo(g.cx + g.R * 1.62 + 30, g.cy - 22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(g.cx + g.R * 1.62 + 36, g.cy - 22);
      ctx.lineTo(g.cx + g.R * 1.62 + 28, g.cy - 27);
      ctx.lineTo(g.cx + g.R * 1.62 + 28, g.cy - 17);
      ctx.fill();
      ctx.fillText('FRONT', g.cx + g.R * 1.62 + 16, g.cy - 30);

      // the cell
      const lc = lookCache.current;
      if (lc.d !== d || lc.tissue !== u.forgeTissue) {
        lc.look = lookFromDesign(d, 0, 0, 1, u.forgeTissue);
        lc.d = d;
        lc.tissue = u.forgeTissue;
      }
      const L = lc.look!;
      L.x = g.cx;
      L.y = g.cy;
      L.r = g.R;
      ctx.textAlign = 'left';
      drawCell(ctx, L, { t, zoom: 1, highlightUid: u.forgeSelected ?? undefined, ghost: true });

      // selection & labels
      for (const c of d.components) {
        const p = compScreen(d, c.uid, g)!;
        const def = COMPONENT_DEFS[c.type];
        const sel = c.uid === u.forgeSelected;
        const expressed = (c.tissues & (1 << u.forgeTissue)) !== 0;
        if (sel || (hoverRef.current && hoverRef.current.uid === c.uid)) {
          ctx.strokeStyle = sel ? 'rgba(255,255,255,0.9)' : 'rgba(200,255,250,0.5)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(p[0], p[1], g.R * (c.type === 'core' ? 0.27 : 0.12), 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // glyph tags
        const lx = p[0] + Math.cos(c.angle) * g.R * (def.placement === 'membrane' ? 0.32 : 0.0) + (def.placement === 'membrane' ? 0 : g.R * 0.1);
        const ly = p[1] + Math.sin(c.angle) * g.R * (def.placement === 'membrane' ? 0.32 : 0.0) - (def.placement === 'membrane' ? 0 : g.R * 0.1);
        ctx.font = '600 9px JetBrains Mono, monospace';
        const tw = ctx.measureText(def.glyph).width + 6;
        ctx.globalAlpha = expressed ? 0.9 : 0.35;
        ctx.fillStyle = def.color;
        ctx.fillRect(lx - tw / 2, ly - 6, tw, 12);
        ctx.fillStyle = '#02060a';
        ctx.textAlign = 'center';
        ctx.fillText(def.glyph, lx, ly + 3);
        ctx.globalAlpha = 1;
        // tissue dots
        let k = 0;
        for (let tt = 0; tt < 4; tt++) {
          if (!(c.tissues & (1 << tt))) continue;
          ctx.fillStyle = TISSUE_COLORS[tt];
          ctx.beginPath();
          ctx.arc(lx - tw / 2 + 3 + k * 5, ly + 9, 1.8, 0, TAU);
          ctx.fill();
          k++;
        }
      }
      // in-progress conduit
      const dr = drag.current;
      if (dr.mode === 'conduit' && dr.uid !== null) {
        const p = compScreen(d, dr.uid, g);
        if (p) {
          ctx.strokeStyle = 'rgba(160,240,255,0.8)';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(dr.x, dr.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      ctx.textAlign = 'left';
    });
    return () => {
      off();
      ro.disconnect();
    };
  }, []);

  const hoverRef = useRef(hover);
  hoverRef.current = hover;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const u = useUI.getState();
      if (u.view !== 'forge' || u.forgeTab !== 'layout') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && u.forgeSelected !== null) removeComponent(u.forgeSelected);
      if (e.key === 'Escape') u.set({ forgeSelected: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const placeFromPoint = (x: number, y: number, membrane: boolean): [number, number] => {
    const g = geo.current;
    const dx = x - g.cx;
    const dy = y - g.cy;
    const a = Math.atan2(dy, dx);
    const dist = membrane ? 1 : Math.min(0.75, Math.hypot(dx, dy) / (g.R * 0.92));
    // snap angle to 5°
    const snap = (Math.round((a * 180) / Math.PI / 5) * 5 * Math.PI) / 180;
    return [snap, dist];
  };

  const onDown = (e: React.PointerEvent) => {
    const [x, y] = local(e);
    const d = useUI.getState().forgeDesign;
    const uid = hitComp(d, x, y, geo.current);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (uid === null) {
      useUI.getState().set({ forgeSelected: null });
      return;
    }
    useUI.getState().set({ forgeSelected: uid });
    drag.current = { uid, mode: conduitRef.current || e.altKey ? 'conduit' : 'move', x, y, moved: false };
  };

  const onMove = (e: React.PointerEvent) => {
    const [x, y] = local(e);
    const d = useUI.getState().forgeDesign;
    const dr = drag.current;
    if (dr.mode === 'move' && dr.uid !== null) {
      if (!dr.moved && Math.hypot(x - dr.x, y - dr.y) < 3) return;
      dr.moved = true;
      const c = d.components.find((k) => k.uid === dr.uid);
      if (!c) return;
      const [a, dist] = placeFromPoint(x, y, COMPONENT_DEFS[c.type].placement === 'membrane');
      if (Math.abs(a - c.angle) > 1e-6 || Math.abs(dist - c.dist) > 1e-3)
        edit((dd) => {
          const cc = dd.components.find((k) => k.uid === dr.uid)!;
          cc.angle = a;
          cc.dist = c.type === 'core' ? Math.min(dist, 0.3) : dist;
        });
    } else if (dr.mode === 'conduit') {
      dr.x = x;
      dr.y = y;
    } else {
      const uid = hitComp(d, x, y, geo.current);
      if ((uid ?? -1) !== (hover?.uid ?? -1)) setHover(uid !== null ? { uid, x, y } : null);
    }
  };

  const onUp = (e: React.PointerEvent) => {
    const [x, y] = local(e);
    const dr = drag.current;
    if (dr.mode === 'conduit' && dr.uid !== null) {
      const d = useUI.getState().forgeDesign;
      const target = hitComp(d, x, y, geo.current);
      if (target !== null && target !== dr.uid) {
        const existed = d.conduits.some((k) => (k.a === dr.uid && k.b === target) || (k.a === target && k.b === dr.uid));
        toggleConduit(dr.uid, target);
        useUI.getState().toast(existed ? 'Conduit removed' : 'Conduit laid', existed ? 'warn' : 'good');
      }
    }
    drag.current = { uid: null, mode: null, x: 0, y: 0, moved: false };
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/bioforge-component') as ComponentType;
    if (!type || !COMPONENT_DEFS[type]) return;
    const [x, y] = local(e);
    const [a, dist] = placeFromPoint(x, y, COMPONENT_DEFS[type].placement === 'membrane');
    addComponentAt(type, a, dist);
  };

  const d = ui.forgeDesign;
  const hc = hover ? d.components.find((c) => c.uid === hover.uid) : null;
  return (
    <div ref={wrap} className="forge-canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop} data-testid="layout-editor">
      <canvas ref={ref} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ cursor: conduitMode ? 'crosshair' : hc ? 'grab' : 'default' }} />
      {hc && !drag.current.mode && (
        <div className="panel" style={{ position: 'absolute', left: hover!.x + 14, top: hover!.y + 10, padding: '6px 9px', fontSize: 11, pointerEvents: 'none', maxWidth: 240 }}>
          <b style={{ color: COMPONENT_DEFS[hc.type].color }}>{COMPONENT_DEFS[hc.type].name}</b>
          <div className="dim tiny">{COMPONENT_DEFS[hc.type].blurb}</div>
        </div>
      )}
      <div className="panel hint-strip">
        {conduitMode
          ? 'Conduit tool: drag from one component to another to lay (or remove) a high-flow conduit.'
          : 'Drag parts from the palette · drag to move · Alt-drag between parts = conduit · Del removes'}
      </div>
    </div>
  );
}
