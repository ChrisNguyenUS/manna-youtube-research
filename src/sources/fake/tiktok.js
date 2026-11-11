// Deterministic TikTokSource for feature/HTTP tests: two on-topic videos, one off-topic, one with no comments.
const NOW = Date.now();
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
/** @param {string} id @param {string} caption @param {{hashtags?: string[], likes?: number, comments?: number, plays?: number, age?: number}} [o] */
const video = (id, caption, o = {}) => ({
  id, url: `https://www.tiktok.com/@creator/video/${id}`, caption, hashtags: o.hashtags ?? [], createdAt: daysAgo(o.age ?? 3), durationSec: 40,
  plays: o.plays ?? 10_000, likes: o.likes ?? 500, comments: o.comments ?? 40, shares: 10, saves: 20, author: 'creator', cover: null, query: '',
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

/** @returns {import('../../ports/tiktok-source.js').TikTokSource & {state: {closed: number, searches: number}}} */
export function createFakeTikTok({ videos = FAKE_VIDEOS, comments = FAKE_COMMENTS, delayMs = 0, searchReady = true } = {}) {
  const state = { closed: 0, searches: 0 };
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
    async resolveVideo(u) {
      const id = String(u).match(/(\d{15,25})/)?.[1];
      if (!id) throw new Error(`Không phải link video TikTok: ${u}`);
      return { id, url: `https://www.tiktok.com/@creator/video/${id}` };
    },
    async getComments(id, o = {}) {
      requests++;
      await wait();
      const list = comments.filter((c) => o.replies !== false || !c.isReply).slice(0, (o.max ?? 300) + 50);
      return { comments: list.map((c) => ({ ...c })), total: list.length };
    },
    capabilities: () => (searchReady ? { searchReady: true } : { searchReady: false, reason: 'Cần cài: npm run setup:tiktok' }),
    close: async () => void state.closed++,
    stats: () => ({ requests, failures: 0 }),
  };
}
