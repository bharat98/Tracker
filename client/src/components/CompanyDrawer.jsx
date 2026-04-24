import { useState, useEffect } from 'react';
import { X, Trash2 } from 'lucide-react';
import { C } from '../theme.js';
import EventLog from './EventLog.jsx';
import NextStepsTree from './NextStepsTree.jsx';

const STAGE_OPTIONS = [
  { value: 'sourced',       label: 'Sourced' },
  { value: 'applied',       label: 'Applied' },
  { value: 'screening',     label: 'Screen' },
  { value: 'interviewing',  label: 'Interview' },
  { value: 'final_round',   label: 'Final round' },
  { value: 'offer',         label: 'Offer' },
  { value: 'accepted',      label: 'Accepted' },
  { value: 'rejected',      label: 'Rejected' },
  { value: 'withdrawn',     label: 'Withdrawn' },
  { value: 'ghosted',       label: 'Ghosted' },
];

const PIPELINE_OPTIONS = [
  { value: 'ongoing',   label: 'Ongoing' },
  { value: 'offer',     label: 'Offer' },
  { value: 'rejected',  label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const CHANNEL_OPTIONS = [
  { value: '',             label: '—' },
  { value: 'portal',       label: 'Company portal' },
  { value: 'linkedin',     label: 'LinkedIn' },
  { value: 'referral',     label: 'Referral' },
  { value: 'cold_email',   label: 'Cold email' },
  { value: 'recruiter',    label: 'Recruiter outreach' },
  { value: 'job_board',    label: 'Job board' },
  { value: 'event',        label: 'Event / networking' },
  { value: 'other',        label: 'Other' },
];

const TABS = [
  { key: 'overview',  label: 'Overview'  },
  { key: 'contacts',  label: 'Contacts'  },
  { key: 'activity',  label: 'Activity'  },
  { key: 'notes',     label: 'Notes'     },
];

export default function CompanyDrawer({ companyId, companies, onClose, onSave, onDelete }) {
  const company = companyId ? companies.find((c) => c.id === companyId) : null;

  const [tab, setTab] = useState('overview');

  // Editable fields — initialised from the company object whenever companyId changes.
  const [name, setName]       = useState('');
  const [role, setRole]       = useState('');
  const [stage, setStage]     = useState('sourced');
  const [pipeline, setPipeline] = useState('ongoing');

  // Overview tab
  const [statuses, setStatuses]   = useState([]);
  const [nextSteps, setNextSteps] = useState([]);
  const [blockers, setBlockers]   = useState('');

  // Contacts tab
  const [hmName, setHmName]                     = useState('');
  const [hmContacted, setHmContacted]           = useState(false);
  const [recruiterName, setRecruiterName]       = useState('');
  const [recruiterCompany, setRecruiterCompany] = useState('');
  const [referralName, setReferralName]         = useState('');
  const [referralRel, setReferralRel]           = useState('');

  // Notes tab
  const [notes, setNotes]               = useState('');
  const [channel, setChannel]           = useState('');
  const [resumeVersion, setResumeVersion] = useState('');
  const [sourceUrl, setSourceUrl]       = useState('');

  useEffect(() => {
    if (!company) return;
    setTab('overview');
    setName(company.name || '');
    setRole(company.role || '');
    setStage(company.currentStage || 'sourced');
    setPipeline(company.pipeline || 'ongoing');
    setStatuses(company.statuses || []);
    setNextSteps(company.nextSteps || []);
    setBlockers(company.blockers || '');
    setHmName(company.hmName || '');
    setHmContacted(Boolean(company.hmContactedDirectly));
    setRecruiterName(company.recruiterName || '');
    setRecruiterCompany(company.recruiterCompany || '');
    setReferralName(company.referralName || '');
    setReferralRel(company.referralRelationship || '');
    setNotes(company.notes || '');
    setChannel(company.channel || '');
    setResumeVersion(company.resumeVersion || '');
    setSourceUrl(company.sourceUrl || '');
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!company) return null;

  const handleSave = () => {
    onSave({
      ...company,
      name:               name.trim() || company.name,
      role:               role.trim(),
      currentStage:       stage,
      pipeline,
      statuses,
      nextSteps,
      blockers,
      hmName:             hmName.trim(),
      hmContactedDirectly: hmContacted,
      recruiterName:      recruiterName.trim(),
      recruiterCompany:   recruiterCompany.trim(),
      referralName:       referralName.trim(),
      referralRelationship: referralRel.trim(),
      notes,
      channel,
      resumeVersion:      resumeVersion.trim(),
      sourceUrl:          sourceUrl.trim(),
    }, {});
  };

  const handleDelete = () => {
    if (!window.confirm(`Delete ${company.name || 'this company'}? This cannot be undone.`)) return;
    onDelete(company.id);
    onClose();
  };

  const toggleStatus = (i) => {
    const n = [...statuses];
    n[i] = { ...n[i], checked: !n[i].checked };
    setStatuses(n);
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel slide-in">
        {/* ── Sticky header ──────────────────────────────────────── */}
        <div style={{
          padding: '1.25rem 1.75rem 1rem',
          borderBottom: '1px solid var(--divider)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input-line"
                style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '1.6rem', fontWeight: 400 }}
                placeholder="Company name"
              />
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="input-line"
                style={{ fontSize: '1rem', marginTop: '0.2rem', color: 'var(--text-secondary)' }}
                placeholder="Role"
              />
            </div>
            <button className="btn btn-ghost" onClick={onClose} style={{ padding: '0.35rem', color: 'var(--text-muted)' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="select"
              style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
            >
              {STAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              value={pipeline}
              onChange={(e) => setPipeline(e.target.value)}
              className="select"
              style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
            >
              {PIPELINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer"
                className="btn btn-ghost"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>
                job ↗
              </a>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem' }}>
              <button className="btn btn-danger" onClick={handleDelete} style={{ padding: '0.35rem 0.7rem', fontSize: '0.8rem' }}>
                <Trash2 size={13} />
              </button>
              <button className="btn btn-primary" onClick={handleSave} style={{ padding: '0.35rem 1rem', fontSize: '0.85rem' }}>
                Save
              </button>
            </div>
          </div>
        </div>

        {/* ── Tab strip ──────────────────────────────────────────── */}
        <div style={{ padding: '0 1.75rem', borderBottom: '1px solid var(--divider)', flexShrink: 0 }}>
          <div style={{ display: 'flex' }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                className={`tab ${tab === t.key ? 'tab-active' : ''}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Tab content ────────────────────────────────────────── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 1.75rem' }}>
          {tab === 'overview' && (
            <OverviewTab
              statuses={statuses}
              nextSteps={nextSteps}
              blockers={blockers}
              onToggleStatus={toggleStatus}
              onNextStepsChange={setNextSteps}
              onBlockersChange={setBlockers}
            />
          )}
          {tab === 'contacts' && (
            <ContactsTab
              hmName={hmName} setHmName={setHmName}
              hmContacted={hmContacted} setHmContacted={setHmContacted}
              recruiterName={recruiterName} setRecruiterName={setRecruiterName}
              recruiterCompany={recruiterCompany} setRecruiterCompany={setRecruiterCompany}
              referralName={referralName} setReferralName={setReferralName}
              referralRel={referralRel} setReferralRel={setReferralRel}
            />
          )}
          {tab === 'activity' && (
            <EventLog companyId={company.id} />
          )}
          {tab === 'notes' && (
            <NotesTab
              notes={notes} setNotes={setNotes}
              channel={channel} setChannel={setChannel}
              resumeVersion={resumeVersion} setResumeVersion={setResumeVersion}
              sourceUrl={sourceUrl} setSourceUrl={setSourceUrl}
              channelOptions={CHANNEL_OPTIONS}
            />
          )}
        </div>
      </div>
    </>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="label" style={{ marginBottom: '0.6rem' }}>
      {children}
    </div>
  );
}

function OverviewTab({ statuses, nextSteps, blockers, onToggleStatus, onNextStepsChange, onBlockersChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <SectionLabel>Status checklist</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {statuses.map((s, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input
                type="checkbox"
                checked={s.checked}
                onChange={() => onToggleStatus(i)}
                style={{ accentColor: 'var(--accent-2)', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{
                color: s.checked ? 'var(--text-muted)' : 'var(--text)',
                textDecoration: s.checked ? 'line-through' : 'none',
              }}>
                {s.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Next steps</SectionLabel>
        <NextStepsTree steps={nextSteps} onChange={onNextStepsChange} />
      </div>

      <div>
        <SectionLabel>Blockers</SectionLabel>
        <textarea
          value={blockers}
          onChange={(e) => onBlockersChange(e.target.value)}
          className="textarea"
          style={{ background: 'var(--danger-bg)', minHeight: 64 }}
          placeholder="Anything blocking progress…"
        />
      </div>
    </div>
  );
}

function ContactCard({ title, pill, pillClass, children }) {
  return (
    <div className="card" style={{ padding: '1rem 1.1rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div className="label">{title}</div>
        <span className={`pill ${pillClass}`}>{pill}</span>
      </div>
      {children}
    </div>
  );
}

function ContactsTab({
  hmName, setHmName, hmContacted, setHmContacted,
  recruiterName, setRecruiterName, recruiterCompany, setRecruiterCompany,
  referralName, setReferralName, referralRel, setReferralRel,
}) {
  const inputStyle = { marginBottom: '0.5rem' };

  const anyContact = hmName || recruiterName || referralName;

  return (
    <div>
      {!anyContact && (
        <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          <div className="font-serif" style={{ fontSize: '1.3rem', color: 'var(--text)', marginBottom: '0.4rem', fontWeight: 300 }}>
            No contacts yet
          </div>
          Fill in the hiring manager, recruiter, or referral below.
        </div>
      )}

      <ContactCard title="Hiring Manager" pill="HM" pillClass="pill-hm">
        <input
          value={hmName}
          onChange={(e) => setHmName(e.target.value)}
          className="input"
          placeholder="Name"
          style={inputStyle}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={hmContacted}
            onChange={(e) => setHmContacted(e.target.checked)}
            style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
          />
          Contacted directly
        </label>
      </ContactCard>

      <ContactCard title="Recruiter" pill="REC" pillClass="pill-recruiter">
        <input
          value={recruiterName}
          onChange={(e) => setRecruiterName(e.target.value)}
          className="input"
          placeholder="Name"
          style={inputStyle}
        />
        <input
          value={recruiterCompany}
          onChange={(e) => setRecruiterCompany(e.target.value)}
          className="input"
          placeholder="Agency / firm"
        />
      </ContactCard>

      <ContactCard title="Referral" pill="REF" pillClass="pill-referral">
        <input
          value={referralName}
          onChange={(e) => setReferralName(e.target.value)}
          className="input"
          placeholder="Name of referrer"
          style={inputStyle}
        />
        <input
          value={referralRel}
          onChange={(e) => setReferralRel(e.target.value)}
          className="input"
          placeholder="Relationship (ex-coworker, friend…)"
        />
      </ContactCard>
    </div>
  );
}

function NotesTab({ notes, setNotes, channel, setChannel, resumeVersion, setResumeVersion, sourceUrl, setSourceUrl, channelOptions }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <SectionLabel>Notes / gameplay</SectionLabel>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="textarea"
          style={{ minHeight: 120 }}
          placeholder="Paste detailed notes here…"
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <SectionLabel>Channel</SectionLabel>
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="select">
            {channelOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <SectionLabel>Resume version</SectionLabel>
          <input
            value={resumeVersion}
            onChange={(e) => setResumeVersion(e.target.value)}
            className="input"
            placeholder="e.g. v3-TAM-focus"
          />
        </div>
      </div>

      <div>
        <SectionLabel>Job URL</SectionLabel>
        <input
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className="input"
          placeholder="https://…"
        />
      </div>
    </div>
  );
}
