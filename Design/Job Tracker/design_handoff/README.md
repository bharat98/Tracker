# Handoff: Job Tracker — Tabs, Pipeline Status & Dashboard

## Overview
This handoff covers three features added on top of the existing Job Tracker codebase:
1. **Ongoing / Rejected / All tabs** — segregate companies by pipeline state
2. **Pipeline status dropdown** — per-company Ongoing / Rejected selector on the row card
3. **Dashboard tab** — activity heatmap (GitHub-contribution style) + pipeline funnel tree

The HTML prototype in this folder is a **high-fidelity design reference** built in React + Babel. Do not ship it directly. Implement the described features inside the existing Vite + React codebase (`client/src/`) using the established file structure, `theme.js` tokens, and Express/SQLite API patterns.

---

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions match the existing `theme.js` exactly. Reuse those tokens. The Dashboard charts are design-level sketches — exact chart library choice is left to the developer (Recharts, Nivo, or custom SVG are all fine).

---

## Files in This Package
| File | Description |
|------|-------------|
| `Job Tracker v2.html` | Full interactive prototype — open in any browser |
| `screenshots/01-dashboard.png` | Dashboard tab with heatmap + funnel |
| `screenshots/02-ongoing.png` | Ongoing tab with pipeline dropdown visible |
| `screenshots/03-rejected.png` | Rejected tab (muted, strikethrough styling) |
| `README.md` | This document |

---

## Feature 1 — Pipeline Status Field

### Data Model Change
Add a `pipeline` column to the SQLite `companies` table:
```sql
ALTER TABLE companies ADD COLUMN pipeline TEXT NOT NULL DEFAULT 'ongoing';
-- Values: 'ongoing' | 'rejected'
```

Update `db.js` to:
- Include `pipeline` in `SELECT` queries
- Accept `pipeline` in `updateCompany` patch
- Default to `'ongoing'` on `createCompany`

### UI — Pipeline Dropdown on CompanyRow
Location: `client/src/components/CompanyRow.jsx`, inside the **Company name column**, below the progress bar.

```
┌─────────────────────┐
│ Google              │
│ TAM                 │
│ ▓▓▓▒▒▒▒▒▒▒▒  3/8  │
│ ┌──────────────┐   │
│ │ ● Ongoing  ▾ │   │
│ └──────────────┘   │
└─────────────────────┘
```

**Dropdown spec:**
- Width: `100%` of the name column
- Padding: `2px 5px`
- Border radius: `4px`
- Border: `1px solid ${C.border}`
- Font size: `11px`, weight `600`
- **Ongoing state:** background `rgba(194,150,106,0.15)`, color `${C.accent}`, label `● Ongoing`
- **Rejected state:** background `rgba(192,112,96,0.12)`, color `${C.red}`, label `✕ Rejected`

**When set to Rejected, the entire row:**
- `opacity: 0.75`
- Company name gets `text-decoration: line-through`
- Progress bar color changes from `${C.green}` → `${C.red}`
- Border color: `rgba(192,112,96,0.3)`

**onChange handler:** call `onUpdate({ pipeline: e.target.value })` — this patches via `PUT /companies/:id`.

---

## Feature 2 — Tabs (Dashboard / Ongoing / Rejected / All)

### Tab Bar
Replace the existing column-header section in `App.jsx` with a tab bar above the content panel. The active tab "merges" into the content box below (browser-tab style — no bottom border on active tab).

**Tab order:** Dashboard · Ongoing · Rejected · All

**Tab bar container:**
```
display: flex
align-items: flex-end
margin-bottom: 0
```

**Each tab button:**
| State | Background | Color | Border |
|-------|-----------|-------|--------|
| Active | `${C.surface}` | `${C.text}` | `1px solid ${C.border}` on top/left/right; bottom matches surface bg (removes line) |
| Inactive | `transparent` | `${C.textDim}` | `1px solid transparent` |

- Padding: `9px 22px 10px`
- Border radius: `8px 8px 0 0`
- Font size: `13px`
- Active font weight: `600`, inactive: `400`
- Active tab: `margin-bottom: -1px` to overlap the content box border
- Count badge: `font-size: 11px`, `opacity: 0.55`, `font-weight: 400`, preceded by a space

**Filler div** after the last tab: `flex: 1`, `border-bottom: 1px solid ${C.border}` — completes the horizontal line.

**Content box** (wraps column headers + rows):
```css
border: 1px solid ${C.border};
border-top: none;
border-radius: 0 8px 8px 8px;
padding: 16px 14px;
background: ${C.surface};
```

### Tab counts
| Tab | Count |
|-----|-------|
| Dashboard | — (no badge) |
| Ongoing | companies where `pipeline === 'ongoing'` |
| Rejected | companies where `pipeline === 'rejected'` (hide badge when 0) |
| All | `companies.length` |

### Filtering
```js
const visibleCompanies = companies.filter(c => {
  if (activeTab === 'ongoing')  return (c.pipeline || 'ongoing') === 'ongoing';
  if (activeTab === 'rejected') return c.pipeline === 'rejected';
  return true; // 'all'
});
```
Column headers and rows are hidden when `activeTab === 'dashboard'`.

---

## Feature 3 — Dashboard Tab

