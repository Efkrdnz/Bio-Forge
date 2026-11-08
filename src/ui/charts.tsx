/**
 * Tiny canvas charts (no chart library): line series, stacked areas, bars.
 */
import { useEffect, useRef } from 'react';

export interface Series {
  values: number[];
  color: string;
  label?: string;
  fill?: boolean;
}

function setup(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

function grid(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = 'rgba(80,220,230,0.07)';
  ctx.lineWidth = 1;
  for (let k = 1; k < 4; k++) {
    const y = Math.round((h * k) / 4) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

export function LineChart({ series, height = 70, min, max, zeroLine = false, version }: { series: Series[]; height?: number; min?: number; max?: number; zeroLine?: boolean; version?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const { ctx, w, h } = setup(c);
    grid(ctx, w, h);
    let lo = min ?? Infinity;
    let hi = max ?? -Infinity;
    if (min === undefined || max === undefined)
      for (const s of series)
        for (const v of s.values) {
          if (min === undefined) lo = Math.min(lo, v);
          if (max === undefined) hi = Math.max(hi, v);
        }
    if (!isFinite(lo) || !isFinite(hi)) return;
    if (hi - lo < 1e-9) hi = lo + 1;
    const pad = 3;
    const Y = (v: number) => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2);
    if (zeroLine && lo < 0 && hi > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, Y(0));
      ctx.lineTo(w, Y(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const s of series) {
      const n = s.values.length;
      if (n < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const y = Y(s.values[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (s.fill) {
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, s.color.replace(/rgb\(([^)]+)\)/, 'rgba($1,0.25)'));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = 0.35;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  });
  return <canvas ref={ref} style={{ width: '100%', height, display: 'block' }} data-v={version} />;
}

export function StackedArea({ layers, height = 120, colors, version }: { layers: number[][]; colors: string[]; height?: number; version?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const { ctx, w, h } = setup(c);
    grid(ctx, w, h);
    const n = layers[0]?.length ?? 0;
    if (n < 2) return;
    let maxT = 1;
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const L of layers) s += L[i] ?? 0;
      maxT = Math.max(maxT, s);
    }
    const base = new Array(n).fill(0);
    layers.forEach((L, li) => {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const y = h - ((base[i] + (L[i] ?? 0)) / maxT) * (h - 4);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = n - 1; i >= 0; i--) {
        const x = (i / (n - 1)) * w;
        const y = h - (base[i] / maxT) * (h - 4);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = colors[li];
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors[li];
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let i = 0; i < n; i++) base[i] += L[i] ?? 0;
    });
    ctx.fillStyle = 'rgba(200,240,245,0.6)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillText(String(Math.round(maxT)), 4, 11);
  });
  return <canvas ref={ref} style={{ width: '100%', height, display: 'block' }} data-v={version} />;
}

export interface BarItem {
  label: string;
  gen: number;
  use: number;
  color: string;
}

/** Diverging bar chart: production to the right, consumption to the left. */
export function BudgetBars({ items }: { items: BarItem[] }) {
  const maxV = Math.max(1e-6, ...items.map((i) => Math.max(i.gen, i.use)));
  return (
    <div className="col" style={{ gap: 3 }}>
      {items.map((it, k) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '78px 1fr 1fr 48px', alignItems: 'center', gap: 4, fontSize: 10 }}>
          <span className="dim" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ height: 7, width: `${(it.use / maxV) * 100}%`, background: 'rgba(255,107,107,0.75)', borderRadius: '3px 0 0 3px' }} />
          </div>
          <div>
            <div style={{ height: 7, width: `${(it.gen / maxV) * 100}%`, background: it.color, borderRadius: '0 3px 3px 0', boxShadow: `0 0 6px ${it.color}` }} />
          </div>
          <span className="mono" style={{ textAlign: 'right', color: it.gen - it.use >= 0 ? 'var(--good)' : 'var(--danger)' }}>
            {((it.gen - it.use) * 1000).toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}
