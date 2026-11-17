// The brick library: videos broken into bricks. Extraction is the job brick_extract; these routes read and correct.
import { httpError, raw } from '../router.js';
import { CONCEPTS, ARCHETYPES, AUDIENCE, BLOCK_LABELS, EDITABLE } from '../../core/bricks/schema.js';

const attachment = (name) => ({ 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });
const PLATFORMS = ['tiktok', 'youtube'];
const at = (params) => {
  if (!PLATFORMS.includes(params.platform)) throw httpError('invalid_input', 'Nền tảng phải là tiktok hoặc youtube', 'platform');
  return /** @type {[string, string]} */ ([params.platform, params.id]);
};

export const brickRoutes = [
  // The lists ride along so the screen's filters and editors never drift from what the checks accept.
  { method: 'GET', path: '/api/v1/bricks', handler: ({ app }) => ({ rows: app.features.bricks.list(), concepts: CONCEPTS, archetypes: ARCHETYPES, audience: AUDIENCE, blockLabels: BLOCK_LABELS, editable: EDITABLE, ai: app.llm.ready() }) },
  {
    method: 'GET', path: '/api/v1/bricks/export.md',
    handler: ({ app, query }) => {
      const md = app.features.bricks.markdown(String(query.get('keys') || '').split(',').filter(Boolean));
      return query.get('inline') ? raw(md, 'text/markdown; charset=utf-8') : raw(md, 'text/markdown; charset=utf-8', attachment('thu-vien-gach.md'));
    },
  },
  { method: 'GET', path: '/api/v1/bricks/:platform/:id', handler: ({ app, params }) => app.features.bricks.get(...at(params)) },
  {
    method: 'POST', path: '/api/v1/bricks/:platform/:id',
    handler: ({ app, params, body }) => {
      if (!body?.edits || typeof body.edits !== 'object') throw httpError('invalid_input', 'Thiếu phần sửa', 'edits');
      return app.features.bricks.update(...at(params), body.edits);
    },
  },
  { method: 'DELETE', path: '/api/v1/bricks/:platform/:id', handler: ({ app, params }) => (app.features.bricks.remove(...at(params)), { ok: true }) },
];
