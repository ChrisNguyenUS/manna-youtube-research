// Settings (secrets masked), metric registry and status bar data.
import { METRICS } from '../../core/metrics/definitions.js';

const MASK = '••••';
const masked = (s) => ({ ...s, aiKey: s.aiKey ? MASK : '' });

export const settingsRoutes = [
  { method: 'GET', path: '/api/v1/settings', handler: ({ app }) => masked(app.settings()) },
  {
    method: 'POST', path: '/api/v1/settings',
    handler: ({ app, ws, body }) => {
      const patch = { ...body };
      if (patch.aiKey === MASK) delete patch.aiKey; // unchanged secret
      const s = app.store.settings.set(ws, patch);
      app.source.configure?.(s);
      return masked(s);
    },
  },
  { method: 'GET', path: '/api/v1/metrics', handler: () => METRICS },
  {
    method: 'GET', path: '/api/v1/status',
    handler: ({ app, ws }) => {
      const s = app.settings();
      return { gl: s.gl, concurrency: s.concurrency, delayMs: s.delayMs, ...app.source.stats(), counts: app.store.records.counts(ws), tiktok: app.tiktok.capabilities(), running: app.runner.list(ws).filter((j) => j.status === 'running').length };
    },
  },
];
