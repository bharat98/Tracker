import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LayoutGrid, List as ListIcon, Search } from 'lucide-react';
import CompanyDrawer from '../components/CompanyDrawer.jsx';

// Display columns for the kanban. Source-of-truth stage enum is richer
// (accepted/rejected/withdrawn/ghosted), but those collapse into "Closed"
// for the funnel view.
const STAGE_COLUMNS = [
  { key: 'sourced',      label: 'Sourced' },
  { key: 'applied',      label: 'Applied' },
  { key: 'screening',    label: 'Screen' },
  { key: 'interviewing', label: 'Interview' },
  { key: 'final_round',  label: 'Final' },
  { key: 'offer',        label: 'Offer' },
  { key: 'closed',       label: 'Closed' },
];

const stageToColumn = (stage) => {
  if (!stage) return 'sourced';
  if (['accepted', 'rejected', 'withdrawn', 'ghosted'].includes(stage)) return 'closed';
  return stage;
};

const PIPELINE_FILTERS = ['all', 'ongoing', 'rejected'];

export default function CompaniesPage({
  companies,
  extractionAvailable,
  onSave,
  onDelete,
}) {
  const navigate = useNavigate();
  const { id: selectedId } = useParams();

  const [view, setView] = useState('kanban');
  const [pipeline, setPipeline] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      const p = c.pipeline || 'ongoing';
      if (pipeline !== 'all' && p !== pipeline) return false;
      if (!q) return true;
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.role || '').toLowerCase().includes(q)
      );
    });
  }, [companies, pipeline, query]);

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--border)', padding: '0.35rem 0.7rem', background: '#fff', minWidth: 260 }}>
          <Search size={14} style={{ color: 'var(--text-secondary)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies…"
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: '0.9rem', flex: 1, fontFamily: 'inherit', color: 'var(--text)' }}
          />
        </div>

        <div style={{ display: 'flex', border: '1px solid var(--border)' }}>
          {PIPELINE_FILTERS.map((p) => {
            const active = pipeline === p;
            return (
              <button
                key={p}
                onClick={() => setPipeline(p)}
                style={{
                  padding: '0.4rem 0.9rem',
                  fontSize: '0.8rem',
                  fontFamily: 'inherit',
                  background: active ? 'var(--text)' : 'transparent',
                  color: active ? 'var(--bg)' : 'var(--text-secondary)',
                  border: 'none',
                  borderRadius: 0,
                  cursor: 'pointer',
                }}
              >
                {p}
              </button>
            );
          })}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setView('kanban')}
            title="Kanban"
            style={{
              padding: '0.45rem 0.75rem',
              background: view === 'kanban' ? 'var(--surface-hover)' : 'transparent',
              color: view === 'kanban' ? 'var(--text)' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer',
            }}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setView('list')}
            title="List"
            style={{
              padding: '0.45rem 0.75rem',
              background: view === 'list' ? 'var(--surface-hover)' : 'transparent',
              color: view === 'list' ? 'var(--text)' : 'var(--text-secondary)',
              border: 'none', cursor: 'pointer',
            }}
          >
            <ListIcon size={14} />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '4rem 0', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div className="font-serif" style={{ fontSize: '1.4rem', fontWeight: 300, marginBottom: '0.5rem', color: 'var(--text)' }}>
            No companies yet
          </div>
          <div style={{ fontSize: '0.9rem' }}>
            Hit <span className="label">+ Company</span> to start.
          </div>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/companies/new')}
            style={{ marginTop: '1.25rem' }}
          >
            + Add Company
          </button>
        </div>
      ) : view === 'kanban' ? (
        <KanbanView rows={filtered} onOpen={(id) => navigate(`/companies/${id}`)} onDelete={onDelete} />
      ) : (
        <ListView rows={filtered} onOpen={(id) => navigate(`/companies/${id}`)} onDelete={onDelete} />
      )}

      {selectedId && (
        <CompanyDrawer
          companyId={selectedId}
          companies={companies}
          onClose={() => navigate('/companies')}
          onSave={(updated) => { onSave(updated, {}); navigate('/companies'); }}
          onDelete={(id) => { onDelete(id); navigate('/companies'); }}
        />
      )}
    </div>
  );
}

