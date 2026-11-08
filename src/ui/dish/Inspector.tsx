import { Fragment, useState } from 'react';
import { engine } from '../engine';
import { useEngineVersion, useUI, dishCamera } from '../store';
import { COMPONENT_DEFS, COMPONENT_TYPES } from '../../sim/components';
import { NODE_DEFS, ACTION_NAMES, INTERNAL_NAMES } from '../../sim/circuit';
import { R_CHARGE, R_LITH, R_MURK, R_SORB, NUM_CHANNELS, RES_COLOR } from '../../sim/constants';
import { MEMBRANE_DEFS } from '../../sim/membranes';
import { LineChart, BudgetBars, type BarItem } from '../charts';
import { kill } from '../../sim/lifecycle';
import { bondPartner } from '../../sim/bond';
import { TISSUE_COLORS } from '../../render/palette';
import { cloneDesign } from '../../sim/design';

function Bar({ label, frac, color, text }: { label: string; frac: number; color: string; text: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 60px', gap: 8, alignItems: 'center', fontSize: 11, marginBottom: 4 }}>
      <span className="dim">{label}</span>
      <div className="bar">
        <i style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
      </div>
      <span className="mono" style={{ textAlign: 'right' }}>
        {text}
      </span>
    </div>
  );
}

export function Inspector() {
  const v = useEngineVersion();
  const ui = useUI();
  const w = engine.world;
  const c = ui.selectedId !== null ? w.cellById(ui.selectedId) : undefined;
  if (!c) {
    return (
      <div className="empty">
        <div style={{ fontSize: 28, opacity: 0.5 }}>◎</div>
        Select a cell with the inspect tool to examine its components, resource network, circuit and energy budget.
        <br />
        <span className="tiny">Wheel to zoom · drag to pan · 1–4 objectives</span>
        {ui.selectedId !== null && <div style={{ color: 'var(--danger)', marginTop: 8 }}>The selected cell has died.</div>}
      </div>
    );
  }
  const cd = c.cd;
  const d = cd.design;
  const org = c.organismId ? w.organisms.get(c.organismId) : undefined;
  const tot = (r: number) => c.total(r);
  const cap = (r: number) => c.totalCap(r);
  let net = 0;
  for (let i = 0; i < c.eGen.length; i++) net += c.eGen[i] - c.eUse[i];

  const budget: BarItem[] = [];
  for (let i = 0; i < cd.n; i++) {
    const def = COMPONENT_DEFS[COMPONENT_TYPES[cd.types[i]]];
    if (c.eGen[i] < 1e-5 && c.eUse[i] < 1e-5) continue;
    budget.push({ label: def.name, gen: c.eGen[i], use: c.eUse[i], color: def.color });
  }
  budget.push({ label: 'Membrane & basal', gen: 0, use: c.eUse[cd.n], color: '#fff' });
  if (c.eGen[cd.n + 1] > 1e-5) budget.push({ label: 'Autophagy', gen: c.eGen[cd.n + 1], use: 0, color: '#ff8f8f' });
  budget.sort((a, b) => b.gen + b.use - (a.gen + a.use));

  const series = (k: number) => c.series(k);

  return (
    <div data-testid="inspector">
      <section>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="swatch" style={{ width: 14, height: 14, marginTop: 3, background: `hsl(${c.strain.hue},85%,62%)`, boxShadow: `0 0 10px hsl(${c.strain.hue},85%,62%)` }} />
          <div className="grow">
            <div style={{ fontSize: 15, fontWeight: 600 }}>{c.strain.name}</div>
            <div className="tiny dim mono">
              cell #{c.id} · gen {c.generation} · age {c.age} · strain d{c.strain.depth}
            </div>
          </div>
        </div>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 8, gap: 4 }}>
          <span className="chip" style={{ borderColor: TISSUE_COLORS[c.tissue], color: TISSUE_COLORS[c.tissue] }}>
            tissue {'ABCD'[c.tissue]} · {d.development.tissueNames[c.tissue]}
          </span>
          <span className="chip">{MEMBRANE_DEFS[cd.membrane.type].name}</span>
          {org ? <span className="chip">organism #{org.id} · {org.size} cells</span> : <span className="chip">unicellular</span>}
          {c.heatStress > 0 && <span className="chip" style={{ color: 'var(--warn)', borderColor: 'var(--warn)' }}>heat stress</span>}
          {c.toxicity > 0.55 && <span className="chip" style={{ color: 'var(--accent3)', borderColor: 'var(--accent3)' }}>toxic</span>}
        </div>
        <div className="row" style={{ flexWrap: 'wrap', marginTop: 8, gap: 4 }}>
          <button className="btn small" onClick={() => dishCamera.flyTo(c.x, c.y, 8)}>
            Zoom 80×
          </button>
          <button className={`btn small ${ui.follow ? 'on' : ''}`} onClick={() => ui.set({ follow: !ui.follow })}>
            Follow
          </button>
          <button
            className="btn small"
            onClick={() => ui.set({ forgeDesign: { ...cloneDesign(d), id: d.id }, forgeSelected: null, view: 'forge', forgeDirty: false })}
          >
            Open blueprint
          </button>
          <button className="btn small" onClick={() => ui.set({ highlightRoot: ui.highlightRoot === c.strain.rootId ? null : c.strain.rootId })}>
            Highlight lineage
          </button>
          <button className="btn small" onClick={() => ui.set({ view: 'lineage', lineageSelected: c.strain.id })}>
            Lineage
          </button>
          <button
            className="btn small danger"
            onClick={() => {
              kill(w, c, 'culled');
              w.purgeDead();
              ui.set({ selectedId: null });
            }}
          >
            Kill
          </button>
        </div>
      </section>

      <section>
        <div className="section-title">Vitals</div>
        <Bar label="Integrity" frac={c.integrity / c.maxIntegrity} color="#7dffa0" text={`${c.integrity.toFixed(1)}/${c.maxIntegrity.toFixed(0)}`} />
        <Bar label="Size" frac={c.mass / cd.divideMass} color="#b388ff" text={`${c.mass.toFixed(1)}/${cd.divideMass.toFixed(0)}`} />
        <Bar label="Charge" frac={tot(R_CHARGE) / cap(R_CHARGE)} color={RES_COLOR.charge} text={tot(R_CHARGE).toFixed(1)} />
        <Bar label="Sorb" frac={tot(R_SORB) / cap(R_SORB)} color={RES_COLOR.sorb} text={tot(R_SORB).toFixed(1)} />
        <Bar label="Lith" frac={tot(R_LITH) / cap(R_LITH)} color={RES_COLOR.lith} text={tot(R_LITH).toFixed(1)} />
        <Bar label="Murk" frac={tot(R_MURK) / cap(R_MURK)} color={RES_COLOR.murk} text={`${(c.toxicity * 100).toFixed(0)}%`} />
        <div className="kv" style={{ marginTop: 6 }}>
          <span>Growth</span>
          <span>{(c.growth * 1000).toFixed(1)} m/kt</span>
          <span>Heat stress</span>
          <span>{c.heatStress.toFixed(3)}</span>
          <span>Divisions</span>
          <span>{c.divisions}</span>
          <span>Position</span>
          <span>
            {c.x.toFixed(0)}, {c.y.toFixed(0)}
          </span>
        </div>
      </section>

      <section>
        <div className="section-title">Activity (last {c.histCount * 5} ticks)</div>
        <LineChart
          version={v}
          height={80}
          min={0}
          max={1.05}
          series={[
            { values: series(0), color: RES_COLOR.charge },
            { values: series(1), color: RES_COLOR.sorb },
            { values: series(2), color: RES_COLOR.murk },
            { values: series(3), color: '#b388ff' },
            { values: series(4), color: '#7dffa0' },
          ]}
        />
        <div className="row tiny dim" style={{ gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: RES_COLOR.charge }}>charge</span>
          <span style={{ color: RES_COLOR.sorb }}>sorb</span>
          <span style={{ color: RES_COLOR.murk }}>murk</span>
          <span style={{ color: '#b388ff' }}>size</span>
          <span style={{ color: '#7dffa0' }}>integrity</span>
        </div>
      </section>

      <section>
        <div className="section-title">Energy budget · net {(net * 1000).toFixed(1)} mC/tick</div>
        <LineChart version={v} height={44} zeroLine series={[{ values: series(5), color: net >= 0 ? '#7dffa0' : '#ff6b6b' }]} />
        <div className="row tiny dim" style={{ justifyContent: 'space-between', margin: '4px 0' }}>
          <span>← consumed</span>
          <span>produced →</span>
          <span>net mC</span>
        </div>
        <BudgetBars items={budget} />
      </section>

      <section>
        <div className="section-title">Components ({cd.n})</div>
        <div className="comp-list">
          {Array.from({ length: cd.n }, (_, i) => {
            const def = COMPONENT_DEFS[COMPONENT_TYPES[cd.types[i]]];
            const on = c.expressed(i);
            const e = c.eGen[i] - c.eUse[i];
            const outs = def.outputs;
            return (
              <div key={i} className={`comp-row ${on ? '' : 'off'}`} title={def.blurb}>
                <span className="glyph" style={{ background: def.color }}>
                  {def.glyph}
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {def.name}
                  {outs.length > 0 && (
                    <span className="dim mono tiny">
                      {' '}
                      {outs.map((o, k) => `${o.key[0]}${c.sensors[cd.outOffset[i] + k].toFixed(2)}`).join(' ')}
                    </span>
                  )}
                </span>
                <div className="bar" title="activity">
                  <i style={{ width: `${c.activity[i] * 100}%`, background: def.color }} />
                </div>
                <span className="e" style={{ color: e >= 0 ? 'var(--good)' : 'var(--dim)' }}>
                  {on ? `${e >= 0 ? '+' : ''}${(e * 1000).toFixed(1)}` : 'off'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {d.circuit.nodes.length > 0 && (
        <section>
          <div className="section-title">Circuit · live values</div>
          {d.circuit.nodes.map((n, i) => {
            const def = NODE_DEFS[n.kind];
            let label = def.label;
            if (n.kind === 'sensor' || n.kind === 'actuator') {
              const comp = d.components.find((x) => x.uid === n.ref);
              label = `${def.label}: ${comp ? COMPONENT_DEFS[comp.type].glyph : '?'}${n.port ? '.' + n.port : ''}`;
            }
            if (n.kind === 'action') label = `${ACTION_NAMES[n.params.which ?? 0]}`;
            if (n.kind === 'internal') label = `${INTERNAL_NAMES[n.params.which ?? 0]}`;
            const val = c.circuit.values[i] ?? 0;
            return (
              <div key={n.id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 34px', gap: 6, alignItems: 'center', fontSize: 10, marginBottom: 2 }}>
                <span className="dim" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  #{n.id} {label}
                </span>
                <div className="bar">
                  <i style={{ width: `${val * 100}%`, background: def.group === 'output' ? 'var(--accent3)' : def.group === 'input' ? '#f5f17a' : 'var(--accent)' }} />
                </div>
                <span className="mono" style={{ textAlign: 'right' }}>
                  {val.toFixed(2)}
                </span>
              </div>
            );
          })}
        </section>
      )}

      <ResourceNetwork c={c} />

      {org && <OrganismSection c={c} />}

      <section>
        <div className="section-title">Signal channels</div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${NUM_CHANNELS}, 1fr)`, gap: 6 }}>
          {Array.from(c.channels).map((x, k) => (
            <div key={k} style={{ textAlign: 'center' }}>
              <div style={{ height: 40, background: 'rgba(255,255,255,0.04)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${x * 100}%`, background: 'var(--accent3)', boxShadow: '0 0 8px var(--accent3)' }} />
              </div>
              <span className="tiny mono dim">ch{k + 1}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title">Membrane exchange</div>
        <div className="kv">
          {([['Sorb', 0], ['Lith', 1], ['Murk', 3]] as const).map(([n, r]) => (
            <Fragment key={n}>
              <span>{n}</span>
              <span style={{ color: c.membraneFlow[r] >= 0 ? 'var(--good)' : 'var(--warn)' }}>
                {c.membraneFlow[r] >= 0 ? 'in ' : 'out '}
                {Math.abs(c.membraneFlow[r] * 1000).toFixed(1)} m/kt
              </span>
            </Fragment>
          ))}
        </div>
      </section>

      <section>
        <div className="section-title">
          Bonds ({c.bonds.length}/{cd.bondSlots})
        </div>
        {c.bonds.length === 0 && <div className="tiny dim">No adhesion bonds.</div>}
        {c.bonds.map((b) => {
          const o = bondPartner(b, c);
          const sign = b.a === c ? 1 : -1;
          return (
            <div key={b.id} className="row tiny" style={{ borderTop: '1px solid var(--line)', padding: '3px 0', cursor: 'pointer' }} onClick={() => ui.set({ selectedId: o.id })}>
              <span className="mono">→ #{o.id}</span>
              <span className="dim">stretch {(b.stretch * 100).toFixed(0)}%</span>
              <span className="grow" />
              <span className="mono" style={{ color: RES_COLOR.charge }}>
                ⚡{(-sign * b.flow[R_CHARGE] * 1000).toFixed(1)}
              </span>
              <span className="mono" style={{ color: RES_COLOR.sorb }}>
                ◆{(-sign * b.flow[R_SORB] * 1000).toFixed(1)}
              </span>
            </div>
          );
        })}
      </section>
    </div>
  );
}

const RES_ICON = ['◆', '▲', '⚡', '●'];
const RES_COLS = [RES_COLOR.sorb, RES_COLOR.lith, RES_COLOR.charge, RES_COLOR.murk];

/** Every internal link (cytosol links + conduits) with its live flow per resource. */
function ResourceNetwork({ c }: { c: import('../../sim/cell').Cell }) {
  const cd = c.cd;
  const name = (node: number) => (node === 0 ? 'Cytosol' : `${COMPONENT_DEFS[COMPONENT_TYPES[cd.types[node - 1]]].glyph}#${cd.uids[node - 1]}`);
  const rows: { a: string; b: string; conduit: boolean; f: number[]; mag: number }[] = [];
  for (let e = 0; e < cd.numEdges; e++) {
    const f = [0, 1, 2, 3].map((r) => c.edgeFlow[e * 4 + r]);
    const mag = f.reduce((a, v) => a + Math.abs(v), 0);
    rows.push({ a: name(cd.edgeA[e]), b: name(cd.edgeB[e]), conduit: cd.edgeConduit[e] === 1, f, mag });
  }
  rows.sort((x, y) => y.mag - x.mag);
  const [open, setOpen] = useState(false);
  const shown = open ? rows : rows.slice(0, 6);
  return (
    <section>
      <div className="section-title">Resource network · {cd.numEdges} links</div>
      <div className="tiny dim" style={{ marginBottom: 4 }}>Flow per link in milli-units per tick (direction: first → second). Conduits are marked ═.</div>
      {shown.map((r, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, 42px)', gap: 4, fontSize: 10, alignItems: 'center', padding: '2px 0', borderTop: '1px solid var(--line)' }}>
          <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.a} {r.conduit ? '═' : '─'}▸ {r.b}
          </span>
          {r.f.map((v, k) => (
            <span key={k} className="mono" style={{ textAlign: 'right', color: Math.abs(v) < 1e-4 ? 'var(--dimmer)' : RES_COLS[k] }}>
              {RES_ICON[k]}
              {(v * 1000).toFixed(1)}
            </span>
          ))}
        </div>
      ))}
      {rows.length > 6 && (
        <button className="btn small" style={{ marginTop: 4 }} onClick={() => setOpen(!open)}>
          {open ? 'Show fewer' : `Show all ${rows.length}`}
        </button>
      )}
    </section>
  );
}

