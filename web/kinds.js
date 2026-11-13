// One place that knows, for every kind of saved result: its name, the screen that opens it, its icon and its platform.
// The dashboard, the sidebar jobs and (later) the history page read it, so a new kind is added once.

/** @typedef {{label: string, path: string, icon: string, platform: 'tiktok'|'youtube'}} KindInfo */

/** @type {Record<string, KindInfo>} */
export const KINDS = {
  tiktok_topic: { label: 'Tìm theo chủ đề', path: '/tiktok/topic', icon: 'compass', platform: 'tiktok' },
  tiktok_insight: { label: 'Insight khách hàng', path: '/tiktok/insight', icon: 'message', platform: 'tiktok' },
  tiktok_search: { label: 'Tìm video', path: '/tiktok/search', icon: 'search', platform: 'tiktok' },
  tiktok_comments: { label: 'Comment', path: '/tiktok/comments', icon: 'message', platform: 'tiktok' },
  research: { label: 'Nghiên cứu chủ đề', path: '/research', icon: 'compass', platform: 'youtube' },
  research_comments: { label: 'Đọc comment', path: '/research', icon: 'message', platform: 'youtube' },
  video_search: { label: 'Tìm video', path: '/videos', icon: 'search', platform: 'youtube' },
  channel_search: { label: 'Tìm kênh', path: '/channels', icon: 'users', platform: 'youtube' },
  channel_analysis: { label: 'Phân tích kênh', path: '/channel', icon: 'bars', platform: 'youtube' },
  comments: { label: 'Comment', path: '/comments', icon: 'message', platform: 'youtube' },
  idea_check: { label: 'Chấm điểm từ khoá', path: '/ideas', icon: 'bulb', platform: 'youtube' },
  keyword_score: { label: 'Chấm điểm từ khoá', path: '/ideas', icon: 'bulb', platform: 'youtube' },
  keywords: { label: 'Từ khoá', path: '/keywords', icon: 'key', platform: 'youtube' },
};

export const PLATFORMS = { tiktok: 'TikTok', youtube: 'YouTube' };

/** @param {string} kind @returns {KindInfo|null} */
export const kindInfo = (kind) => KINDS[kind] || null;

/** Link that opens a saved result on its own screen. @param {{id: number|string, kind: string}} r */
export const recordHref = (r) => (KINDS[r.kind] ? `#${KINDS[r.kind].path}?id=${r.id}` : '#/');
