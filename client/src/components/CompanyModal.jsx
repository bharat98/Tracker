import { useState, useEffect, useRef } from 'react';
import { C } from '../theme.js';
import * as api from '../api.js';
import NextStepsTree from './NextStepsTree.jsx';
import EventLog from './EventLog.jsx';

// Dropdown options for the structured metadata. Keep in sync with the
// AI-facing MCP spec — these are the canonical values analytics will
// group by.
const CHANNEL_OPTIONS = [
  { value: '', label: '—' },
  { value: 'portal', label: 'Company portal' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'referral', label: 'Referral' },
  { value: 'cold_email', label: 'Cold email' },
  { value: 'recruiter', label: 'Recruiter outreach' },
  { value: 'job_board', label: 'Job board' },
  { value: 'event', label: 'Event / networking' },
  { value: 'other', label: 'Other' },
];

const STAGE_OPTIONS = [
  { value: 'sourced', label: 'Sourced' },
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Phone screen' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'final_round', label: 'Final round' },
  { value: 'offer', label: 'Offer received' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'ghosted', label: 'Ghosted' },
];

export default function CompanyModal({
  company,
  isNew,
  extractionAvailable = false,
  onClose,
  onSave,
}) {
  const [name, setName] = useState(company.name);
  const [role, setRole] = useState(company.role);
  const [notes, setNotes] = useState(company.notes || '');
  const [statuses, setStatuses] = useState(company.statuses);
  const [nextSteps, setNextSteps] = useState(company.nextSteps);
  const [blockers, setBlockers] = useState(company.blockers);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const labelRef = useRef(null);

  // Structured metadata — the fields AI tools will use for analysis.
  const [channel, setChannel] = useState(company.channel || '');
  const [referralName, setReferralName] = useState(company.referralName || '');
  const [referralRelationship, setReferralRelationship] = useState(
    company.referralRelationship || ''
  );
  const [hmName, setHmName] = useState(company.hmName || '');
  const [hmContactedDirectly, setHmContactedDirectly] = useState(
    Boolean(company.hmContactedDirectly)
  );
  const [recruiterName, setRecruiterName] = useState(company.recruiterName || '');
  const [recruiterCompany, setRecruiterCompany] = useState(company.recruiterCompany || '');
  const [currentStage, setCurrentStage] = useState(company.currentStage || 'sourced');
  const [resumeVersion, setResumeVersion] = useState(company.resumeVersion || '');

  // URL extraction state (only used in new-company mode)
  const [jobUrl, setJobUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  // Full stripped JD text from the last successful extract — we DON'T
  // persist this to the DB, but we hand it to GitHub sync after save.
  const [sourceText, setSourceText] = useState('');
  const [sourceUrl, setSourceUrl] = useState(company.sourceUrl || '');

  const handleFetch = async () => {
    const url = jobUrl.trim();
    if (!url || fetching) return;
    setFetchError('');
    setFetching(true);
    try {
      const result = await api.extractJob(url);
      if (result.company) setName(result.company);
      if (result.role) setRole(result.role);
      setSourceUrl(result.sourceUrl || url);
      setSourceText(result.sourceText || '');
      if (!result.company && !result.role) {
        setFetchError("Couldn't find company or role in that page.");
      }
    } catch (err) {
      setFetchError(err?.message || 'Fetch failed. Try entering details manually.');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (editingIdx !== null && labelRef.current) labelRef.current.focus();
  }, [editingIdx]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleStatus = (i) => {
    const n = [...statuses];
    n[i] = { ...n[i], checked: !n[i].checked };
    setStatuses(n);
  };
  const startEditLabel = (i) => {
    setEditingIdx(i);
    setEditLabel(statuses[i].label);
  };
  const commitLabel = () => {
    if (editingIdx === null) return;
    const n = [...statuses];
    n[editingIdx] = { ...n[editingIdx], label: editLabel.trim() || n[editingIdx].label };
    setStatuses(n);
    setEditingIdx(null);
  };
  const removeStatus = (i) => setStatuses(statuses.filter((_, idx) => idx !== i));
  const addStatus = () => setStatuses([...statuses, { label: 'New Status', checked: false }]);

  const doSave = () => {
    if (isNew && !name.trim()) return;
    const persistedCompany = {
      ...company,
      name: name.trim() || company.name,
      role: role.trim(),
      notes,
      statuses,
      nextSteps,
      blockers,
      sourceUrl,
      channel,
      referralName: referralName.trim(),
      referralRelationship: referralRelationship.trim(),
      hmName: hmName.trim(),
      hmContactedDirectly,
      recruiterName: recruiterName.trim(),
      recruiterCompany: recruiterCompany.trim(),
      currentStage,
      resumeVersion: resumeVersion.trim(),
    };
    // Second arg is "extras" — sourceText is sent to GitHub sync but NOT
    // persisted in the DB. Lives only in this HTTP round-trip.
    onSave(persistedCompany, { sourceText });
    onClose();
  };

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    fontFamily: 'inherit',
    fontSize: 14,
    outline: 'none',
    background: C.surface,
    color: C.text,
  };
  const sectionTitle = {
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 8,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          borderRadius: 14,
          width: '92%',
          maxWidth: 820,
          maxHeight: '90vh',
          overflow: 'auto',
          padding: 32,
          border: `1px solid ${C.border}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.accent }}>
            {isNew ? 'Add New Company' : `${company.name} — ${company.role}`}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: C.textDim,
            }}
          >
            ✕
          </button>
        </div>

        {isNew && (
          <>
            {/* Paste-URL shortcut: pre-fills name and role via backend LLM call */}
            <div style={{ marginBottom: 16 }}>
              <div style={sectionTitle}>
                Paste Job URL
                {!extractionAvailable && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      fontWeight: 500,
                      color: C.textMuted,
                      textTransform: 'none',
                      letterSpacing: 0,
                    }}
                  >
                    — disabled (no OPENROUTER_API_KEY in server/.env)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                  placeholder="https://www.linkedin.com/jobs/view/..."
                  disabled={!extractionAvailable || fetching}
                  style={{
                    ...inputStyle,
                    opacity: extractionAvailable ? 1 : 0.5,
                  }}
                />
                <button
                  type="button"
                  onClick={handleFetch}
                  disabled={!extractionAvailable || fetching || !jobUrl.trim()}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 6,
                    border: 'none',
                    background: C.accent,
                    color: '#0F0F0F',
                    cursor:
                      !extractionAvailable || fetching || !jobUrl.trim() ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: 13,
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    opacity: !extractionAvailable || !jobUrl.trim() ? 0.5 : 1,
                  }}
                >
                  {fetching ? 'Fetching…' : 'Fetch'}
                </button>
              </div>
              {fetchError && (
                <div style={{ marginTop: 6, fontSize: 12, color: C.red }}>{fetchError}</div>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div>
                <div style={sectionTitle}>Company Name</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Google"
                  style={inputStyle}
                  autoFocus
                />
              </div>
              <div>
                <div style={sectionTitle}>Role</div>
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. TAM"
                  style={inputStyle}
                />
              </div>
            </div>
          </>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
            marginBottom: 24,
          }}
        >
          <div>
            <div style={sectionTitle}>Status Checklist</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {statuses.map((s, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13 }}
                >
                  <input
                    type="checkbox"
                    checked={s.checked}
                    onChange={() => toggleStatus(i)}
                    style={{ accentColor: C.green, width: 15, height: 15, cursor: 'pointer' }}
                  />
                  {editingIdx === i ? (
                    <input
                      ref={labelRef}
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onBlur={commitLabel}
                      onKeyDown={(e) => e.key === 'Enter' && commitLabel()}
                      style={{
                        flex: 1,
                        padding: '1px 4px',
                        border: `1px solid ${C.accent}`,
                        borderRadius: 3,
                        background: C.accentDim,
                        color: C.text,
                        fontFamily: 'inherit',
                        fontSize: 13,
                        outline: 'none',
                      }}
                    />
                  ) : (
                    <span
                      onClick={() => startEditLabel(i)}
                      style={{
                        cursor: 'pointer',
                        flex: 1,
                        color: s.checked ? C.green : C.text,
                        textDecoration: s.checked ? 'line-through' : 'none',
                        opacity: s.checked ? 0.6 : 1,
                      }}
                    >
                      {s.label}
                    </span>
                  )}
                  <button
                    onClick={() => removeStatus(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: C.textMuted,
                      fontSize: 11,
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                onClick={addStatus}
                style={{
                  background: 'none',
                  border: `1px dashed ${C.border}`,
                  borderRadius: 4,
                  padding: '4px 8px',
                  fontSize: 11,
                  cursor: 'pointer',
                  color: C.textDim,
                  fontFamily: 'inherit',
                  marginTop: 2,
                }}
              >
                + Add status
              </button>
            </div>
          </div>
          <div>
            <div style={sectionTitle}>Next Steps</div>
            <NextStepsTree steps={nextSteps} onChange={setNextSteps} />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={sectionTitle}>Blockers</div>
          <textarea
            value={blockers}
            onChange={(e) => setBlockers(e.target.value)}
            placeholder="Any blockers..."
            style={{
              ...inputStyle,
              minHeight: 56,
              resize: 'vertical',
              background: C.redDim,
              border: `1px solid ${C.border}`,
            }}
          />
        </div>

        {/* ── Structured metadata ── */}
        <div
          style={{
            marginBottom: 24,
            padding: 16,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            background: C.card,
          }}
        >
          <div style={{ ...sectionTitle, marginBottom: 14 }}>Details</div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <div style={sectionTitle}>Stage</div>
              <select
                value={currentStage}
                onChange={(e) => setCurrentStage(e.target.value)}
                style={{ ...inputStyle, padding: '8px 10px' }}
              >
                {STAGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={sectionTitle}>Channel</div>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                style={{ ...inputStyle, padding: '8px 10px' }}
              >
                {CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div>
              <div style={sectionTitle}>Hiring Manager</div>
              <input
                value={hmName}
                onChange={(e) => setHmName(e.target.value)}
                placeholder="Name"
                style={inputStyle}
              />
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 6,
                  fontSize: 12,
                  color: C.textDim,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={hmContactedDirectly}
                  onChange={(e) => setHmContactedDirectly(e.target.checked)}
                  style={{ accentColor: C.accent, width: 13, height: 13, cursor: 'pointer' }}
                />
                Contacted directly
              </label>
            </div>
            <div>
              <div style={sectionTitle}>Recruiter</div>
              <input
                value={recruiterName}
                onChange={(e) => setRecruiterName(e.target.value)}
                placeholder="Name"
                style={inputStyle}
              />
              <input
                value={recruiterCompany}
                onChange={(e) => setRecruiterCompany(e.target.value)}
                placeholder="Agency / firm"
                style={{ ...inputStyle, marginTop: 6 }}
              />
            </div>
          </div>

          <div
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}
          >
            <div>
              <div style={sectionTitle}>Referral</div>
              <input
                value={referralName}
                onChange={(e) => setReferralName(e.target.value)}
                placeholder="Name of referrer"
                style={inputStyle}
              />
              <input
                value={referralRelationship}
                onChange={(e) => setReferralRelationship(e.target.value)}
                placeholder="Relationship (ex-coworker, friend)"
                style={{ ...inputStyle, marginTop: 6 }}
              />
            </div>
            <div>
              <div style={sectionTitle}>Resume Version</div>
              <input
                value={resumeVersion}
                onChange={(e) => setResumeVersion(e.target.value)}
                placeholder="e.g. v3-TAM-focus"
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* ── Event log (existing companies only — needs a company_id) ── */}
        {!isNew && (
          <div style={{ marginBottom: 24 }}>
            <EventLog companyId={company.id} />
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <div style={sectionTitle}>Notes / Gameplay</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Paste detailed notes here…"
            style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 6,
              border: `1px solid ${C.border}`,
              background: C.surface,
              color: C.text,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
            }}
          >
            Cancel
          </button>
          <button
            onClick={doSave}
            style={{
              padding: '8px 24px',
              borderRadius: 6,
              border: 'none',
              background: C.accent,
              color: '#0F0F0F',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {isNew ? 'Add Company' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
