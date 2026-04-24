import { useEffect, useState } from 'react';
import { Sparkles, X, Check, RotateCcw, Loader } from 'lucide-react';
import * as api from '../api.js';

const ROLE_TYPES = ['hm', 'recruiter', 'referral', 'cold_reach', 'employee'];
const CHANNELS   = ['linkedin', 'email', 'phone', 'in_person', 'other'];
const EVENT_KINDS = [
  'reached_out','applied','responded','scheduled','interviewed',
  'advanced','offer_received','rejected','ghosted','withdrew','note',
];

export default function QuickLogModal({ open, onClose, onCommit }) {
  const [text, setText]           = useState('');
  const [parsed, setParsed]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    if (!open) {
      setText(''); setParsed(null); setError('');
      setLoading(false); setCommitting(false);
    }
  }, [open]);

  // Cmd/Ctrl+K opens; Esc closes
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const parse = async () => {
    if (!text.trim() || loading) return;
    setLoading(true); setError('');
    try {
      const { parsed: p } = await api.nlLog(text);
      setParsed(p);
    } catch (e) {
      setError(e?.body?.error || e?.message || 'Parse failed. Try rephrasing.');
    } finally {
      setLoading(false);
    }
  };

  const commit = async () => {
    if (!parsed || committing) return;
    setCommitting(true); setError('');
    try {
      await api.nlLogCommit(parsed);
      onCommit?.();
    } catch (e) {
      setError(e?.body?.error || e?.message || 'Commit failed.');
      setCommitting(false);
    }
  };

  const updateCompany = (patch) => setParsed({ ...parsed, company: { ...parsed.company, ...patch } });
  const updateContact = (patch) => setParsed({ ...parsed, contact: { ...parsed.contact, ...patch } });
  const updateMessage = (patch) =>
    setParsed({ ...parsed, message: parsed.message ? { ...parsed.message, ...patch } : patch });
  const updateEvent   = (patch) => setParsed({ ...parsed, event: { ...parsed.event, ...patch } });

  const company = parsed?.company || {};
  const contact = parsed?.contact || {};
  const message = parsed?.message;
  const event   = parsed?.event;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div
        className="fade-in"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(680px, 94vw)',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          zIndex: 55,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '88vh',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Sparkles size={16} style={{ color: 'var(--accent)' }} />
          <div className="font-serif" style={{ fontSize: '1.35rem', fontWeight: 400, flex: 1 }}>Quick Log</div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '0.3rem' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          {/* Input area */}
          <div className="label" style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Sparkles size={11} /> Describe today's move in one sentence
          </div>
          <textarea
            className="editorial-mono"
            style={{ width: '100%', minHeight: 110, resize: 'vertical' }}
            value={text}
            onChange={(e) => { setText(e.target.value); if (parsed) setParsed(null); }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') parse();
            }}
            placeholder={`e.g. "Sent a LinkedIn InMail to Sarah at ChurnZero using v2-intro template, follow up in 3 days"`}
            autoFocus
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', gap: '0.5rem' }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={parse}
              disabled={!text.trim() || loading}
            >
              {loading ? <Loader size={14} className="spin" /> : <Sparkles size={14} />}
              {loading ? 'Parsing…' : 'Parse with AI'}
            </button>
          </div>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--danger-bg)', border: '1px solid #E7B3B3' }}>
              {error}
            </div>
          )}

          {/* Chip preview */}
          {parsed && (
            <div className="fade-in" style={{ borderTop: '1px solid var(--divider)', paddingTop: '1rem', marginTop: '1rem' }}>
              <div className="label" style={{ marginBottom: '0.75rem' }}>Preview · edit before committing</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {/* Company chip */}
                <div className="card" style={{ padding: '0.85rem 1rem' }}>
                  <div className="label" style={{ marginBottom: '0.4rem' }}>Company</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <input
                      className="input-line"
                      placeholder="name"
                      value={company.name || ''}
                      onChange={(e) => updateCompany({ name: e.target.value })}
                    />
                    <input
                      className="input-line"
                      placeholder="role"
                      value={company.role || ''}
                      onChange={(e) => updateCompany({ role: e.target.value })}
                    />
                  </div>
                </div>

                {/* Contact chip (if a name was found) */}
                {contact.name !== undefined && contact.name !== '' && (
                  <div className="card" style={{ padding: '0.85rem 1rem' }}>
                    <div className="label" style={{ marginBottom: '0.4rem' }}>Contact</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 0.9fr', gap: '0.5rem' }}>
                      <input className="input-line" placeholder="name" value={contact.name || ''} onChange={(e) => updateContact({ name: e.target.value })} />
                      <input className="input-line" placeholder="title" value={contact.title || ''} onChange={(e) => updateContact({ title: e.target.value })} />
                      <select className="select" value={contact.role_type || 'cold_reach'} onChange={(e) => updateContact({ role_type: e.target.value })} style={{ fontSize: '0.85rem' }}>
                        {ROLE_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Message chip */}
                {message && (
                  <div className="card" style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                      <div className="label">Message</div>
                      <button className="btn btn-ghost" style={{ padding: '0.15rem 0.4rem', fontSize: '0.78rem' }} onClick={() => setParsed({ ...parsed, message: null })}>
                        <X size={11} /> remove
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 0.9fr 0.7fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <select className="select" value={message.direction || 'outbound'} onChange={(e) => updateMessage({ direction: e.target.value })} style={{ fontSize: '0.85rem' }}>
                        {['outbound','inbound'].map((d) => <option key={d}>{d}</option>)}
                      </select>
                      <select className="select" value={message.channel || 'linkedin'} onChange={(e) => updateMessage({ channel: e.target.value })} style={{ fontSize: '0.85rem' }}>
                        {CHANNELS.map((c) => <option key={c}>{c}</option>)}
                      </select>
                      <input
                        className="input"
                        placeholder="follow up in … days"
                        type="number" min="0"
                        value={message.next_followup_days ?? ''}
                        onChange={(e) => updateMessage({ next_followup_days: e.target.value ? Number(e.target.value) : null })}
                        style={{ fontSize: '0.85rem' }}
                      />
                    </div>
                    <input className="input-line" placeholder="summary" value={message.body_summary || ''} onChange={(e) => updateMessage({ body_summary: e.target.value })} />
                    {message.template_hint && (
                      <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        Template: <span className="font-mono">{message.template_hint}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Event chip */}
                {event && (
                  <div className="card" style={{ padding: '0.85rem 1rem' }}>
                    <div className="label" style={{ marginBottom: '0.3rem' }}>Event</div>
                    <select className="select" value={event.kind || 'note'} onChange={(e) => updateEvent({ kind: e.target.value })} style={{ fontSize: '0.85rem', width: 'auto' }}>
                      {EVENT_KINDS.map((k) => <option key={k}>{k}</option>)}
                    </select>
                  </div>
                )}

                {/* Action row */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', paddingTop: '0.25rem' }}>
                  <button className="btn btn-secondary" onClick={() => { setParsed(null); }} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <RotateCcw size={13} /> Edit prompt
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={commit}
                    disabled={committing || !company.name}
                  >
                    {committing ? <Loader size={14} className="spin" /> : <Check size={14} />}
                    {committing ? 'Committing…' : 'Commit'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
