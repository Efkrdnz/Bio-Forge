import { useEffect, useState } from 'react';
import { useEngineVersion, useUI, type View } from './store';
import { engine } from './engine';
import { DishView } from './dish/DishView';
import { ForgeView } from './forge/ForgeView';
import { LineageView } from './lineage/LineageView';
import { LabView } from './lab/LabView';
import { tutorials } from '../sim/presets/experiments';

const VIEWS: { id: View; label: string; key: string }[] = [
  { id: 'dish', label: 'Dish', key: 'F1' },
  { id: 'forge', label: 'Cell Forge', key: 'F2' },
  { id: 'lineage', label: 'Lineage', key: 'F3' },
  { id: 'lab', label: 'Experiments', key: 'F4' },
];

const WELCOME_KEY = 'bioforge.welcomed';

export function App() {
  const ui = useUI();
  useEngineVersion();
  const [welcome, setWelcome] = useState(() => {
    try {
      return !localStorage.getItem(WELCOME_KEY) && !new URLSearchParams(location.search).has('nowelcome');
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const idx = ['F1', 'F2', 'F3', 'F4'].indexOf(e.key);
      if (idx >= 0) {
        e.preventDefault();
        useUI.getState().set({ view: VIEWS[idx].id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dismiss = () => {
    setWelcome(false);
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const w = engine.world;
  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">
          <div className="mark" />
          <div>
            BIOFORGE
            <br />
            <small>SYNTHETIC LIFE LAB</small>
          </div>
        </div>
        <nav className="tabs">
          {VIEWS.map((v) => (
            <button key={v.id} className={`tab ${ui.view === v.id ? 'active' : ''}`} onClick={() => ui.set({ view: v.id })} data-testid={`tab-${v.id}`}>
              {v.label}
              <kbd>{v.key}</kbd>
            </button>
          ))}
        </nav>
        <div className="exp-name" title="Current experiment">
          ▣ {w.experiment?.name ?? 'Free dish'}
        </div>
        <div className="topstats">
          <span>
            T <b>{w.tick.toLocaleString()}</b>
          </span>
          <span>
            cells <b>{w.cells.length}</b>
          </span>
          <span>
            {engine.running ? (
              <b style={{ color: 'var(--good)' }}>● LIVE {engine.speed}×</b>
            ) : (
              <b style={{ color: 'var(--warn)' }}>❚❚ PAUSED</b>
            )}
          </span>
        </div>
      </header>
      <main style={{ minHeight: 0, position: 'relative' }}>
        {ui.view === 'dish' && <DishView />}
        {ui.view === 'forge' && <ForgeView />}
        {ui.view === 'lineage' && <LineageView />}
        {ui.view === 'lab' && <LabView />}
        {welcome && <Welcome onClose={dismiss} />}
      </main>
      <div className="toasts">
        {ui.toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Welcome({ onClose }: { onClose: () => void }) {
  const ui = useUI();
  const tuts = tutorials();
  return (
    <div className="welcome" data-testid="welcome">
      <div className="panel bracket">
        <h1>BIOFORGE</h1>
        <div className="dim" style={{ marginBottom: 6 }}>
          Engineer fictional cells, wire their behaviour, grow organisms and let evolution loose in a living dish.
        </div>
        <div className="tiny dim">Every substance here (sorb, lith, charge, murk, echo) is invented. Nothing models real organisms.</div>
        <div className="grid">
          {tuts.map((t) => (
            <div
              key={t.id}
              className="panel card"
              onClick={() => {
                engine.startExperiment(t);
                ui.set({ view: 'dish', selectedId: null });
                onClose();
              }}
            >
              <div className="tag">tutorial</div>
              <h5>{t.name}</h5>
              <p>{t.summary}</p>
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => { ui.set({ view: 'lab' }); onClose(); }}>
            Browse experiments
          </button>
          <button className="btn primary" onClick={onClose} data-testid="welcome-close">
            Enter the open dish
          </button>
        </div>
      </div>
    </div>
  );
}
