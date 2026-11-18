// One place that knows, for every kind of saved result: its name, the screen that opens it, its icon and its platform.
// The dashboard, the sidebar jobs and (later) the history page read it, so a new kind is added once.

/** @typedef {{label: string, path: string, icon: string, platform: 'tiktok'|'youtube'}} KindInfo */

/** @type {Record<string, KindInfo>} */
export const KINDS = {
  tiktok_topic: { label: 'Tìm theo chủ đề', path: '/tiktok/topic', icon: 'compass', platform: 'tiktok' },
  tiktok_insight: { label: 'Insight khách hàng', path: '/tiktok/insight', icon: 'message', platform: 'tiktok' },
  youtube_insight: { label: 'Insight khách hàng', path: '/insight', icon: 'message', platform: 'youtube' },
  tiktok_video_analysis: { label: 'Phân tích video', path: '/video', icon: 'bars', platform: 'tiktok' },
  tiktok_channel: { label: 'Phân tích kênh', path: '/tiktok/channel', icon: 'users', platform: 'tiktok' },
  tiktok_search: { label: 'Tìm video', path: '/tiktok/search', icon: 'search', platform: 'tiktok' },
  tiktok_comments: { label: 'Thu thập bình luận', path: '/tiktok/comments', icon: 'message', platform: 'tiktok' },
  comment_5w1h: { label: '5W1H comment (AI)', path: '/tiktok/5w1h', icon: 'target', platform: 'tiktok' },
  video_analysis: { label: 'Phân tích video', path: '/video', icon: 'bars', platform: 'youtube' },
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

/**
 * Where a job leads: its result once it succeeded, otherwise the screen that runs it (which shows the progress).
 * @param {{kind: string, status: string, params?: any, result?: any}} j
 */
export function jobHref(j) {
  if (j.kind === 'follow_refresh') return '#/follows'; // results live on the follow list, not in a record
  if (j.kind === 'batch_refresh') return `#/board/review?batch=${j.params?.batchId ?? ''}`; // numbers live on the cards
  const k = KINDS[j.kind];
  if (!k) return '#/';
  if (j.kind === 'research_comments' && j.params?.recordId) return `#${k.path}?id=${j.params.recordId}`;
  // A multi-link comment job keeps its results inline: open the first video's.
  const id = j.status === 'succeeded' ? j.result?.id ?? j.result?.jobs?.[0]?.id : null;
  return id ? `#${k.path}?id=${id}` : `#${k.path}`;
}
