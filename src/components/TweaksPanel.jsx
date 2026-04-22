import { useState, useEffect } from 'react';
import { C } from '../theme.js';

export default function TweaksPanel({ visible, tweaks, setTweaks }) {
  const [labels, setLabels] = useState(tweaks.statusLabels);

  useEffect(() => {
    setLabels(tweaks.statusLabels);
  }, [tweaks.statusLabels]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: 280,
        background: C.surface,
        borderRadius: 10,
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        border: `1px solid ${C.border}`,
        padding: 14,
        zIndex: 999,
      }}
    >
      <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: C.accent }}>
        Tweaks
      </h3>
      <div style={{ marginBottom: 10 }}>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.textDim,
            display: 'block',
            marginBottom: 3,
          }}
        >
          Row Density
        </label>
        <select
          value={tweaks.rowDensity}
          onChange={(e) => setTweaks({ ...tweaks, rowDensity: e.target.value })}
          style={{
            width: '100%',
            padding: '5px 7px',
            borderRadius: 4,
            border: `1px solid ${C.border}`,
            fontFamily: 'inherit',
            fontSize: 12,
            background: C.card,
            color: C.text,
          }}
        >
          <option value="compact">Compact</option>
          <option value="comfortable">Comfortable</option>
        </select>
      </div>
      <div>
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: C.textDim,
            display: 'block',
            marginBottom: 3,
          }}
        >
          Default Status Labels
        </label>
        <textarea
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
          onBlur={() => setTweaks({ ...tweaks, statusLabels: labels })}
          style={{
            width: '100%',
            minHeight: 70,
            padding: 7,
            borderRadius: 4,
            border: `1px solid ${C.border}`,
            fontFamily: 'inherit',
            fontSize: 11,
            resize: 'vertical',
            background: C.card,
            color: C.text,
          }}
        />
      </div>
    </div>
  );
}
