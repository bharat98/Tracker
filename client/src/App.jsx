import { useState, useEffect, useRef, useCallback } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  NavLink,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  FileText,
  Bell,
  Plus,
  Sparkles,
} from 'lucide-react';
import { C, DEFAULT_STATUS_LABELS, uid } from './theme.js';
import * as api from './api.js';
import CompanyDetail from './components/CompanyDetail.jsx';
import QuickLogModal from './components/QuickLogModal.jsx';
import TweaksPanel from './components/TweaksPanel.jsx';
import ConflictDialog from './components/ConflictDialog.jsx';
import Toast from './components/Toast.jsx';
import DashboardPage from './pages/Dashboard.jsx';
import CompaniesPage from './pages/Companies.jsx';
import FollowupsPage from './pages/Followups.jsx';
import TemplatesPage from './pages/Templates.jsx';

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

// Map a newly-checked status label to a structured event (or null if we
// don't have a meaningful event kind for it). Keeps the AI-facing event
// log rich without asking the user to log events manually.
const statusToEvent = (label) => {
  const l = label.toLowerCase();
  if (l.includes('reachout') || (l.includes('linkedin') && !l.includes('reach'))) {
    return { kind: 'reached_out', actor: 'me', channel: 'linkedin' };
  }
  if (l.includes('applied')) return { kind: 'applied', actor: 'me' };
  if (l.includes('hiring manager') && l.includes('contact')) {
    return { kind: 'hm_contacted', actor: 'me' };
  }
  if (l.includes('someone') && l.includes('connect')) {
    return { kind: 'responded', actor: 'them' };
  }
  if (l.includes('interview')) return { kind: 'interviewed', actor: 'me' };
  if (l.includes('offer')) return { kind: 'offer_received', actor: 'them' };
  return null;
};

function Sidebar() {
  return (
    <aside className="sidebar">
      <div style={{ paddingLeft: '0.25rem', marginBottom: '2rem' }}>
        <div className="font-serif" style={{ fontSize: '1.6rem', fontWeight: 500, lineHeight: 1, letterSpacing: '-0.01em', color: 'var(--text)' }}>
          Campaign
        </div>
        <div className="label" style={{ marginTop: '0.4rem' }}>Job-Search CRM</div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={16} /> Dashboard
        </NavLink>
        <NavLink to="/companies" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Building2 size={16} /> Companies
        </NavLink>
        <NavLink to="/followups" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Bell size={16} /> Follow-ups
        </NavLink>
        <NavLink to="/templates" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <FileText size={16} /> Templates
        </NavLink>
      </nav>
      <div style={{ marginTop: 'auto' }}>
        <div className="label" style={{ padding: '0 0.5rem' }}>v2.0 · local-first</div>
      </div>
    </aside>
  );
}

const TITLE_MAP = {
  '/': 'Dashboard',
  '/companies': 'Companies',
  '/followups': 'Follow-ups',
  '/templates': 'Templates',
};

function TopBar({ onAddCompany, onQuickLog }) {
  const loc = useLocation();
  const title =
    TITLE_MAP[loc.pathname] ||
    (loc.pathname.startsWith('/companies') ? 'Companies' : 'Campaign');
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return (
    <div className="topbar">
      <div>
        <div className="label">Today · {today}</div>
        <div
          className="font-serif"
          style={{ fontSize: '1.9rem', fontWeight: 400, lineHeight: 1.1, marginTop: '0.15rem', color: 'var(--text)' }}
        >
          {title}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-secondary" onClick={onAddCompany}>
          <Plus size={14} /> Company
        </button>
        <button className="btn btn-primary" onClick={onQuickLog} title="Quick Log (coming soon)">
          <Sparkles size={14} /> Quick Log
        </button>
      </div>
    </div>
  );
}

// Separate "new company" route component so App-level state doesn't need
// an isAdding flag — routing carries that intent.
function NewCompanyRoute({ extractionAvailable, onSave }) {
  const navigate = useNavigate();
  const [draft] = useState(makeBlankCompany);
  return (
    <CompanyDetail
      company={draft}
      isNew
      extractionAvailable={extractionAvailable}
      onBack={() => navigate('/companies')}
      onSave={(updated, extras) => {
        onSave(updated, extras, true);
        navigate('/companies');
      }}
    />
  );
}

function Shell({ children, onQuickLog }) {
  const navigate = useNavigate();
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <TopBar
          onAddCompany={() => navigate('/companies/new')}
          onQuickLog={onQuickLog}
        />
        <div className="page">{children}</div>
      </div>
    </div>
  );
}

