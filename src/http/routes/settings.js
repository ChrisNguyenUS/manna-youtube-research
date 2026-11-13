// Settings (secrets masked), metric registry and status bar data.
import { METRICS } from '../../core/metrics/definitions.js';
import { httpError } from '../router.js';

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
    // "Tắt app": the same clean stop as the Stop Content Research icon (running jobs become "interrupted" and can be run again).
    // Only the app's own page may ask: a JSON request from this origin. Another website open in the browser cannot send
    // a JSON body here without a CORS preflight, which this server never answers.
    method: 'POST', path: '/api/v1/shutdown',
    handler: ({ app, headers: h }) => {
      /** @type {Record<string, string|undefined>} */
      const headers = h ?? {};
      const origin = headers.origin;
      const own = !origin || (() => { try { return new URL(origin).host === headers.host; } catch { return false; } })();
      if (!own || !String(headers['content-type'] || '').startsWith('application/json')) throw httpError('forbidden', 'Chỉ cửa sổ Content Research mới tắt được app');
      if (!app.shutdown) throw httpError('unavailable', 'Bản chạy này không tự tắt được');
      const stop = app.shutdown;
      setTimeout(stop, 150); // after this answer has left
      return { ok: true };
    },
  },
  {
    method: 'GET', path: '/api/v1/status',
    handler: ({ app, ws }) => {
      const s = app.settings();
      return { gl: s.gl, concurrency: s.concurrency, delayMs: s.delayMs, ...app.source.stats(), counts: app.store.records.counts(ws), tiktok: app.tiktok.capabilities(), running: app.runner.list(ws).filter((j) => j.status === 'running').length };
    },
  },
];
