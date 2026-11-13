// Bookmarks with notes: YouTube channels and videos, TikTok videos, customer quotes, keywords.
import { httpError, raw } from '../router.js';
import { SAVED_KINDS, savedMarkdown } from '../../core/report/saved.js';
import { validate } from '../validate.js';

const KEY = { kind: Object.keys(SAVED_KINDS), ref: 'string!' };
function need(body, schema) {
  const v = validate(schema, body);
  if (!v.ok) throw httpError('invalid_input', v.message, v.field);
  if (!body.kind) throw httpError('invalid_input', 'bắt buộc', 'kind');
  return v.value;
}

export const savedRoutes = [
  { method: 'GET', path: '/api/v1/saved', handler: ({ app, ws, query }) => app.store.saved.list(ws, query.get('kind') || undefined) },
  {
    // The whole list, or one kind, as Markdown (download; ?inline=1 to read it in the page).
    method: 'GET', path: '/api/v1/saved/export.md',
    handler: ({ app, ws, query }) => {
      const kind = query.get('kind') || undefined;
      if (kind && !SAVED_KINDS[kind]) throw httpError('invalid_input', `phải là một trong: ${Object.keys(SAVED_KINDS).join(', ')}`, 'kind');
      const md = savedMarkdown(app.store.saved.list(ws, kind));
      const name = `da-luu${kind ? `-${kind.replace(/_/g, '-')}` : ''}-${new Date().toISOString().slice(0, 10)}.md`;
      return raw(md, 'text/markdown; charset=utf-8', query.get('inline') ? {} : { 'content-disposition': `attachment; filename="${name}"` });
    },
  },
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
