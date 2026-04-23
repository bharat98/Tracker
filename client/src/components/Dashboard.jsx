import { C } from '../theme.js';

// ──────────────────────────────────────────────────────────────────
// ACTIVITY HEATMAP — last 24 weeks of (currently stubbed) activity
// ──────────────────────────────────────────────────────────────────
// TODO(events-table): once we persist status-change timestamps, swap the
// sine-wave seed for a real count grouped by day. For now it's deterministic
// per (day-index, company-count) so it doesn't flicker on re-render.
function buildActivity(companies, weeks = 24) {
  const today = new Date();
  const totalDays = weeks * 7;
  const base = companies.length;
  const days = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const noise = Math.sin(i * 0.3 + base) * 0.5 + 0.5;
    const prob = base > 0 ? 0.18 + noise * 0.25 : 0.08 + noise * 0.12;
    const r = Math.abs(Math.sin(i * 9301 + base * 49297)) % 1;
    const activity = r < prob ? Math.floor(((r * 10_000) % 4) + 1) : 0;
    days.push({ date: d, activity });
  }
  return packWeeks(days);
}

// ──────────────────────────────────────────────────────────────────
// COUNTDOWN HEATMAP — days between a fixed start and the deadline.
// Past days = colored, today = bright accent, future = gray. The start
// date is fixed so the total cell count doesn't shrink over time.
// ──────────────────────────────────────────────────────────────────
const COUNTDOWN_START = new Date(2026, 3, 22); // 2026-04-22 (month is 0-indexed)
const COUNTDOWN_END = new Date(2026, 6, 20); // 2026-07-20

function buildCountdown() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(COUNTDOWN_START);
  const end = new Date(COUNTDOWN_END);
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const date = new Date(d);
    const isToday = date.toDateString() === today.toDateString();
    const isPast = date < today;
    days.push({ date, isPast, isToday });
  }
  return packWeeks(days);
}

// Pack a flat list of days (oldest → newest) into 7-row-high columns starting
// on Sunday. Also compute month label positions for the column strip above.
function packWeeks(days) {
  if (days.length === 0) return { weekCols: [], months: [] };
  const firstDow = days[0].date.getDay();
  const padded = [...Array(firstDow).fill(null), ...days];
  const weekCols = [];
  for (let i = 0; i < padded.length; i += 7) weekCols.push(padded.slice(i, i + 7));

  const months = [];
  let lastMonth = -1;
  weekCols.forEach((wk, wi) => {
    const d = wk.find((x) => x);
    if (d && d.date.getMonth() !== lastMonth) {
      months.push({ wi, label: d.date.toLocaleString('default', { month: 'short' }) });
      lastMonth = d.date.getMonth();
    }
  });
  return { weekCols, months };
}

const activityColor = (n) => {
  if (!n) return C.border;
  if (n === 1) return 'rgba(194,150,106,0.30)';
  if (n === 2) return 'rgba(194,150,106,0.55)';
  if (n === 3) return 'rgba(194,150,106,0.80)';
  return C.accent;
};

const countdownColor = (day) => {
  if (!day) return C.bg;
  if (day.isToday) return C.accentBright;
  if (day.isPast) return C.accent;
  return C.border;
};

