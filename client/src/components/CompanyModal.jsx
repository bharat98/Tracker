import { useState, useEffect, useRef } from 'react';
import { C } from '../theme.js';
import NextStepsTree from './NextStepsTree.jsx';

export default function CompanyModal({ company, isNew, onClose, onSave }) {
  const [name, setName] = useState(company.name);
  const [role, setRole] = useState(company.role);
  const [notes, setNotes] = useState(company.notes || '');
  const [statuses, setStatuses] = useState(company.statuses);
  const [nextSteps, setNextSteps] = useState(company.nextSteps);
  const [blockers, setBlockers] = useState(company.blockers);
  const [editingIdx, setEditingIdx] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const labelRef = useRef(null);

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
    onSave({
      ...company,
      name: name.trim() || company.name,
      role: role.trim(),
      notes,
      statuses,
      nextSteps,
      blockers,
    });
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
