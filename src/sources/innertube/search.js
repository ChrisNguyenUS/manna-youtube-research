import { rethrowIfCancelled } from '../../core/cancel.js';
import { call } from './client.js';
import { parseCount, parseDuration, parseRelativeAge, text, findAll, findFirst } from './parse.js';

// Search filter ("sp") is a small protobuf: { 1: sort, 2: { 1: uploadDate, 2: type, 3: duration } }.
// Values verified against YouTube's own filter menu on 2026-11-06.
export const SORT = { relevance: 0, rating: 1, date: 2, popularity: 3 };
export const UPLOAD = { any: 0, hour: 1, today: 2, week: 3, month: 4, year: 5 };
export const TYPE = { video: 1, channel: 2, playlist: 3, movie: 4, shorts: 9 };
export const DURATION = { any: 0, under4: 1, over20: 2, mid4to20: 3, under3: 4, mid3to20: 5 };

function varint(n) {
  const out = [];
  while (n > 127) {
    out.push((n & 127) | 128);
    n >>>= 7;
  }
  out.push(n);
  return out;
}
function field(num, value) {
  return value ? [...varint(num << 3), ...varint(value)] : [];
}

export function buildSearchParams({ sort = 'relevance', upload = 'any', type = 'video', duration = 'any', cc = false, captions = false } = {}) {
  const inner = [...field(1, UPLOAD[upload] || 0), ...field(2, TYPE[type] || 0), ...field(3, DURATION[duration] || 0)];
  if (captions) inner.push(...varint((5 << 3) | 0), 1); // Subtitles/CC
  if (cc) inner.push(...varint((6 << 3) | 0), 1); // Creative Commons
  const bytes = [...field(1, SORT[sort] || 0)];
  if (inner.length) bytes.push(...varint((2 << 3) | 2), ...varint(inner.length), ...inner);
  return Buffer.from(bytes).toString('base64');
}

