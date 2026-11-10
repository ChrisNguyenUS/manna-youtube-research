import { call } from './client.js';
import { parseCount, parseRelativeAge, findAll } from './parse.js';

function commentsEntryToken(nextJson) {
  for (const s of findAll(nextJson, 'itemSectionRenderer')) {
    if (s?.sectionIdentifier === 'comment-item-section') {
      const t = JSON.stringify(s).match(/"continuationCommand":\{"token":"([^"]+)"/)?.[1];
      if (t) return t;
    }
  }
  return null;
}

function sortTokens(json) {
  const out = {};
  for (const items of findAll(json, 'subMenuItems')) {
    for (const i of items || []) {
      const t = i?.serviceEndpoint?.continuationCommand?.token;
      if (t && /top/i.test(i.title)) out.top = t;
      if (t && /new/i.test(i.title)) out.newest = t;
    }
  }
  return out;
}

function parseBatch(json) {
  const mutations = json?.frameworkUpdates?.entityBatchUpdate?.mutations || [];
  const comments = [];
  for (const m of mutations) {
    const p = m.payload?.commentEntityPayload;
    if (!p) continue;
    const props = p.properties || {};
    const tb = p.toolbar || {};
    comments.push({
      id: props.commentId,
      text: props.content?.content || '',
      likes: parseCount(tb.likeCountNotliked || tb.likeCountA11y) ?? 0,
      replies: parseCount(tb.replyCount) ?? 0,
      published: props.publishedTime || null,
      ageDays: parseRelativeAge(props.publishedTime),
      isReply: Number(props.replyLevel || 0) > 0,
      byCreator: !!p.author?.isCreator,
      hearted: !!tb.heartActiveTooltip,
    });
  }
  // Continuations for more top-level comments (not reply expanders).
  let more = null;
  const replyTokens = [];
  for (const ep of json?.onResponseReceivedEndpoints || []) {
    const items = ep.reloadContinuationItemsCommand?.continuationItems || ep.appendContinuationItemsCommand?.continuationItems || [];
    for (const it of items) {
      const t = it.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || it.continuationItemRenderer?.button?.buttonRenderer?.command?.continuationCommand?.token;
      if (t) more = t;
      const thread = it.commentThreadRenderer;
      const rt = thread && JSON.stringify(thread.replies || {}).match(/"continuationCommand":\{"token":"([^"]+)"/)?.[1];
      if (rt) replyTokens.push({ parent: thread.commentViewModel?.commentViewModel?.commentId || null, token: rt });
    }
  }
  return { comments, more, replyTokens };
}

/**
 * Comments for one video. opts: { max=100, sort='top'|'newest', replies=false, maxRepliesPerThread=20 }
 * Returns { comments, disabled }
 */
export async function getComments(videoId, opts = {}, onProgress) {
  const max = opts.max ?? 100;
  const nx = await call('next', { videoId });
  let tok = commentsEntryToken(nx);
  if (!tok) return { comments: [], disabled: true };
  let json = await call('next', { continuation: tok });
  if (opts.sort === 'newest') {
    const st = sortTokens(json).newest || sortTokens(nx).newest;
    if (st) json = await call('next', { continuation: st });
  }
  /** @type {any[]} */
  const out = [];
  const seen = new Set();
  const replyJobs = [];
  for (let page = 0; page < 200; page++) {
    const { comments, more, replyTokens } = parseBatch(json);
    for (const c of comments) {
      if (!c.id || seen.has(c.id) || c.isReply) continue;
      seen.add(c.id);
      out.push(c);
    }
    replyJobs.push(...replyTokens);
    onProgress?.(out.length);
    if (out.length >= max || !more) break;
    json = await call('next', { continuation: more });
  }
  const top = out.slice(0, max);
  if (opts.replies) {
    const keep = new Set(top.map((c) => c.id));
    for (const job of replyJobs) {
      if (job.parent && !keep.has(job.parent)) continue;
      let rj = await call('next', { continuation: job.token });
      let count = 0;
      for (let page = 0; page < 10; page++) {
        const { comments, more } = parseBatch(rj);
        for (const c of comments) {
          if (!c.id || seen.has(c.id)) continue;
          seen.add(c.id);
          top.push({ ...c, isReply: true, parentId: job.parent });
          count++;
        }
        if (!more || count >= (opts.maxRepliesPerThread ?? 20)) break;
        rj = await call('next', { continuation: more });
      }
      onProgress?.(top.length);
    }
  }
  return { comments: top, disabled: false };
}
