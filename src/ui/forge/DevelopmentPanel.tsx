import { useUI } from '../store';
import { edit } from './designOps';
import { COMPONENT_DEFS } from '../../sim/components';
import { TISSUE_RULE_LABEL, type DaughterTissueRule, type CellDesign } from '../../sim/design';
import { NUM_TISSUES } from '../../sim/constants';
import { TISSUE_COLORS } from '../../render/palette';

/** Schematic of where the first divisions place cells (ignores physics). */
function growthPreview(d: CellDesign) {
  const dev = d.development;
  const max = dev.mode === 'bonded' ? Math.min(16, dev.maxCells) : 2;
  type P = { x: number; y: number; tissue: number; divs: number; parent: number };
  const cells: P[] = [{ x: 0, y: 0, tissue: dev.startTissue, divs: 0, parent: -1 }];
  let guard = 0;
  while (cells.length < max && guard++ < 64) {
    const n = cells.length;
    for (let i = 0; i < n && cells.length < max; i++) {
      const p = cells[i];
      const ax = ((dev.divisionAngle + dev.rotateEach * p.divs) * Math.PI) / 180;
      let tissue = p.tissue;
      if (dev.daughterTissue === 'alternate') tissue = p.tissue === 0 ? 1 : 0;
      else if (dev.daughterTissue === 'cycle') tissue = (p.tissue + 1) % NUM_TISSUES;
      else if (dev.daughterTissue === 'toB') tissue = 1;
      else if (dev.daughterTissue === 'random') tissue = (i * 7 + p.divs) % NUM_TISSUES;
      // place daughter one diameter along the axis, nudged away from crowding
      let x = p.x + Math.cos(ax);
      let y = p.y + Math.sin(ax);
      for (let it = 0; it < 6; it++) {
        for (const q of cells) {
          const dx = x - q.x;
          const dy = y - q.y;
          const dd = Math.hypot(dx, dy);
          if (dd < 0.9 && dd > 1e-6) {
            x += (dx / dd) * (0.9 - dd) * 0.6;
            y += (dy / dd) * (0.9 - dd) * 0.6;
          }
        }
      }
      p.divs++;
      cells.push({ x, y, tissue, divs: 0, parent: i });
    }
  }
  return cells;
}

