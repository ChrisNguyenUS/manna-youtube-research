// What is kept when something is saved to "Đã lưu": a small snapshot that still reads well after its report is deleted.
// Customer comments keep their words and numbers only, never the commenter's name.

/** @param {any} v a TikTok video @param {string[]} [keywords] the research keywords that found it */
export const savedTikTokVideo = (v, keywords = v.queries ?? []) => ({
  ref: String(v.id),
  title: String(v.caption || '').slice(0, 140),
  data: { id: v.id, url: v.url, caption: v.caption, author: v.author, authorName: v.authorName, cover: v.cover, plays: v.plays, likes: v.likes, comments: v.comments, shares: v.shares, saves: v.saves, createdAt: v.createdAt, keywords },
});

/** @param {any} c a comment @param {{video?: any, topics?: string[], source?: string, recordId?: number}} [o] */
export const savedQuote = (c, { video, topics = [], source = '', recordId } = {}) => ({
  ref: String(c.id),
  title: String(c.text || '').slice(0, 140),
  data: { text: c.text, likes: c.likes ?? 0, replies: c.replies ?? 0, createdAt: c.createdAt, videoId: c.videoId, videoUrl: video?.url, creator: video?.author, topics, source, recordId },
});

/** @param {string} keyword @param {'tiktok'|'youtube'} platform @param {string} [topic] */
export const savedKeyword = (keyword, platform, topic = '') => ({
  ref: `${platform}:${String(keyword).trim().toLowerCase()}`,
  title: String(keyword).trim(),
  data: { keyword: String(keyword).trim(), platform, topic },
});
