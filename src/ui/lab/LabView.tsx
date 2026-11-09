import { useRef, useState } from 'react';
import { engine } from '../engine';
import { useEngineVersion, useUI } from '../store';
import { tutorials, experiments } from '../../sim/presets/experiments';
import type { ExperimentDef, Goal, GoalKind, Inoculation, ScheduleEvent } from '../../sim/experiment';
import { DEFAULT_PARAMS, PARAM_META, type SimParams } from '../../sim/params';
import { COMPONENT_TYPES, COMPONENT_DEFS, type ComponentType } from '../../sim/components';
import { cloneDesign } from '../../sim/design';
import { Icon } from '../Icon';

const GOAL_KINDS: { kind: GoalKind; label: string; fields: ('designId' | 'n' | 'ticks' | 'component' | 'zone')[] }[] = [
  { kind: 'population', label: 'Population ≥ n', fields: ['designId', 'n'] },
  { kind: 'survive', label: 'Lineage survives until tick', fields: ['designId', 'ticks'] },
  { kind: 'organism', label: 'Organism of ≥ n cells', fields: ['designId', 'n'] },
  { kind: 'tissues', label: 'Organism with n tissues', fields: ['designId', 'n'] },
  { kind: 'diversity', label: '≥ n living strains', fields: ['designId', 'n'] },
  { kind: 'depth', label: 'Strain n mutations deep', fields: ['designId', 'n'] },
  { kind: 'extinct', label: 'Lineage goes extinct', fields: ['designId'] },
  { kind: 'hasComponent', label: 'Living design has component', fields: ['designId', 'component', 'n'] },
  { kind: 'region', label: '≥ n cells inside a zone', fields: ['designId', 'n', 'zone'] },
  { kind: 'netEnergy', label: 'A cell nets ≥ n mC/tick', fields: ['designId', 'n'] },
  { kind: 'conduits', label: 'Living design has n conduits', fields: ['designId', 'n'] },
  { kind: 'heatTolerance', label: 'Lineage mean heat tolerance ≥ n/100', fields: ['designId', 'n'] },
];

function blankExperiment(): ExperimentDef {
  return {
    id: `user-${Date.now().toString(36)}`,
    name: 'My experiment',
    summary: 'Describe the question you are testing.',
    category: 'experiment',
    seed: Math.floor(Math.random() * 1000),
    params: {},
    inoculations: [{ designId: 'protocell', count: 10, angle: 0, dist: 0, spread: 0.4 }],
    schedule: [],
    goals: [],
    designs: [],
  };
}

