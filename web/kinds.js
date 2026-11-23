// One place that knows, for every kind of saved result: its name, the screen that opens it, its icon and its platform.
// The dashboard, the sidebar jobs and (later) the history page read it, so a new kind is added once.

/** @typedef {{label: string, path: string, icon: string, platform: 'tiktok'|'youtube'}} KindInfo */

/** @type {Record<string, KindInfo>} */
export const KINDS = {
  tiktok_topic: { label: 'Topic Research', path: '/tiktok/topic', icon: 'compass', platform: 'tiktok' },
  tiktok_insight: { label: 'Insight theo từ khoá', path: '/tiktok/insight', icon: 'message', platform: 'tiktok' },
  youtube_insight: { label: 'Insight theo từ khoá', path: '/insight', icon: 'message', platform: 'youtube' },
  tiktok_video_analysis: { label: 'Video Analysis', path: '/video', icon: 'play', platform: 'tiktok' },
  tiktok_channel: { label: 'Channel Analysis', path: '/tiktok/channel', icon: 'bars', platform: 'tiktok' },
  tiktok_search: { label: 'Video Search', path: '/tiktok/search', icon: 'search', platform: 'tiktok' },
  tiktok_comments: { label: 'Collect Comments', path: '/tiktok/comments', icon: 'download', platform: 'tiktok' },
  comment_5w1h: { label: '5W1H comment (AI)', path: '/tiktok/5w1h', icon: 'doc', platform: 'tiktok' },
  video_analysis: { label: 'Video Analysis', path: '/video', icon: 'play', platform: 'youtube' },
  research: { label: 'Topic Research', path: '/research', icon: 'compass', platform: 'youtube' },
  research_comments: { label: 'Đọc comment', path: '/research', icon: 'message', platform: 'youtube' },
  video_search: { label: 'Video Search', path: '/videos', icon: 'search', platform: 'youtube' },
  channel_search: { label: 'Channel Search', path: '/channels', icon: 'users', platform: 'youtube' },
  channel_analysis: { label: 'Channel Analysis', path: '/channel', icon: 'bars', platform: 'youtube' },
  comments: { label: 'Collect Comments', path: '/comments', icon: 'download', platform: 'youtube' },
  idea_check: { label: 'Chấm điểm từ khoá', path: '/ideas', icon: 'trend', platform: 'youtube' },
  keyword_score: { label: 'Chấm điểm từ khoá', path: '/ideas', icon: 'trend', platform: 'youtube' },
  keywords: { label: 'Gợi ý từ khoá', path: '/keywords', icon: 'key', platform: 'youtube' },
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
  if (j.kind === 'ci_analyze') return `#/ci/runs?run=${j.params?.runId ?? ''}`; // results live in the run
  if (j.kind === 'batch_refresh') return `#/board/review?batch=${j.params?.batchId ?? ''}`; // numbers live on the cards
  const k = KINDS[j.kind];
  if (!k) return '#/';
  if (j.kind === 'research_comments' && j.params?.recordId) return `#${k.path}?id=${j.params.recordId}`;
  // A multi-link comment job keeps its results inline: open the first video's.
  const id = j.status === 'succeeded' ? j.result?.id ?? j.result?.jobs?.[0]?.id : null;
  return id ? `#${k.path}?id=${id}` : `#${k.path}`;
}