function OrganismSection({ c }: { c: import('../../sim/cell').Cell }) {
  const ui = useUI();
  const w = engine.world;
  const members = w.cells.filter((x) => x.organismId === c.organismId);
  const bonds = w.bonds.filter((b) => b.a.organismId === c.organismId);
  const tissues = [0, 0, 0, 0];
  let mass = 0;
  for (const m of members) {
    tissues[m.tissue]++;
    mass += m.mass;
  }
  const meanStretch = bonds.length ? bonds.reduce((a, b) => a + b.stretch, 0) / bonds.length : 0;
  const maxStretch = bonds.reduce((a, b) => Math.max(a, b.stretch), 0);
  const limit = bonds.length ? 0.35 + bonds[0].strength * 0.9 : 1;
  const stability = Math.max(0, 1 - maxStretch / limit);
  const names = c.cd.design.development.tissueNames;
  return (
    <section>
      <div className="section-title">Organism #{c.organismId}</div>
      <div className="kv">
        <span>Cells / bonds</span>
        <span>
          {members.length} / {bonds.length}
        </span>
        <span>Total biomass</span>
        <span>{mass.toFixed(1)}</span>
        <span>Mean bond stretch</span>
        <span>{(meanStretch * 100).toFixed(1)}%</span>
      </div>
      <Bar label="Stability" frac={stability} color={stability > 0.5 ? '#7dffa0' : '#ffb347'} text={`${(stability * 100).toFixed(0)}%`} />
      <div className="row" style={{ flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
        {tissues.map((n, t) =>
          n ? (
            <span key={t} className="chip" style={{ borderColor: TISSUE_COLORS[t], color: TISSUE_COLORS[t] }}>
              {names[t]} × {n}
            </span>
          ) : null,
        )}
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        <button
          className="btn small danger"
          onClick={() => {
            w.cullWhere((x) => x.organismId === c.organismId);
            ui.set({ selectedId: null });
          }}
        >
          Cull organism
        </button>
      </div>
    </section>
  );
}
