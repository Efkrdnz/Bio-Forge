import { useEffect, useMemo, useRef, useState } from 'react';
import { engine } from '../engine';
import { useEngineVersion, useUI, dishCamera } from '../store';
import type { Strain } from '../../sim/cell';
import { diffDesigns } from '../../sim/evolution';
import { StackedArea } from '../charts';
import { drawCell, lookFromDesign } from '../../render/cellDraw';
import { cloneDesign } from '../../sim/design';
import { newDesignId } from '../forge/designOps';

interface TreeLayout {
  y: Map<number, number>;
  rows: number;
  shown: Strain[];
}

function layoutTree(strains: Strain[], minPeak: number, livingOnly: boolean): TreeLayout {
  const byId = new Map(strains.map((s) => [s.id, s]));
  // Determine which strains are visible: pass filter, or ancestors of visible
  const keep = new Set<number>();
  for (const s of strains) {
    const pass = (s.peak >= minPeak || s.parentId === null) && (!livingOnly || s.population > 0);
    if (!pass) continue;
    let p: Strain | undefined = s;
    while (p && !keep.has(p.id)) {
      keep.add(p.id);
      p = p.parentId !== null ? byId.get(p.parentId) : undefined;
    }
  }
  const children = new Map<number, Strain[]>();
  const roots: Strain[] = [];
  for (const s of strains) {
    if (!keep.has(s.id)) continue;
    if (s.parentId !== null && keep.has(s.parentId)) {
      const arr = children.get(s.parentId) ?? [];
      arr.push(s);
      children.set(s.parentId, arr);
    } else roots.push(s);
  }
  const y = new Map<number, number>();
  let row = 0;
  const visit = (s: Strain) => {
    const kids = (children.get(s.id) ?? []).sort((a, b) => a.birthTick - b.birthTick);
    // parent row first, then its descendants
    y.set(s.id, row++);
    for (const k of kids) visit(k);
  };
  for (const r of roots.sort((a, b) => a.rootId.localeCompare(b.rootId) || a.id - b.id)) visit(r);
  return { y, rows: row, shown: strains.filter((s) => keep.has(s.id)) };
}