export function LabView() {
  useEngineVersion();
  const ui = useUI();
  const [draft, setDraft] = useState<ExperimentDef>(() => JSON.parse(JSON.stringify(engine.currentExperiment ?? blankExperiment())));
  const fileRef = useRef<HTMLInputElement>(null);
  const expFileRef = useRef<HTMLInputElement>(null);
  const [slotName, setSlotName] = useState('');

  const run = (exp: ExperimentDef) => {
    // Embed every referenced design so the experiment is self-contained
    const all = engine.allDesigns();
    const ids = new Set<string>([...exp.inoculations.map((i) => i.designId), ...exp.schedule.filter((s) => s.kind === 'inoculate').map((s) => (s as Inoculation).designId)]);
    const designs = [...exp.designs];
    for (const id of ids) if (!designs.some((d) => d.id === id)) {
      const d = all.find((x) => x.id === id);
      if (d) designs.push(cloneDesign(d));
    }
    const full = { ...exp, designs };
    engine.startExperiment(full);
    ui.set({ view: 'dish', selectedId: null, highlightRoot: null });
    ui.toast(`Started “${exp.name}”`, 'good');
  };

  const card = (e: ExperimentDef, user = false) => (
    <div key={e.id} className={`panel card ${engine.currentExperiment?.id === e.id ? 'current' : ''}`} onClick={() => setDraft(JSON.parse(JSON.stringify(e)))} data-testid={`card-${e.id}`}>
      <div className="row">
        <span className="tag">{e.category}</span>
        <span className="grow" />
        {user && (
          <button className="btn small danger" onClick={(ev) => { ev.stopPropagation(); engine.deleteUserExperiment(e.id); }}>
            <Icon name="trash" size={11} />
          </button>
        )}
        <button
          className="btn small primary"
          onClick={(ev) => {
            ev.stopPropagation();
            run(e);
          }}
          data-testid={`run-${e.id}`}
        >
          ▶ Run
        </button>
      </div>
      <h5>{e.name}</h5>
      <p>{e.summary}</p>
    </div>
  );

  const saveFile = (name: string, text: string) => {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="lab">
      <div className="presets">
        <div className="section-title">Tutorials · learn by doing</div>
        {tutorials().map((e) => card(e))}
        <div className="section-title" style={{ marginTop: 14 }}>
          Experiments
        </div>
        {experiments().map((e) => card(e))}
        <div className="section-title" style={{ marginTop: 14 }}>
          My experiments
        </div>
        {engine.userExperiments.length === 0 && <div className="tiny dim">Edit any experiment and press “Save as mine”.</div>}
        {engine.userExperiments.map((e) => card(e, true))}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => setDraft(blankExperiment())}>
            <Icon name="plus" size={11} /> New experiment
          </button>
          <button className="btn small" onClick={() => expFileRef.current?.click()}>
            <Icon name="upload" size={11} /> Import
          </button>
          <input
            ref={expFileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const j = JSON.parse(await f.text());
                if (j.format !== 'bioforge-experiment') throw new Error();
                setDraft(j.experiment);
                ui.toast('Experiment imported', 'good');
              } catch {
                ui.toast('Not a BIOFORGE experiment file', 'warn');
              }
            }}
          />
        </div>
      </div>

      <div>
        <ExperimentEditor draft={draft} setDraft={setDraft} />
        <div className="row" style={{ marginTop: 14, position: 'sticky', bottom: 0, padding: '10px 0', background: 'linear-gradient(transparent, var(--bg) 30%)' }}>
          <button className="btn primary" onClick={() => run(draft)} data-testid="run-draft">
            ▶ Run this experiment
          </button>
          <button
            className="btn"
            onClick={() => {
              const e = { ...draft, id: draft.id.startsWith('user-') ? draft.id : `user-${Date.now().toString(36)}`, category: draft.category === 'tutorial' ? 'experiment' : draft.category } as ExperimentDef;
              setDraft(e);
              engine.saveUserExperiment(e);
              ui.toast('Saved to My experiments', 'good');
            }}
          >
            <Icon name="save" size={12} /> Save as mine
          </button>
          <button className="btn" onClick={() => saveFile(`${draft.name.replace(/\W+/g, '_')}.bioforge-experiment.json`, JSON.stringify({ format: 'bioforge-experiment', experiment: draft }, null, 2))}>
            <Icon name="download" size={12} /> Export
          </button>
        </div>
      </div>

      <div className="slots">
        <div className="section-title">Save current world</div>
        <div className="row">
          <input type="text" placeholder={`Dish @ t${engine.world.tick}`} value={slotName} onChange={(e) => setSlotName(e.target.value)} className="grow" />
          <button
            className="btn small primary"
            onClick={async () => {
              const r = await engine.saveToSlot(slotName || `${engine.world.experiment?.name ?? 'Dish'} @ t${engine.world.tick}`);
              ui.toast(r.message, r.ok ? 'good' : 'warn');
              setSlotName('');
            }}
            data-testid="save-slot"
          >
            <Icon name="save" size={12} /> Save
          </button>
        </div>
        <div className="col" style={{ marginTop: 10, gap: 6 }}>
          {engine.slots().length === 0 && <div className="tiny dim">No saved worlds yet. Saves live in this browser’s storage.</div>}
          {engine.slots().map((s) => (
            <div key={s.id} className="panel" style={{ padding: 8 }}>
              <div style={{ fontSize: 12 }}>{s.name}</div>
              <div className="tiny dim mono">
                t{s.tick} · {s.cells} cells · {(s.size / 1024).toFixed(0)} KB · {new Date(s.savedAt).toLocaleString()}
              </div>
              <div className="row" style={{ marginTop: 6 }}>
                <button
                  className="btn small"
                  onClick={async () => {
                    const r = await engine.loadSlot(s.id);
                    ui.toast(r.message, r.ok ? 'good' : 'warn');
                    if (r.ok) ui.set({ view: 'dish', selectedId: null });
                  }}
                >
                  <Icon name="load" size={11} /> Load
                </button>
                <button className="btn small danger" onClick={() => engine.deleteSlot(s.id)}>
                  <Icon name="trash" size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="section-title" style={{ marginTop: 16 }}>
          Files
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <button className="btn small" onClick={() => saveFile(`bioforge-world-t${engine.world.tick}.json`, engine.exportJSON())}>
            <Icon name="download" size={12} /> Export world
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={12} /> Import world
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const r = engine.importJSON(await f.text());
              ui.toast(r.message, r.ok ? 'good' : 'warn');
              if (r.ok) ui.set({ view: 'dish', selectedId: null });
            }}
          />
        </div>
        <div className="section-title" style={{ marginTop: 16 }}>
          My blueprints ({engine.library.length})
        </div>
        {engine.library.length === 0 && <div className="tiny dim">Designs you save in the Forge appear here.</div>}
        {engine.library.map((d) => (
          <div key={d.id} className="row tiny" style={{ borderTop: '1px solid var(--line)', padding: '4px 0' }}>
            <span className="swatch" style={{ background: `hsl(${d.hue},85%,62%)` }} />
            <span className="grow">{d.name}</span>
            <button className="btn small" onClick={() => ui.set({ forgeDesign: cloneDesign(d), view: 'forge', forgeSelected: null, forgeDirty: false })}>
              edit
            </button>
            <button className="btn small danger" onClick={() => engine.deleteDesign(d.id)}>
              <Icon name="trash" size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExperimentEditor({ draft, setDraft }: { draft: ExperimentDef; setDraft: (d: ExperimentDef) => void }) {
  const designs = engine.allDesigns();
  for (const d of draft.designs) if (!designs.some((x) => x.id === d.id)) designs.push(d);
  const up = (fn: (d: ExperimentDef) => void) => {
    const c = JSON.parse(JSON.stringify(draft)) as ExperimentDef;
    fn(c);
    setDraft(c);
  };
  const designSelect = (value: string | undefined, onChange: (v: string) => void, allowAny = false) => (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {allowAny && <option value="">any lineage</option>}
      {designs.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
  const num = (v: number | undefined, onChange: (n: number) => void, step = 1, title?: string) => (
    <input type="number" value={v ?? 0} step={step} title={title} onChange={(e) => onChange(Number(e.target.value))} />
  );
  return (
    <div data-testid="experiment-editor">
      <div className="panel bracket" style={{ padding: 14, marginBottom: 12 }}>
        <div className="row">
          <input type="text" value={draft.name} onChange={(e) => up((d) => (d.name = e.target.value))} style={{ fontSize: 16, fontWeight: 600, flex: 1 }} aria-label="Experiment name" />
          <span className="tiny dim">seed</span>
          {num(draft.seed, (n) => up((d) => (d.seed = n)))}
        </div>
        <textarea value={draft.summary} onChange={(e) => up((d) => (d.summary = e.target.value))} rows={2} style={{ width: '100%', marginTop: 8, resize: 'vertical' }} aria-label="Summary" />
      </div>
      <div className="editor-grid">
        <div className="panel">
          <div className="section-title">Environment overrides</div>
          {PARAM_META.map((m) => {
            const on = m.key in draft.params;
            const v = (draft.params as Record<string, unknown>)[m.key] ?? (DEFAULT_PARAMS as unknown as Record<string, unknown>)[m.key];
            return (
              <div key={m.key} className="row tiny" style={{ marginBottom: 3 }}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) =>
                    up((d) => {
                      const p = d.params as Record<string, unknown>;
                      if (e.target.checked) p[m.key] = (DEFAULT_PARAMS as unknown as Record<string, unknown>)[m.key];
                      else delete p[m.key];
                    })
                  }
                  aria-label={`override ${m.label}`}
                />
                <span className="grow" style={{ color: on ? 'var(--text)' : 'var(--dim)' }}>
                  {m.label}
                </span>
                {on &&
                  (m.kind === 'enum' ? (
                    <select value={String(v)} onChange={(e) => up((d) => ((d.params as Record<string, unknown>)[m.key] = e.target.value))}>
                      {m.options!.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : m.kind === 'bool' ? (
                    <input type="checkbox" checked={Boolean(v)} onChange={(e) => up((d) => ((d.params as Record<string, unknown>)[m.key] = e.target.checked))} />
                  ) : (
                    <input type="number" value={Number(v)} min={m.min} max={m.max} step={m.step} onChange={(e) => up((d) => ((d.params as Record<string, unknown>)[m.key] = Number(e.target.value)))} />
                  ))}
                {!on && <span className="mono dim">{String(v)}</span>}
              </div>
            );
          })}
        </div>

        <div className="col" style={{ gap: 12 }}>
          <div className="panel">
            <div className="section-title">Inoculations · founders at start</div>
            <div className="tiny dim">Position: angle (°) and distance from the centre (0–1 of the dish radius).</div>
            {draft.inoculations.map((inoc, i) => (
              <div key={i} className="list-row">
                {designSelect(inoc.designId, (v) => up((d) => (d.inoculations[i].designId = v)))}
                ×{num(inoc.count, (n) => up((d) => (d.inoculations[i].count = Math.max(1, Math.min(200, n)))))}
                @{num(inoc.angle, (n) => up((d) => (d.inoculations[i].angle = n)), 15, 'angle')}°
                r{num(inoc.dist, (n) => up((d) => (d.inoculations[i].dist = n)), 0.05, 'distance')}
                ±{num(inoc.spread, (n) => up((d) => (d.inoculations[i].spread = n)), 0.05, 'spread')}
                <button className="btn small danger" onClick={() => up((d) => d.inoculations.splice(i, 1))}>
                  ×
                </button>
              </div>
            ))}
            <button className="btn small" onClick={() => up((d) => d.inoculations.push({ designId: designs[0]?.id ?? 'protocell', count: 8, angle: 0, dist: 0.3, spread: 0.2 }))}>
              + founder group
            </button>
          </div>

          <div className="panel">
            <div className="section-title">Schedule · timed events</div>
            {draft.schedule.map((ev, i) => (
              <ScheduleRow key={i} ev={ev} designs={designs.map((d) => ({ id: d.id, name: d.name }))} onChange={(nev) => up((d) => (d.schedule[i] = nev))} onDelete={() => up((d) => d.schedule.splice(i, 1))} />
            ))}
            <div className="row">
              <button className="btn small" onClick={() => up((d) => d.schedule.push({ tick: 2000, kind: 'set', key: 'baseHeat', value: 0.7, label: 'Heat wave' }))}>
                + set parameter
              </button>
              <button className="btn small" onClick={() => up((d) => d.schedule.push({ tick: 1000, kind: 'pulse', field: 'sorb', angle: 0, dist: 0, r: 0.3, amount: 5, label: 'Nutrient pulse' }))}>
                + field pulse
              </button>
              <button className="btn small" onClick={() => up((d) => d.schedule.push({ tick: 1500, kind: 'inoculate', designId: 'lysin-hunter', count: 5, angle: 0, dist: 0, spread: 0.2, label: 'Invaders arrive' }))}>
                + inoculation
              </button>
            </div>
          </div>

          <div className="panel">
            <div className="section-title">Goals · live checklist</div>
            {draft.goals.map((g, i) => (
              <GoalRow key={g.id} g={g} designSelect={designSelect} onChange={(ng) => up((d) => (d.goals[i] = ng))} onDelete={() => up((d) => d.goals.splice(i, 1))} />
            ))}
            <button
              className="btn small"
              onClick={() => up((d) => d.goals.push({ id: `g${Date.now().toString(36)}`, kind: 'population', label: 'Reach 50 cells', n: 50, designId: draft.inoculations[0]?.designId }))}
            >
              + goal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleRow({ ev, designs, onChange, onDelete }: { ev: ScheduleEvent; designs: { id: string; name: string }[]; onChange: (e: ScheduleEvent) => void; onDelete: () => void }) {
  const set = (patch: Partial<ScheduleEvent>) => onChange({ ...ev, ...patch } as ScheduleEvent);
  return (
    <div className="list-row">
      t<input type="number" value={ev.tick} step={100} onChange={(e) => set({ tick: Number(e.target.value) })} />
      <input type="text" value={ev.label ?? ''} placeholder="label" onChange={(e) => set({ label: e.target.value })} style={{ width: 110 }} />
      {ev.kind === 'set' && (
        <>
          <select value={ev.key} onChange={(e) => set({ key: e.target.value as keyof SimParams, value: DEFAULT_PARAMS[e.target.value as keyof SimParams] } as Partial<ScheduleEvent>)}>
            {PARAM_META.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
          =
          {typeof ev.value === 'string' ? (
            <select value={ev.value} onChange={(e) => set({ value: e.target.value } as Partial<ScheduleEvent>)}>
              {PARAM_META.find((m) => m.key === ev.key)?.options?.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : typeof ev.value === 'boolean' ? (
            <input type="checkbox" checked={ev.value} onChange={(e) => set({ value: e.target.checked } as Partial<ScheduleEvent>)} />
          ) : (
            <input type="number" value={ev.value} step={0.001} onChange={(e) => set({ value: Number(e.target.value) } as Partial<ScheduleEvent>)} />
          )}
        </>
      )}
      {ev.kind === 'pulse' && (
        <>
          <select value={ev.field} onChange={(e) => set({ field: e.target.value as 'sorb' } as Partial<ScheduleEvent>)}>
            {['sorb', 'lith', 'murk', 'heat'].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
          +<input type="number" value={ev.amount} step={0.5} onChange={(e) => set({ amount: Number(e.target.value) } as Partial<ScheduleEvent>)} />@
          <input type="number" value={ev.angle} step={15} onChange={(e) => set({ angle: Number(e.target.value) } as Partial<ScheduleEvent>)} />° r
          <input type="number" value={ev.r} step={0.05} onChange={(e) => set({ r: Number(e.target.value) } as Partial<ScheduleEvent>)} />
        </>
      )}
      {ev.kind === 'inoculate' && (
        <>
          <select value={ev.designId} onChange={(e) => set({ designId: e.target.value } as Partial<ScheduleEvent>)}>
            {designs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          ×<input type="number" value={ev.count} onChange={(e) => set({ count: Number(e.target.value) } as Partial<ScheduleEvent>)} />
        </>
      )}
      <button className="btn small danger" onClick={onDelete}>
        ×
      </button>
    </div>
  );
}

function GoalRow({
  g,
  designSelect,
  onChange,
  onDelete,
}: {
  g: Goal;
  designSelect: (v: string | undefined, f: (v: string) => void, any?: boolean) => React.ReactNode;
  onChange: (g: Goal) => void;
  onDelete: () => void;
}) {
  const meta = GOAL_KINDS.find((k) => k.kind === g.kind) ?? GOAL_KINDS[0];
  const set = (p: Partial<Goal>) => onChange({ ...g, ...p });
  return (
    <div className="list-row">
      <select value={g.kind} onChange={(e) => set({ kind: e.target.value as GoalKind })}>
        {GOAL_KINDS.map((k) => (
          <option key={k.kind} value={k.kind}>
            {k.label}
          </option>
        ))}
      </select>
      {meta.fields.includes('designId') && designSelect(g.designId, (v) => set({ designId: v || undefined }), true)}
      {meta.fields.includes('n') && (
        <>
          n<input type="number" value={g.n ?? 1} onChange={(e) => set({ n: Number(e.target.value) })} />
        </>
      )}
      {meta.fields.includes('ticks') && (
        <>
          t<input type="number" value={g.ticks ?? 1000} step={100} onChange={(e) => set({ ticks: Number(e.target.value) })} />
        </>
      )}
      {meta.fields.includes('component') && (
        <select value={g.component ?? 'combustor'} onChange={(e) => set({ component: e.target.value as ComponentType })}>
          {COMPONENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {COMPONENT_DEFS[t].name}
            </option>
          ))}
        </select>
      )}
      {meta.fields.includes('zone') && (
        <>
          @<input type="number" value={g.angle ?? 0} step={15} onChange={(e) => set({ angle: Number(e.target.value) })} />° d
          <input type="number" value={g.dist ?? 0.5} step={0.05} onChange={(e) => set({ dist: Number(e.target.value) })} /> r
          <input type="number" value={g.r ?? 0.25} step={0.05} onChange={(e) => set({ r: Number(e.target.value) })} />
        </>
      )}
      <input type="text" value={g.label} onChange={(e) => set({ label: e.target.value })} style={{ flex: 1, minWidth: 120 }} placeholder="label shown in the checklist" />
      <button className="btn small danger" onClick={onDelete}>
        ×
      </button>
    </div>
  );
}
