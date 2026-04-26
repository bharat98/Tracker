import { useState, useEffect, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { C } from '../theme.js';
import * as api from '../api.js';

// Warm monochromatic palette matching the app heatmap
const SEG = {
  water:  { color: 'rgba(100, 130, 160, 0.28)', label: 'Water'  },
  fat:    { color: 'rgba(184, 110,  72, 0.62)', label: 'Fat'    },
  muscle: { color: '#C49A3C',                    label: 'Muscle' },
};

const PAD = { top: 28, right: 20, bottom: 48, left: 48 };
const BAR_W = 22;
const BAR_GAP = 14;

function fmt(n) { return Number(n || 0).toFixed(1); }

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function labelDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function StackedBarChart({ data }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [hovered, setHovered] = useState(null); // index

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const svgH = 260;
  const chartH = svgH - PAD.top - PAD.bottom;

  const maxWeight = Math.max(...data.map(d => +d.muscle_kg + +d.fat_kg + +d.water_kg), 1);
  // Round up to nearest 10, add a bit of headroom for labels
  const yMax = Math.ceil(maxWeight / 10) * 10 + 5;

  const yPx = (kg) => PAD.top + chartH - (kg / yMax) * chartH;
  const hPx = (kg) => (kg / yMax) * chartH;

  const step = yMax > 80 ? 20 : yMax > 40 ? 10 : 5;
  const yTicks = [];
  for (let v = 0; v <= yMax; v += step) yTicks.push(v);

  // Chart width expands with data, but won't overflow container
  const minW = PAD.left + PAD.right + data.length * (BAR_W + BAR_GAP);
  const svgW = Math.max(width, minW);

  // Trend line points (top of each bar = total body weight)
  const trendPoints = data.map((d, i) => {
    const total = +d.muscle_kg + +d.fat_kg + +d.water_kg;
    const bx = PAD.left + i * (BAR_W + BAR_GAP) + BAR_W / 2;
    return [bx, yPx(total)];
  });

  return (
    <div ref={containerRef} style={{ overflowX: 'auto' }}>
      <svg
        width={svgW}
        height={svgH}
        style={{ display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Y-axis ticks + grid */}
        {yTicks.map(v => (
          <g key={v}>
            <line
              x1={PAD.left} y1={yPx(v)}
              x2={svgW - PAD.right} y2={yPx(v)}
              stroke={v === 0 ? C.border : C.borderLight}
              strokeWidth={v === 0 ? 1 : 0.5}
            />
            <text
              x={PAD.left - 8} y={yPx(v) + 4}
              textAnchor="end" fontSize={9}
              fontFamily="var(--font-mono)"
              fill={C.textMuted}
            >
              {v}
            </text>
          </g>
        ))}

        {/* Y axis spine */}
        <line
          x1={PAD.left} y1={PAD.top - 4}
          x2={PAD.left} y2={PAD.top + chartH}
          stroke={C.border} strokeWidth={1}
        />

        {/* Bars */}
        {data.map((d, i) => {
          const muscle = +d.muscle_kg;
          const fat    = +d.fat_kg;
          const water  = +d.water_kg;
          const total  = muscle + fat + water;
          const bx     = PAD.left + i * (BAR_W + BAR_GAP);
          const isHov  = hovered === i;

          return (
            <g
              key={d.id || d.date}
              onMouseEnter={() => setHovered(i)}
              style={{ cursor: 'default' }}
            >
              {/* hover highlight */}
              {isHov && (
                <rect
                  x={bx - 4} y={PAD.top - 2}
                  width={BAR_W + 8} height={chartH + 2}
                  fill={C.accentDim} rx={3}
                />
              )}

              {/* water (bottom) */}
              {water > 0 && (
                <rect
                  x={bx} y={yPx(water)} width={BAR_W} height={hPx(water)}
                  fill={SEG.water.color}
                />
              )}
              {/* fat (middle) */}
              {fat > 0 && (
                <rect
                  x={bx} y={yPx(water + fat)} width={BAR_W} height={hPx(fat)}
                  fill={SEG.fat.color}
                />
              )}
              {/* muscle (top) */}
              {muscle > 0 && (
                <rect
                  x={bx} y={yPx(total)} width={BAR_W} height={hPx(muscle)}
                  fill={SEG.muscle.color}
                  rx={2}
                />
              )}

              {/* thin segment dividers */}
              {water > 0 && fat > 0 && (
                <line x1={bx} y1={yPx(water)} x2={bx + BAR_W} y2={yPx(water)}
                  stroke={C.bg} strokeWidth={1.5} />
              )}
              {fat > 0 && muscle > 0 && (
                <line x1={bx} y1={yPx(water + fat)} x2={bx + BAR_W} y2={yPx(water + fat)}
                  stroke={C.bg} strokeWidth={1.5} />
              )}

              {/* body weight label above bar */}
              <text
                x={bx + BAR_W / 2} y={yPx(total) - 5}
                textAnchor="middle" fontSize={9}
                fontFamily="var(--font-mono)"
                fill={isHov ? C.text : C.textDim}
                fontWeight={isHov ? 700 : 400}
              >
                {fmt(total)}
              </text>

              {/* X label */}
              <text
                x={bx + BAR_W / 2}
                y={PAD.top + chartH + 14}
                textAnchor="middle" fontSize={9}
                fontFamily="var(--font-mono)"
                fill={isHov ? C.textDim : C.textMuted}
                transform={data.length > 10
                  ? `rotate(-40, ${bx + BAR_W / 2}, ${PAD.top + chartH + 14})`
                  : undefined}
              >
                {labelDate(d.date)}
              </text>

              {/* hover tooltip */}
              {isHov && (() => {
                const rows = [
                  { label: 'Muscle', val: `${fmt(muscle)} kg`, color: SEG.muscle.color },
                  { label: 'Fat',    val: `${fmt(fat)} kg`,    color: SEG.fat.color    },
                  { label: 'Water',  val: `${fmt(water)} kg`,  color: SEG.water.color  },
                ];
                const tipW = 120;
                const tipH = 14 + rows.length * 17;
                let tx = bx + BAR_W / 2 - tipW / 2;
                if (tx < PAD.left) tx = PAD.left;
                if (tx + tipW > svgW - PAD.right) tx = svgW - PAD.right - tipW;
                const ty = Math.max(PAD.top, yPx(total) - tipH - 14);
                return (
                  <g>
                    <rect x={tx} y={ty} width={tipW} height={tipH} rx={4}
                      fill={C.surface} stroke={C.border} strokeWidth={1}
                      style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,.09))' }}
                    />
                    {rows.map((r, ri) => (
                      <g key={r.label}>
                        <rect x={tx + 10} y={ty + 8 + ri * 17 + 4} width={7} height={7} rx={1}
                          fill={r.color} stroke={C.borderLight} strokeWidth={0.5} />
                        <text x={tx + 22} y={ty + 8 + ri * 17 + 11} fontSize={10} fill={C.textDim}
                          fontFamily="var(--font-mono)">{r.label}</text>
                        <text x={tx + tipW - 10} y={ty + 8 + ri * 17 + 11} fontSize={10}
                          fontWeight={600} fill={C.text} textAnchor="end"
                          fontFamily="var(--font-mono)">{r.val}</text>
                      </g>
                    ))}
                  </g>
                );
              })()}
            </g>
          );
        })}

        {/* Trend line — thin accent stroke connecting body weight tops */}
        {data.length > 1 && (
          <polyline
            points={trendPoints.map(([x, y]) => `${x + BAR_W / 2 - (BAR_W / 2)},${y}`).join(' ')}
            fill="none"
            stroke={C.accent}
            strokeWidth={1.5}
            strokeDasharray="3 3"
            opacity={0.55}
          />
        )}
      </svg>
    </div>
  );
}

