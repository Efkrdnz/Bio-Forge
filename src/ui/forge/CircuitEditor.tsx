import { useEffect, useRef, useState } from 'react';
import { useTicker, useUI } from '../store';
import { NODE_DEFS, ACTION_NAMES, INTERNAL_NAMES, type CircuitNodeDef, type NodeKind } from '../../sim/circuit';
import { COMPONENT_DEFS } from '../../sim/components';
import { addNode, addWire, edit, removeNode, removeWire } from './designOps';
import { chamber } from './chamber';
import type { CellDesign } from '../../sim/design';
import type { ParamDef } from '../../sim/components';

const NW = 156;
const HEAD = 24;
const ROW = 18;

function nodeTitle(n: CircuitNodeDef, d: CellDesign): string {
  const def = NODE_DEFS[n.kind];
  if (n.kind === 'sensor' || n.kind === 'actuator') {
    const c = d.components.find((x) => x.uid === n.ref);
    if (!c) return `${def.label}: (missing)`;
    const cd = COMPONENT_DEFS[c.type];
    if (n.kind === 'sensor') {
      const port = cd.outputs.find((o) => o.key === n.port);
      return `${cd.glyph}#${c.uid} ${port?.label ?? n.port}`;
    }
    return `Activate ${cd.glyph}#${c.uid}`;
  }
  if (n.kind === 'action') {
    const w = n.params.which ?? 0;
    return w === 4 ? `Become ${'ABCD'[n.params.k ?? 1]}` : ACTION_NAMES[w];
  }
  if (n.kind === 'internal') return INTERNAL_NAMES[n.params.which ?? 0];
  if (n.kind === 'signalIn' || n.kind === 'signalOut') return `${def.label} ch${(n.params.ch ?? 0) + 1}`;
  return def.label;
}

function nodeColor(kind: NodeKind): string {
  const g = NODE_DEFS[kind].group;
  return g === 'input' ? '#f5f17a' : g === 'output' ? '#ff6fd8' : g === 'memory' ? '#b388ff' : '#3ef0c6';
}

function nodeHeight(kind: NodeKind) {
  return HEAD + Math.max(1, NODE_DEFS[kind].slots.length) * ROW + 6;
}

