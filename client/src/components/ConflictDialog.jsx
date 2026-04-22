import { C } from '../theme.js';

// Shown when GitHub sync finds a folder with the same slug. User picks:
// - "Use existing"  → close and do nothing (folder in repo is presumed theirs)
// - "Create new"    → retry sync with force=true (server auto-suffixes -2, -3…)
export default function ConflictDialog({ folderName, onUseExisting, onCreateNew }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        backdropFilter: 'blur(4px)',
      }}
      onClick={onUseExisting}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          borderRadius: 12,
          width: '90%',
          maxWidth: 440,
          padding: 24,
          border: `1px solid ${C.border}`,
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.accent, marginBottom: 10 }}>
          Folder already exists
        </h2>
        <p style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: 18 }}>
          A folder named{' '}
          <code
            style={{
              background: C.surface,
              padding: '1px 6px',
              borderRadius: 3,
              fontSize: 12,
              color: C.accentBright,
            }}
          >
            {folderName}
          </code>{' '}
          is already in your GitHub repo. Create a new folder with a numbered
          suffix, or reuse the existing one?
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onUseExisting}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: `1px solid ${C.border}`,
              background: C.surface,
              color: C.text,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
            }}
          >
            Use existing
          </button>
          <button
            onClick={onCreateNew}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              background: C.accent,
              color: '#0F0F0F',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Create new
          </button>
        </div>
      </div>
    </div>
  );
}