// ── form input style ─────────────────────────────────────────────────────────
const inp = {
  border: `1px solid ${C.border}`,
  borderRadius: 4,
  padding: '6px 10px',
  fontSize: 13,
  fontFamily: 'var(--font-mono)',
  background: C.surface,
  color: C.text,
  width: '100%',
  boxSizing: 'border-box',
};

const sectionLabel = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: C.textDim,
  marginBottom: 14,
};

// ── page ─────────────────────────────────────────────────────────────────────
export default function FitnessPage() {
  const [logs, setLogs]   = useState([]);
  const [form, setForm]   = useState({ date: todayStr(), muscle_kg: '', fat_kg: '', water_kg: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => { api.listFitness().then(setLogs).catch(() => {}); }, []);

  const total = (+form.muscle_kg || 0) + (+form.fat_kg || 0) + (+form.water_kg || 0);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date || total === 0) { setError('Date and at least one weight value are required.'); return; }
    setError('');
    setSaving(true);
    try {
      const log = await api.createFitnessLog({
        date: form.date,
        muscle_kg: +form.muscle_kg || 0,
        fat_kg:    +form.fat_kg    || 0,
        water_kg:  +form.water_kg  || 0,
        notes:     form.notes,
      });
      setLogs(prev => {
        const without = prev.filter(l => l.date !== log.date);
        return [...without, log].sort((a, b) => a.date.localeCompare(b.date));
      });
      setForm(f => ({ ...f, muscle_kg: '', fat_kg: '', water_kg: '', notes: '' }));
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    await api.deleteFitnessLog(id);
    setLogs(prev => prev.filter(l => l.id !== id));
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', paddingBottom: 56 }}>

      {/* Chart header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 12 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textDim }}>
          Body Composition · kg
        </span>
        <div style={{ display: 'flex', gap: 16 }}>
          {Object.entries(SEG).reverse().map(([key, { color, label }]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 1, background: color, border: `1px solid ${C.borderLight}` }} />
              <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'var(--font-mono)' }}>{label}</span>
            </div>
          ))}
        </div>
        {logs.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 4 }}>
            <svg width={20} height={8}>
              <line x1={0} y1={4} x2={20} y2={4} stroke={C.accent} strokeWidth={1.5} strokeDasharray="3 3" opacity={0.55} />
            </svg>
            <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'var(--font-mono)' }}>Trend</span>
          </div>
        )}
      </div>

      {/* Chart */}
      {logs.length > 0 ? (
        <div style={{ marginBottom: 36 }}>
          <StackedBarChart data={logs} />
          <div style={{ height: 1, background: C.border, marginTop: 0 }} />
        </div>
      ) : (
        <div style={{ padding: '40px 0 36px', borderBottom: `1px solid ${C.border}`, marginBottom: 36, textAlign: 'center' }}>
          <div className="font-serif" style={{ fontSize: '1.6rem', fontWeight: 300, color: C.text, marginBottom: 6 }}>
            No measurements yet
          </div>
          <div style={{ fontSize: 13, color: C.textDim }}>
            Log your first entry below to start tracking body composition over time.
          </div>
        </div>
      )}

      {/* Log form */}
      <div style={{ marginBottom: 36 }}>
        <div style={sectionLabel}>Log Entry</div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>Date</div>
              <input type="date" value={form.date} onChange={set('date')} style={inp} required />
            </div>
            {[
              ['Muscle', 'muscle_kg', SEG.muscle.color],
              ['Fat',    'fat_kg',    SEG.fat.color],
              ['Water',  'water_kg',  SEG.water.color],
            ].map(([label, key, color]) => (
              <div key={key}>
                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>
                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 1, background: color, marginRight: 5, verticalAlign: 'middle' }} />
                  {label} kg
                </div>
                <input type="number" min="0" step="0.1" placeholder="0.0"
                  value={form[key]} onChange={set(key)} style={inp} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 10, color: C.textDim, marginBottom: 4, fontFamily: 'var(--font-mono)' }}>Notes</div>
              <input type="text" placeholder="optional" value={form.notes} onChange={set('notes')} style={inp} />
            </div>
            <div style={{ paddingBottom: 1 }}>
              <button type="submit" disabled={saving} style={{
                padding: '7px 18px',
                background: C.accent, color: '#fff',
                border: 'none', borderRadius: 4,
                fontSize: 12, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-mono)',
                opacity: saving ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}>
                {saving ? '…' : 'Log'}
              </button>
            </div>
          </div>
          {total > 0 && (
            <div style={{ marginTop: 8, fontSize: 11, color: C.textDim, fontFamily: 'var(--font-mono)' }}>
              body weight = <strong style={{ color: C.text }}>{fmt(total)} kg</strong>
            </div>
          )}
          {error && <div style={{ marginTop: 8, fontSize: 12, color: C.red }}>{error}</div>}
        </form>
      </div>

      {/* History */}
      {logs.length > 0 && (
        <div>
          <div style={sectionLabel}>History</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {['Date', 'Muscle', 'Fat', 'Water', 'Body wt', 'Notes', ''].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textMuted }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...logs].reverse().map((l) => {
                const bw = +l.muscle_kg + +l.fat_kg + +l.water_kg;
                return (
                  <tr key={l.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: '8px 12px', color: C.textDim }}>{labelDate(l.date)}</td>
                    <td style={{ padding: '8px 12px', color: SEG.muscle.color, fontWeight: 600 }}>{fmt(l.muscle_kg)}</td>
                    <td style={{ padding: '8px 12px', color: '#B87060'                          }}>{fmt(l.fat_kg)}</td>
                    <td style={{ padding: '8px 12px', color: C.textDim                         }}>{fmt(l.water_kg)}</td>
                    <td style={{ padding: '8px 12px', color: C.text,          fontWeight: 700  }}>{fmt(bw)} kg</td>
                    <td style={{ padding: '8px 12px', color: C.textMuted, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.notes || '—'}</td>
                    <td style={{ padding: '8px 4px' }}>
                      <button onClick={() => handleDelete(l.id)} title="Delete"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, padding: 4, display: 'inline-flex', opacity: 0.6 }}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