export function CircuitEditor() {
  const ui = useUI();
  useTicker(10);
  const d = ui.forgeDesign;
  const [sel, setSel] = useState<number | null>(null);
  const [selWire, setSelWire] = useState<number | null>(null);
  const [pan, setPan] = useState({ x: 200, y: 20 });
  const [pending, setPending] = useState<{ from: number; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: number; ox: number; oy: number } | { pan: true; sx: number; sy: number; px: number; py: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const live = chamber.liveValues(d);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (useUI.getState().forgeTab !== 'circuit' || useUI.getState().view !== 'forge') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selWire !== null) {
          removeWire(selWire);
          setSelWire(null);
        } else if (sel !== null) {
          removeNode(sel);
          setSel(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, selWire]);

  const portOut = (n: CircuitNodeDef) => ({ x: n.x + NW, y: n.y + HEAD + ROW / 2 });
  const portIn = (n: CircuitNodeDef, slot: number) => ({ x: n.x, y: n.y + HEAD + ROW / 2 + slot * ROW });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = boxRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left - pan.x, y: e.clientY - r.top - pan.y };
  };

  const onBgDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('wires-bg')) return;
    setSel(null);
    setSelWire(null);
    dragRef.current = { pan: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const dr = dragRef.current;
    if (pending) {
      const p = local(e);
      setPending({ ...pending, x: p.x, y: p.y });
    }
    if (!dr) return;
    if ('pan' in dr) setPan({ x: dr.px + e.clientX - dr.sx, y: dr.py + e.clientY - dr.sy });
    else {
      const p = local(e);
      edit((dd) => {
        const n = dd.circuit.nodes.find((k) => k.id === dr.id);
        if (n) {
          n.x = Math.round((p.x - dr.ox) / 4) * 4;
          n.y = Math.round((p.y - dr.oy) / 4) * 4;
        }
      });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    if (pending) {
      // Hit-test input ports (pointer capture means the port itself never sees the release)
      const p = local(e);
      let best: { id: number; slot: number; dist: number } | null = null;
      for (const n of d.circuit.nodes) {
        NODE_DEFS[n.kind].slots.forEach((_, si) => {
          const q = portIn(n, si);
          const dist = Math.hypot(q.x - p.x, q.y - p.y);
          if (dist < 16 && (!best || dist < best.dist)) best = { id: n.id, slot: si, dist };
        });
      }
      const b = best as { id: number; slot: number; dist: number } | null;
      if (b) addWire(pending.from, b.id, b.slot);
      setPending(null);
    }
  };

  const idx = new Map(d.circuit.nodes.map((n, i) => [n.id, i]));
  const sensors = d.components.filter((c) => COMPONENT_DEFS[c.type].outputs.length);
  const actuated = d.components.filter((c) => COMPONENT_DEFS[c.type].actuated);
  const spawnPos = () => ({ x: -pan.x + 260 + (d.circuit.nodes.length % 5) * 24, y: -pan.y + 60 + (d.circuit.nodes.length % 7) * 30 });

  const selNode = d.circuit.nodes.find((n) => n.id === sel);

  return (
    <div className="circuit-wrap" data-testid="circuit-editor">
      <div className="panel node-palette">
        <div className="section-title">Sensors</div>
        {sensors.length === 0 && <div className="tiny dim">Add sensor components in Layout.</div>}
        {sensors.flatMap((c) =>
          COMPONENT_DEFS[c.type].outputs.map((o) => (
            <div key={`${c.uid}-${o.key}`} className="pal-item" onClick={() => { const p = spawnPos(); setSel(addNode('sensor', p.x, p.y, { ref: c.uid, port: o.key })); }}>
              <span className="nm small">{COMPONENT_DEFS[c.type].glyph}#{c.uid} · {o.label}</span>
              <span className="swatch" style={{ background: COMPONENT_DEFS[c.type].color }} />
            </div>
          )),
        )}
        {(['input', 'logic', 'memory'] as const).map((g) => (
          <div key={g}>
            <div className="section-title" style={{ marginTop: 8 }}>
              {g}
            </div>
            {Object.values(NODE_DEFS)
              .filter((k) => k.group === g && k.kind !== 'sensor')
              .map((k) => (
                <div key={k.kind} className="pal-item" title={k.blurb} onClick={() => { const p = spawnPos(); setSel(addNode(k.kind, p.x, p.y)); }}>
                  <span className="nm small">{k.label}</span>
                  <span className="swatch" style={{ background: nodeColor(k.kind) }} />
                </div>
              ))}
          </div>
        ))}
        <div className="section-title" style={{ marginTop: 8 }}>
          Actuators
        </div>
        {actuated.map((c) => (
          <div key={c.uid} className="pal-item" onClick={() => { const p = spawnPos(); setSel(addNode('actuator', p.x + 200, p.y, { ref: c.uid })); }}>
            <span className="nm small">Activate {COMPONENT_DEFS[c.type].glyph}#{c.uid}</span>
            <span className="swatch" style={{ background: COMPONENT_DEFS[c.type].color }} />
          </div>
        ))}
        <div className="section-title" style={{ marginTop: 8 }}>
          Cell actions
        </div>
        {ACTION_NAMES.map((a, i) => (
          <div key={a} className="pal-item" onClick={() => { const p = spawnPos(); setSel(addNode('action', p.x + 200, p.y, { params: { which: i, k: 1 } })); }}>
            <span className="nm small">{a}</span>
            <span className="swatch" style={{ background: '#ff6fd8' }} />
          </div>
        ))}
        <div className="pal-item" onClick={() => { const p = spawnPos(); setSel(addNode('signalOut', p.x + 200, p.y)); }}>
          <span className="nm small">Signal Out</span>
          <span className="swatch" style={{ background: '#ff6fd8' }} />
        </div>
      </div>

      <div
        ref={boxRef}
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: 'radial-gradient(circle at 50% 40%, #071a22, #02060a)', backgroundSize: 'cover' }}
        onPointerDown={onBgDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <div
          className="wires-bg"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(80,220,230,0.12) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />
        <svg style={{ position: 'absolute', left: pan.x, top: pan.y, overflow: 'visible', width: 1, height: 1 }}>
          {d.circuit.wires.map((wd, wi) => {
            const a = d.circuit.nodes.find((n) => n.id === wd.from);
            const b = d.circuit.nodes.find((n) => n.id === wd.to);
            if (!a || !b) return null;
            const p0 = portOut(a);
            const p1 = portIn(b, wd.slot);
            const dx = Math.max(40, Math.abs(p1.x - p0.x) * 0.5);
            const path = `M${p0.x},${p0.y} C${p0.x + dx},${p0.y} ${p1.x - dx},${p1.y} ${p1.x},${p1.y}`;
            const v = live ? live[idx.get(a.id)!] ?? 0 : 0.3;
            const selected = selWire === wi;
            return (
              <g key={wi} style={{ cursor: 'pointer' }} onPointerDown={(e) => { e.stopPropagation(); setSelWire(wi); setSel(null); }}>
                <path d={path} stroke="transparent" strokeWidth={12} fill="none" />
                <path d={path} stroke={selected ? '#fff' : `rgba(62,240,198,${0.25 + 0.75 * v})`} strokeWidth={selected ? 3 : 1.5 + v * 2} fill="none" style={{ filter: v > 0.5 ? 'drop-shadow(0 0 4px #3ef0c6)' : undefined }} />
              </g>
            );
          })}
          {pending && (() => {
            const a = d.circuit.nodes.find((n) => n.id === pending.from);
            if (!a) return null;
            const p0 = portOut(a);
            return <path d={`M${p0.x},${p0.y} L${pending.x},${pending.y}`} stroke="#fff" strokeDasharray="5 4" strokeWidth={1.5} fill="none" />;
          })()}
        </svg>
        <div style={{ position: 'absolute', left: pan.x, top: pan.y }}>
          {d.circuit.nodes.map((n) => {
            const def = NODE_DEFS[n.kind];
            const col = nodeColor(n.kind);
            const v = live ? live[idx.get(n.id)!] ?? 0 : null;
            const isSel = sel === n.id;
            return (
              <div
                key={n.id}
                data-node={n.id}
                className="panel"
                style={{
                  position: 'absolute',
                  left: n.x,
                  top: n.y,
                  width: NW,
                  height: nodeHeight(n.kind),
                  borderColor: isSel ? '#fff' : col + '88',
                  boxShadow: v !== null && v > 0.5 ? `0 0 14px ${col}55` : undefined,
                  userSelect: 'none',
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setSel(n.id);
                  setSelWire(null);
                  const p = local(e);
                  dragRef.current = { id: n.id, ox: p.x - n.x, oy: p.y - n.y };
                  boxRef.current!.setPointerCapture(e.pointerId);
                }}
              >
                <div style={{ height: HEAD, display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px', borderBottom: `1px solid ${col}44`, fontSize: 11 }}>
                  <span className="swatch" style={{ background: col }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nodeTitle(n, d)}</span>
                  {v !== null && <span className="mono tiny" style={{ color: v > 0.5 ? col : 'var(--dim)' }}>{v.toFixed(2)}</span>}
                </div>
                {def.slots.map((s, si) => (
                  <div key={s} style={{ position: 'absolute', left: 0, top: HEAD + si * ROW, height: ROW, display: 'flex', alignItems: 'center', fontSize: 10, color: 'var(--dim)' }}>
                    <span
                      title={`input: ${s}`}
                      style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${col}`, background: '#02060a', marginLeft: -7, marginRight: 5, cursor: 'crosshair' }}
                    />
                    {s}
                  </div>
                ))}
                {def.hasOutput && (
                  <span
                    title="output: drag to an input"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const p = local(e);
                      setPending({ from: n.id, x: p.x, y: p.y });
                      boxRef.current!.setPointerCapture(e.pointerId);
                    }}
                    style={{ position: 'absolute', right: -7, top: HEAD + ROW / 2 - 6, width: 12, height: 12, borderRadius: '50%', background: col, boxShadow: `0 0 8px ${col}`, cursor: 'crosshair' }}
                  />
                )}
                {v !== null && (
                  <div style={{ position: 'absolute', left: 8, right: 8, bottom: 4, height: 2, background: 'rgba(255,255,255,0.06)' }}>
                    <div style={{ width: `${v * 100}%`, height: '100%', background: col }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {d.circuit.nodes.length === 0 && (
          <div className="empty" style={{ position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', maxWidth: 360 }}>
            No circuit yet. Add a sensor and an actuator from the left, then drag from the sensor’s output dot to the actuator’s input.
            <br />
            Unwired actuated parts run at full power.
          </div>
        )}
      </div>

      {(selNode || selWire !== null) && (
        <div className="panel bracket node-props">
          {selNode ? <NodeProps n={selNode} d={d} onDelete={() => { removeNode(selNode.id); setSel(null); }} /> : null}
          {selWire !== null && !selNode && (
            <div className="col">
              <div className="section-title">Wire</div>
              <button className="btn small danger" onClick={() => { removeWire(selWire); setSelWire(null); }}>
                Delete wire
              </button>
            </div>
          )}
        </div>
      )}
      <div className="panel hint-strip" style={{ left: 196 }}>Drag output ● to input ○ · drag nodes · drag background to pan · Del deletes · live values from the Test Chamber</div>
    </div>
  );
}

function ParamSlider({ p, value, onChange }: { p: ParamDef; value: number; onChange: (v: number) => void }) {
  if (p.options)
    return (
      <div className="param">
        <label>{p.label}</label>
        <select value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ gridColumn: '2 / 4' }}>
          {p.options.map((o, i) => (
            <option key={o} value={i}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  return (
    <div className="param">
      <label title={p.hint}>{p.label}</label>
      <input type="range" min={p.min} max={p.max} step={p.step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="val">{value >= 10 ? value.toFixed(0) : value.toFixed(2)}</span>
    </div>
  );
}
export { ParamSlider };

function NodeProps({ n, d, onDelete }: { n: CircuitNodeDef; d: CellDesign; onDelete: () => void }) {
  const def = NODE_DEFS[n.kind];
  const set = (fn: (x: CircuitNodeDef) => void) =>
    edit((dd) => {
      const x = dd.circuit.nodes.find((k) => k.id === n.id);
      if (x) fn(x);
    });
  const sensors = d.components.filter((c) => COMPONENT_DEFS[c.type].outputs.length);
  const actuated = d.components.filter((c) => COMPONENT_DEFS[c.type].actuated);
  const ref = d.components.find((c) => c.uid === n.ref);
  return (
    <div className="col">
      <div className="section-title">
        {def.label} #{n.id}
      </div>
      <div className="tiny dim">{def.blurb}</div>
      {n.kind === 'sensor' && (
        <>
          <select value={n.ref ?? ''} onChange={(e) => set((x) => { x.ref = Number(e.target.value); const c = d.components.find((k) => k.uid === x.ref); x.port = c ? COMPONENT_DEFS[c.type].outputs[0]?.key : undefined; })}>
            {sensors.map((c) => (
              <option key={c.uid} value={c.uid}>
                {COMPONENT_DEFS[c.type].name} #{c.uid}
              </option>
            ))}
          </select>
          {ref && (
            <select value={n.port} onChange={(e) => set((x) => (x.port = e.target.value))}>
              {COMPONENT_DEFS[ref.type].outputs.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </>
      )}
      {n.kind === 'actuator' && (
        <select value={n.ref ?? ''} onChange={(e) => set((x) => (x.ref = Number(e.target.value)))}>
          {actuated.map((c) => (
            <option key={c.uid} value={c.uid}>
              {COMPONENT_DEFS[c.type].name} #{c.uid}
            </option>
          ))}
        </select>
      )}
      {def.params.map((p) => (
        <ParamSlider key={p.key} p={p} value={n.params[p.key] ?? p.default} onChange={(v) => set((x) => (x.params[p.key] = v))} />
      ))}
      <button className="btn small danger" onClick={onDelete}>
        Delete node
      </button>
    </div>
  );
}
