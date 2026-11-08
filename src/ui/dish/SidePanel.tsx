import { engine } from '../engine';
import { useEngineVersion, useUI, dishCamera } from '../store';
import { Inspector } from './Inspector';
import { PARAM_META, type SimParams } from '../../sim/params';
import { LineChart, StackedArea } from '../charts';
import { polarToWorld } from '../../sim/experiment';

export function SidePanel() {
  const ui = useUI();
  return (
    <div className="side">
      <div className="side-tabs">
        {(['inspector', 'environment', 'population'] as const).map((t) => (
          <button key={t} className={ui.sideTab === t ? 'on' : ''} onClick={() => ui.set({ sideTab: t })}>
            {t}
          </button>
        ))}
      </div>
      <div className="side-body">
        {ui.sideTab === 'inspector' && <Inspector />}
        {ui.sideTab === 'environment' && <EnvironmentPanel />}
        {ui.sideTab === 'population' && <PopulationPanel />}
      </div>
    </div>
  );
}

function ParamControl({ m }: { m: (typeof PARAM_META)[number] }) {
  const w = engine.world;
  const p = w.params as unknown as Record<string, number | string | boolean>;
  const v = p[m.key];
  const set = (nv: number | string | boolean) => {
    p[m.key] = nv;
    if (m.key === 'feedPattern' || m.key === 'lightPattern' || m.key === 'heatPattern') w.env.updatePatterns(w.params, true);
    engine.notify();
  };
  if (m.kind === 'enum')
    return (
      <div className="param">
        <label title={m.hint}>{m.label}</label>
        <select value={String(v)} onChange={(e) => set(e.target.value)} style={{ gridColumn: '2 / 4' }} aria-label={m.label}>
          {m.options!.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </div>
    );
  if (m.kind === 'bool')
    return (
      <div className="param">
        <label title={m.hint}>{m.label}</label>
        <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} style={{ justifySelf: 'start' }} aria-label={m.label} />
        <span className="val">{v ? 'on' : 'off'}</span>
      </div>
    );
  const num = Number(v);
  return (
    <div className="param">
      <label title={m.hint}>{m.label}</label>
      <input type="range" min={m.min} max={m.max} step={m.step} value={num} onChange={(e) => set(Number(e.target.value))} aria-label={m.label} />
      <span className="val">{num >= 100 ? num.toFixed(0) : num >= 1 ? num.toFixed(2) : num.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.0')}</span>
    </div>
  );
}

function EnvironmentPanel() {
  useEngineVersion();
  const ui = useUI();
  const w = engine.world;
  const groups = [...new Set(PARAM_META.map((m) => m.group))];
  const event = (label: string, fn: () => void) => {
    fn();
    w.log.push({ tick: w.tick, text: label, kind: 'event' });
    ui.toast(label, 'warn');
    engine.notify();
  };
  return (
    <>
      <section>
        <div className="section-title">Quick events</div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn small" onClick={() => event('Heat wave', () => ((w.params as SimParams).baseHeat = Math.min(1, w.params.baseHeat + 0.15)))}>
            Heat wave
          </button>
          <button className="btn small" onClick={() => event('Cold snap', () => ((w.params as SimParams).baseHeat = Math.max(0, w.params.baseHeat - 0.15)))}>
            Cold snap
          </button>
          <button className="btn small" onClick={() => event('Nutrient bloom', () => w.brush('sorb', w.env.cx, w.env.cy, w.env.R, 4))}>
            Nutrient bloom
          </button>
          <button className="btn small" onClick={() => event('Famine', () => (w.params.feedRate = 0))}>
            Famine
          </button>
          <button className="btn small" onClick={() => event('Toxic spill', () => {
            const [x, y] = polarToWorld(w, Math.random() * 360, 0.4);
            w.brush('murk', x, y, w.env.R * 0.35, 8);
          })}>
            Toxic spill
          </button>
          <button className="btn small danger" onClick={() => event('Dish sterilised', () => w.cullWhere(() => true))}>
            Sterilise
          </button>
        </div>
      </section>
      {groups.map((g) => (
        <section key={g}>
          <div className="section-title">{g}</div>
          {PARAM_META.filter((m) => m.group === g).map((m) => (
            <ParamControl key={m.key} m={m} />
          ))}
          {g === 'Light' && w.env.lightSources.length > 0 && (
            <button
              className="btn small"
              onClick={() => {
                w.env.lightSources = [];
                w.env.updatePatterns(w.params, true);
                engine.notify();
              }}
            >
              Remove {w.env.lightSources.length} lumen source(s)
            </button>
          )}
        </section>
      ))}
      <section>
        <div className="section-title">Dish readings</div>
        <DishTotals />
      </section>
    </>
  );
}

function DishTotals() {
  const w = engine.world;
  const t = w.env.totals();
  const matter = w.totalMatter();
  const err = w.matterError();
  return (
    <div className="kv">
      <span>Free sorb</span>
      <span>{t.sorb.toFixed(0)}</span>
      <span>Free lith</span>
      <span>{t.lith.toFixed(0)}</span>
      <span>Free murk</span>
      <span>{t.murk.toFixed(0)}</span>
      <span>Mean heat</span>
      <span>{t.heat.toFixed(3)}</span>
      <span>Light factor (day)</span>
      <span>{w.env.lightMul.toFixed(2)}</span>
      <span>Total matter</span>
      <span>{matter.toFixed(0)}</span>
      <span title="Matter in dish − (inputs − outputs). Should stay ~0.">Ledger drift</span>
      <span style={{ color: Math.abs(err) / Math.max(1, matter) < 1e-4 ? 'var(--good)' : 'var(--danger)' }}>{err.toExponential(1)}</span>
      <span>Matter in / out</span>
      <span>
        {w.ledger.matterIn.toFixed(0)} / {w.ledger.matterOut.toFixed(0)}
      </span>
    </div>
  );
}

export function rootColor(rootId: string): string {
  const d = engine.world.designs.get(rootId) ?? engine.allDesigns().find((x) => x.id === rootId);
  return `hsl(${d?.hue ?? 180},85%,62%)`;
}

function PopulationPanel() {
  const v = useEngineVersion();
  const ui = useUI();
  const w = engine.world;
  const hist = w.history.slice(-240);
  const roots = new Set<string>();
  for (const h of hist) for (const k of Object.keys(h.byRoot)) roots.add(k);
  const rootList = [...roots];
  const layers = rootList.map((r) => hist.map((h) => h.byRoot[r] ?? 0));
  const colors = rootList.map(rootColor);
  const strains = [...w.strains.values()].filter((s) => s.population > 0).sort((a, b) => b.population - a.population).slice(0, 12);
  const deaths = Object.entries(w.deaths).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const totalDeaths = deaths.reduce((a, [, n]) => a + (n ?? 0), 0);
  return (
    <>
      <section>
        <div className="section-title">Population by lineage</div>
        <StackedArea layers={layers} colors={colors} height={130} version={v} />
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 6, gap: 4 }}>
          {rootList.map((r, i) => (
            <button key={r} className={`chip ${ui.highlightRoot === r ? 'on' : ''}`} style={{ cursor: 'pointer', background: 'transparent' }} onClick={() => ui.set({ highlightRoot: ui.highlightRoot === r ? null : r })}>
              <span className="swatch" style={{ background: colors[i] }} />
              {w.designs.get(r)?.name ?? r} {w.cells.filter((c) => c.strain.rootId === r).length}
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="section-title">Dish resources</div>
        <LineChart
          version={v}
          height={70}
          min={0}
          series={[
            { values: hist.map((h) => h.sorb), color: '#3ef0c6' },
            { values: hist.map((h) => h.lith), color: '#ffc65c' },
            { values: hist.map((h) => h.murk), color: '#d05cff' },
          ]}
        />
        <div className="row tiny dim" style={{ gap: 10 }}>
          <span>
            <span className="swatch" style={{ background: '#3ef0c6' }} /> sorb
          </span>
          <span>
            <span className="swatch" style={{ background: '#ffc65c' }} /> lith
          </span>
          <span>
            <span className="swatch" style={{ background: '#d05cff' }} /> murk
          </span>
        </div>
      </section>
      <section>
        <div className="section-title">Charge flux (per tick)</div>
        <LineChart
          version={v}
          height={60}
          min={0}
          series={[
            { values: hist.map((h) => h.energyIn), color: '#7dffa0' },
            { values: hist.map((h) => h.energyOut), color: '#ff6b6b' },
          ]}
        />
      </section>
      <section>
        <div className="section-title">Leading strains</div>
        {strains.length === 0 && <div className="empty">No life in the dish.</div>}
        {strains.map((s) => (
          <div
            key={s.id}
            className="row"
            style={{ fontSize: 11, padding: '3px 0', cursor: 'pointer', borderTop: '1px solid var(--line)' }}
            onClick={() => ui.set({ view: 'lineage', lineageSelected: s.id })}
            title="Open in lineage view"
          >
            <span className="swatch" style={{ background: `hsl(${s.hue},85%,62%)` }} />
            <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.name}
            </span>
            <span className="mono dim">d{s.depth}</span>
            <span className="mono" style={{ width: 36, textAlign: 'right' }}>
              {s.population}
            </span>
          </div>
        ))}
      </section>
      <section>
        <div className="section-title">Deaths ({totalDeaths})</div>
        {deaths.map(([k, n]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 40px', gap: 6, alignItems: 'center', fontSize: 11, marginBottom: 3 }}>
            <span className="dim">{k}</span>
            <div className="bar">
              <i style={{ width: `${((n ?? 0) / Math.max(1, totalDeaths)) * 100}%`, background: 'var(--danger)' }} />
            </div>
            <span className="mono" style={{ textAlign: 'right' }}>
              {n}
            </span>
          </div>
        ))}
        <div className="kv" style={{ marginTop: 6 }}>
          <span>Births</span>
          <span>{w.births}</span>
          <span>Organisms (2+ cells)</span>
          <span>{w.organisms.size}</span>
          <span>Largest organism</span>
          <span>{Math.max(0, ...[...w.organisms.values()].map((o) => o.size))}</span>
        </div>
        <button className="btn small" style={{ marginTop: 8 }} onClick={() => dishCamera.fit(w.env.cx, w.env.cy, w.env.R)}>
          Fit dish
        </button>
      </section>
    </>
  );
}