The Dashboard tab renders two side-by-side panels inside the content box.

### 3a — Stats Row
Four stat cards in a 4-column grid above the charts.

| Stat | Value | Accent color |
|------|-------|-------------|
| Total Tracked | `companies.length` | `${C.accent}` |
| Ongoing | count where pipeline=ongoing | `${C.green}` |
| Rejected | count where pipeline=rejected | `${C.red}` |
| Interviews | count where Interview 1 is checked | `#8A9EC2` |

Each card:
- Background: `${C.card}`, border `1px solid ${C.border}`, border radius `8px`
- Padding: `14px 16px`
- Value: `font-size: 22px`, `font-weight: 700`, `letter-spacing: -0.03em`
- Label: `font-size: 11px`, `color: ${C.textMuted}`, `text-transform: uppercase`, `letter-spacing: 0.8px`

### 3b — Activity Heatmap (left panel)
GitHub contribution-style calendar grid. Shows the **last 24 weeks** of job application activity.

**Data source (future):** derive from company `created_at` timestamps and status-update events stored in the DB. For now, seed from company count.

**Layout:**
- Day labels (S M T W T F S) on the left, `font-size: 8px`, `color: ${C.textMuted}`, show only M/W/F
- Month labels above columns, `font-size: 9px`
- Cell size: `10×10px`, `border-radius: 2px`, gap: `3px`

**Cell colors by activity level:**
| Level | Color |
|-------|-------|
| 0 (no activity) | `${C.border}` |
| 1 | `rgba(194,150,106,0.30)` |
| 2 | `rgba(194,150,106,0.55)` |
| 3 | `rgba(194,150,106,0.80)` |
| 4+ | `${C.accent}` — `#C2966A` |

Legend: Less → 5 swatches → More, `font-size: 10px`, below the grid.

**Future:** clicking a cell should filter the company list to that day's activity.

### 3c — Pipeline Funnel Tree (right panel)
An SVG tree showing how many companies are at each stage, with rejection branches off each node.

**Main spine (left side, vertical dashed line):**
Nodes from top to bottom:
1. Total → 2. LinkedIn Reachout → 3. Applied → 4. Interview 1 → 5. Interview 2

**Branch nodes (right side, connected via curved bezier paths):**
| Branching from | Branch label | Color |
|---------------|-------------|-------|
| Reachout | No Response | `${C.red}` |
| Applied | Rejected | `${C.red}` |
| Interview 1 | Ghosted | `${C.red}` |
| Interview 2 | Ongoing | `${C.green}` |

**Node style:**
- Circle: `r=18`, `fill: color + '22'` (22% alpha), `stroke: color`, `strokeWidth: 1.5`
- Count text: `font-size: 13px`, `font-weight: 700`, centered in circle
- Label text: `font-size: 11px`, `color: ${C.textDim}`, 26px right of circle center

**Branch paths:** cubic bezier `M x1,y1 C midX,y1 midX,y2 x2,y2`, `strokeDasharray: "4,3"`, `opacity: 0.7`

**Data derivation:**
```js
// Count companies where that status checkbox is checked
const reachoutCount = companies.filter(c =>
  c.statuses?.some(s => s.label === 'LinkedIn Reachout' && s.checked)
).length;
// ...etc for each stage
```

---

## Design Tokens (from `client/src/theme.js`)
```js
bg:           '#0F0F0F'
surface:      '#1A1A1A'
surfaceHover: '#222222'
card:         '#161616'
accent:       '#C2966A'
accentDim:    'rgba(194,150,106,0.15)'
accentBright: '#D4A87A'
border:       '#2A2A2A'
borderLight:  '#333'
text:         '#E8E0D8'
textDim:      '#8A7E72'
textMuted:    '#5A5048'
green:        '#7AA870'
greenDim:     'rgba(122,168,112,0.15)'
red:          '#C07060'
redDim:       'rgba(192,112,96,0.12)'
```
Font: `DM Sans` (already loaded), fallback `sans-serif`.

---

## State & API Changes Needed

### New state in `App.jsx`
```js
const [activeTab, setActiveTab] = useState('dashboard');
```

### New DB column
```sql
ALTER TABLE companies ADD COLUMN pipeline TEXT NOT NULL DEFAULT 'ongoing';
```

### `db.js` — include `pipeline` in all company queries and updates.

### `CompanyRow.jsx` — accept `pipeline` from company object; render the dropdown; call `onUpdate({ pipeline })`.

### No new API endpoints required — `PUT /companies/:id` already accepts arbitrary patches.

---

## Interactions
| Interaction | Behavior |
|------------|---------|
| Click tab | Switch `activeTab` state, re-render content |
| Pipeline dropdown change | Immediately update local state + `PUT /companies/:id`; if on Ongoing/Rejected tab, row disappears (filtered out) |
| Heatmap cell hover | Show tooltip: date + activity count (future) |
| Funnel node hover | Highlight connected paths (future) |

---

## Out of Scope (Future Work)
- Heatmap driven by real timestamped events (needs an `events` table in SQLite)
- Funnel drill-down: click a node to filter company list
- Chart library integration (Recharts/Nivo) for more polished rendering
- AI-generated next steps from Notes/Gameplay text
