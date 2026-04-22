export const C = {
  bg: '#0F0F0F',
  surface: '#1A1A1A',
  surfaceHover: '#222222',
  card: '#161616',
  accent: '#C2966A',
  accentDim: 'rgba(194,150,106,0.15)',
  accentBright: '#D4A87A',
  border: '#2A2A2A',
  borderLight: '#333',
  text: '#E8E0D8',
  textDim: '#8A7E72',
  textMuted: '#5A5048',
  green: '#7AA870',
  greenDim: 'rgba(122,168,112,0.15)',
  red: '#C07060',
  redDim: 'rgba(192,112,96,0.12)',
};

export const DEFAULT_STATUS_LABELS =
  'LinkedIn Reachout,Someone at Company Connected,Hiring Manager Tracked,Resume Created,Hiring Manager Contacted,Applied,Interview 1,Interview 2';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
