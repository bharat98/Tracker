import { C } from '../theme.js';

export default function Toast({ kind = 'info', message }) {
  const colors = {
    success: { bg: 'rgba(122,168,112,0.15)', border: C.green, text: C.green },
    error: { bg: 'rgba(192,112,96,0.15)', border: C.red, text: C.red },
    info: { bg: C.surface, border: C.border, text: C.text },
  }[kind] || { bg: C.surface, border: C.border, text: C.text };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        padding: '10px 16px',
        borderRadius: 8,
        fontSize: 13,
        maxWidth: 340,
        zIndex: 1200,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        animation: 'tracker-toast-in 0.2s ease-out',
      }}
    >
      {message}
    </div>
  );
}
