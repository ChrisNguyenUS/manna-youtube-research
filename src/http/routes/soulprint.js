// Soulprint: the root profile of the owner's content. Reads, saves and exports; AI helpers only propose.
import { httpError, raw } from '../router.js';

const attachment = (name) => ({ 'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });

export const soulprintRoutes = [
  { method: 'GET', path: '/api/v1/soulprint', handler: ({ app }) => app.features.soulprint.get() },
  {
    method: 'POST', path: '/api/v1/soulprint',
    handler: ({ app, body }) => {
      if (!body?.profile || typeof body.profile !== 'object') throw httpError('invalid_input', 'Thiếu hồ sơ', 'profile');
      return app.features.soulprint.save(body.profile);
    },
  },
  { method: 'GET', path: '/api/v1/soulprint/seeds', handler: ({ app }) => app.features.soulprint.seeds() },
  {
    method: 'POST', path: '/api/v1/soulprint/import',
    handler: ({ app, body }) => {
      if (typeof body?.text !== 'string') throw httpError('invalid_input', 'Thiếu nội dung file', 'text');
      return app.features.soulprint.importText(body.text);
    },
  },
  {
    method: 'GET', path: '/api/v1/soulprint/export.md',
    handler: ({ app, query }) => {
      const md = app.features.soulprint.markdown();
      return query.get('inline') ? raw(md, 'text/markdown; charset=utf-8') : raw(md, 'text/markdown; charset=utf-8', attachment('soulprint.md'));
    },
  },
];
