import { useState, useEffect, useCallback } from 'react';
import { C } from '../theme.js';
import * as api from '../api.js';

// Canonical event kinds. Keep in sync with the AI-facing MCP spec —
// these are the values analytics will group by. Each kind is tagged
// 'me' (you did it) or 'them' (company did it) to hint a sensible
// default actor when logging from the UI.
const EVENT_KINDS = [
  { value: 'reached_out',    label: 'Reached out',         actor: 'me' },
  { value: 'applied',        label: 'Applied',             actor: 'me' },
  { value: 'hm_contacted',   label: 'Contacted HM',        actor: 'me' },
  { value: 'responded',      label: 'Got response',        actor: 'them' },
  { value: 'scheduled',      label: 'Interview scheduled', actor: 'them' },
  { value: 'interviewed',    label: 'Interview completed', actor: 'me' },
  { value: 'advanced',       label: 'Advanced to next round', actor: 'them' },
  { value: 'offer_received', label: 'Offer received',      actor: 'them' },
  { value: 'offer_accepted', label: 'Offer accepted',      actor: 'me' },
  { value: 'rejected',       label: 'Rejected',            actor: 'them' },
  { value: 'ghosted',        label: 'Ghosted',             actor: 'them' },
  { value: 'withdrew',       label: 'Withdrew',            actor: 'me' },
  { value: 'note',           label: 'Note',                actor: 'me' },
];

const CHANNEL_OPTIONS = [
  { value: '', label: '—' },
  { value: 'linkedin',  label: 'LinkedIn' },
  { value: 'email',     label: 'Email' },
  { value: 'phone',     label: 'Phone / call' },
  { value: 'in_person', label: 'In person' },
  { value: 'portal',    label: 'Portal' },
  { value: 'video',     label: 'Video call' },
  { value: 'other',     label: 'Other' },
];

const kindLabel = (k) => EVENT_KINDS.find((e) => e.value === k)?.label || k;

// Format as "Apr 23, 2026 · 14:32"
const fmtTs = (ts) => {
  const d = new Date(ts);
  return `${d.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

// Convert timestamp → "YYYY-MM-DDTHH:MM" for datetime-local input
const tsToLocalInput = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function EventLog({ companyId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  // New-event form state
  const [kind, setKind] = useState('applied');
  const [actor, setActor] = useState('me');
  const [channel, setChannel] = useState('');
  const [when, setWhen] = useState(() => tsToLocalInput(Date.now()));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.listEvents(companyId);
      setEvents(list);
    } catch (err) {
      setError(err.message || 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Default actor follows the selected kind — just a hint, user can override.
  const handleKindChange = (v) => {
    setKind(v);
    const hint = EVENT_KINDS.find((e) => e.value === v)?.actor;
    if (hint) setActor(hint);
  };

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await api.createEvent(companyId, {
        kind,
        actor,
        channel,
        notes,
        timestamp: new Date(when).getTime(),
      });
      setNotes('');
      setWhen(tsToLocalInput(Date.now()));
      setAdding(false);
      await reload();
    } catch (err) {
      setError(err.message || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.deleteEvent(id);
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err.message || 'Failed to delete event');
    }
  };

  const sectionTitle = {
    fontSize: 11,
    fontWeight: 600,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  };
  const inputStyle = {
    padding: '6px 8px',
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    background: C.surface,
    color: C.text,
    fontFamily: 'inherit',
    fontSize: 12,
    outline: 'none',
  };

  return (
    <div
      style={{
        padding: 16,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: C.card,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 10,
        }}
      >
        <div style={sectionTitle}>Activity Log</div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          style={{
            background: adding ? C.surface : C.accentDim,
            border: `1px solid ${adding ? C.border : C.accent}`,
            color: adding ? C.textDim : C.accent,
            borderRadius: 5,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {adding ? 'Cancel' : '+ Log event'}
        </button>
      </div>

      {adding && (
        <div
          style={{
            border: `1px dashed ${C.border}`,
            borderRadius: 6,
            padding: 12,
            marginBottom: 12,
            background: C.surface,
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div>
              <div style={{ ...sectionTitle, marginBottom: 4 }}>Kind</div>
              <select
                value={kind}
                onChange={(e) => handleKindChange(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              >
                {EVENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ ...sectionTitle, marginBottom: 4 }}>Who</div>
              <select
                value={actor}
                onChange={(e) => setActor(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              >
                <option value="me">Me</option>
                <option value="them">Them</option>
              </select>
            </div>
            <div>
              <div style={{ ...sectionTitle, marginBottom: 4 }}>Channel</div>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                style={{ ...inputStyle, width: '100%' }}
              >
                {CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ ...sectionTitle, marginBottom: 4 }}>When</div>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={{ ...sectionTitle, marginBottom: 4 }}>Notes</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional details about what happened"
              style={{ ...inputStyle, width: '100%', minHeight: 48, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              type="button"
              onClick={() => setAdding(false)}
              style={{
                background: 'none',
                border: `1px solid ${C.border}`,
                color: C.textDim,
                borderRadius: 5,
                padding: '5px 12px',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              style={{
                background: C.accent,
                border: 'none',
                color: '#0F0F0F',
                borderRadius: 5,
                padding: '5px 14px',
                fontSize: 12,
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Saving…' : 'Save event'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: 12,
            color: C.red,
            marginBottom: 8,
            padding: '6px 8px',
            background: C.redDim,
            borderRadius: 4,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: C.textMuted }}>Loading…</div>
      ) : events.length === 0 ? (
        <div style={{ fontSize: 12, color: C.textMuted, fontStyle: 'italic' }}>
          No events yet. Log the first one.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {events.map((ev) => {
            const actorColor = ev.actor === 'them' ? C.green : C.accent;
            return (
              <div
                key={ev.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 110px 1fr auto',
                  gap: 10,
                  alignItems: 'center',
                  padding: '6px 8px',
                  borderRadius: 5,
                  fontSize: 12,
                  background: C.surface,
                  borderLeft: `2px solid ${actorColor}`,
                }}
              >
                <div style={{ color: C.textDim, fontSize: 11 }}>{fmtTs(ev.timestamp)}</div>
                <div style={{ color: actorColor, fontWeight: 600 }}>{kindLabel(ev.kind)}</div>
                <div style={{ color: C.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.channel ? <span style={{ color: C.textDim }}>[{ev.channel}] </span> : null}
                  {ev.notes || <span style={{ color: C.textMuted }}>—</span>}
                </div>
                <button
                  type="button"
                  onClick={() => remove(ev.id)}
                  title="Delete event"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: C.textMuted,
                    fontSize: 12,
                    cursor: 'pointer',
                    opacity: 0.5,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.5)}
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
