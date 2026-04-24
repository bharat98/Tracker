# Job-Search CRM — Product Requirements Document

> A single-user, CRM-lite tool for running an active job search as an outbound campaign.
> Built for a job seeker who doesn't just "apply and wait" — they cold-email HMs, work LinkedIn, track templates, and need to know *who owes them a reply today*.

---

## 1. Problem

Existing free tools (Huntr, Teal, Simplify, JibberJobber, Streak, Notion templates) each cover *part* of an active job search:

- **Trackers (Huntr, Teal)** — good for "did I apply?", weak on contacts + messages.
- **Gmail CRMs (Streak)** — good for email threads, blind to LinkedIn.
- **LinkedIn itself** — doesn't expose acceptance/thread data to any tool.
- **DIY (Notion, Airtable)** — full flexibility, zero scaffolding, lots of upkeep.

No single tool natively covers:
1. Companies + roles I've engaged with.
2. **Contacts** at each company (HMs, recruiters, referrers, cold-reach targets) with LinkedIn connection state.
3. **Messages** I've sent to each contact, with the **template** I used.
4. **Follow-ups** — "nudge on date X if they haven't replied."
5. AI-native structured data so an LLM can later answer "what's working?"

## 2. Vision

A desktop-first web app where the primary unit isn't "an application" — it's **a relationship**. Every row is a company; inside each company is a cast of contacts and the running conversation with each one. The UI is intuitive enough that logging a cold email takes <10 seconds. The data layer is structured enough that an AI can later surface patterns the user can't.

## 3. Target User

A single job seeker (solo, not a team) running 20–100 simultaneous active conversations across applications, cold outreach, and referrals. They are technically literate and willing to trade 10s of data entry per action for the ability to ask, six weeks in, "which template gets the highest reply rate, and which company is about to ghost me?"

## 4. Design Principles

1. **Intuitive beats complete.** If a feature demands a form with 12 fields, it's wrong. Most logging should be one line of natural language + a confirm click.
2. **The data model is for the AI.** UI is natural-language. Underneath, every entry is normalized into structured rows so future AI/MCP tooling can query it.
3. **Single source of truth per entity.** Company state isn't duplicated into "stage" *and* "current_stage" *and* "status." Pick one canonical representation per concept.
4. **Local-first, exportable.** All data in a local SQLite DB. CSV/JSON export built in. No vendor lock-in.
5. **Free to run.** LLM calls go through OpenRouter's free-tier models (e.g., `minimax/minimax-m2.5:free`). No mandatory paid keys.

## 5. Non-Goals

