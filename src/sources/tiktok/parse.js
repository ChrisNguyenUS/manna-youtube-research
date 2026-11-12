// Pure parsers for TikTok's web API (ported from ~/tiktok-keyword-comments-actor, verified 2026-10-22).
const iso = (unix) => (Number(unix) > 0 ? new Date(Number(unix) * 1000).toISOString() : null);

/** Relative URL of TikTok's "Top" search API; must be fetched from inside a tiktok.com page (TikTok signs it). */
export function searchApiPath(keyword, offset, searchId) {
  const p = new URLSearchParams({ aid: '1988', app_name: 'tiktok_web', device_platform: 'web_pc', keyword, offset: String(offset), search_source: 'normal_search' });
  if (offset > 0 && searchId) p.set('search_id', searchId);
  return `/api/search/general/full/?${p}`;
}

function parseVideo(item, query) {
  if (!item?.id || !item?.author) return null;
  const s = item.stats ?? {};
  const author = String(item.author.uniqueId ?? '');
  return {
    id: String(item.id),
    url: `https://www.tiktok.com/@${author}/video/${item.id}`,
    caption: String(item.desc ?? ''),
    hashtags: (item.textExtra ?? []).map((t) => t?.hashtagName).filter(Boolean),
    createdAt: iso(item.createTime),
    durationSec: Number(item.video?.duration ?? 0),
    plays: Number(s.playCount ?? 0),
    likes: Number(s.diggCount ?? 0),
    comments: Number(s.commentCount ?? 0),
    shares: Number(s.shareCount ?? 0),
    saves: Number(s.collectCount ?? 0),
    author,
    cover: item.video?.cover ? String(item.video.cover) : null,
    query,
  };
}

/** A non-zero status_code alone is not an error: later pages come back as 203 with full results. */
export function parseSearchPage(body, query) {
  const hasData = Array.isArray(body?.data) && body.data.length > 0;
  if (!body || typeof body !== 'object' || (Number(body.status_code ?? 0) !== 0 && !hasData)) return { ok: false, videos: [], hasMore: false, cursor: 0, searchId: '', statusCode: Number(body?.status_code ?? 0) };
  const videos = (body.data ?? []).filter((d) => d?.type === 1).map((d) => parseVideo(d.item, query)).filter(Boolean);
  return { ok: true, videos, hasMore: Boolean(body.has_more), cursor: Number(body.cursor ?? 0), searchId: String(body.log_pb?.impr_id ?? '') };
}

export const PAGE_SIZE = 50;
const COMMENT_API = 'https://www.tiktok.com/api/comment/list';

/** @param {string} urlOrId */
export function extractVideoId(urlOrId) {
  const s = String(urlOrId || '').trim();
  if (/^\d{15,25}$/.test(s)) return s;
  return s.match(/\/(?:video|photo|v)\/(\d{15,25})/)?.[1] ?? null;
}
/** @param {string} url */
export const isShortLink = (url) => /^https?:\/\/(vm|vt)\.tiktok\.com\//.test(url) || /^https?:\/\/(www\.)?tiktok\.com\/t\//.test(url);

export const commentListUrl = (videoId, cursor) => `${COMMENT_API}/?${new URLSearchParams({ aid: '1988', aweme_id: videoId, count: String(PAGE_SIZE), cursor: String(cursor) })}`;
export const replyListUrl = (videoId, commentId, cursor) => `${COMMENT_API}/reply/?${new URLSearchParams({ aid: '1988', item_id: videoId, comment_id: commentId, count: String(PAGE_SIZE), cursor: String(cursor) })}`;

/** Handles tagged inside a comment would identify people too. */
export const maskMentions = (s) => s.replace(/@[\p{L}\p{N}._]+/gu, '@…');

/** Commenter name/username are deliberately not read: reports must never identify customers. */
export function parseCommentPage(body, parentId) {
  if (!body || typeof body !== 'object' || Number(body.status_code ?? 0) !== 0) return { ok: false, comments: [], hasMore: false, cursor: 0, total: 0 };
  const comments = (body.comments ?? []).map((c) => ({
    id: String(c.cid),
    parentId,
    isReply: parentId !== null,
    text: maskMentions(String(c.text ?? '')),
    likes: Number(c.digg_count ?? 0),
    replies: Number(c.reply_comment_total ?? 0),
    createdAt: iso(c.create_time),
    pinned: Boolean(c.author_pin),
  }));
  return { ok: true, comments, hasMore: Boolean(body.has_more), cursor: Number(body.cursor ?? 0), total: Number(body.total ?? 0) };
}

/** Consecutive pages overlap: keep unseen comments (up to `room`) and remember them. */
export function takeNew(comments, seen, room) {
  const fresh = [];
  for (const c of comments) {
    if (fresh.length >= room) break;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    fresh.push(c);
  }
  return fresh;
}
