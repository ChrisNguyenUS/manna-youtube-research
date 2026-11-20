// YouTube comments already collected, for "Insight → Từ comment đã có" (YouTube). Reads only.
import { httpError } from '../router.js';

export const youtubeRoutes = [
  { method: 'GET', path: '/api/v1/youtube/comment-videos', handler: ({ app }) => app.features.youtubeCommentData.videos() },
  // "Thu thập bình luận" on YouTube: the runs, and how much of some videos is already collected.
  { method: 'GET', path: '/api/v1/youtube/comment-collections', handler: ({ app, query }) => app.features.youtubeCommentData.collections(Number(query.get('limit')) || 100) },
  { method: 'GET', path: '/api/v1/youtube/comment-coverage', handler: ({ app, query }) => app.features.youtubeCommentData.coverage(String(query.get('ids') || '').split(',').filter((x) => /^[\w-]{11}$/.test(x))) },
  {
    method: 'GET', path: '/api/v1/youtube/comments',
    handler: ({ app, query }) => {
      const ids = String(query.get('videos') || '').split(',').filter((x) => /^[\w-]{11}$/.test(x));
      if (!ids.length) throw httpError('invalid_input', 'Chọn ít nhất một video', 'videos');
      return app.features.youtubeCommentData.comments(ids);
    },
  },
];
