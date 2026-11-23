// Kept copies of TikTok images (src/features/thumbs.js): the web UI loads TikTok covers and avatars through here.
import { httpError, raw } from '../router.js';

export const thumbRoutes = [
  {
    method: 'GET',
    path: '/api/v1/thumb',
    handler: async ({ app, query }) => {
      const hit = await app.thumbs.get(String(query.get('u') ?? ''));
      if (!hit) throw httpError('not_found', 'Không lấy được ảnh');
      return raw(hit.body, hit.type, { 'cache-control': 'private, max-age=31536000, immutable' });
    },
  },
];