// Shared sub-component for either heatmap; each caller supplies its own cell
// coloring fn + tooltip builder. Keeps the two charts visually identical.
function HeatmapGrid({ weekCols, months, colorFor, titleFor }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 3, marginBottom: 3, paddingLeft: 22 }}>
        {weekCols.map((_, wi) => {
          const m = months.find((mm) => mm.wi === wi);
          return (
            <div key={wi} style={{ width: 10, fontSize: 9, color: C.textMuted, flexShrink: 0 }}>
              {m ? m.label : ''}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 3 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginRight: 2 }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div
              key={i}
              style={{ height: 10, fontSize: 8, color: C.textMuted, lineHeight: '10px' }}
            >
              {i % 2 === 1 ? d : ''}
            </div>
          ))}
        </div>
        {weekCols.map((wk, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {wk.map((day, di) => (
              <div
                key={di}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: colorFor(day),
                  opacity: day ? 1 : 0,
                }}
                title={day ? titleFor(day) : ''}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────
// SANKEY — true ribbon Sankey. Each flow is a closed SVG shape whose
// height encodes the count flowing through it, exactly like the
// LinkedIn pipeline diagram. Three stages:
//   Total  →  [Interview 1 | No Interview]
//             Interview 1  →  [Interview 2 | Ghosted]
// ──────────────────────────────────────────────────────────────────

// Ribbon: closed cubic-bezier band from (x1, ytl..ybl) to (x2, ytr..ybr).
const Ribbon = ({ x1, ytl, ybl, x2, ytr, ybr, color, opacity = 0.38 }) => {
  const mid = (x1 + x2) / 2;
  return (
    <path
      d={`M ${x1} ${ytl} C ${mid} ${ytl}, ${mid} ${ytr}, ${x2} ${ytr}
         L ${x2} ${ybr} C ${mid} ${ybr}, ${mid} ${ybl}, ${x1} ${ybl} Z`}
      fill={color}
      opacity={opacity}
    />
  );
};

// Vertical bar node + count + label.
const SankeyNode = ({ x, y, h, w = 16, color, count, label, side = 'right' }) => {
  const lx = side === 'right' ? x + w + 10 : x - 10;
  const anchor = side === 'right' ? 'start' : 'end';
  const midY = y + h / 2;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={color} rx={3} />
      <text x={lx} y={midY - 7} textAnchor={anchor} fill={color} fontSize={16} fontWeight={700}>
        {count}
      </text>
      <text x={lx} y={midY + 9} textAnchor={anchor} fill={C.textDim} fontSize={11}>
        {label}
      </text>
    </g>
  );
};

function PipelineSankey({ companies }) {
  const total = companies.length;
  if (total === 0) return null;

  // Match by position among statuses whose label contains "interview"
  // (case-insensitive). This handles custom labels like "HR interview" or
  // "VP Interview/Final round" without requiring exact strings.
  const nthInterviewCount = (nth) =>
    companies.filter((c) => {
      const ivs = (c.statuses || []).filter((s) =>
        s.label.toLowerCase().includes('interview')
      );
      return ivs[nth]?.checked;
    }).length;

  const i1 = nthInterviewCount(0);
  const i2 = nthInterviewCount(1);
  const noInterview = Math.max(0, total - i1);
  const ghosted = Math.max(0, i1 - i2);

  // Layout constants
  const W = 860;
  const H = 220;
  const yMin = 20;
  const availH = H - yMin * 2; // 180px
  const barW = 16;
  const minH = 22;
  const gap = 10; // gap between sibling bars
  const col0 = 30; // source x
  const col1 = 330; // split 1 x
  const col2 = 630; // split 2 x

  // Helper: height proportional to n out of denom, floored at minH
  const ph = (n, denom) =>
    denom > 0 && n > 0 ? Math.max(minH, (n / denom) * availH) : 0;

  // Level-1 bar heights
  const i1H = ph(i1, total);
  const noI1H = ph(noInterview, total);
  const l1TotalH = i1H + (i1H > 0 && noI1H > 0 ? gap : 0) + noI1H;
  const l1Top = yMin + (availH - l1TotalH) / 2;
  const i1Top = l1Top;
  const noI1Top = l1Top + i1H + (i1H > 0 ? gap : 0);

  // Level-2 bar heights (scaled within the Interview 1 bar)
  const i2H = i1 > 0 ? ph(i2, i1) * (i1H / availH) * (availH / 1) : 0;
  // re-scale proportionally within i1H
  const i2Hscaled = i1H > 0 && i2 > 0 ? Math.max(minH, (i2 / i1) * i1H) : 0;
  const ghostHscaled = i1H > 0 && ghosted > 0 ? Math.max(minH, (ghosted / i1) * i1H) : 0;
  const l2Gap = i2Hscaled > 0 && ghostHscaled > 0 ? gap : 0;
  const i2Top = i1Top;
  const ghostTop = i1Top + i2Hscaled + l2Gap;

  // Source exit proportions (continuous bar, no internal gap)
  const srcH = availH;
  const srcTop = yMin;
  const i1SrcBot = i1 > 0 ? srcTop + (i1 / total) * srcH : srcTop;
  // i1 bar exit proportions
  const i2ExitBot = i1 > 0 && i2 > 0 ? i1Top + (i2 / i1) * i1H : i1Top;

  const COLORS = {
    src: C.textDim,
    interviews: '#8A9EC2',
    noInterview: C.red,
    i2: C.green,
    ghosted: C.accentBright,
  };

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* ── Ribbons (draw first, behind bars) ── */}

      {/* Total → Interviews */}
      {i1 > 0 && (
        <Ribbon
          x1={col0 + barW} ytl={srcTop}    ybl={i1SrcBot}
          x2={col1}         ytr={i1Top}     ybr={i1Top + i1H}
          color={COLORS.interviews}
        />
      )}
      {/* Total → No Interview */}
      {noInterview > 0 && (
        <Ribbon
          x1={col0 + barW} ytl={i1SrcBot}         ybl={srcTop + srcH}
          x2={col1}         ytr={noI1Top}           ybr={noI1Top + noI1H}
          color={COLORS.noInterview}
        />
      )}
      {/* Interviews → Interview 2 */}
      {i2 > 0 && (
        <Ribbon
          x1={col1 + barW} ytl={i1Top}      ybl={i2ExitBot}
          x2={col2}         ytr={i2Top}      ybr={i2Top + i2Hscaled}
          color={COLORS.i2}
        />
      )}
      {/* Interviews → Ghosted */}
      {ghosted > 0 && (
        <Ribbon
          x1={col1 + barW} ytl={i2ExitBot}         ybl={i1Top + i1H}
          x2={col2}         ytr={ghostTop}           ybr={ghostTop + ghostHscaled}
          color={COLORS.ghosted}
        />
      )}

      {/* ── Bars + labels ── */}

      {/* Source */}
      <SankeyNode
        x={col0} y={srcTop} h={srcH} color={COLORS.src}
        count={total} label="Total" side="left"
      />
      {/* Interview 1 */}
      {i1 > 0 && (
        <SankeyNode
          x={col1} y={i1Top} h={i1H} color={COLORS.interviews}
          count={i1} label="Interviews"
        />
      )}
      {/* No Interview */}
      {noInterview > 0 && (
        <SankeyNode
          x={col1} y={noI1Top} h={noI1H} color={COLORS.noInterview}
          count={noInterview} label="No Interview"
        />
      )}
      {/* Interview 2 */}
      {i2 > 0 && (
        <SankeyNode
          x={col2} y={i2Top} h={i2Hscaled} color={COLORS.i2}
          count={i2} label="Interview 2"
        />
      )}
      {/* Ghosted */}
      {ghosted > 0 && (
        <SankeyNode
          x={col2} y={ghostTop} h={ghostHscaled} color={COLORS.ghosted}
          count={ghosted} label="Ghosted"
        />
      )}
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────────────
export default function Dashboard({ companies }) {
  const activity = buildActivity(companies);
  const countdown = buildCountdown();

  const total = companies.length;
  const ongoing = companies.filter((c) => (c.pipeline || 'ongoing') === 'ongoing').length;
  const rejected = companies.filter((c) => c.pipeline === 'rejected').length;
  // Any company with at least one interview-labeled status checked
  const i1 = companies.filter((c) =>
    (c.statuses || []).some(
      (s) => s.label.toLowerCase().includes('interview') && s.checked
    )
  ).length;

  // Countdown progress summary
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.max(
    0,
    Math.ceil((COUNTDOWN_END - today) / (1000 * 60 * 60 * 24))
  );
  const daysTotal = Math.ceil(
    (COUNTDOWN_END - COUNTDOWN_START) / (1000 * 60 * 60 * 24)
  );
  const daysPassed = Math.max(0, daysTotal - daysLeft);

  const panelStyle = {
    background: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 10,
    padding: '16px 18px',
  };
  const panelHeader = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  };
  const panelTitle = {
    fontSize: 12,
    fontWeight: 600,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
  };
  const panelMeta = { fontSize: 11, color: C.textMuted };

  const statCards = [
    { label: 'Total Tracked', value: total, color: C.accent },
    { label: 'Ongoing', value: ongoing, color: C.green },
    { label: 'Rejected', value: rejected, color: C.red },
    { label: 'Interviews', value: i1, color: '#8A9EC2' },
  ];

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Stats */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}
      >
        {statCards.map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: C.card,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 700, color, letterSpacing: '-0.03em' }}>
              {value}
            </div>
            <div
              style={{
                fontSize: 11,
                color: C.textMuted,
                marginTop: 3,
                textTransform: 'uppercase',
                letterSpacing: 0.8,
              }}
            >
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Activity + Countdown side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div style={panelStyle}>
          <div style={panelHeader}>
            <div style={panelTitle}>Activity</div>
            <div style={panelMeta}>Last 24 weeks</div>
          </div>
          <HeatmapGrid
            weekCols={activity.weekCols}
            months={activity.months}
            colorFor={(day) => (day ? activityColor(day.activity) : C.bg)}
            titleFor={(day) =>
              `${day.date.toDateString()}: ${day.activity} action${day.activity !== 1 ? 's' : ''}`
            }
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 10, color: C.textMuted }}>Less</span>
            {[0, 1, 2, 3, 4].map((n) => (
              <div
                key={n}
                style={{ width: 10, height: 10, borderRadius: 2, background: activityColor(n) }}
              />
            ))}
            <span style={{ fontSize: 10, color: C.textMuted }}>More</span>
          </div>
        </div>

        <div style={panelStyle}>
          <div style={panelHeader}>
            <div style={panelTitle}>Countdown to Jul 20</div>
            <div style={panelMeta}>
              {daysLeft} day{daysLeft === 1 ? '' : 's'} left
            </div>
          </div>
          <HeatmapGrid
            weekCols={countdown.weekCols}
            months={countdown.months}
            colorFor={countdownColor}
            titleFor={(day) =>
              day.isToday
                ? `${day.date.toDateString()} (today)`
                : day.isPast
                  ? `${day.date.toDateString()} (passed)`
                  : `${day.date.toDateString()}`
            }
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: C.border }} />
            <span style={{ fontSize: 10, color: C.textMuted }}>Remaining</span>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: C.accent,
                marginLeft: 8,
              }}
            />
            <span style={{ fontSize: 10, color: C.textMuted }}>Passed</span>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: C.accentBright,
                marginLeft: 8,
              }}
            />
            <span style={{ fontSize: 10, color: C.textMuted }}>Today</span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: C.textMuted }}>
              {daysPassed}/{daysTotal}
            </span>
          </div>
        </div>
      </div>

      {/* Full-width Sankey */}
      <div style={panelStyle}>
        <div style={panelHeader}>
          <div style={panelTitle}>Pipeline</div>
          <div style={panelMeta}>Drop-off at each stage</div>
        </div>
        {total === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '40px 0',
              color: C.textMuted,
              fontSize: 13,
            }}
          >
            No companies yet — add one to see the pipeline flow.
          </div>
        ) : (
          <PipelineSankey companies={companies} />
        )}
      </div>
    </div>
  );
}
