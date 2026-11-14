// Deterministic TikTokSource for feature/HTTP tests: two on-topic videos, one off-topic, one with no comments.
const NOW = Date.now();
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
/** @param {string} id @param {string} caption @param {{hashtags?: string[], likes?: number, comments?: number, plays?: number, shares?: number, age?: number}} [o] */
const video = (id, caption, o = {}) => ({
  id, url: `https://www.tiktok.com/@creator/video/${id}`, caption, hashtags: o.hashtags ?? [], createdAt: daysAgo(o.age ?? 3), durationSec: 40,
  plays: o.plays ?? 10_000, likes: o.likes ?? 500, comments: o.comments ?? 40, shares: o.shares ?? 10, saves: 20, author: 'creator', authorName: 'Creator', authorVerified: false, musicTitle: 'original sound', cover: null, query: '',
});
export const FAKE_VIDEOS = [
  video('7000000000000000001', 'Phỏng vấn quốc tịch Mỹ đậu rồi', { hashtags: ['thiquoctichmy'], likes: 900, age: 2 }),
  video('7000000000000000002', 'Kinh nghiệm thi quốc tịch mỹ', { likes: 300, age: 10 }),
  video('7000000000000000003', 'Đi thi chỉ để biết giải nhì', { likes: 5000, age: 1 }),
  video('7000000000000000004', 'thi quốc tịch mỹ không ai comment', { comments: 0, age: 1 }),
];
/** @param {string} id @param {string} text @param {number} likes @param {{parentId?: string, replies?: number, age?: number}} [o] */
const comment = (id, text, likes, o = {}) => ({ id, parentId: o.parentId ?? null, isReply: !!o.parentId, text, likes, replies: o.replies ?? 0, createdAt: daysAgo(o.age ?? 1), pinned: false });
export const FAKE_COMMENTS = [
  comment('c1', 'Phỏng vấn có khó không ạ?', 50, { replies: 1 }),
  comment('c2', 'Em sợ bị đánh trượt lắm', 20),
  comment('c3', 'Dịch vụ giá bao nhiêu vậy', 8),
  comment('r1', 'Không khó đâu bạn', 3, { parentId: 'c1' }),
];

/** @type {import('../../ports/tiktok-source.js').Transcript} */
export const FAKE_TRANSCRIPT = {
  language: 'vie-VN', kind: 'auto',
  segments: [
    { start: 0, end: 3, text: 'Phỏng vấn quốc tịch Mỹ đậu rồi' },
    { start: 3, end: 6, text: 'hôm nay mình kể lại từng câu hỏi' },
    { start: 6, end: 40, text: 'câu đầu tiên là về tên và ngày sinh' },
  ],
};
/** Ids with special behaviour in getVideo. */
export const FAKE_GONE_ID = '7000000000000000009';

/** @returns {import('../../ports/tiktok-source.js').TikTokSource & {state: {closed: number, searches: number, logins: number}}} */
export const FAKE_RELATED = {
  suggestions: ['thi quốc tịch mỹ 2026', 'thi quốc tịch mỹ mất bao lâu', 'thi quốc tịch mỹ hết bao nhiêu tiền', 'thi quốc tịch nhật'],
  related: ['phỏng vấn quốc tịch mỹ', 'cách học 100 câu hỏi quốc tịch', 'thi quốc tịch mỹ mới nhất'],
};

export function createFakeTikTok({ videos = FAKE_VIDEOS, comments = FAKE_COMMENTS, delayMs = 0, searchReady = true, related = FAKE_RELATED } = {}) {
  const state = { closed: 0, searches: 0, logins: 0 };
  /** @type {import('../../ports/tiktok-source.js').LoginStatus} */
  let login = { loggedIn: false, savedAt: null, expiresAt: null };
  let requests = 0;
  const wait = () => (delayMs ? new Promise((r) => setTimeout(r, delayMs)) : Promise.resolve());
  return {
    state,
    async searchVideos(q, o = {}) {
      if (!searchReady) throw Object.assign(new Error('Cần cài: npm run setup:tiktok'), { code: 'tiktok_setup_required' });
      state.searches++;
      requests++;
      await wait();
      return videos.slice(0, o.max ?? 60).map((v) => ({ ...v, query: q }));
    },
    async relatedKeywords() {
      if (!searchReady) throw Object.assign(new Error('Cần cài: npm run setup:tiktok'), { code: 'tiktok_setup_required' });
      requests++;
      await wait();
      return { suggestions: [...related.suggestions], related: [...related.related] };
    },
    async resolveVideo(u) {
      const id = String(u).match(/(\d{15,25})/)?.[1];
      if (!id) throw new Error(`Không phải link video TikTok: ${u}`);
      return { id, url: `https://www.tiktok.com/@creator/video/${id}` };
    },
    async getComments(id, o = {}, onProgress) {
      requests++;
      await wait();
      const list = comments.filter((c) => o.replies !== false || !c.isReply).slice(0, (o.max ?? 300) + 50);
      onProgress?.(list.length);
      return { comments: list.map((c) => ({ ...c })), total: list.length };
    },
    async getVideo(u) {
      const id = String(u).match(/(\d{15,25})/)?.[1];
      if (!id) throw new Error(`Không phải link video TikTok: ${u}`);
      requests++;
      await wait();
      const v = videos.find((x) => x.id === id);
      if (id === FAKE_GONE_ID || !v) throw Object.assign(new Error('Video không còn hoặc đang để riêng tư'), { code: 'video_unavailable' });
      // Only the first fake video has subtitles, so tests cover both cases.
      return { video: { ...v, query: '' }, transcript: id === videos[0].id ? { ...FAKE_TRANSCRIPT, segments: FAKE_TRANSCRIPT.segments.map((s) => ({ ...s })) } : null };
    },
    async login() {
      if (!searchReady) throw Object.assign(new Error('Cần cài: npm run setup:tiktok'), { code: 'tiktok_setup_required' });
      state.logins++;
      await wait();
      login = { loggedIn: true, savedAt: new Date(NOW).toISOString(), expiresAt: new Date(NOW + 60 * 86_400_000).toISOString() };
      return { ...login };
    },
    loginStatus: () => ({ ...login }),
    logout: async () => void (login = { loggedIn: false, savedAt: null, expiresAt: null }),
    capabilities: () => (searchReady ? { searchReady: true } : { searchReady: false, reason: 'Cần cài: npm run setup:tiktok' }),
    close: async () => void state.closed++,
    stats: () => ({ requests, failures: 0 }),
  };
}
