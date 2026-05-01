import { useState, useEffect, useRef, useCallback } from 'react';
import { Paperclip, Link2, X, Image as ImageIcon, Send, Sparkles, AlertCircle } from 'lucide-react';
import { C } from '../theme.js';
import * as api from '../api.js';

const KIND_LABELS = {
  reached_out:    'Reached out',
  applied:        'Applied',
  hm_contacted:   'Contacted HM',
  responded:      'Got response',
  scheduled:      'Interview scheduled',
  interviewed:    'Interview completed',
  advanced:       'Advanced',
  offer_received: 'Offer received',
  offer_accepted: 'Offer accepted',
  rejected:       'Rejected',
  ghosted:        'Ghosted',
  withdrew:       'Withdrew',
  note:           'Note',
};

const CHANNEL_LABELS = {
  linkedin: 'LinkedIn', email: 'Email', phone: 'Phone',
  in_person: 'In person', portal: 'Portal', recruiter: 'Recruiter',
  referral: 'Referral', video: 'Video', other: 'Other',
};

const URL_RE = /\bhttps?:\/\/[^\s]+/i;

const fmtTs = (ts) => {
  const d = new Date(ts);
  return `${d.toLocaleDateString('default', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
};

// ── composer ─────────────────────────────────────────────────────────────────
function Composer({ companyId, onCommit }) {
  const [text, setText]       = useState('');
  const [url, setUrl]         = useState('');
  const [urlManual, setUrlManual] = useState(false); // user typed it explicitly
  const [image, setImage]     = useState(null);     // File
  const [imageUrl, setImageUrl] = useState(null);   // object URL for preview
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]     = useState('');
  const fileInputRef = useRef(null);
  const taRef = useRef(null);

  // Auto-detect URL in text (only if user hasn't manually set one).
  useEffect(() => {
    if (urlManual) return;
    const m = text.match(URL_RE);
    setUrl(m ? m[0] : '');
  }, [text, urlManual]);

  // Auto-grow textarea
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = 'auto';
    taRef.current.style.height = Math.min(taRef.current.scrollHeight, 240) + 'px';
  }, [text]);

  // Image preview cleanup
  useEffect(() => {
    if (!image) { setImageUrl(null); return; }
    const u = URL.createObjectURL(image);
    setImageUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);

  const handlePaste = useCallback((e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          // Give pasted images a sensible filename
          const ext = item.type.split('/')[1] || 'png';
          const named = new File([file], `pasted-${Date.now()}.${ext}`, { type: item.type });
          setImage(named);
          e.preventDefault();
          return;
        }
      }
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) setImage(file);
  }, []);

  const submit = async () => {
    if (submitting) return;
    if (!text.trim() && !image && !url) {
      setError('Add some text, an image, or a URL.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const result = await api.postTimelineEntry(companyId, { text: text.trim(), url, image });
      onCommit(result);
      setText(''); setUrl(''); setUrlManual(false); setImage(null);
    } catch (e) {
      setError(e.message || 'Failed to log entry.');
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: 12,
        background: C.surface,
        marginBottom: 20,
      }}
    >
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={onKeyDown}
        placeholder="What happened? e.g. 'Found Sarah Chen on LinkedIn — she's the recruiter for this role.' Drop a screenshot, paste a URL."
        rows={2}
        style={{
          width: '100%',
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontFamily: 'inherit',
          fontSize: 13,
          lineHeight: 1.5,
          color: C.text,
          background: 'transparent',
          minHeight: 36,
        }}
      />

      {/* preview row: image + URL chip */}
      {(image || url) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
          {image && (
            <div style={{ position: 'relative', display: 'inline-flex' }}>
              <img src={imageUrl} alt="" style={{ height: 64, borderRadius: 4, border: `1px solid ${C.border}`, objectFit: 'cover' }} />
              <button onClick={() => setImage(null)} title="Remove"
                style={{ position: 'absolute', top: -6, right: -6, background: C.text, color: '#fff', border: 'none', borderRadius: 999, width: 18, height: 18, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={11} />
              </button>
            </div>
          )}
          {url && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: C.accentDim, borderRadius: 4, fontSize: 11, color: C.text, fontFamily: 'var(--font-mono)' }}>
              <Link2 size={11} />
              <span style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{url}</span>
              <button onClick={() => { setUrl(''); setUrlManual(true); }} title="Remove URL"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textDim, padding: 0, display: 'flex' }}>
                <X size={11} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            style={{ display: 'none' }}
            onChange={(e) => { if (e.target.files?.[0]) setImage(e.target.files[0]); e.target.value = ''; }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach image"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textDim, padding: 6, borderRadius: 4, display: 'inline-flex' }}
          >
            <Paperclip size={15} />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'var(--font-mono)' }}>⌘↵ to log</span>
          <button
            onClick={submit}
            disabled={submitting || (!text.trim() && !image && !url)}
            style={{
              padding: '6px 14px',
              background: C.accent, color: '#fff',
              border: 'none', borderRadius: 4,
              fontSize: 12, fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex', alignItems: 'center', gap: 6,
              opacity: submitting || (!text.trim() && !image && !url) ? 0.5 : 1,
            }}
          >
            {submitting ? 'Logging…' : <>Log <Send size={11} /></>}
          </button>
        </div>
      </div>

      {error && <div style={{ marginTop: 6, fontSize: 11, color: C.red }}>{error}</div>}
    </div>
  );
}

// ── single event row ─────────────────────────────────────────────────────────
function EventRow({ event, onImageClick }) {
  const isMe = event.actor === 'me';
  const dotColor = isMe ? C.accent : C.accent2;
  const detailUrl = event.details?.url;
  const att = event.attachments || [];
  const summary = event.notes || event.details?.summary || '';
  const isPending = event.processingStatus === 'pending';
  const isFailed  = event.processingStatus === 'failed';

  return (
    <div style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: `1px solid ${C.borderLight}`, opacity: isPending ? 0.85 : 1 }}>
      {/* timeline marker */}
      <div style={{ flexShrink: 0, paddingTop: 4 }}>
        <div style={{ width: 8, height: 8, borderRadius: 999, background: dotColor }} />
      </div>

      {/* content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: 'var(--font-mono)' }}>
            {KIND_LABELS[event.kind] || event.kind}
          </span>
          {event.channel && (
            <span style={{ fontSize: 10, color: C.textDim, padding: '1px 6px', border: `1px solid ${C.border}`, borderRadius: 3, fontFamily: 'var(--font-mono)' }}>
              {CHANNEL_LABELS[event.channel] || event.channel}
            </span>
          )}
          {isPending && (
            <span title="LLM still parsing this entry" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.accent, padding: '1px 6px', background: C.accentDim, borderRadius: 3, fontFamily: 'var(--font-mono)' }}>
              <Sparkles size={10} className="spin" />
              parsing…
            </span>
          )}
          {isFailed && (
            <span title={event.processingError || 'Parse failed'} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: C.red, padding: '1px 6px', border: `1px solid ${C.red}`, borderRadius: 3, fontFamily: 'var(--font-mono)' }}>
              <AlertCircle size={10} />
              parse failed
            </span>
          )}
          <span style={{ fontSize: 10, color: C.textMuted, fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
            {fmtTs(event.timestamp)}
          </span>
        </div>

        {summary && (
          <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {summary}
          </div>
        )}

        {/* URL chip */}
        {detailUrl && (
          <a
            href={detailUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.accentBright, marginTop: 6, textDecoration: 'none', fontFamily: 'var(--font-mono)' }}
          >
            <Link2 size={11} />
            <span style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {detailUrl.replace(/^https?:\/\//, '')}
            </span>
          </a>
        )}

        {/* image thumbnails */}
        {att.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {att.map((a) => (
              <img
                key={a.id}
                src={a.url}
                alt={a.filename}
                onClick={() => onImageClick(a)}
                style={{ height: 96, maxWidth: 200, borderRadius: 4, border: `1px solid ${C.border}`, cursor: 'zoom-in', objectFit: 'cover' }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── lightbox ─────────────────────────────────────────────────────────────────
function Lightbox({ attachment, onClose }) {
  if (!attachment) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, padding: 32, cursor: 'zoom-out',
      }}
    >
      <img
        src={attachment.url}
        alt={attachment.filename}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── tab ──────────────────────────────────────────────────────────────────────
export default function TimelineTab({ companyId, onCompanyUpdated }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listTimeline(companyId);
      setEvents(data);
    } catch (e) {
      console.warn('Timeline load failed:', e.message);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll while any row is still being parsed by the backend worker. Polling
  // stops as soon as nothing is pending. Cheap — one HTTP call every 2s and
  // only when there's actual work in flight.
  useEffect(() => {
    const anyPending = events.some((e) => e.processingStatus === 'pending');
    if (!anyPending) return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [events, refresh]);

  const handleCommit = (result) => {
    setEvents((prev) => [result.event, ...prev]);
    if (result.stageChanged && onCompanyUpdated) {
      onCompanyUpdated({ currentStage: result.stageChanged.to });
    }
  };

  return (
    <div>
      <Composer companyId={companyId} onCommit={handleCommit} />

      {loading ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
          Loading timeline…
        </div>
      ) : events.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: C.textDim, fontSize: 13 }}>
          No entries yet. Log your first one above.
        </div>
      ) : (
        <div>
          {events.map((ev) => (
            <EventRow key={ev.id} event={ev} onImageClick={setLightbox} />
          ))}
        </div>
      )}

      <Lightbox attachment={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}