export function parseVideoRenderer(v, query) {
  const owner = v.ownerText?.runs?.[0] || v.longBylineText?.runs?.[0];
  const durationText = v.lengthText?.simpleText || null;
  const published = text(v.publishedTimeText) || null;
  const badges = (v.badges || []).map((b) => b.metadataBadgeRenderer?.label).filter(Boolean);
  return {
    id: v.videoId,
    title: text(v.title),
    url: `https://www.youtube.com/watch?v=${v.videoId}`,
    thumb: `https://i.ytimg.com/vi/${v.videoId}/mqdefault.jpg`,
    channelId: owner?.navigationEndpoint?.browseEndpoint?.browseId || null,
    channelTitle: owner?.text || '',
    channelHandle: owner?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl?.replace(/^\//, '') || null,
    views: parseCount(text(v.viewCountText)),
    durationSec: parseDuration(durationText),
    published,
    ageDays: parseRelativeAge(published),
    isLive: badges.some((b) => /live/i.test(b)) || /watching/i.test(text(v.viewCountText)),
    description: text(v.detailedMetadataSnippets?.[0]?.snippetText) || '',
    query,
  };
}

function continuationToken(json) {
  for (const c of findAll(json, 'continuationItemRenderer')) {
    const t = c?.continuationEndpoint?.continuationCommand?.token;
    if (t) return t;
  }
  return null;
}

/**
 * Search videos for one query. Returns up to `max` videos (20 per page).
 * opts: { sort, upload, duration, gl, max }
 */
export async function searchVideos(query, opts = {}, onPage) {
  const max = opts.max || 40;
  const params = buildSearchParams({ sort: opts.sort || 'popularity', upload: opts.upload || 'any', type: 'video', duration: opts.duration || 'any', cc: opts.cc, captions: opts.captions });
  let json = await call('search', { query, params }, { gl: opts.gl });
  const out = [];
  const seen = new Set();
  for (let page = 0; page < 15; page++) {
    for (const v of findAll(json, 'videoRenderer')) {
      if (!v?.videoId || seen.has(v.videoId)) continue;
      seen.add(v.videoId);
      out.push(parseVideoRenderer(v, query));
    }
    onPage?.(out.length);
    const tok = continuationToken(json);
    if (out.length >= max || !tok) break;
    json = await call('search', { continuation: tok }, { gl: opts.gl });
  }
  return out.slice(0, max);
}

export function parseChannelRenderer(c, query) {
  // YouTube puts the @handle in subscriberCountText and the subscriber count in videoCountText.
  const a = text(c.subscriberCountText);
  const b = text(c.videoCountText);
  const handle = a.startsWith('@') ? a : b.startsWith('@') ? b : c.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl?.replace(/^\//, '') || null;
  const subsText = [a, b].find((x) => /subscriber/i.test(x)) || '';
  const thumbs = c.thumbnail?.thumbnails || [];
  let avatar = thumbs[thumbs.length - 1]?.url || null;
  if (avatar?.startsWith('//')) avatar = 'https:' + avatar;
  return {
    id: c.channelId,
    title: text(c.title),
    handle,
    url: `https://www.youtube.com/channel/${c.channelId}`,
    avatar,
    subs: parseCount(subsText),
    description: text(c.descriptionSnippet),
    query,
  };
}

export async function searchChannels(query, opts = {}, onPage) {
  const max = opts.max || 40;
  const params = buildSearchParams({ sort: 'relevance', type: 'channel' });
  let json = await call('search', { query, params }, { gl: opts.gl });
  const out = [];
  const seen = new Set();
  for (let page = 0; page < 10; page++) {
    for (const c of findAll(json, 'channelRenderer')) {
      if (!c?.channelId || seen.has(c.channelId)) continue;
      seen.add(c.channelId);
      out.push(parseChannelRenderer(c, query));
    }
    onPage?.(out.length);
    const tok = continuationToken(json);
    if (out.length >= max || !tok) break;
    json = await call('search', { continuation: tok }, { gl: opts.gl });
  }
  return out.slice(0, max);
}

// ---------- Global mode: same query in several regions, merged ----------
// regionsFor / durationBucket are pure option helpers and live in core/search-options.js.
export { GLOBAL, regionsFor, durationBucket } from '../../core/search-options.js';

/**
 * Merge per-region result lists, dedupe by id, record every region an item appeared in.
 * Order: round-robin across regions, so each country's top results stay near the top.
 */
export function mergeByRegion(perRegion) {
  const map = new Map();
  const longest = Math.max(0, ...perRegion.map((r) => r.list.length));
  for (let i = 0; i < longest; i++) {
    for (const { gl, list } of perRegion) {
      const item = list[i];
      if (!item) continue;
      const cur = map.get(item.id);
      if (cur) {
        if (gl && !cur.regions.includes(gl)) cur.regions.push(gl);
        if ((item.views ?? -1) > (cur.views ?? -1)) cur.views = item.views; // keep the freshest count
      } else map.set(item.id, { ...item, regions: gl ? [gl] : [] });
    }
  }
  return [...map.values()];
}

async function multi(fn, query, opts, regions, onPage) {
  if (regions.length === 1) return (await fn(query, { ...opts, gl: regions[0] || undefined }, onPage)).map((x) => ({ ...x, regions: regions[0] ? [regions[0]] : [] }));
  const counts = new Map();
  const perRegion = await Promise.all(
    regions.map(async (gl) => {
      try {
        const list = await fn(query, { ...opts, gl }, (n) => {
          counts.set(gl, n);
          onPage?.([...counts.values()].reduce((a, b) => a + b, 0));
        });
        return { gl, list };
      } catch (e) {
        rethrowIfCancelled(e);
        return { gl, list: [] }; // one region failing shouldn't kill a global search
      }
    }),
  );
  return mergeByRegion(perRegion);
}

export const searchVideosRegions = (query, opts, regions, onPage) => multi(searchVideos, query, opts, regions, onPage);
export const searchChannelsRegions = (query, opts, regions, onPage) => multi(searchChannels, query, opts, regions, onPage);

export { findFirst };
