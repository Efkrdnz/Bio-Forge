import { useState } from 'react';
import { engine } from '../engine';
import { useEngineVersion, useUI } from '../store';

export function Objectives() {
  useEngineVersion();
  const ui = useUI();
  const [collapsed, setCollapsed] = useState(false);
  const w = engine.world;
  const exp = w.experiment;
  if (!exp) return null;
  const recent = w.log.filter((l) => w.tick - l.tick < 300).slice(-3);
  const done = exp.goals.filter((g) => w.goalStatus[g.id]?.done).length;
  return (
    <div className="panel bracket objectives" data-testid="objectives">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div>
          <div className="tag mono tiny" style={{ color: 'var(--accent2)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {exp.category}
            {exp.goals.length ? ` · ${done}/${exp.goals.length}` : ''}
          </div>
          <h4>{exp.name}</h4>
        </div>
        <button className="btn small" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? 'show' : 'hide'}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="sum">{exp.summary}</div>
          {exp.goals.map((g) => {
            const st = w.goalStatus[g.id];
            return (
              <div key={g.id} className={`goal ${st?.done ? 'done' : ''}`}>
                <div className="check">{st?.done ? '✓' : ''}</div>
                <div>
                  <div className="label">{g.label}</div>
                  {!st?.done && g.hint && <div className="hint">↳ {g.hint}</div>}
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="bar grow">
                      <i style={{ width: `${(st?.progress ?? 0) * 100}%`, background: st?.done ? 'var(--good)' : 'var(--accent)' }} />
                    </div>
                    <span className="prog">{st?.text ?? '…'}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {exp.focusDesignId && (
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="btn small primary"
                onClick={() => {
                  const d = w.designs.get(exp.focusDesignId!);
                  if (d) ui.set({ forgeDesign: JSON.parse(JSON.stringify(d)), forgeSelected: null, view: 'forge', forgeDirty: false });
                }}
              >
                Open blueprint in Forge →
              </button>
            </div>
          )}
          {recent.map((l, i) => (
            <div key={i} className="tiny mono" style={{ marginTop: 6, color: l.kind === 'goal' ? 'var(--good)' : 'var(--warn)' }}>
              ▸ t{l.tick}: {l.text}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
