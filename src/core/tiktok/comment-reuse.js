// Can comments already collected for a video stand in for a new collection? Decided from what earlier runs actually
// got, never from "close enough": parents are counted without replies, and a run that asked for more parent comments
// than it received is the only proof that the video had no more public comments at that time.

/**
 * @typedef {{kind: string, params: any, createdAt: number, parents: number, total: number}} Run  one report's comments of one video
 * @typedef {{state: 'ready'|'exhausted'|'partial'|'none', parents: number, replies: number, lastSeen: number|null,
 *   missing: number, exhaustedAt: number|null, repliesCollected: boolean}} Reuse
 */

/** Parent comments a run asked for, per kind of report (defaults of each feature). @param {Run} run */
export function askedFor(run) {
  const p = run.params || {};
  if (run.kind === 'tiktok_comments') return Number(p.max) === 100 ? 100 : 300;
  if (run.kind === 'tiktok_video_analysis') return [100, 300].includes(Number(p.comments)) ? Number(p.comments) : 100;
  if (run.kind === 'tiktok_insight') return Number(p.commentsPerVideo) === 100 ? 100 : 300;
  return Infinity;
}
/** Whether a run asked for replies too. @param {Run} run */
const withReplies = (run) => (run.params || {}).replies !== false;

/**
 * @param {{parents: number, replies: number, lastSeen: number}|undefined} cov what the shared dataset holds for the video
 * @param {Run[]} runs earlier runs that collected this video
 * @param {{max: number, replies: boolean}} want
 * @returns {Reuse}
 */
export function reuseState(cov, runs, { max, replies }) {
  if (!cov || !cov.parents) return { state: 'none', parents: 0, replies: 0, lastSeen: null, missing: max, exhaustedAt: null, repliesCollected: false };
  const repliesCollected = runs.some(withReplies);
  const ended = runs.filter((r) => r.parents < askedFor(r)).sort((a, b) => b.createdAt - a.createdAt)[0];
  const base = { parents: cov.parents, replies: cov.replies, lastSeen: cov.lastSeen, exhaustedAt: ended?.createdAt ?? null, repliesCollected };
  const repliesOk = !replies || repliesCollected;
  if (cov.parents >= max && repliesOk) return { ...base, state: 'ready', missing: 0 };
  if (ended && repliesOk) return { ...base, state: 'exhausted', missing: 0 };
  return { ...base, state: 'partial', missing: Math.max(0, max - cov.parents) };
}
