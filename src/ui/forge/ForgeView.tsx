import { useRef, useState } from 'react';
import { useEngineVersion, useUI, dishCamera } from '../store';
import { engine } from '../engine';
import { CATEGORY_LABEL, COMPONENT_DEFS, componentsByCategory, defaultParams, type Category } from '../../sim/components';
import { MEMBRANE_DEFS, MEMBRANE_TYPES, type MembraneType } from '../../sim/membranes';
import { cloneDesign, compileDesign, estimateBudget, normalizeDesign, validateDesign, type CellDesign } from '../../sim/design';
import { addComponentAt, edit, freeSpot, newDesignId, removeComponent, toggleConduit } from './designOps';
import { LayoutEditor } from './LayoutEditor';
import { CircuitEditor, ParamSlider } from './CircuitEditor';
import { DevelopmentPanel } from './DevelopmentPanel';
import { TestChamber } from './TestChamber';
import { Icon } from '../Icon';
import { TISSUE_COLORS } from '../../render/palette';
import { blankCell } from '../../sim/presets/designs';
import { NUM_TISSUES } from '../../sim/constants';

const CAT_ORDER: Category[] = ['core', 'energy', 'storage', 'transport', 'sensor', 'signal', 'structure', 'movement', 'defense'];

export function ForgeView() {
  const ui = useUI();
  useEngineVersion();
  const [conduitMode, setConduitMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const d = ui.forgeDesign;
  const designs = engine.allDesigns();

  const loadDesign = (id: string) => {
    const src = designs.find((x) => x.id === id);
    if (src) ui.set({ forgeDesign: cloneDesign(src), forgeSelected: null, forgeDirty: false });
  };

  const save = () => {
    engine.upsertDesign(d);
    ui.set({ forgeDirty: false });
    ui.toast(`Saved “${d.name}” to your library`, 'good');
  };

  const deploy = (count: number) => {
    const w = engine.world;
    engine.upsertDesign(d);
    const reg = w.designs.get(d.id)!;
    const got = w.inoculate(reg, count, w.env.cx, w.env.cy, Math.min(w.env.R * 0.5, 30 + count * 10));
    ui.set({ forgeDirty: false });
    if (got.length) {
      ui.toast(`Deployed ${got.length} × ${d.name} to the dish`, 'good');
      ui.set({ view: 'dish', selectedId: got[0].id, inoculateId: d.id });
      dishCamera.flyTo(w.env.cx, w.env.cy, 1.2);
      engine.running = true;
    } else ui.toast('Population cap reached: raise it in Environment', 'warn');
  };

  const exportDesign = () => {
    const blob = new Blob([JSON.stringify({ format: 'bioforge-design', design: d }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${d.name.replace(/\W+/g, '_')}.bioforge-design.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importDesign = async (f: File) => {
    try {
      const j = JSON.parse(await f.text());
      const dd = normalizeDesign((j.design ?? j) as CellDesign);
      if (!dd.id || !Array.isArray(dd.components)) throw new Error('bad');
      ui.set({ forgeDesign: dd, forgeSelected: null, forgeDirty: true });
      ui.toast(`Imported “${dd.name}”`, 'good');
    } catch {
      ui.toast('That file is not a BIOFORGE design', 'warn');
    }
  };

  return (
    <div className="forge">
      <div className="forge-head">
        <span className="swatch" style={{ width: 16, height: 16, background: `hsl(${d.hue},85%,62%)`, boxShadow: `0 0 10px hsl(${d.hue},85%,62%)` }} />
        <input className="name" value={d.name} onChange={(e) => edit((x) => (x.name = e.target.value.slice(0, 32)))} aria-label="Design name" />
        <input type="range" min={0} max={359} value={d.hue} onChange={(e) => edit((x) => (x.hue = Number(e.target.value)))} style={{ width: 90 }} title="Colour" aria-label="Hue" />
        <select value={d.membrane.type} onChange={(e) => edit((x) => (x.membrane.type = e.target.value as MembraneType))} title={MEMBRANE_DEFS[d.membrane.type].blurb} aria-label="Membrane">
          {MEMBRANE_TYPES.map((m) => (
            <option key={m} value={m}>
              {MEMBRANE_DEFS[m].name}
            </option>
          ))}
        </select>
        <span className="tiny dim">thickness</span>
        <input type="range" min={0.5} max={2} step={0.05} value={d.membrane.thickness} onChange={(e) => edit((x) => (x.membrane.thickness = Number(e.target.value)))} style={{ width: 80 }} aria-label="Membrane thickness" />
        <span className="mono tiny">{d.membrane.thickness.toFixed(2)}</span>
        <span style={{ width: 1, height: 22, background: 'var(--line)' }} />
        <select value="" onChange={(e) => e.target.value && loadDesign(e.target.value)} aria-label="Load design">
          <option value="">Load blueprint…</option>
          {designs.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
              {engine.library.some((l) => l.id === x.id) ? ' ★' : ''}
            </option>
          ))}
        </select>
        <button className="btn small" onClick={() => ui.set({ forgeDesign: { ...blankCell(), id: newDesignId('cell') }, forgeSelected: null, forgeDirty: false })}>
          <Icon name="plus" size={12} /> New
        </button>
        <button
          className="btn small"
          title="Copy as a new design with its own lineage"
          onClick={() => {
            edit((x) => {
              x.id = newDesignId(x.name);
              x.name = `${x.name.split(' copy')[0]} copy`;
            });
            ui.toast('Duplicated as a new blueprint');
          }}
        >
          <Icon name="copy" size={12} /> Duplicate
        </button>
        <div className="grow" />
        <span className="tiny mono dim" title="Lineage id: strains deployed from this blueprint share it">
          id {d.id}
          {ui.forgeDirty ? ' · unsaved' : ''}
        </span>
        <button className="btn small" onClick={exportDesign} title="Export JSON">
          <Icon name="download" size={12} />
        </button>
        <button className="btn small" onClick={() => fileRef.current?.click()} title="Import JSON">
          <Icon name="upload" size={12} />
        </button>
        <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && importDesign(e.target.files[0])} />
        <button className="btn small" onClick={save}>
          <Icon name="save" size={12} /> Save
        </button>
        <button className="btn primary" onClick={() => deploy(6)} data-testid="deploy">
          Deploy to dish ▸
        </button>
      </div>

      <Palette />

      <div className="forge-center">
        <div className="forge-tabs">
          {(['layout', 'circuit', 'development'] as const).map((t) => (
            <button key={t} className={`tab ${ui.forgeTab === t ? 'active' : ''}`} onClick={() => ui.set({ forgeTab: t })} data-testid={`forge-tab-${t}`}>
              {t}
            </button>
          ))}
          <div className="grow" />
          {ui.forgeTab === 'layout' && (
            <>
              <span className="tiny dim">View tissue</span>
              <div className="tissue-pick">
                {Array.from({ length: NUM_TISSUES }, (_, i) => (
                  <button
                    key={i}
                    className={ui.forgeTissue === i ? 'on' : ''}
                    style={ui.forgeTissue === i ? { background: TISSUE_COLORS[i], borderColor: TISSUE_COLORS[i] } : { borderColor: TISSUE_COLORS[i] + '66' }}
                    onClick={() => ui.set({ forgeTissue: i })}
                    title={d.development.tissueNames[i]}
                  >
                    {'ABCD'[i]}
                  </button>
                ))}
              </div>
              <button className={`btn small ${conduitMode ? 'on' : ''}`} onClick={() => setConduitMode(!conduitMode)} data-testid="conduit-tool">
                <Icon name="conduit" size={12} /> Conduit tool
              </button>
            </>
          )}
        </div>
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          {ui.forgeTab === 'layout' && <LayoutEditor conduitMode={conduitMode} />}
          {ui.forgeTab === 'circuit' && <CircuitEditor />}
          {ui.forgeTab === 'development' && <DevelopmentPanel />}
        </div>
      </div>

      <div className="forge-side">
        <SelectedComponent />
        <DesignStats />
        <section>
          <div className="section-title">Test chamber</div>
          <TestChamber />
        </section>
        {d.notes && (
          <section>
            <div className="section-title">Notes</div>
            <div className="tiny dim">{d.notes}</div>
          </section>
        )}
      </div>
    </div>
  );
}

function Palette() {
  const ui = useUI();
  const cats = componentsByCategory();
  return (
    <div className="palette" data-testid="palette">
      <div className="section-title">Membrane</div>
      <div className="col" style={{ gap: 4, marginBottom: 12 }}>
        {MEMBRANE_TYPES.map((m) => {
          const def = MEMBRANE_DEFS[m];
          const on = ui.forgeDesign.membrane.type === m;
          return (
            <div key={m} className="pal-item" style={on ? { borderColor: 'var(--accent)', background: 'var(--accent-dim)' } : undefined} onClick={() => edit((x) => (x.membrane.type = m))} title={def.blurb}>
              <span className="swatch" style={{ width: 18, height: 18, border: `2px solid ${def.color}`, background: 'transparent' }} />
              <span className="nm">{def.name}</span>
              <span className="cost">
                m{def.massCost.toFixed(1)}
                <br />⚡{(def.upkeep * 1000).toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
      {CAT_ORDER.map((cat) => (
        <div key={cat} className="cat">
          <div className="section-title">{CATEGORY_LABEL[cat]}</div>
          {(cats[cat] ?? []).map((def) => {
            const p = defaultParams(def.type);
            return (
              <div
                key={def.type}
                className="pal-item"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/bioforge-component', def.type)}
                onClick={() => {
                  const [a, dist] = freeSpot(useUI.getState().forgeDesign, def.type);
                  addComponentAt(def.type, a, dist);
                  if (ui.forgeTab !== 'layout') ui.set({ forgeTab: 'layout' });
                }}
                title={`${def.blurb}\n(click to add, or drag onto the cell)`}
                data-testid={`pal-${def.type}`}
              >
                <span className="glyph" style={{ background: def.color }}>
                  {def.glyph}
                </span>
                <span className="nm">{def.name}</span>
                <span className="cost">
                  m{def.massCost(p).toFixed(1)}
                  <br />⚡{(def.upkeep(p) * 1000).toFixed(0)}
                </span>
              </div>
            );
          })}
        </div>
      ))}
      <div className="tiny dim">m = biomass cost · ⚡ = upkeep (milli-charge per tick)</div>
    </div>
  );
}

function SelectedComponent() {
  const ui = useUI();
  const d = ui.forgeDesign;
  const c = d.components.find((x) => x.uid === ui.forgeSelected);
  if (!c)
    return (
      <section>
        <div className="section-title">Component</div>
        <div className="tiny dim">Select a part on the cell to tune it. Click or drag a part from the palette to add it.</div>
      </section>
    );
  const def = COMPONENT_DEFS[c.type];
  const setP = (k: string, v: number) =>
    edit((x) => {
      const cc = x.components.find((y) => y.uid === c.uid);
      if (cc) cc.params[k] = v;
    });
  const linked = d.conduits.filter((k) => k.a === c.uid || k.b === c.uid);
  return (
    <section data-testid="component-props">
      <div className="section-title">Component #{c.uid}</div>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="glyph" style={{ background: def.color, padding: '2px 5px' }}>
          {def.glyph}
        </span>
        <b>{def.name}</b>
        <span className="grow" />
        <span className="chip">{def.placement}</span>
      </div>
      <div className="tiny dim" style={{ marginBottom: 8 }}>
        {def.blurb}
      </div>
      <div className="kv" style={{ marginBottom: 8 }}>
        <span>Biomass cost</span>
        <span>{def.massCost(c.params).toFixed(2)}</span>
        <span>Upkeep</span>
        <span>{(def.upkeep(c.params) * 1000).toFixed(1)} mC/tick</span>
        <span>Angle</span>
        <span>{Math.round((((c.angle * 180) / Math.PI) % 360 + 360) % 360)}°</span>
        {def.placement === 'interior' && (
          <>
            <span>Depth</span>
            <span>{(c.dist * 100).toFixed(0)}%</span>
          </>
        )}
      </div>
      {def.params.map((p) => (
        <ParamSlider key={p.key} p={p} value={c.params[p.key] ?? p.default} onChange={(v) => setP(p.key, v)} />
      ))}
      <div className="row" style={{ margin: '8px 0', gap: 4 }}>
        <span className="tiny dim">Expressed in</span>
        {Array.from({ length: NUM_TISSUES }, (_, t) => {
          const on = (c.tissues & (1 << t)) !== 0;
          return (
            <button
              key={t}
              className="btn small"
              style={{ borderColor: TISSUE_COLORS[t], background: on ? TISSUE_COLORS[t] : 'transparent', color: on ? '#02060a' : TISSUE_COLORS[t], padding: '2px 7px' }}
              disabled={c.type === 'core'}
              onClick={() =>
                edit((x) => {
                  const cc = x.components.find((y) => y.uid === c.uid)!;
                  const m = cc.tissues ^ (1 << t);
                  if (m) cc.tissues = m;
                })
              }
            >
              {'ABCD'[t]}
            </button>
          );
        })}
      </div>
      {linked.length > 0 && (
        <div className="col" style={{ gap: 3, marginBottom: 8 }}>
          {linked.map((k) => {
            const other = d.components.find((x) => x.uid === (k.a === c.uid ? k.b : k.a));
            return (
              <div key={`${k.a}-${k.b}`} className="row tiny">
                <span className="dim">conduit →</span>
                <span>{other ? `${COMPONENT_DEFS[other.type].name} #${other.uid}` : '?'}</span>
                <span className="grow" />
                <button className="btn small" onClick={() => toggleConduit(k.a, k.b)}>
                  remove
                </button>
              </div>
            );
          })}
        </div>
      )}
      <button className="btn small danger" onClick={() => removeComponent(c.uid)} disabled={c.type === 'core' && d.components.filter((x) => x.type === 'core').length === 1 && false}>
        <Icon name="trash" size={12} /> Remove part
      </button>
    </section>
  );
}

function DesignStats() {
  const ui = useUI();
  const d = ui.forgeDesign;
  const cd = compileDesign(cloneDesign(d));
  const issues = validateDesign(d);
  const env = { sorb: 4, light: 0.8, heat: 0.5 };
  const b = estimateBudget(cd, env, d.development.startTissue);
  const m = cd.membrane;
  return (
    <section>
      <div className="section-title">Blueprint stats</div>
      <div className="kv">
        <span>Components</span>
        <span>{cd.n} / 28</span>
        <span>Build mass</span>
        <span>{cd.buildMass.toFixed(1)}</span>
        <span>Divides at</span>
        <span>{cd.divideMass.toFixed(1)}</span>
        <span>Upkeep (tissue {'ABCD'[d.development.startTissue]})</span>
        <span>{(b.upkeep * 1000).toFixed(1)} mC/t</span>
        <span title="Upper bound when fully supplied">Peak production</span>
        <span>{(b.production * 1000).toFixed(1)} mC/t</span>
        <span title="Peak production minus upkeep">Peak surplus</span>
        <span style={{ color: b.net >= 0 ? 'var(--good)' : 'var(--danger)' }}>{(b.net * 1000).toFixed(1)} mC/t</span>
        <span>Integrity</span>
        <span>{cd.baseIntegrity.toFixed(0)}</span>
        <span>Heat tolerance</span>
        <span>±{m.heatTolerance.toFixed(2)}</span>
        <span>Bond slots</span>
        <span>{cd.bondSlots}</span>
        <span>Conduits</span>
        <span>{d.conduits.length}</span>
      </div>
      <div className="tiny dim" style={{ margin: '4px 0 8px' }}>
        Peak values assume sorb 4, light 0.8, comfortable heat and full supply; real cells are often limited by transport and demand. The test chamber runs the real simulation.
      </div>
      <div className="issues">
        {issues.length === 0 && <div className="issue info">Blueprint looks viable.</div>}
        {issues.map((i, k) => (
          <div key={k} className={`issue ${i.level}`}>
            {i.text}
          </div>
        ))}
      </div>
    </section>
  );
}

export { edit };
