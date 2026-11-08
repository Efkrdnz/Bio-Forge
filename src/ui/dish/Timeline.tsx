import { useEffect, useRef } from 'react';
import { engine } from '../engine';
import { useEngineVersion, useUI } from '../store';
import { Icon } from '../Icon';

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8, 16];

export function Timeline() {
  useEngineVersion();
  const ui = useUI();
  const w = engine.world;
  const tl = engine.timeline;
  const first = tl[0]?.tick ?? 0;
  const span = Math.max(1, w.tick - first);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // population sparkline behind the scrubber
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth;
    const H = c.clientHeight;
    c.width = W * dpr;
    c.height = H * dpr;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const hist = w.history.filter((h) => h.tick >= first);
    if (hist.length < 2) return;
    const max = Math.max(1, ...hist.map((h) => h.total));
    ctx.beginPath();
    hist.forEach((h, i) => {
      const x = ((h.tick - first) / span) * W;
      const y = H - (h.total / max) * (H - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(62,240,198,0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fillStyle = 'rgba(62,240,198,0.08)';
    ctx.fill();
  });

  const toggle = () => {
    engine.running = !engine.running;
    engine.notify();
  };

  return (
    <div className="timeline">
      <button className="btn icon" onClick={toggle} title="Play / pause (space)" aria-label={engine.running ? 'Pause' : 'Play'}>
        <Icon name={engine.running ? 'pause' : 'play'} />
      </button>
      <button
        className="btn icon"
        onClick={() => {
          engine.running = false;
          engine.step(1);
        }}
        title="Step one tick (.)"
        aria-label="Step"
      >
        <Icon name="step" />
      </button>
      <button
        className="btn icon"
        onClick={() => {
          engine.running = false;
          engine.step(30);
        }}
        title="Step 30 ticks (one second)"
      >
        +30
      </button>
      <div className="tick">
        {w.tick.toLocaleString()}
        <small>ticks</small>
      </div>
      <div className="speeds">
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={engine.speed === s ? 'on' : ''}
            onClick={() => {
              engine.speed = s;
              engine.running = true;
              engine.notify();
            }}
          >
            {s < 1 ? `${s}×` : `${s}×`}
          </button>
        ))}
      </div>
      <div className="scrub" title="Timeline: click a marker to rewind to that snapshot">
        <canvas ref={canvasRef} />
        {tl.map((e, i) => (
          <div
            key={`${e.tick}-${i}`}
            className={`mark ${e.bookmark ? 'bm' : ''}`}
            style={{ left: `${((e.tick - first) / span) * 100}%` }}
            title={`${e.label ? e.label + ' · ' : ''}tick ${e.tick} — click to rewind`}
            onClick={() => {
              engine.rewindTo(e);
              ui.set({ selectedId: null });
              ui.toast(`Rewound to tick ${e.tick}`);
            }}
          />
        ))}
        <div className="now" />
      </div>
      <button
        className="btn icon"
        title="Rewind to previous snapshot"
        onClick={() => {
          const prev = [...tl].reverse().find((e) => e.tick < w.tick - 1) ?? tl[0];
          if (prev) {
            engine.rewindTo(prev);
            ui.toast(`Rewound to tick ${prev.tick}`);
          }
        }}
      >
        <Icon name="rewind" />
      </button>
      <button
        className="btn icon"
        title="Bookmark this moment"
        onClick={() => {
          engine.bookmark(`Bookmark @${w.tick}`);
          ui.toast('Bookmarked', 'good');
        }}
      >
        <Icon name="bookmark" />
      </button>
      <span className="tiny dim mono" title="Average simulation cost per tick">
        {engine.stepMs.toFixed(2)} ms/t
      </span>
    </div>
  );
}
