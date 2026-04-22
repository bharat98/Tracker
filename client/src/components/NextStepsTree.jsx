import { useState, useEffect, useRef } from 'react';
import { C, uid } from '../theme.js';

function StepNode({ node, depth = 0, onUpdate, onDelete, onAddChild }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(node.text);
  const ref = useRef(null);

  useEffect(() => {
    if (editing && ref.current) ref.current.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (text.trim()) onUpdate(node.id, text.trim());
    else onDelete(node.id);
  };

  return (
    <div style={{ marginLeft: depth > 0 ? 18 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0' }}>
        {depth > 0 && (
          <svg width="14" height="14" viewBox="0 0 14 14" style={{ flexShrink: 0, opacity: 0.5 }}>
            <path
              d="M2 0 L2 7 L12 7"
              stroke={C.accent}
              strokeWidth="1.2"
              fill="none"
              strokeLinecap="round"
            />
            <polygon points="10,5 14,7 10,9" fill={C.accent} />
          </svg>
        )}
        {editing ? (
          <input
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && commit()}
            style={{
              flex: 1,
              padding: '2px 6px',
              border: `1px solid ${C.accent}`,
              borderRadius: 3,
              fontFamily: 'inherit',
              fontSize: 12,
              outline: 'none',
              background: C.accentDim,
              color: C.text,
            }}
          />
        ) : (
          <span
            style={{ fontSize: 12, cursor: 'pointer', flex: 1, color: C.text }}
            onClick={() => setEditing(true)}
          >
            {node.text}
          </span>
        )}
        <button
          onClick={() => onAddChild(node.id)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: C.textMuted,
            fontSize: 13,
            padding: '0 1px',
          }}
          title="Add sub-step"
        >
          +
        </button>
        <button
          onClick={() => onDelete(node.id)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: C.textMuted,
            fontSize: 11,
            padding: '0 1px',
          }}
          title="Delete"
        >
          ✕
        </button>
      </div>
      {node.children?.map((ch) => (
        <StepNode
          key={ch.id}
          node={ch}
          depth={depth + 1}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddChild={onAddChild}
        />
      ))}
    </div>
  );
}

export default function NextStepsTree({ steps, onChange }) {
  const updateText = (nodes, id, text) =>
    nodes.map((n) =>
      n.id === id
        ? { ...n, text }
        : { ...n, children: updateText(n.children || [], id, text) }
    );
  const del = (nodes, id) =>
    nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: del(n.children || [], id) }));
  const addChild = (nodes, pid) =>
    nodes.map((n) =>
      n.id === pid
        ? { ...n, children: [...(n.children || []), { id: uid(), text: 'New step', children: [] }] }
        : { ...n, children: addChild(n.children || [], pid) }
    );

  return (
    <div>
      {steps.map((n) => (
        <StepNode
          key={n.id}
          node={n}
          onUpdate={(id, t) => onChange(updateText(steps, id, t))}
          onDelete={(id) => onChange(del(steps, id))}
          onAddChild={(id) => onChange(addChild(steps, id))}
        />
      ))}
      <button
        onClick={() => onChange([...steps, { id: uid(), text: 'New step', children: [] }])}
        style={{
          marginTop: 4,
          background: 'none',
          border: `1px dashed ${C.border}`,
          borderRadius: 4,
          padding: '3px 8px',
          fontSize: 11,
          cursor: 'pointer',
          color: C.textDim,
          fontFamily: 'inherit',
        }}
      >
        + Add step
      </button>
    </div>
  );
}
