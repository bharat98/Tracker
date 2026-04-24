import { useEffect, useState } from 'react';
import { X, UserPlus, Loader } from 'lucide-react';
import * as api from '../api.js';

const EMPTY_HM    = { firstName: '', lastName: '', linkedinUrl: '', email: '' };
const EMPTY_REC   = { firstName: '', lastName: '', linkedinUrl: '', email: '', notes: '' };
const emptyOther  = () => ({ title: '', firstName: '', lastName: '', linkedinUrl: '', email: '' });

const hasData = (c) => c.firstName || c.lastName || c.linkedinUrl || c.email;

export default function NetworkingModal({ open, company, onClose, onSkip, onMove }) {
  const [hm,     setHm]     = useState(EMPTY_HM);
  const [rec,    setRec]    = useState(EMPTY_REC);
  const [others, setOthers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  useEffect(() => {
    if (!open) {
      setHm(EMPTY_HM); setRec(EMPTY_REC); setOthers([]);
      setSaving(false); setError('');
    }
  }, [open]);

  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape' && open) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const contacts = [
        ...(hasData(hm)  ? [{ ...hm,  role: 'hiring_manager' }] : []),
        ...(hasData(rec) ? [{ ...rec, role: 'recruiter'       }] : []),
        ...others.filter((o) => hasData(o) || o.title).map((o) => ({ ...o, role: 'other' })),
      ];
      for (const c of contacts) {
        await api.createContact(company.id, c);
      }
      onMove();
    } catch {
      setError('Failed to save contacts. Try again.');
      setSaving(false);
    }
  };

  const addOther    = () => setOthers((p) => [...p, emptyOther()]);
  const updateOther = (i, patch) => setOthers((p) => p.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const removeOther = (i)        => setOthers((p) => p.filter((_, j) => j !== i));

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div
        className="fade-in"
        style={{
          position: 'fixed', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(620px, 94vw)',
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          zIndex: 55,
          display: 'flex', flexDirection: 'column',
          maxHeight: '88vh', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '1px solid var(--divider)', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{ flex: 1 }}>
            <div className="label" style={{ marginBottom: '0.25rem' }}>Moving to Networked</div>
            <div className="font-serif" style={{ fontSize: '1.35rem', fontWeight: 400 }}>
              {company?.name || 'Company'}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
              Log your contacts — leave blank to fill in later
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '0.3rem' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem 1.5rem' }}>
          {/* Hiring Manager */}
          <ModalSectionHeader title="Hiring Manager" pill="HM" pillClass="pill-hm" />
          <ContactFields data={hm} onChange={(p) => setHm((prev) => ({ ...prev, ...p }))} />

          <div style={{ borderTop: '1px solid var(--divider)', margin: '1.25rem 0' }} />

          {/* Recruiter */}
          <ModalSectionHeader title="Recruiter" pill="REC" pillClass="pill-recruiter" />
          <ContactFields
            data={rec}
            onChange={(p) => setRec((prev) => ({ ...prev, ...p }))}
            extra={
              <input
                className="input"
                placeholder="Firm / agency (optional)"
                value={rec.notes}
                onChange={(e) => setRec((p) => ({ ...p, notes: e.target.value }))}
              />
            }
          />

          {/* Additional contacts */}
          {others.length > 0 && (
            <>
              <div style={{ borderTop: '1px solid var(--divider)', margin: '1.25rem 0' }} />
              <ModalSectionHeader title="Additional contacts" />
              {others.map((o, i) => (
                <div
                  key={i}
                  style={{ position: 'relative', marginBottom: '1.25rem', paddingLeft: '0.75rem', borderLeft: '2px solid var(--border)' }}
                >
                  <button
                    onClick={() => removeOther(i)}
                    style={{ position: 'absolute', top: 0, right: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem' }}
                  >
                    <X size={13} />
                  </button>
                  <input
                    className="input"
                    placeholder="Title / role (e.g. Engineering Manager)"
                    value={o.title}
                    onChange={(e) => updateOther(i, { title: e.target.value })}
                    style={{ marginBottom: '0.5rem' }}
                  />
                  <ContactFields data={o} onChange={(p) => updateOther(i, p)} />
                </div>
              ))}
            </>
          )}

          <button
            className="btn btn-ghost"
            onClick={addOther}
            style={{ marginTop: '0.5rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <UserPlus size={14} /> Add more people
          </button>

          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'var(--danger-bg)', border: '1px solid #E7B3B3' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '0.9rem 1.5rem', borderTop: '1px solid var(--divider)', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving} style={{ marginRight: 'auto' }}>
            Cancel — revert move
          </button>
          <button className="btn btn-secondary" onClick={onSkip} disabled={saving}>Skip</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving && <Loader size={14} className="spin" />}
            {saving ? 'Saving…' : 'Save & Move'}
          </button>
        </div>
      </div>
    </>
  );
}

function ModalSectionHeader({ title, pill, pillClass }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
      <div className="label">{title}</div>
      {pill && <span className={`pill ${pillClass}`}>{pill}</span>}
    </div>
  );
}

function ContactFields({ data, onChange, extra }) {
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input className="input" placeholder="First name" value={data.firstName} onChange={(e) => onChange({ firstName: e.target.value })} />
        <input className="input" placeholder="Last name"  value={data.lastName}  onChange={(e) => onChange({ lastName:  e.target.value })} />
      </div>
      <input className="input" placeholder="LinkedIn URL"      value={data.linkedinUrl} onChange={(e) => onChange({ linkedinUrl: e.target.value })} style={{ marginBottom: '0.5rem' }} />
      <input className="input" placeholder="Email (optional)"  value={data.email}       onChange={(e) => onChange({ email:       e.target.value })} style={{ marginBottom: extra ? '0.5rem' : 0 }} />
      {extra}
    </div>
  );
}
