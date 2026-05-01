import { useState, useEffect } from 'react';
import { X, Trash2, Download, Loader, Pencil } from 'lucide-react';
import EventLog from './EventLog.jsx';
import TimelineTab from './TimelineTab.jsx';
import NextStepsTree from './NextStepsTree.jsx';
import * as api from '../api.js';

const LINKEDIN_RE = /^https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[^/?#]+/i;

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
  { key: 'timeline',  label: 'Timeline'  },
  { key: 'contacts',  label: 'Contacts'  },
  { key: 'overview',  label: 'Overview'  },
  { key: 'notes',     label: 'Notes'     },
];

export default function CompanyDrawer({ companyId, companies, onClose, onSave, onDelete }) {
  const company = companyId ? companies.find((c) => c.id === companyId) : null;

  const [tab, setTab] = useState('timeline');

  const [name, setName]         = useState('');
  const [role, setRole]         = useState('');
  const [stage, setStage]       = useState('sourced');
  const [pipeline, setPipeline] = useState('ongoing');

  const [statuses,  setStatuses]  = useState([]);
  const [nextSteps, setNextSteps] = useState([]);
  const [blockers,  setBlockers]  = useState('');

  const [notes,     setNotes]     = useState('');
  const [channel,   setChannel]   = useState('');
  const [sourceUrl, setSourceUrl] = useState('');

  useEffect(() => {
    if (!company) return;
    setTab('timeline');
    setName(company.name || '');
    setRole(company.role || '');
    setStage(company.currentStage || 'sourced');
    setPipeline(company.pipeline || 'ongoing');
    setStatuses(company.statuses || []);
    setNextSteps(company.nextSteps || []);
    setBlockers(company.blockers || '');
    setNotes(company.notes || '');
    setChannel(company.channel || '');
    setSourceUrl(company.sourceUrl || '');
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!company) return null;

  const handleSave = () => {
    onSave({
      ...company,
      name:         name.trim() || company.name,
      role:         role.trim(),
      currentStage: stage,
      pipeline,
      statuses,
      nextSteps,
      blockers,
      notes,
      channel,
      sourceUrl: sourceUrl.trim(),
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
            {company.resumeLink && (
              <a href={company.resumeLink} target="_blank" rel="noreferrer"
                className="btn btn-ghost"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>
                resume ↗
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
            <ContactsTab companyId={company.id} />
          )}
          {tab === 'timeline' && (
            <TimelineTab
              companyId={company.id}
              onCompanyUpdated={(patch) => { if (patch.currentStage) setStage(patch.currentStage); }}
            />
          )}
          {tab === 'notes' && (
            <NotesTab
              notes={notes} setNotes={setNotes}
              channel={channel} setChannel={setChannel}
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

// ── Contacts tab — reads/writes the contacts table via API ────────────────────

// showTitle = render a "Title / designation" input in the add form and show
// the title above the name in the listed row. LinkedIn headlines land here.
const SECTION_CONFIG = [
  { role: 'hiring_manager', title: 'Hiring Manager', pill: 'HM',  pillClass: 'pill-hm',        showTitle: true },
  { role: 'recruiter',      title: 'Recruiter',      pill: 'REC', pillClass: 'pill-recruiter', showTitle: true, notesLabel: 'Firm / agency' },
  { role: 'referral',       title: 'Referral',       pill: 'REF', pillClass: 'pill-referral',  notesLabel: 'Relationship' },
  { role: 'other',          title: 'Other',          showTitle: true },
];

function ContactsTab({ companyId }) {
  const [contacts,   setContacts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [addingRole, setAddingRole] = useState(null);
  const [draft,      setDraft]      = useState({});
  const [editingId,  setEditingId]  = useState(null);
  const [editDraft,  setEditDraft]  = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listContacts(companyId)
      .then((cs) => { if (!cancelled) { setContacts(cs); setLoading(false); } })
      .catch(()  => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  const startAdding = (role) => {
    setAddingRole(role);
    setDraft(
      role === 'recruiter' ? { firstName: '', lastName: '', linkedinUrl: '', email: '', notes: '' }
      : role === 'other'   ? { title: '', firstName: '', lastName: '', linkedinUrl: '', email: '' }
      : { firstName: '', lastName: '', linkedinUrl: '', email: '' }
    );
  };

  const cancelAdding = () => { setAddingRole(null); setDraft({}); };

  const saveContact = async () => {
    const empty = !draft.firstName && !draft.lastName && !draft.linkedinUrl && !draft.email && !draft.title;
    if (empty) { cancelAdding(); return; }
    try {
      const created = await api.createContact(companyId, { ...draft, role: addingRole });
      setContacts((prev) => [...prev, created]);
      cancelAdding();
    } catch (e) { console.error('save contact failed', e); }
  };

  const removeContact = async (id) => {
    try {
      await api.deleteContact(companyId, id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (e) { console.error('delete contact failed', e); }
  };

  const startEditing = (contact) => {
    setAddingRole(null);
    setEditingId(contact.id);
    setEditDraft({
      title:       contact.title       || '',
      firstName:   contact.firstName   || '',
      lastName:    contact.lastName    || '',
      linkedinUrl: contact.linkedinUrl || '',
      email:       contact.email       || '',
      notes:       contact.notes       || '',
    });
  };

  const cancelEditing = () => { setEditingId(null); setEditDraft({}); };

  const saveEditing = async () => {
    if (!editingId) return;
    try {
      const updated = await api.updateContact(companyId, editingId, editDraft);
      setContacts((prev) => prev.map((c) => (c.id === editingId ? updated : c)));
      cancelEditing();
    } catch (e) { console.error('update contact failed', e); }
  };

  if (loading) {
    return <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '1rem 0' }}>Loading…</div>;
  }

  const byRole = (role) => contacts.filter((c) => c.role === role);
  const total  = contacts.length;

  return (
    <div>
      {total === 0 && !addingRole && (
        <div style={{ padding: '2rem 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          <div className="font-serif" style={{ fontSize: '1.3rem', color: 'var(--text)', marginBottom: '0.4rem', fontWeight: 300 }}>
            No contacts yet
          </div>
          Click + to add a hiring manager, recruiter, or referral.
        </div>
      )}

      {SECTION_CONFIG.map((sec) => (
        <ContactSection
          key={sec.role}
          sec={sec}
          contacts={byRole(sec.role)}
          isAdding={addingRole === sec.role}
          draft={draft}
          onStartAdd={() => startAdding(sec.role)}
          onDraftChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
          onSave={saveContact}
          onCancel={cancelAdding}
          onDelete={removeContact}
          editingId={editingId}
          editDraft={editDraft}
          onStartEdit={startEditing}
          onEditDraftChange={(patch) => setEditDraft((prev) => ({ ...prev, ...patch }))}
          onSaveEdit={saveEditing}
          onCancelEdit={cancelEditing}
        />
      ))}
    </div>
  );
}

function ContactSection({
  sec, contacts, isAdding, draft, onStartAdd, onDraftChange, onSave, onCancel, onDelete,
  editingId, editDraft, onStartEdit, onEditDraftChange, onSaveEdit, onCancelEdit,
}) {
  const hasContent = contacts.length > 0 || isAdding;
  return (
    <div className="card" style={{ padding: '1rem 1.1rem', marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: hasContent ? '0.75rem' : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <div className="label">{sec.title}</div>
          {sec.pill && <span className={`pill ${sec.pillClass}`}>{sec.pill}</span>}
        </div>
        {!isAdding && (
          <button className="btn btn-ghost" onClick={onStartAdd} style={{ padding: '0.2rem 0.5rem', fontSize: '0.78rem' }}>
            + Add
          </button>
        )}
      </div>

      {contacts.map((c) => (
        editingId === c.id ? (
          <ContactEditForm
            key={c.id}
            sec={sec}
            draft={editDraft}
            onDraftChange={onEditDraftChange}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
          />
        ) : (
          <ContactRow key={c.id} contact={c} sec={sec} onDelete={onDelete} onEdit={onStartEdit} />
        )
      ))}

      {isAdding && (
        <ContactAddForm sec={sec} draft={draft} onDraftChange={onDraftChange} onCancel={onCancel} onSave={onSave} hasExisting={contacts.length > 0} />
      )}
    </div>
  );
}

function ContactAddForm({ sec, draft, onDraftChange, onCancel, onSave, hasExisting }) {
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');
  const canFetch = LINKEDIN_RE.test((draft.linkedinUrl || '').trim()) && !fetching;

  const handleFetch = async () => {
    setFetching(true);
    setFetchMsg('');
    try {
      const r = await api.fetchLinkedIn(draft.linkedinUrl.trim());
      const patch = {};
      if (r.firstName) patch.firstName = r.firstName;
      if (r.lastName)  patch.lastName  = r.lastName;
      if (r.headline)  patch.title     = r.headline;
      onDraftChange(patch);
      if (!r.firstName && !r.lastName && !r.headline) {
        setFetchMsg('Nothing returned — profile may be private.');
      }
    } catch (e) {
      setFetchMsg(e.message || 'Lookup failed.');
    } finally {
      setFetching(false);
    }
  };

  return (
    <div style={{ paddingTop: hasExisting ? '0.75rem' : 0, borderTop: hasExisting ? '1px solid var(--divider)' : 'none' }}>
      {sec.showTitle && (
        <input
          className="input"
          placeholder={sec.role === 'other' ? 'Title / role (e.g. Engineering Manager)' : 'Title / designation'}
          value={draft.title || ''}
          onChange={(e) => onDraftChange({ title: e.target.value })}
          style={{ marginBottom: '0.5rem' }}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input className="input" placeholder="First name" value={draft.firstName || ''} onChange={(e) => onDraftChange({ firstName: e.target.value })} />
        <input className="input" placeholder="Last name"  value={draft.lastName  || ''} onChange={(e) => onDraftChange({ lastName:  e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
        <input
          className="input"
          placeholder="LinkedIn URL"
          value={draft.linkedinUrl || ''}
          onChange={(e) => onDraftChange({ linkedinUrl: e.target.value })}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleFetch}
          disabled={!canFetch}
          title={canFetch ? 'Fetch name & headline from LinkedIn' : 'Paste a linkedin.com/in/… URL'}
          style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.3rem', whiteSpace: 'nowrap' }}
        >
          {fetching ? <Loader size={12} className="spin" /> : <Download size={12} />}
          Fetch
        </button>
      </div>
      <input className="input" placeholder="Email (optional)" value={draft.email || ''} onChange={(e) => onDraftChange({ email: e.target.value })} style={{ marginBottom: sec.notesLabel ? '0.5rem' : '0.25rem' }} />
      {sec.notesLabel && (
        <input className="input" placeholder={sec.notesLabel} value={draft.notes || ''} onChange={(e) => onDraftChange({ notes: e.target.value })} style={{ marginBottom: '0.25rem' }} />
      )}
      {fetchMsg && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          {fetchMsg}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
        <button className="btn btn-ghost"    onClick={onCancel} style={{ fontSize: '0.82rem' }}>Cancel</button>
        <button className="btn btn-primary"  onClick={onSave}   style={{ fontSize: '0.82rem' }}>Save</button>
      </div>
    </div>
  );
}

function ContactRow({ contact, sec, onDelete, onEdit }) {
  const displayName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '(no name)';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.5rem 0', borderBottom: '1px solid var(--divider)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {sec.showTitle && contact.title && (
          <div className="label" style={{ marginBottom: '0.15rem' }}>{contact.title}</div>
        )}
        <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{displayName}</div>
        {contact.linkedinUrl && (
          <a href={contact.linkedinUrl} target="_blank" rel="noreferrer"
            style={{ fontSize: '0.8rem', color: 'var(--accent)', display: 'block' }}>
            LinkedIn ↗
          </a>
        )}
        {contact.email && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{contact.email}</div>
        )}
        {contact.notes && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
            {sec.notesLabel ? `${sec.notesLabel}: ` : ''}{contact.notes}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.15rem', flexShrink: 0 }}>
        <button
          onClick={() => onEdit(contact)}
          title="Edit"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem' }}
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(contact.id)}
          title="Delete"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.2rem' }}
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

function ContactEditForm({ sec, draft, onDraftChange, onCancel, onSave }) {
  return (
    <div style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--divider)' }}>
      {sec.showTitle && (
        <input
          className="input"
          placeholder={sec.role === 'other' ? 'Title / role' : 'Title / designation'}
          value={draft.title || ''}
          onChange={(e) => onDraftChange({ title: e.target.value })}
          style={{ marginBottom: '0.5rem' }}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <input className="input" placeholder="First name" value={draft.firstName || ''} onChange={(e) => onDraftChange({ firstName: e.target.value })} />
        <input className="input" placeholder="Last name"  value={draft.lastName  || ''} onChange={(e) => onDraftChange({ lastName:  e.target.value })} />
      </div>
      <input
        className="input"
        placeholder="LinkedIn URL"
        value={draft.linkedinUrl || ''}
        onChange={(e) => onDraftChange({ linkedinUrl: e.target.value })}
        style={{ marginBottom: '0.5rem' }}
      />
      <input
        className="input"
        placeholder="Email (optional)"
        value={draft.email || ''}
        onChange={(e) => onDraftChange({ email: e.target.value })}
        style={{ marginBottom: sec.notesLabel ? '0.5rem' : '0.25rem' }}
      />
      {sec.notesLabel && (
        <input
          className="input"
          placeholder={sec.notesLabel}
          value={draft.notes || ''}
          onChange={(e) => onDraftChange({ notes: e.target.value })}
          style={{ marginBottom: '0.25rem' }}
        />
      )}
      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
        <button className="btn btn-ghost"   onClick={onCancel} style={{ fontSize: '0.82rem' }}>Cancel</button>
        <button className="btn btn-primary" onClick={onSave}   style={{ fontSize: '0.82rem' }}>Save</button>
      </div>
    </div>
  );
}

function NotesTab({ notes, setNotes, channel, setChannel, sourceUrl, setSourceUrl, channelOptions }) {
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

      <div>
        <SectionLabel>Channel</SectionLabel>
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="select">
          {channelOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
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
