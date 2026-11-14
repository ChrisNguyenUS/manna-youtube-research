// "Theo dõi": followed YouTube/TikTok channels. Checking them runs as the follow_refresh job (routes/jobs.js).
import { httpError } from '../router.js';
import { validate } from '../validate.js';

const KEY = { platform: /** @type {any} */ (['youtube', 'tiktok']), ref: 'string!' };
/** @param {any} body @param {Record<string, any>} schema */
function need(body, schema) {
  const v = validate(schema, body);
  if (!v.ok) throw httpError('invalid_input', v.message, v.field);
  if (!body.platform) throw httpError('invalid_input', 'bắt buộc', 'platform');
  return v.value;
}

export const followRoutes = [
  { method: 'GET', path: '/api/v1/follows', handler: ({ app, query }) => app.features.follows.list(query.get('platform') || undefined) },
  { method: 'GET', path: '/api/v1/follows/keys', handler: ({ app }) => app.features.follows.keys() },
  {
    method: 'POST', path: '/api/v1/follows',
    handler: ({ app, body }) => {
      const b = need(body, { ...KEY, title: 'string?' });
      app.features.follows.follow({ platform: b.platform, ref: b.ref, title: b.title, data: b.data && typeof b.data === 'object' ? b.data : {} });
      return { ok: true };
    },
  },
  {
    // From what the user typed (@name, link); YouTube needs a lookup to find the channel id.
    method: 'POST', path: '/api/v1/follows/input',
    handler: ({ app, body }) => {
      const b = need(body, { platform: KEY.platform, input: 'string!' });
      return app.features.follows.followInput(b.platform, b.input);
    },
  },
  {
    method: 'PATCH', path: '/api/v1/follows',
    handler: ({ app, body }) => {
      const b = need(body, { ...KEY, note: 'string?' });
      app.features.follows.note(b.platform, b.ref, b.note || '');
      return { ok: true };
    },
  },
  {
    method: 'DELETE', path: '/api/v1/follows',
    handler: ({ app, body }) => {
      const b = need(body, KEY);
      app.features.follows.unfollow(b.platform, b.ref);
      return { ok: true };
    },
  },
];