function KanbanView({ rows, onOpen, onDelete }) {
  const grouped = useMemo(() => {
    const g = Object.fromEntries(STAGE_COLUMNS.map((c) => [c.key, []]));
    rows.forEach((r) => {
      const col = stageToColumn(r.currentStage);
      (g[col] || g.sourced).push(r);
    });
    return g;
  }, [rows]);

  return (
    <div
      className="thin-scroll"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${STAGE_COLUMNS.length}, minmax(220px, 1fr))`,
        gap: 0,
        overflowX: 'auto',
      }}
    >
      {STAGE_COLUMNS.map((col) => (
        <div
          key={col.key}
          style={{
            padding: '0 0.5rem 1rem',
            borderRight: col.key === 'closed' ? 'none' : '1px solid var(--border)',
            minHeight: '70vh',
          }}
        >
          <div style={{ padding: '0.5rem 0.25rem 0.85rem', position: 'sticky', top: 0, background: 'var(--bg)' }}>
            <div className="label">{col.label}</div>
            <div className="num" style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              {grouped[col.key].length}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {grouped[col.key].map((r) => (
              <KanbanCard key={r.id} company={r} onOpen={onOpen} onDelete={onDelete} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function KanbanCard({ company, onOpen, onDelete }) {
  const [hovering, setHovering] = useState(false);
  const p = company.pipeline || 'ongoing';
  return (
    <div
      className="card card-interactive"
      onClick={() => onOpen(company.id)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{ padding: '0.75rem 0.85rem', background: '#fff', position: 'relative' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
        <div style={{ fontWeight: 500, fontSize: '0.95rem', lineHeight: 1.2, color: 'var(--text)' }}>
          {company.name || 'Untitled'}
        </div>
        {hovering && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Delete ${company.name || 'this company'}?`)) onDelete(company.id);
            }}
            title="Delete"
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 12, padding: 0, lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>
      {company.role && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
          {company.role}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.55rem' }}>
        <span className={`pill pill-${p}`}>{p}</span>
        {company.hmName && <span className="pill pill-hm">HM</span>}
        {company.recruiterName && <span className="pill pill-recruiter">Rec</span>}
        {company.referralName && <span className="pill pill-referral">Ref</span>}
      </div>
    </div>
  );
}

function ListView({ rows, onOpen, onDelete }) {
  return (
    <div className="card">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <Th>Company</Th>
            <Th>Role</Th>
            <Th>Stage</Th>
            <Th>Pipeline</Th>
            <Th>Channel</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="row-hover"
              style={{ borderBottom: '1px solid var(--divider)', cursor: 'pointer' }}
              onClick={() => onOpen(r.id)}
            >
              <Td><div style={{ fontWeight: 500 }}>{r.name}</div></Td>
              <Td>{r.role || '—'}</Td>
              <Td><span className="label">{stageToColumn(r.currentStage)}</span></Td>
              <Td><span className={`pill pill-${r.pipeline || 'ongoing'}`}>{r.pipeline || 'ongoing'}</span></Td>
              <Td>{r.channel || '—'}</Td>
              <Td>
                {onDelete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete ${r.name || 'this company'}?`)) onDelete(r.id);
                    }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >
                    ✕
                  </button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Th = ({ children }) => (
  <th style={{
    textAlign: 'left', padding: '0.7rem 0.9rem',
    fontWeight: 500, fontSize: '0.72rem', letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'var(--text-secondary)',
    fontFamily: 'IBM Plex Mono, monospace',
  }}>{children}</th>
);
const Td = ({ children }) => (
  <td style={{ padding: '0.7rem 0.9rem' }}>{children}</td>
);
