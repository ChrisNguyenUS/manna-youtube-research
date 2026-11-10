// Bookmarks (channels/videos) with notes.
import { httpError } from '../router.js';
import { validate } from '../validate.js';

const KEY = { kind: ['channel', 'video'], ref: 'string!' };
function need(body, schema) {
  const v = validate(schema, body);
  if (!v.ok) throw httpError('invalid_input', v.message, v.field);
  if (!body.kind) throw httpError('invalid_input', 'bắt buộc', 'kind');
  return v.value;
}

export const savedRoutes = [
  { method: 'GET', path: '/api/v1/saved', handler: ({ app, ws, query }) => app.store.saved.list(ws, query.get('kind') || undefined) },
  { method: 'GET', path: '/api/v1/saved/keys', handler: ({ app, ws }) => app.store.saved.keys(ws) },
  {
    method: 'POST', path: '/api/v1/saved',
    handler: ({ app, ws, body }) => {
      const b = need(body, { ...KEY, title: 'string?', note: 'string?' });
      app.store.saved.put(ws, b.kind, b.ref, b.title || '', b.data || {}, b.note || '');
      return { ok: true };
    },
  },
  {
    method: 'PATCH', path: '/api/v1/saved',
    handler: ({ app, ws, body }) => {
      const b = need(body, { ...KEY, note: 'string?' });
      app.store.saved.note(ws, b.kind, b.ref, b.note || '');
      return { ok: true };
    },
  },
  {
    method: 'DELETE', path: '/api/v1/saved',
    handler: ({ app, ws, body }) => {
      const b = need(body, KEY);
      app.store.saved.remove(ws, b.kind, b.ref);
      return { ok: true };
    },
  },
];
