export const DEFAULT_STATUS_LABELS =
  'LinkedIn Reachout,Someone at Company Connected,Hiring Manager Tracked,Resume Created,Hiring Manager Contacted,Applied,Interview 1,Interview 2';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
