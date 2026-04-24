// Editorial palette (warm off-white, terracotta accent, olive secondary).
// Keeps the same key names the rest of the app already imports; new
// surfaces should prefer CSS variables from styles.css.
export const C = {
  bg: '#FDFBF7',
  surface: '#FFFFFF',
  surfaceHover: '#F5F3EF',
  card: '#FFFFFF',
  accent: '#D95A40',
  accentDim: 'rgba(217,90,64,0.12)',
  accentBright: '#C24930',
  accent2: '#2D4A22',
  border: '#E5E2DC',
  borderLight: '#EFECE7',
  text: '#1C1917',
  textDim: '#78716C',
  textMuted: '#A8A29E',
  green: '#166534',
  greenDim: 'rgba(22,101,52,0.10)',
  red: '#B91C1C',
  redDim: '#FDEDED',
};

export const DEFAULT_STATUS_LABELS =
  'LinkedIn Reachout,Someone at Company Connected,Hiring Manager Tracked,Resume Created,Hiring Manager Contacted,Applied,Interview 1,Interview 2';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
