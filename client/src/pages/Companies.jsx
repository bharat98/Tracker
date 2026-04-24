import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LayoutGrid, List as ListIcon, Search } from 'lucide-react';
import {
  DndContext, DragOverlay,
  pointerWithin, closestCenter,
  PointerSensor, KeyboardSensor,
  useSensor, useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates,
  useSortable, arrayMove, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CompanyDrawer from '../components/CompanyDrawer.jsx';
import * as api from '../api.js';

const STAGE_COLUMNS = [
  { key: 'sourced',      label: 'Sourced' },
  { key: 'networked',    label: 'Networked' },
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

const groupByColumn = (rows) => {
  const g = Object.fromEntries(STAGE_COLUMNS.map((c) => [c.key, []]));
  rows.forEach((r) => {
    const col = stageToColumn(r.currentStage);
    (g[col] || g.sourced).push(r);
  });
  return g;
};

export default function CompaniesPage({ companies, extractionAvailable, onSave, onDelete }) {
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
                  padding: '0.4rem 0.9rem', fontSize: '0.8rem', fontFamily: 'inherit',
                  background: active ? 'var(--text)' : 'transparent',
                  color: active ? 'var(--bg)' : 'var(--text-secondary)',
                  border: 'none', borderRadius: 0, cursor: 'pointer',
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
            style={{ padding: '0.45rem 0.75rem', background: view === 'kanban' ? 'var(--surface-hover)' : 'transparent', color: view === 'kanban' ? 'var(--text)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => setView('list')}
            title="List"
            style={{ padding: '0.45rem 0.75rem', background: view === 'list' ? 'var(--surface-hover)' : 'transparent', color: view === 'list' ? 'var(--text)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}
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
          <button className="btn btn-primary" onClick={() => navigate('/companies/new')} style={{ marginTop: '1.25rem' }}>
            + Add Company
          </button>
        </div>
      ) : view === 'kanban' ? (
        <KanbanView rows={filtered} onOpen={(id) => navigate(`/companies/${id}`)} onDelete={onDelete} onSave={onSave} />
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

// ── Kanban ────────────────────────────────────────────────────────────────────

// pointerWithin first (most accurate for cross-column), fall back to closestCenter
const collisionDetection = (args) => {
  const pw = pointerWithin(args);
  return pw.length > 0 ? pw : closestCenter(args);
};

function KanbanView({ rows, onOpen, onDelete, onSave }) {
  const [colItems, setColItems] = useState(() => groupByColumn(rows));
  const [activeId, setActiveId] = useState(null);
  const dragging = useRef(false);
  const origColRef = useRef(null); // stable origCol captured at drag start

  // Sync from parent when rows change, but not while a drag is in progress
  useEffect(() => {
    if (!dragging.current) setColItems(groupByColumn(rows));
  }, [rows]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findCol = (itemId) => {
    for (const key of Object.keys(colItems)) {
      if (colItems[key].find((c) => c.id === itemId)) return key;
    }
    return null;
  };

  const handleDragStart = ({ active }) => {
    dragging.current = true;
    setActiveId(active.id);
    origColRef.current = findCol(active.id); // capture BEFORE any dragOver updates
  };

  // Mid-drag: visually move card into the hovered column
  const handleDragOver = ({ active, over }) => {
    if (!over) return;
    const srcCol = findCol(active.id);
    // over.id is either a column key (from useDroppable) or a card id (from useSortable)
    const destCol = STAGE_COLUMNS.some((c) => c.key === over.id) ? over.id : findCol(over.id);
    if (!srcCol || !destCol || srcCol === destCol) return;

    const card = colItems[srcCol].find((c) => c.id === active.id);
    if (!card) return;

    setColItems((prev) => {
      const srcItems = prev[srcCol].filter((c) => c.id !== active.id);
      const destItems = [...prev[destCol]];
      const overIdx = destItems.findIndex((c) => c.id === over.id);
      destItems.splice(overIdx >= 0 ? overIdx : destItems.length, 0, card);
      return { ...prev, [srcCol]: srcItems, [destCol]: destItems };
    });
  };

  const handleDragEnd = ({ active, over }) => {
    dragging.current = false;
    setActiveId(null);

    if (!over) {
      setColItems(groupByColumn(rows)); // snap back
      return;
    }

    const currentCol = findCol(active.id);
    if (!currentCol) return;

    if (currentCol !== origColRef.current) {
      // Cross-column: persist the stage change
      const company = rows.find((c) => c.id === active.id);
      if (company) onSave({ ...company, currentStage: currentCol }, {});
    } else {
      // Same-column: check if position changed and persist reorder
      const overCol = STAGE_COLUMNS.some((c) => c.key === over.id) ? over.id : findCol(over.id);
      if (overCol === currentCol) {
        const oldIdx = colItems[currentCol].findIndex((c) => c.id === active.id);
        const newIdx = colItems[currentCol].findIndex((c) => c.id === over.id);
        if (oldIdx !== newIdx && newIdx >= 0) {
          const reordered = arrayMove(colItems[currentCol], oldIdx, newIdx);
          setColItems((prev) => ({ ...prev, [currentCol]: reordered }));
          const allIds = STAGE_COLUMNS.flatMap((col) =>
            col.key === currentCol ? reordered : (colItems[col.key] || [])
          ).map((c) => c.id);
          api.reorderCompanies(allIds).catch(console.error);
        }
      }
    }
  };

  const activeCompany = activeId ? rows.find((c) => c.id === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
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
          <KanbanColumn
            key={col.key}
            col={col}
            items={colItems[col.key] || []}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={{ duration: 150 }}>
        {activeCompany && <KanbanCardGhost company={activeCompany} />}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumn({ col, items, onOpen, onDelete }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });

  return (
    <div
      ref={setNodeRef}
      style={{
        padding: '0 0.5rem 1rem',
        borderRight: col.key === 'closed' ? 'none' : '1px solid var(--border)',
        minHeight: '70vh',
        background: isOver ? 'rgba(217,90,64,0.04)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      <div style={{ padding: '0.5rem 0.25rem 0.85rem', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
        <div className="label">{col.label}</div>
        <div className="num" style={{ fontSize: '1rem', color: 'var(--text-secondary)', marginTop: 2 }}>
          {items.length}
        </div>
      </div>
      <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map((r) => (
            <KanbanCard key={r.id} company={r} onOpen={onOpen} onDelete={onDelete} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function KanbanCard({ company, onOpen, onDelete }) {
  const [hovering, setHovering] = useState(false);
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: company.id });

  const p = company.pipeline || 'ongoing';

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0 : 1,
        touchAction: 'none',
      }}
    >
      <div
        className="card card-interactive"
        style={{ padding: '0.75rem 0.85rem', background: '#fff', position: 'relative', cursor: 'grab' }}
        onClick={() => onOpen(company.id)}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        {...attributes}
        {...listeners}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
          <div style={{ fontWeight: 500, fontSize: '0.95rem', lineHeight: 1.2, color: 'var(--text)' }}>
            {company.name || 'Untitled'}
          </div>
          {hovering && onDelete && !isDragging && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete ${company.name || 'this company'}?`)) onDelete(company.id);
              }}
              title="Delete"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 0, lineHeight: 1 }}
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
    </div>
  );
}

// Ghost shown in DragOverlay while dragging
function KanbanCardGhost({ company }) {
  const p = company.pipeline || 'ongoing';
  return (
    <div
      className="card"
      style={{
        padding: '0.75rem 0.85rem', background: '#fff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
        cursor: 'grabbing', transform: 'rotate(1.5deg)',
        border: '1px solid var(--accent)',
      }}
    >
      <div style={{ fontWeight: 500, fontSize: '0.95rem', lineHeight: 1.2, color: 'var(--text)' }}>
        {company.name || 'Untitled'}
      </div>
      {company.role && (
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{company.role}</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.55rem' }}>
        <span className={`pill pill-${p}`}>{p}</span>
      </div>
    </div>
  );
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ rows, onOpen, onDelete }) {
  return (
    <div className="card">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            <Th>Company</Th><Th>Role</Th><Th>Stage</Th><Th>Pipeline</Th><Th>Channel</Th><Th></Th>
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
                    onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete ${r.name || 'this company'}?`)) onDelete(r.id); }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}
                  >✕</button>
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
  <th style={{ textAlign: 'left', padding: '0.7rem 0.9rem', fontWeight: 500, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: 'IBM Plex Mono, monospace' }}>{children}</th>
);
const Td = ({ children }) => (
  <td style={{ padding: '0.7rem 0.9rem' }}>{children}</td>
);
