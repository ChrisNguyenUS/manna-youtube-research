// The idea board. Every route answers synchronously; the AI helper (Task 5) is a short call, not a job.
import { httpError, raw } from '../router.js';

const attachment = (name) => ({ 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });
const idOf = (v, field = 'id') => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw httpError('invalid_input', 'Mã không hợp lệ', field);
  return n;
};
const batchOf = (query) => (query.get('batch') ? idOf(query.get('batch'), 'batch') : undefined);

export const ideaRoutes = [
  { method: 'GET', path: '/api/v1/ideas', handler: ({ app, query }) => app.features.ideas.board(batchOf(query)) },
  {
    method: 'POST', path: '/api/v1/ideas',
    handler: ({ app, body }) => {
      if (typeof body?.from !== 'string') throw httpError('invalid_input', 'Thiếu nguồn của thẻ', 'from');
      return app.features.ideas.create({ from: body.from });
    },
  },
  { method: 'POST', path: '/api/v1/ideas/batches', handler: ({ app, body }) => app.features.ideas.newBatch(body?.title) },
  {
    method: 'GET', path: '/api/v1/ideas/export.md',
    handler: ({ app, query }) => {
      const md = app.features.ideas.markdown(batchOf(query));
      return query.get('inline') ? raw(md, 'text/markdown; charset=utf-8') : raw(md, 'text/markdown; charset=utf-8', attachment('bang-y-tuong.md'));
    },
  },
  // AI helpers: a suggestion for the card on screen. Nothing is saved here.
  { method: 'POST', path: '/api/v1/ideas/assist', handler: ({ app, body }) => app.features.ideas.assist(String(body?.action || ''), { id: idOf(body?.id), card: body?.card }) },
  // A script the owner wrote, checked by code (no AI). Used while typing, before it is saved.
  {
    method: 'POST', path: '/api/v1/ideas/lint',
    handler: ({ app, body }) => {
      if (typeof body?.text !== 'string') throw httpError('invalid_input', 'Thiếu lời thoại', 'text');
      const length = [30, 45, 60, 90].includes(Number(body.length)) ? Number(body.length) : 45;
      return app.features.ideas.lint(body.text, { length, leadMagnet: String(body.leadMagnet ?? '') });
    },
  },
  { method: 'GET', path: '/api/v1/ideas/:id', handler: ({ app, params }) => app.features.ideas.get(idOf(params.id)) },
  {
    method: 'POST', path: '/api/v1/ideas/:id',
    handler: ({ app, params, body }) => {
      const id = idOf(params.id);
      if (!body?.patch || typeof body.patch !== 'object') throw httpError('invalid_input', 'Thiếu phần sửa', 'patch');
      return app.features.ideas.update(id, body.patch);
    },
  },
  { method: 'DELETE', path: '/api/v1/ideas/:id', handler: ({ app, params }) => (app.features.ideas.remove(idOf(params.id)), { ok: true }) },
  {
    method: 'POST', path: '/api/v1/ideas/:id/outline',
    handler: ({ app, params, body }) => {
      const id = idOf(params.id);
      if (!body?.outline || typeof body.outline !== 'object') throw httpError('invalid_input', 'Thiếu dàn ý', 'outline');
      return app.features.ideas.saveOutline(id, body.outline);
    },
  },
  {
    method: 'POST', path: '/api/v1/ideas/:id/script',
    handler: ({ app, params, body }) => {
      const id = idOf(params.id);
      if (typeof body?.text !== 'string') throw httpError('invalid_input', 'Thiếu lời thoại', 'text');
      return app.features.ideas.saveScript(id, body.text);
    },
  },
  // AI helpers on the outline: a suggestion for what is on screen. Nothing is saved here.
  {
    method: 'POST', path: '/api/v1/ideas/:id/outline/assist',
    handler: ({ app, params, body }) => app.features.ideas.outlineAssist(String(body?.action || ''), { id: idOf(params.id), outline: body?.outline, card: body?.card, archetype: typeof body?.archetype === 'string' ? body.archetype : undefined }),
  },
  {
    method: 'GET', path: '/api/v1/ideas/:id/outline.md',
    handler: ({ app, params, query }) => {
      const md = app.features.ideas.outlineMarkdown(idOf(params.id));
      return query.get('inline') ? raw(md, 'text/markdown; charset=utf-8') : raw(md, 'text/markdown; charset=utf-8', attachment('dan-y.md'));
    },
  },
];
