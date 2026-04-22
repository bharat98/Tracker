import { useState, useEffect, useRef, useCallback } from 'react';
import { C, DEFAULT_STATUS_LABELS, uid } from './theme.js';
import * as api from './api.js';
import CompanyRow from './components/CompanyRow.jsx';
import CompanyModal from './components/CompanyModal.jsx';
import TweaksPanel from './components/TweaksPanel.jsx';
import ConflictDialog from './components/ConflictDialog.jsx';
import Toast from './components/Toast.jsx';

const makeBlankCompany = () => ({
  id: uid(),
  name: '',
  role: '',
  statuses: DEFAULT_STATUS_LABELS.split(',').map((s) => ({ label: s.trim(), checked: false })),
  nextSteps: [],
  blockers: '',
  notes: '',
});

const logError = (label) => (err) => console.error(`${label} failed:`, err);

export default function App() {
  const [ready, setReady] = useState(false);
  const [persistenceMode, setPersistenceMode] = useState('unknown');
  const [extractionAvailable, setExtractionAvailable] = useState(false);
  const [githubSyncAvailable, setGithubSyncAvailable] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [modal, setModal] = useState(null); // {company, isNew}
  const [tweaksVisible, setTweaksVisible] = useState(false);
  const [tweaks, setTweaks] = useState({
    statusLabels: DEFAULT_STATUS_LABELS,
    rowDensity: 'comfortable',
  });
  const dragItem = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [toast, setToast] = useState(null);
  // When sync returns a conflict we stash the data needed to retry with force=true.
  const [conflict, setConflict] = useState(null);

  const showToast = useCallback((kind, message) => {
    const key = Math.random();
    setToast({ kind, message, key });
    setTimeout(() => {
      setToast((prev) => (prev && prev.key === key ? null : prev));
    }, 4000);
  }, []);

  // Boot: probe backend, load state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { persistenceMode, extractionAvailable, githubSyncAvailable } = await api.initDb();
      if (cancelled) return;
      setPersistenceMode(persistenceMode);
      setExtractionAvailable(extractionAvailable);
      setGithubSyncAvailable(githubSyncAvailable);
      if (persistenceMode !== 'offline') {
        const [cs, tw] = await Promise.all([api.listCompanies(), api.getTweaks()]);
        if (cancelled) return;
        setCompanies(cs);
        setTweaks(tw);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Tweaks panel harness (design-mode message bus)
  useEffect(() => {
    const h = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksVisible(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksVisible(false);
    };
    window.addEventListener('message', h);
    try {
      window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    } catch {}
    return () => window.removeEventListener('message', h);
  }, []);

  // Persist tweaks
  useEffect(() => {
    if (!ready || persistenceMode === 'offline') return;
    api.setTweaks(tweaks).catch(logError('setTweaks'));
    try {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: tweaks }, '*');
    } catch {}
  }, [tweaks, ready, persistenceMode]);

  const updateCompany = useCallback((id, patch) => {
    setCompanies((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    api.updateCompany(id, patch).catch(logError('updateCompany'));
  }, []);

  const replaceCompany = useCallback((updated) => {
    setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    api.updateCompany(updated.id, updated).catch(logError('replaceCompany'));
  }, []);

  // Fire-and-forget GitHub sync. Runs AFTER the DB write returns, so the
  // tracker UI doesn't wait for GitHub at all. If it fails the tracker row
  // is already saved — sync can be retried later.
  const syncWithGithub = useCallback(
    async ({ companyId, sourceUrl, sourceText, force = false }) => {
      if (!githubSyncAvailable) return; // silent when not configured
      try {
        const result = await api.syncToGithub({ companyId, sourceUrl, sourceText, force });
        if (result?.status === 'created') {
          showToast('success', `Saved to GitHub: ${result.folderPath}`);
        } else if (result?.status === 'conflict') {
          // Stash the raw content so "Create new" can retry with force=true.
          setConflict({
            companyId,
            sourceUrl,
            sourceText,
            folderName: result.folderName,
          });
        }
        // 'skipped' (missing name/role) → silent, shouldn't happen for new rows
      } catch (err) {
        if (err.status === 503) return; // not configured → silent
        console.error('syncToGithub failed:', err);
        showToast('error', `GitHub sync failed: ${err.message || 'unknown error'}`);
      }
    },
    [githubSyncAvailable, showToast]
  );

  const createCompany = useCallback(
    async (c, extras = {}) => {
      try {
        const created = await api.createCompany(c);
        setCompanies((prev) => [...prev, created]);
        // Kick off GitHub sync — do NOT await, UI stays snappy.
        syncWithGithub({
          companyId: created.id,
          sourceUrl: c.sourceUrl || '',
          sourceText: extras.sourceText || '',
        });
      } catch (err) {
        logError('createCompany')(err);
      }
    },
    [syncWithGithub]
  );

  const deleteCompany = useCallback((id) => {
    setCompanies((prev) => prev.filter((c) => c.id !== id));
    api.deleteCompany(id).catch(logError('deleteCompany'));
  }, []);

  const openAdd = () => setModal({ company: makeBlankCompany(), isNew: true });
  const openDetail = (c) => setModal({ company: c, isNew: false });
  const saveModal = (updated, extras = {}) => {
    if (modal.isNew) createCompany(updated, extras);
    else replaceCompany(updated);
  };

  // User chose "Create new" on the conflict dialog — retry sync with force=true.
  const handleConflictCreateNew = () => {
    if (!conflict) return;
    const payload = { ...conflict, force: true };
    setConflict(null);
    syncWithGithub(payload);
  };

  // Drag reorder
  const handleDragStart = (e, id) => {
    dragItem.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e, id) => {
    e.preventDefault();
    setDragOverId(id);
  };
  const handleDrop = (e, targetId) => {
    e.preventDefault();
    setDragOverId(null);
    const srcId = dragItem.current;
    if (!srcId || srcId === targetId) return;
    setCompanies((prev) => {
      const list = [...prev];
      const si = list.findIndex((c) => c.id === srcId);
      const ti = list.findIndex((c) => c.id === targetId);
      const [item] = list.splice(si, 1);
      list.splice(ti, 0, item);
      api.reorderCompanies(list.map((c) => c.id)).catch(logError('reorderCompanies'));
      return list;
    });
  };

  if (!ready) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: C.textDim,
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px' }}>
      {persistenceMode === 'offline' && (
        <div
          style={{
            background: C.redDim,
            border: `1px solid ${C.red}`,
            color: C.red,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          ⚠ Backend unreachable — start the server with{' '}
          <code style={{ background: C.bg, padding: '1px 5px', borderRadius: 3 }}>
            npm run dev
          </code>{' '}
          or check that the API URL is correct.
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: C.accent,
              letterSpacing: '-0.02em',
            }}
          >
            Job Tracker
          </h1>
          <p style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>
            Double-click a row for details · Drag to reorder
          </p>
        </div>
        <button
          onClick={openAdd}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            border: 'none',
            background: C.accent,
            color: '#0F0F0F',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = C.accentBright)}
          onMouseLeave={(e) => (e.currentTarget.style.background = C.accent)}
        >
          + Add Company
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '190px 1fr 1fr 170px',
          padding: '6px 14px',
          fontSize: 10,
          fontWeight: 600,
          color: C.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        <span>Company</span>
        <span>Status</span>
        <span>Next Steps</span>
        <span>Blockers</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {companies.map((c) => (
          <div key={c.id} style={{ position: 'relative' }}>
            <CompanyRow
              company={c}
              density={tweaks.rowDensity}
              onUpdate={(patch) => updateCompany(c.id, patch)}
              onOpenDetail={openDetail}
              onDragStart={(e) => handleDragStart(e, c.id)}
              onDragOver={(e) => handleDragOver(e, c.id)}
              onDrop={(e) => handleDrop(e, c.id)}
              isDragOver={dragOverId === c.id}
            />
            <button
              onClick={() => deleteCompany(c.id)}
              title="Delete"
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: C.textMuted,
                fontSize: 12,
                opacity: 0.3,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = 1)}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = 0.3)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {modal && (
        <CompanyModal
          company={modal.company}
          isNew={modal.isNew}
          extractionAvailable={extractionAvailable}
          onClose={() => setModal(null)}
          onSave={saveModal}
        />
      )}

      <TweaksPanel visible={tweaksVisible} tweaks={tweaks} setTweaks={setTweaks} />

      {conflict && (
        <ConflictDialog
          folderName={conflict.folderName}
          onUseExisting={() => setConflict(null)}
          onCreateNew={handleConflictCreateNew}
        />
      )}

      {toast && <Toast kind={toast.kind} message={toast.message} />}
    </div>
  );
}