function AppRoutes({
  ready,
  persistenceMode,
  extractionAvailable,
  companies,
  saveCompany,
  deleteCompany,
  onQuickLog,
}) {
  if (!ready) {
    return (
      <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading…
      </div>
    );
  }

  return (
    <Shell onQuickLog={onQuickLog}>
      {persistenceMode === 'offline' && (
        <div
          style={{
            background: '#FDEDED',
            border: '1px solid #E7B3B3',
            color: 'var(--danger)',
            padding: '8px 12px',
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          ⚠ Backend unreachable — start the server with{' '}
          <code style={{ background: '#fff', padding: '1px 5px', border: '1px solid var(--border)' }}>npm run dev</code>{' '}
          or check that the API URL is correct.
        </div>
      )}
      <Routes>
        <Route path="/" element={<DashboardPage companies={companies} />} />
        <Route
          path="/companies"
          element={
            <CompaniesPage
              companies={companies}
              extractionAvailable={extractionAvailable}
              onSave={(updated, extras) => saveCompany(updated, extras, false)}
              onDelete={deleteCompany}
            />
          }
        />
        <Route
          path="/companies/new"
          element={
            <NewCompanyRoute
              extractionAvailable={extractionAvailable}
              onSave={saveCompany}
            />
          }
        />
        <Route
          path="/companies/:id"
          element={
            <CompaniesPage
              companies={companies}
              extractionAvailable={extractionAvailable}
              onSave={(updated, extras) => saveCompany(updated, extras, false)}
              onDelete={deleteCompany}
            />
          }
        />
        <Route path="/followups" element={<FollowupsPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
      </Routes>
    </Shell>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [persistenceMode, setPersistenceMode] = useState('unknown');
  const [extractionAvailable, setExtractionAvailable] = useState(false);
  const [githubSyncAvailable, setGithubSyncAvailable] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [tweaksVisible, setTweaksVisible] = useState(false);
  const [tweaks, setTweaks] = useState({
    statusLabels: DEFAULT_STATUS_LABELS,
    rowDensity: 'comfortable',
  });
  const [toast, setToast] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [quickLogOpen, setQuickLogOpen] = useState(false);

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

  // Tweaks panel harness
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

  useEffect(() => {
    if (!ready || persistenceMode === 'offline') return;
    api.setTweaks(tweaks).catch(logError('setTweaks'));
    try {
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: tweaks }, '*');
    } catch {}
  }, [tweaks, ready, persistenceMode]);

  // Cmd/Ctrl+K → Quick Log
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setQuickLogOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Auto-emit structured events for newly-checked status boxes
  const companiesRef = useRef([]);
  useEffect(() => {
    companiesRef.current = companies;
  }, [companies]);

  const autoEmitStatusEvents = useCallback((id, beforeStatuses, afterStatuses) => {
    if (!Array.isArray(beforeStatuses) || !Array.isArray(afterStatuses)) return;
    afterStatuses.forEach((s, i) => {
      const wasChecked = Boolean(beforeStatuses[i]?.checked);
      if (s.checked && !wasChecked) {
        const ev = statusToEvent(s.label);
        if (ev) {
          api
            .createEvent(id, { ...ev, notes: `Status "${s.label}" checked` })
            .catch(logError('auto-emit event'));
        }
      }
    });
  }, []);

  // Fire-and-forget GitHub sync
  const syncWithGithub = useCallback(
    async ({ companyId, sourceUrl, sourceText, force = false }) => {
      if (!githubSyncAvailable) return;
      try {
        const result = await api.syncToGithub({ companyId, sourceUrl, sourceText, force });
        if (result?.status === 'created') {
          showToast('success', `Saved to GitHub: ${result.folderPath}`);
        } else if (result?.status === 'conflict') {
          setConflict({ companyId, sourceUrl, sourceText, folderName: result.folderName });
        }
      } catch (err) {
        if (err.status === 503) return;
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

  const replaceCompany = useCallback(
    (updated) => {
      const before = companiesRef.current.find((c) => c.id === updated.id);
      if (before) autoEmitStatusEvents(updated.id, before.statuses, updated.statuses);
      setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      api.updateCompany(updated.id, updated).catch(logError('replaceCompany'));
    },
    [autoEmitStatusEvents]
  );

  const saveCompany = useCallback(
    (updated, extras = {}, isNew = false) => {
      if (isNew) createCompany(updated, extras);
      else replaceCompany(updated);
    },
    [createCompany, replaceCompany]
  );

  const deleteCompany = useCallback((id) => {
    setCompanies((prev) => prev.filter((c) => c.id !== id));
    api.deleteCompany(id).catch(logError('deleteCompany'));
  }, []);

  const handleConflictCreateNew = () => {
    if (!conflict) return;
    const payload = { ...conflict, force: true };
    setConflict(null);
    syncWithGithub(payload);
  };

  return (
    <BrowserRouter>
      <AppRoutes
        ready={ready}
        persistenceMode={persistenceMode}
        extractionAvailable={extractionAvailable}
        companies={companies}
        saveCompany={saveCompany}
        deleteCompany={deleteCompany}
        onQuickLog={() => setQuickLogOpen(true)}
      />
      <QuickLogModal
        open={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onCommit={() => {
          setQuickLogOpen(false);
          api.listCompanies().then(setCompanies).catch(logError('refreshAfterQuickLog'));
        }}
      />
      <TweaksPanel visible={tweaksVisible} tweaks={tweaks} setTweaks={setTweaks} />
      {conflict && (
        <ConflictDialog
          folderName={conflict.folderName}
          onUseExisting={() => setConflict(null)}
          onCreateNew={handleConflictCreateNew}
        />
      )}
      {toast && <Toast kind={toast.kind} message={toast.message} />}
    </BrowserRouter>
  );
}