export function LineageView() {
  const v = useEngineVersion();
  const ui = useUI();
  const w = engine.world;
  const [minPeak, setMinPeak] = useState(3);
  const [livingOnly, setLivingOnly] = useState(false);
  const strains = [...w.strains.values()];
  const layout = useMemo(() => layoutTree(strains, minPeak, livingOnly), [v, minPeak, livingOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const view = useRef({ ox: 0, oy: 0, sy: 18 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: number } | null>(null);
  const [, force] = useState(0);
  const sel = ui.lineageSelected !== null ? w.strains.get(ui.lineageSelected) : undefined;

  useEffect(() => {
    const c = canvasRef.current;
    const el = wrapRef.current;
    if (!c || !el) return;
    const dpr = window.devicePixelRatio || 1;
    const W = el.clientWidth;
    const H = el.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#02060a';
    ctx.fillRect(0, 0, W, H);
    const t0 = Math.min(0, ...layout.shown.map((s) => s.birthTick));
    const t1 = Math.max(w.tick, 1);
    const left = 70;
    const right = W - 210;
    const X = (t: number) => left + ((t - t0) / (t1 - t0)) * (right - left);
    const vw = view.current;
    const Y = (r: number) => 30 + vw.oy + r * vw.sy;
    // time grid
    ctx.strokeStyle = 'rgba(80,220,230,0.06)';
    ctx.fillStyle = 'rgba(120,150,160,0.8)';
    ctx.font = '10px JetBrains Mono, monospace';
    const raw = Math.max(10, (t1 - t0) / 8);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? 10 * mag;
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      ctx.beginPath();
      ctx.moveTo(X(t) + 0.5, 20);
      ctx.lineTo(X(t) + 0.5, H);
      ctx.stroke();
      ctx.fillText(`t${t}`, X(t) + 3, 14);
    }
    // edges & lifespans
    const byId = w.strains;
    for (const s of layout.shown) {
      const yy = Y(layout.y.get(s.id)!);
      if (yy < -20 || yy > H + 20) continue;
      const end = s.extinctTick ?? w.tick;
      const alive = s.population > 0;
      const col = `hsla(${s.hue},85%,62%,${alive ? 0.95 : 0.35})`;
      if (s.parentId !== null && layout.y.has(s.parentId)) {
        const py = Y(layout.y.get(s.parentId)!);
        ctx.strokeStyle = `hsla(${byId.get(s.parentId)?.hue ?? s.hue},60%,60%,0.35)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(X(s.birthTick), py);
        ctx.lineTo(X(s.birthTick), yy);
        ctx.stroke();
      }
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(1.5, Math.min(7, Math.sqrt(s.peak) * 0.9));
      ctx.beginPath();
      ctx.moveTo(X(s.birthTick), yy);
      ctx.lineTo(X(end), yy);
      ctx.stroke();
      if (alive) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(X(end), yy, 3 + Math.min(8, Math.sqrt(s.population)), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,84,112,0.6)';
        ctx.fillRect(X(end) - 1, yy - 4, 2, 8);
      }
      if (s.id === ui.lineageSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(X(s.birthTick) - 4, yy - 7, Math.max(8, X(end) - X(s.birthTick) + 8), 14);
      }
      if (vw.sy >= 12) {
        ctx.fillStyle = alive ? 'rgba(220,240,245,0.85)' : 'rgba(120,150,160,0.6)';
        ctx.fillText(`${s.name}${alive ? ` · ${s.population}` : ''}`, X(end) + 10 + (alive ? 6 : 0), yy + 3);
      }
    }
    ctx.fillStyle = 'rgba(120,150,160,0.8)';
    ctx.fillText('founders', 8, 34);
  });

  const hit = (mx: number, my: number): Strain | null => {
    const el = wrapRef.current!;
    const W = el.clientWidth;
    const t0 = Math.min(0, ...layout.shown.map((s) => s.birthTick));
    const t1 = Math.max(w.tick, 1);
    const X = (t: number) => 70 + ((t - t0) / (t1 - t0)) * (W - 280);
    let best: Strain | null = null;
    let bd = 9;
    for (const s of layout.shown) {
      const yy = 30 + view.current.oy + layout.y.get(s.id)! * view.current.sy;
      const d = Math.abs(yy - my);
      if (d < bd && mx >= X(s.birthTick) - 6 && mx <= X(s.extinctTick ?? w.tick) + 140) {
        bd = d;
        best = s;
      }
    }
    return best;
  };

  // Muller-like chart of the dominant strains over time
  const hist = w.history.slice(-300);
  const totals = new Map<number, number>();
  for (const h of hist) for (const [id, n] of h.byStrain) totals.set(id, (totals.get(id) ?? 0) + n);
  const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([id]) => id);
  const layers = top.map((id) => hist.map((h) => h.byStrain.find((x) => x[0] === id)?.[1] ?? 0));
  const colors = top.map((id) => `hsl(${w.strains.get(id)?.hue ?? 0},80%,60%)`);

  return (
    <div className="lineage">
      <div
        className="tree"
        ref={wrapRef}
        onPointerDown={(e) => {
          const r = wrapRef.current!.getBoundingClientRect();
          drag.current = { x: e.clientX, y: e.clientY, ox: view.current.ox, oy: view.current.oy, moved: 0 };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          void r;
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          view.current.oy = d.oy + (e.clientY - d.y);
          d.moved += Math.abs(e.movementY) + Math.abs(e.movementX);
          force((x) => x + 1);
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (d && d.moved < 4) {
            const r = wrapRef.current!.getBoundingClientRect();
            const s = hit(e.clientX - r.left, e.clientY - r.top);
            ui.set({ lineageSelected: s ? s.id : null });
          }
        }}
        onWheel={(e) => {
          view.current.sy = Math.max(3, Math.min(40, view.current.sy * Math.exp(-e.deltaY * 0.001)));
          force((x) => x + 1);
        }}
        data-testid="lineage-tree"
      >
        <canvas ref={canvasRef} />
        <div className="hud bl" style={{ position: 'absolute' }}>
          <div className="panel" style={{ padding: 10, width: 250 }}>
            <div className="section-title">Phylogeny · {layout.shown.length} / {strains.length} strains</div>
            <div className="param">
              <label>Min peak pop.</label>
              <input type="range" min={1} max={60} value={minPeak} onChange={(e) => setMinPeak(Number(e.target.value))} />
              <span className="val">{minPeak}</span>
            </div>
            <label className="row tiny">
              <input type="checkbox" checked={livingOnly} onChange={(e) => setLivingOnly(e.target.checked)} /> living lineages only
            </label>
            <div className="tiny dim" style={{ marginTop: 6 }}>
              Bars span each strain’s life; thickness = peak population; ● = alive now, red tick = extinct. Wheel = row spacing, drag = scroll, click = inspect.
            </div>
          </div>
        </div>
      </div>
      <div className="muller">
        <div style={{ position: 'absolute', left: 10, top: 6, zIndex: 2 }} className="section-title">
          Strain abundance (top {top.length})
        </div>
        <div style={{ position: 'absolute', inset: '24px 10px 6px 10px' }}>
          <StackedArea layers={layers} colors={colors} height={170} version={v} />
        </div>
      </div>
      <div className="details">
        {sel ? <StrainDetails s={sel} /> : <div className="empty">Click a strain bar to inspect its blueprint, mutations and descendants.</div>}
      </div>
    </div>
  );
}

function StrainDetails({ s }: { s: Strain }) {
  const ui = useUI();
  const w = engine.world;
  const parent = s.parentId !== null ? w.strains.get(s.parentId) : undefined;
  const kids = [...w.strains.values()].filter((x) => x.parentId === s.id);
  const diff = parent ? diffDesigns(parent.design, s.design) : [];
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 300 * dpr;
    c.height = 180 * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#03090e';
    ctx.fillRect(0, 0, 300, 180);
    drawCell(ctx, lookFromDesign(s.design, 150, 90, 58), { t: 1, zoom: 1, ghost: true });
  }, [s]);
  const living = w.cells.filter((c) => c.strain === s);
  return (
    <div className="col" style={{ gap: 12 }} data-testid="strain-details">
      <div>
        <div className="row">
          <span className="swatch" style={{ width: 14, height: 14, background: `hsl(${s.hue},85%,62%)` }} />
          <b style={{ fontSize: 15 }}>{s.name}</b>
        </div>
        <div className="tiny dim mono">
          strain #{s.id} · lineage {s.rootId} · {s.depth} mutation{s.depth === 1 ? '' : 's'} from founder
        </div>
      </div>
      <canvas ref={ref} style={{ width: 300, height: 180, borderRadius: 6, border: '1px solid var(--line)' }} />
      <div className="kv">
        <span>Born</span>
        <span>tick {s.birthTick}</span>
        <span>Status</span>
        <span style={{ color: s.population > 0 ? 'var(--good)' : 'var(--danger)' }}>{s.population > 0 ? `alive · ${s.population}` : `extinct @ ${s.extinctTick}`}</span>
        <span>Peak / total born</span>
        <span>
          {s.peak} / {s.totalBorn}
        </span>
        <span>Components</span>
        <span>{s.design.components.length}</span>
        <span>Build / divide mass</span>
        <span>
          {s.compiled.buildMass.toFixed(1)} / {s.compiled.divideMass.toFixed(1)}
        </span>
      </div>
      <section>
        <div className="section-title">Mutation</div>
        <div className="tiny" style={{ color: 'var(--warn)' }}>{s.note}</div>
        {parent && (
          <div className="diff" style={{ marginTop: 6 }}>
            {diff.length === 0 && <div className="dim">No structural difference (silent mutation)</div>}
            {diff.map((l, i) => (
              <div key={i} className={l.startsWith('+') ? 'add' : l.startsWith('−') ? 'del' : 'mod'}>
                {l}
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
        {parent && (
          <button className="btn small" onClick={() => ui.set({ lineageSelected: parent.id })}>
            ↑ Parent: {parent.name}
          </button>
        )}
        <button
          className="btn small primary"
          onClick={() => {
            const d = cloneDesign(s.design);
            if (s.depth > 0) d.id = newDesignId(d.name);
            ui.set({ forgeDesign: d, forgeSelected: null, view: 'forge', forgeDirty: true });
            ui.toast(s.depth > 0 ? 'Evolved blueprint adopted as a new design' : 'Founder blueprint opened');
          }}
        >
          Open in Forge
        </button>
        {living.length > 0 && (
          <button
            className="btn small"
            onClick={() => {
              const c = living[0];
              ui.set({ view: 'dish', selectedId: c.id, sideTab: 'inspector' });
              dishCamera.flyTo(c.x, c.y, 3);
            }}
          >
            Find in dish
          </button>
        )}
        {living.length > 0 && (
          <button
            className="btn small danger"
            onClick={() => {
              const n = w.cullWhere((c) => c.strain === s);
              ui.toast(`Culled ${n} cells of ${s.name}`, 'warn');
              engine.notify();
            }}
          >
            Cull strain
          </button>
        )}
      </div>
      {kids.length > 0 && (
        <section>
          <div className="section-title">Descendant strains ({kids.length})</div>
          {kids.slice(0, 30).map((k) => (
            <div key={k.id} className="row tiny" style={{ cursor: 'pointer', borderTop: '1px solid var(--line)', padding: '3px 0' }} onClick={() => ui.set({ lineageSelected: k.id })}>
              <span className="swatch" style={{ background: `hsl(${k.hue},85%,62%)` }} />
              <span className="grow">{k.name}</span>
              <span className="dim" style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {k.note}
              </span>
              <span className="mono">{k.population}</span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
