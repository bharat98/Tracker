import { C } from '../theme.js';
import NextStepsTree from './NextStepsTree.jsx';

export default function CompanyRow({
  company,
  density,
  onUpdate,
  onOpenDetail,
  onDragStart,
  onDragOver,
  onDrop,
  isDragOver,
}) {
  const py = density === 'compact' ? 10 : 16;

  const toggleStatus = (idx) => {
    const statuses = company.statuses.map((s, i) =>
      i === idx ? { ...s, checked: !s.checked } : s
    );
    onUpdate({ statuses });
  };

  const checked = company.statuses.filter((s) => s.checked).length;
  const pct = company.statuses.length ? checked / company.statuses.length : 0;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDoubleClick={() => onOpenDetail(company)}
      style={{
        background: C.card,
        borderRadius: 10,
        border: `1px solid ${isDragOver ? C.accent : C.border}`,
        display: 'grid',
        gridTemplateColumns: '190px 1fr 1fr 170px',
        cursor: 'grab',
        transition: 'all 0.15s',
        boxShadow: isDragOver ? `0 0 0 1px ${C.accent}` : '0 1px 4px rgba(0,0,0,0.2)',
      }}
      onMouseEnter={(e) => {
        if (!isDragOver) e.currentTarget.style.borderColor = C.borderLight;
        e.currentTarget.style.background = C.surfaceHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isDragOver ? C.accent : C.border;
        e.currentTarget.style.background = C.card;
      }}
    >
      {/* Name + progress */}
      <div
        style={{
          padding: `${py}px 14px`,
          borderRight: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-start',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{company.name}</div>
        <div style={{ fontSize: 12, color: C.textDim, marginTop: 1 }}>{company.role}</div>
        <div
          style={{
            marginTop: 6,
            height: 3,
            background: C.border,
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              background: C.green,
              borderRadius: 2,
              transition: 'width 0.3s',
            }}
          />
        </div>
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3 }}>
          {checked}/{company.statuses.length} complete
        </div>
      </div>

      {/* Status */}
      <div
        style={{
          padding: `${py}px 12px`,
          borderRight: `1px solid ${C.border}`,
          display: 'flex',
          flexDirection: 'column',
          gap: density === 'compact' ? 1 : 3,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {company.statuses.map((s, i) => (
          <label
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              cursor: 'pointer',
              color: s.checked ? C.green : C.text,
              textDecoration: s.checked ? 'line-through' : 'none',
              opacity: s.checked ? 0.55 : 1,
            }}
          >
            <input
              type="checkbox"
              checked={s.checked}
              onChange={() => toggleStatus(i)}
              style={{ accentColor: C.green, width: 13, height: 13, cursor: 'pointer' }}
            />
            {s.label}
          </label>
        ))}
      </div>

      {/* Next Steps */}
      <div
        style={{ padding: `${py}px 12px`, borderRight: `1px solid ${C.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <NextStepsTree
          steps={company.nextSteps}
          onChange={(steps) => onUpdate({ nextSteps: steps })}
        />
      </div>

      {/* Blockers */}
      <div style={{ padding: `${py}px 12px` }} onClick={(e) => e.stopPropagation()}>
        <textarea
          value={company.blockers}
          onChange={(e) => onUpdate({ blockers: e.target.value })}
          placeholder="—"
          style={{
            width: '100%',
            height: '100%',
            minHeight: 40,
            border: 'none',
            resize: 'none',
            fontFamily: 'inherit',
            fontSize: 12,
            outline: 'none',
            background: 'transparent',
            color: company.blockers ? C.red : C.textMuted,
          }}
        />
      </div>
    </div>
  );
}