export function DevelopmentPanel() {
  const ui = useUI();
  const d = ui.forgeDesign;
  const dev = d.development;
  const set = (fn: (x: CellDesign['development']) => void) => edit((dd) => fn(dd.development));
  const prev = growthPreview(d);
  const minX = Math.min(...prev.map((p) => p.x)) - 1;
  const maxX = Math.max(...prev.map((p) => p.x)) + 1;
  const minY = Math.min(...prev.map((p) => p.y)) - 1;
  const maxY = Math.max(...prev.map((p) => p.y)) + 1;
  const span = Math.max(maxX - minX, maxY - minY);

  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: 18 }} data-testid="development">
      <div className="editor-grid">
        <div className="panel bracket">
          <div className="section-title">Life cycle</div>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className={`btn small ${dev.mode === 'separate' ? 'on' : ''}`} onClick={() => set((x) => (x.mode = 'separate'))}>
              Unicellular
            </button>
            <button className={`btn small ${dev.mode === 'bonded' ? 'on' : ''}`} onClick={() => set((x) => { x.mode = 'bonded'; if (x.maxCells < 2) x.maxCells = 6; })}>
              Multicellular (bonded)
            </button>
          </div>
          <div className="tiny dim" style={{ marginBottom: 8 }}>
            {dev.mode === 'bonded'
              ? 'Daughters stay bonded until the organism is full, then bud off to found a new organism. Needs Adhesion Knobs (2 bonds each).'
              : 'Daughters separate after division.'}
          </div>
          <div className="param">
            <label>Organism size</label>
            <input type="range" min={1} max={40} value={dev.maxCells} disabled={dev.mode !== 'bonded'} onChange={(e) => set((x) => (x.maxCells = Number(e.target.value)))} />
            <span className="val">{dev.maxCells}</span>
          </div>
          <div className="param">
            <label>Division axis</label>
            <input type="range" min={-180} max={180} step={5} value={dev.divisionAngle} onChange={(e) => set((x) => (x.divisionAngle = Number(e.target.value)))} />
            <span className="val">{dev.divisionAngle}°</span>
          </div>
          <div className="param">
            <label>Rotate each</label>
            <input type="range" min={-180} max={180} step={5} value={dev.rotateEach} onChange={(e) => set((x) => (x.rotateEach = Number(e.target.value)))} />
            <span className="val">{dev.rotateEach}°</span>
          </div>
          <div className="tiny dim">0° chains forward; 180° grows behind the parent; rotating each division by 60–120° makes sheets and clusters.</div>
        </div>

        <div className="panel bracket">
          <div className="section-title">Growth preview</div>
          <svg viewBox={`${minX} ${minY} ${span} ${span}`} style={{ width: '100%', height: 220, display: 'block' }}>
            <line x1={0.48} y1={0} x2={0.85} y2={0} stroke="#3ef0c6" strokeWidth={0.04} />
            <path d="M0.92,0 L0.82,-0.05 L0.82,0.05 Z" fill="#3ef0c6" />
            {prev.map((p, i) =>
              p.parent >= 0 ? (
                <line
                  key={`l${i}`}
                  x1={prev[p.parent].x}
                  y1={prev[p.parent].y}
                  x2={p.x}
                  y2={p.y}
                  stroke={dev.mode === 'bonded' ? 'rgba(160,240,255,0.5)' : 'rgba(160,240,255,0.15)'}
                  strokeWidth={0.08}
                  strokeDasharray={dev.mode === 'bonded' ? undefined : '0.1 0.1'}
                />
              ) : null,
            )}
            {prev.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={0.44} fill={TISSUE_COLORS[p.tissue] + '33'} stroke={TISSUE_COLORS[p.tissue]} strokeWidth={0.05} />
                <text x={p.x} y={p.y + 0.12} fontSize={0.32} textAnchor="middle" fill="#cfe">
                  {i + 1}
                </text>
              </g>
            ))}
          </svg>
          <div className="tiny dim">Schematic only: the Test Chamber shows the real, physics-based result.</div>
        </div>

        <div className="panel bracket">
          <div className="section-title">Differentiation</div>
          <div className="param">
            <label>Founder tissue</label>
            <select value={dev.startTissue} onChange={(e) => set((x) => (x.startTissue = Number(e.target.value)))} style={{ gridColumn: '2 / 4' }}>
              {dev.tissueNames.map((n, i) => (
                <option key={i} value={i}>
                  {'ABCD'[i]} · {n}
                </option>
              ))}
            </select>
          </div>
          <div className="param">
            <label>Daughter tissue</label>
            <select value={dev.daughterTissue} onChange={(e) => set((x) => (x.daughterTissue = e.target.value as DaughterTissueRule))} style={{ gridColumn: '2 / 4' }}>
              {Object.entries(TISSUE_RULE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          {dev.tissueNames.map((n, i) => (
            <div className="param" key={i}>
              <label style={{ color: TISSUE_COLORS[i] }}>Tissue {'ABCD'[i]}</label>
              <input type="text" value={n} onChange={(e) => set((x) => (x.tissueNames[i] = e.target.value.slice(0, 16)))} style={{ gridColumn: '2 / 4' }} />
            </div>
          ))}
          <div className="tiny dim">Circuits can also switch tissue at any time with the “Become tissue” action.</div>
        </div>

        <div className="panel bracket" style={{ gridColumn: '1 / -1' }}>
          <div className="section-title">Expression matrix · which parts each tissue builds</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', color: 'var(--dim)', fontWeight: 400 }}>Component</th>
                {dev.tissueNames.map((n, i) => (
                  <th key={i} style={{ color: TISSUE_COLORS[i], fontWeight: 600 }}>
                    {'ABCD'[i]} <span className="dim" style={{ fontWeight: 400 }}>{n}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.components.map((c) => (
                <tr key={c.uid} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '3px 0' }}>
                    <span className="glyph" style={{ background: COMPONENT_DEFS[c.type].color, padding: '1px 4px', marginRight: 6 }}>
                      {COMPONENT_DEFS[c.type].glyph}
                    </span>
                    {COMPONENT_DEFS[c.type].name} <span className="dim">#{c.uid}</span>
                  </td>
                  {Array.from({ length: NUM_TISSUES }, (_, t) => (
                    <td key={t} style={{ textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={(c.tissues & (1 << t)) !== 0}
                        disabled={c.type === 'core'}
                        onChange={() =>
                          edit((dd) => {
                            const x = dd.components.find((k) => k.uid === c.uid)!;
                            const m = x.tissues ^ (1 << t);
                            if (m) x.tissues = m;
                          })
                        }
                        aria-label={`${COMPONENT_DEFS[c.type].name} in tissue ${'ABCD'[t]}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