- No Gmail or LinkedIn API integration in v1 (LinkedIn doesn't expose it; Gmail is too heavy). User copy-pastes or types summaries.
- No team/multi-user features.
- No native mobile app (web responsive is enough).
- No built-in resume builder or interview scheduler.
- No salary negotiation module.
- No public sharing / social features.

## 6. Data Model

### 6.1 `companies`
| field              | type     | notes                                                    |
|--------------------|----------|----------------------------------------------------------|
| id                 | uuid     | pk                                                       |
| name               | text     | required                                                 |
| role               | text     | job title                                                |
| location           | text     | "Remote", "NYC", etc.                                    |
| job_url            | text     | source listing                                           |
| source             | text     | freeform: "Referral from Raj", "LinkedIn search", etc.  |
| pipeline           | enum     | `ongoing` \| `rejected` \| `withdrawn` \| `offer`       |
| current_stage      | enum     | `sourced` \| `applied` \| `screen` \| `interview` \| `final` \| `offer` \| `closed` |
| resume_version     | text     | e.g. `v3-TAM-focus`                                      |
| created_at         | ts       |                                                          |
| notes              | text     | freeform                                                 |

### 6.2 `contacts`
| field              | type     | notes                                                    |
|--------------------|----------|----------------------------------------------------------|
| id                 | uuid     | pk                                                       |
| company_id         | uuid     | fk → companies                                           |
| name               | text     | required                                                 |
| title              | text     | "Director of Engineering", etc.                          |
| email              | text     |                                                          |
| linkedin_url       | text     |                                                          |
| role_type          | enum     | `hm` \| `recruiter` \| `referral` \| `cold_reach` \| `employee` |
| connection_status  | enum     | `none` \| `pending` \| `accepted` \| `declined`          |
| is_primary         | bool     | one primary contact per company for list view            |
| notes              | text     |                                                          |
| created_at         | ts       |                                                          |

### 6.3 `messages`
| field              | type     | notes                                                    |
|--------------------|----------|----------------------------------------------------------|
| id                 | uuid     | pk                                                       |
| contact_id         | uuid     | fk → contacts                                            |
| direction          | enum     | `outbound` \| `inbound`                                  |
| channel            | enum     | `linkedin` \| `email` \| `phone` \| `in_person` \| `other` |
| subject            | text     | nullable                                                 |
| body_summary       | text     | required; short AI-generated or user summary             |
| full_body          | text     | optional; the raw text if user pasted it                 |
| template_id        | uuid     | fk → templates, nullable                                 |
| sent_at            | ts       | required                                                 |
| next_followup_at   | ts       | nullable; drives the reminders view                      |
| replied            | bool     | default false; inbound messages flip sibling outbounds   |

### 6.4 `templates`
| field              | type     | notes                                                    |
|--------------------|----------|----------------------------------------------------------|
| id                 | uuid     | pk                                                       |
| name               | text     | "Cold HM intro v2"                                       |
| channel            | enum     | `linkedin` \| `email`                                    |
| subject_template   | text     | supports `{{placeholders}}`                              |
| body_template      | text     | supports `{{placeholders}}`                              |
| placeholders       | json     | auto-detected list, e.g. `["name", "company", "role"]`   |
| use_count          | int      | incremented each time used                               |
| reply_count        | int      | incremented when a linked message gets a reply           |
| created_at         | ts       |                                                          |

### 6.5 `events`
| field              | type     | notes                                                    |
|--------------------|----------|----------------------------------------------------------|
| id                 | uuid     | pk                                                       |
| company_id         | uuid     | fk → companies                                           |
| kind               | enum     | `applied` \| `responded` \| `scheduled` \| `interviewed` \| `advanced` \| `offer_received` \| `offer_accepted` \| `rejected` \| `ghosted` \| `withdrew` \| `note` |
| actor              | enum     | `me` \| `them`                                           |
| channel            | enum     | `linkedin` \| `email` \| `phone` \| `portal` \| `in_person` \| `video` \| `other` |
| timestamp          | ts       |                                                          |
| notes              | text     |                                                          |

> **Design note:** `events` are high-level milestones ("applied", "got offer"). `messages` are the low-level conversation log. Both exist. The AI funnel / heatmaps read from `events`; the "who owes me a reply" view reads from `messages`.

### 6.6 Relationships

```
companies 1──n contacts 1──n messages n──1 templates
    │
    └── 1──n events
```

## 7. Features

### 7.1 Companies
- **List view**: table/kanban with columns = pipeline stages. Each card shows company, role, primary contact, last-activity date, # of overdue follow-ups badge.
- **Add company**:
  - Manually (name + role minimum).
  - By URL paste: LLM extracts company + role + location from the job listing. (See §9.1.)
- **Detail view** (modal or right-pane): company fields editable inline; tabs for Contacts / Messages / Events / Notes.

### 7.2 Contacts
- **Per-company contact list** inside company detail.
- **Add contact** form: name (required), title, role_type, LinkedIn URL, email, connection_status, notes.
- **Edit / delete** with confirm on delete.
- **Primary contact** toggle — shown in company list row.
- **Connection status** shown as a pill; clicking cycles none→pending→accepted.

### 7.3 Messages
- **Inside a contact**: chronological list of messages (both directions).
- **Quick-log outbound** (the primary flow):
  - Button: "+ Log message sent"
  - Fields: channel (default: contact's preferred), template picker (optional, auto-fills body), body summary (required, ≤280 chars), full body (optional, collapsible), next-followup date (optional but encouraged).
  - Save → creates message + updates contact's `last_contacted_at`.
- **Log reply received**:
  - Button: "+ Log reply"
  - Fields: channel, summary, any outbound messages from this contact since the last reply get their `replied=true` flag flipped.
- **Template picker**: dropdown of user's templates for the selected channel; on select, body is filled with placeholders replaced from {{name}}, {{company}}, {{role}}.

### 7.4 Templates
- **Templates page** (top-level nav).
- **List** of user's templates with: name, channel, use_count, reply_count, reply rate %.
- **Create/edit**: name, channel, subject, body (textarea). Placeholders auto-detected from `{{...}}` syntax.
- **Usage analytics**: clicking a template shows every message that used it + reply rate.

### 7.5 Follow-ups / Reminders
- **Today view** on the dashboard: list of messages where `next_followup_at <= today` and `replied=false`.
- Each row: contact name, company, last-sent date, days overdue, quick-action buttons (Log follow-up / Mark replied / Snooze).
- **Snooze** bumps `next_followup_at` by user-picked days (1/3/7/custom).

### 7.6 Events (existing milestones log)
- Per-company event log (applied, interviewed, rejected, etc.) — mostly auto-emitted from state changes, can be manually added.
- This feeds the dashboard funnel and heatmaps.

### 7.7 Dashboard
- **Top stats**: total companies, ongoing, rejected, interviews this week, follow-ups overdue.
- **Activity heatmap**: last 24 weeks of events (GitHub-style).
- **Funnel** (Sankey): Total applications → [Interviewed | No interview] → [Advanced | Ghosted] → [Offer | Rejected].
- **Channel effectiveness**: bar chart of reply rate per channel (linkedin / email / portal) — computed from messages.
- **Template leaderboard**: top 5 templates by reply rate.

### 7.8 Natural-language quick log (AI-powered)
A global "+ Log" button that opens a text box. User types free-form:

> "Sent a LinkedIn InMail to Sarah Chen at ChurnZero using my 'v2-intro' template, follow up in 3 days if no reply"

On submit, an LLM call extracts:
```json
{
  "company": "ChurnZero",
  "contact": { "name": "Sarah Chen", "role_type": "cold_reach" },
  "message": {
    "channel": "linkedin",
    "direction": "outbound",
    "template_hint": "v2-intro",
    "body_summary": "Cold intro via LinkedIn InMail",
    "next_followup_days": 3
  }
}
```

The UI shows a **preview card** with extracted chips (each editable/removable). User hits Confirm → rows are created/updated. If the company or contact doesn't exist, it's created.

### 7.9 URL-based job extraction (existing pattern)
Paste a job URL → LLM extracts company name, role, location. Fast-path uses OG meta tags where possible to skip the LLM and save latency.

### 7.10 Import / Export
- **Export**: CSV files for companies, contacts, messages, templates, events. One-click ZIP download.
- **Import**: CSV upload with column mapping UI (v1.5 if time is tight).

## 8. Key User Flows

### Flow A — Log a new cold outreach (primary daily use)
1. User finds a company on LinkedIn → clicks "+ Add company" → pastes URL → extracted → saved.
2. In the new company modal, goes to Contacts tab → "+ Add contact" → types HM name, title, linkedin URL → sets role_type=`cold_reach`.
3. Goes to Messages → "+ Log message sent" → picks template "Cold HM intro v2" → body auto-fills → sets next-followup = +3 days → saves.
4. Total time: < 60 seconds.

### Flow B — Natural-language log (power user)
1. User opens quick-log → types one paragraph describing the day's actions.
2. AI extracts 3 messages across 2 contacts at 1 company.
3. Preview chips shown → user tweaks one → confirms.
4. Total time: < 30 seconds for 3 logged actions.

### Flow C — Morning follow-up sweep
1. User opens dashboard → sees "5 overdue follow-ups."
2. For each, clicks "Log follow-up" → picks template → sends → updates `next_followup_at=+7`.
3. Total time: < 2 minutes for 5 follow-ups.

### Flow D — End-of-week review
1. User opens dashboard → sees funnel, heatmap, channel bar, template leaderboard.
2. Notices "email template 'warm-ref v3'" has 40% reply rate, "linkedin v1" has 3%.
3. Archives v1, uses v3 more. (Manual decision — app doesn't nudge.)

## 9. AI / LLM Integration

### 9.1 URL → Company/Role extraction
- Input: job listing URL.
- Fast path: fetch page, parse OpenGraph `og:title`, `og:site_name` — if clean, use directly.
- Fallback: send HTML snippet to LLM, prompt it for `{ company, role, location }`.
- Model: free tier (e.g., `minimax/minimax-m2.5:free`).

### 9.2 Natural-language → structured log
- Input: free-form sentence(s).
- Prompt returns JSON `{ company, contact, message, event? }`.
- Validate against Zod/JSON schema. On parse failure, show user the raw text in a normal form.
- Model: free tier.

### 9.3 (Stretch) Weekly digest
- Batch-process last 7 days of events + messages → summarize in 3 bullets.
- "You applied to 12 companies, sent 34 messages, got 5 replies. Email had 2x the reply rate of LinkedIn this week."

## 10. Tech Recommendations (stack-agnostic)

The PRD is stack-agnostic, but the reference implementation uses:

- **Frontend**: React 18 + Vite. Desktop-first. No component library required; inline styles or Tailwind both fine.
- **Backend**: Node + Express. (Any language is fine — Python/FastAPI, Go/net-http also acceptable.)
- **DB**: SQLite (via better-sqlite3 in Node). A single file. Migrations should be idempotent (check column existence before `ALTER TABLE ADD COLUMN`).
- **LLM**: OpenRouter (BYO API key, env var `OPENROUTER_API_KEY`). Free-tier model default.
- **Deployment**: Runs locally on `localhost:3000` (client) + `localhost:3001` (server). Optional GCP Cloud Run deploy.

## 11. Acceptance Criteria (Definition of Done)

For v1 ship, all of these must pass:

**Companies**
- [ ] Can add a company manually.
- [ ] Can add a company by pasting a URL (LLM extracts name + role).
- [ ] Can see all companies in a list and filter by pipeline.
- [ ] Can edit all company fields inline.
- [ ] Can delete a company (cascade deletes contacts, messages, events).

**Contacts**
- [ ] Can add multiple contacts per company.
- [ ] Can set role_type and connection_status.
- [ ] One contact per company can be marked primary.

**Messages**
- [ ] Can log an outbound message with a template.
- [ ] Templates auto-fill body with placeholder substitution.
- [ ] Can set a next-followup date.
- [ ] Can log an inbound reply, which flips `replied=true` on outbound siblings.

**Templates**
- [ ] Can CRUD templates.
- [ ] Each template shows use_count and reply_count.
- [ ] Placeholders are auto-detected from `{{...}}`.

**Follow-ups**
- [ ] Today view shows messages with overdue follow-ups.
- [ ] Can snooze, mark replied, or log follow-up from the reminders view.

**Dashboard**
- [ ] Shows top-line stats.
- [ ] Activity heatmap renders for last 24 weeks.
- [ ] Funnel/Sankey renders.
- [ ] Channel reply-rate chart renders from message data.
- [ ] Template leaderboard renders.

**AI**
- [ ] URL extraction works for at least LinkedIn, company career pages, Greenhouse, Lever.
- [ ] Natural-language quick-log parses a sample sentence and shows preview chips.
- [ ] If LLM fails, user falls through to manual form.

**Data**
- [ ] SQLite DB migrations are idempotent (running twice doesn't break).
- [ ] CSV export works for all entities.
- [ ] No data loss on browser refresh or app restart.

## 12. Out-of-Scope (v1.5 / v2)

- CSV import with column mapping
- Gmail OAuth integration (auto-pull reply threads)
- Mobile responsive polish
- Multi-user / shared workspaces
- Public sharing links for specific companies (e.g., send a recruiter a "see my process" link — probably never)
- MCP server exposing companies/contacts/messages/events to an external AI assistant

## 13. Open Questions

1. **Template placeholders**: support conditional blocks (`{{#if referrer}}...{{/if}}`) or keep dumb string replace? → Default: dumb string replace.
2. **Message full_body storage**: store indefinitely or auto-prune after N months? → Default: keep everything; user can delete.
3. **Archive vs delete**: should rejected companies archive (hidden but recoverable) or delete? → Default: archive (pipeline=rejected hides from default list, stays in DB).
4. **Timezones**: store all timestamps as UTC epoch ms, render in user's local TZ. One canonical source.

---

*End of PRD. Feed this whole file to the builder. Anything ambiguous, default to the simpler option.*
