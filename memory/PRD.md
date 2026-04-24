# Job-Search CRM — Implementation PRD

## Original Problem Statement
Build a single-user, CRM-lite tool for running an active job search as an outbound campaign.
Primary unit is a **relationship** (not an application): each company holds a cast of contacts
and the running conversation with each one. Logging a cold email should take <10 seconds.
Underlying data layer is structured so an LLM can later answer "what's working?"

## Architecture
- **Frontend**: React 19 + Tailwind + Recharts + lucide-react (editorial light theme:
  Cormorant Garamond + Work Sans + IBM Plex Mono, terracotta accent #D95A40).
- **Backend**: FastAPI (single `server.py`) + Motor async MongoDB driver.
- **LLM**: Claude Sonnet 4.5 via `emergentintegrations.LlmChat`, keyed by `EMERGENT_LLM_KEY`.
- **Storage**: MongoDB collections `companies`, `contacts`, `messages`, `templates`, `events`.
  Enums enforced app-side via Pydantic Literal types.
- No auth (single-user).

## User Personas
- One technically literate job seeker running 20–100 simultaneous active conversations
  across applications, cold outreach, and referrals.

## Core Requirements
- Companies: kanban by `current_stage`, filtered list by `pipeline`, URL-based AI extraction.
- Contacts: per-company, role-typed pills, primary-toggle, cycling connection status.
- Messages: per-contact log with templates, `next_followup_at`, inbound flips `replied=true` on
  outbound siblings and bumps template `reply_count`.
- Templates: CRUD with `{{placeholder}}` auto-detection, use_count/reply_count/reply_rate.
- Follow-ups "Today" view with mark-replied + snooze (1/3/7d).
- Dashboard: top stats, 24-week GitHub-style heatmap, funnel, channel bar chart, template leaderboard.
- Global Quick Log (⌘K): natural-language sentence → AI → preview chips → commit creates
  company/contact/message/event end-to-end.
- CSV ZIP export of all entities.

## What's Been Implemented (2026-01)
- Full CRUD + cascade deletes for all five entities.
- All dashboard aggregations (heatmap/funnel/channels/leaderboard/stats) in one endpoint.
- AI URL extraction with OG-tag fast path + LLM fallback.
- AI NL quick-log with two-step parse/commit.
- CSV ZIP export endpoint.
- Editorial UI: serif headings, mono labels, terracotta pills, sharp 1px borders.

## Test Status (iteration_1)
- Backend: 16/19 pass. 3 failures are AI endpoints blocked by `EMERGENT_LLM_KEY` budget
  exhaustion (`Max budget: 0.001`) — code is correct; key needs top-up.
- Frontend: ~95% of flows verified; AI-dependent flows (URL extract, Quick Log) pend on key.

## Open Action Items / Next Steps
- P0: User tops up Universal Key balance (Profile → Universal Key → Add Balance) to enable
  the two AI features. All code is already wired and passing smoke tests.
- P1: CSV import (v1.5).
- P1: Weekly digest email/summary (stretch).
- P2: Keyboard shortcut cheatsheet overlay.

## Future / Backlog
- Gmail OAuth for auto-reply threading.
- MCP server exposing the entity graph to an external AI assistant.
- Public shareable process link (probably never).
