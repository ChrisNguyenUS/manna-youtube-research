// High-level research operations. Used by the HTTP server (as background jobs) and the CLI.
import { searchVideos, searchChannels, durationBucket } from './yt/search.js';
import { resolveChannelId, getChannelInfo, getChannelVideos, getChannelShorts, getVideoDetails } from './yt/channel.js';
import { getComments } from './yt/comments.js';
import { mapLimit, suggest } from './yt/innertube.js';
import { cache, records, settingsStore } from './db.js';
import { addVideoMetrics, channelStats, durationBuckets, median, sum, round } from './analysis/metrics.js';
import { titlePhrases, titlePatterns, titleShape, commentInsights } from './analysis/text.js';

const noop = () => {};
const splitList = (s) => (Array.isArray(s) ? s : String(s || '').split(/[,\n]/)).map((x) => x.trim()).filter(Boolean);

// ---------------- channel helpers (cached) ----------------
export async function channelInfo(id, { about = false } = {}) {
  const hit = cache.getChannel(id, { needAbout: about });
  if (hit) return hit;
  const info = await getChannelInfo(id, { about });
  cache.putChannel(info, about);
  return info;
}

export async function channelVideos(id, { max = 30, channel } = {}) {
  const hit = cache.getChannelVideos(id, { min: max });
  if (hit) return hit.slice(0, max);
  const list = await getChannelVideos(id, { max, channel });
  cache.putChannelVideos(id, list);
  return list;
}

export async function videoDetails(id, { likes = false } = {}) {
  const hit = cache.getVideo(id);
  if (hit && (!likes || hit.likes != null)) return hit;
  const d = await getVideoDetails(id, { likes });
  cache.putVideo(d);
  return d;
}

/** Attach channel subs to videos, then exact dates/likes for the top `exactTop` by views. */
async function enrichVideos(videos, { exactTop = 0, likes = false, minSubs, progress = noop }) {
  const ids = [...new Set(videos.map((v) => v.channelId).filter(Boolean))];
  const subs = new Map();
  progress({ step: 'Lấy số sub của kênh', done: 0, total: ids.length });
  await mapLimit(
    ids,
    async (id) => {
      const info = await channelInfo(id);
      subs.set(id, info);
    },
    (done, total) => progress({ step: 'Lấy số sub của kênh', done, total }),
  );
  let out = videos.map((v) => {
    const c = subs.get(v.channelId);
    return { ...v, channelSubs: c?.subs ?? null, channelHandle: v.channelHandle || c?.handle || null, channelAvatar: c?.avatar || null };
  });
  if (exactTop > 0) {
    const top = [...out].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, exactTop);
    const details = new Map();
    await mapLimit(
      top,
      async (v) => details.set(v.id, await videoDetails(v.id, { likes })),
      (done, total) => progress({ step: 'Lấy ngày đăng chính xác', done, total }),
    );
    out = out.map((v) => {
      const d = details.get(v.id);
      return d && !d.error ? { ...v, publishedAt: d.publishedAt, likes: d.likes ?? v.likes ?? null, category: d.category } : v;
    });
  }
  return addVideoMetrics(out, { minSubs });
}

// ---------------- video search ----------------
/**
 * params: { keywords, upload, sort, minDur, maxDur (seconds), perKeyword, gl, exactTop, likes, cc }
 * Server-side YouTube filters narrow the search; exact duration filtering is applied here.
 * Everything else (subs, views, age) is filtered in the UI so chips don't need a new scrape.
 */
export async function videoSearch(params, progress = noop) {
  const s = settingsStore.all();
  const keywords = splitList(params.keywords);
  if (!keywords.length) throw new Error('Nhập ít nhất một từ khoá');
  const minDur = params.minDur ? Number(params.minDur) : null;
  const maxDur = params.maxDur ? Number(params.maxDur) : null;
  const opts = {
    sort: params.sort || 'popularity',
    upload: params.upload || 'year',
    duration: durationBucket(minDur, maxDur),
    gl: params.gl || s.gl,
    max: Math.min(Number(params.perKeyword) || 60, 300),
    cc: !!params.cc,
  };
  const all = new Map();
  for (const [i, kw] of keywords.entries()) {
    progress({ step: `Tìm "${kw}" (${i + 1}/${keywords.length})`, done: 0, total: opts.max });
    const list = await searchVideos(kw, opts, (n) => progress({ step: `Tìm "${kw}" (${i + 1}/${keywords.length})`, done: n, total: opts.max }));
    for (const v of list) {
      if (all.has(v.id)) all.get(v.id).queries.push(kw);
      else all.set(v.id, { ...v, queries: [kw] });
    }
  }
  let videos = [...all.values()].filter((v) => !v.isLive);
  videos = videos.filter((v) => v.durationSec == null || ((minDur == null || v.durationSec >= minDur) && (maxDur == null || v.durationSec <= maxDur)));
  videos = await enrichVideos(videos, { exactTop: params.exactTop ?? 30, likes: !!params.likes, minSubs: s.minSubsForOutlier, progress });
  videos.sort((a, b) => (b.views ?? 0) - (a.views ?? 0));
  const result = { videos, keywords, opts, summary: summarizeVideos(videos) };
  const id = records.add('video_search', keywords.join(', '), { params, data: result });
  return { id, ...result };
}

function summarizeVideos(videos) {
  return {
    count: videos.length,
    medianViews: median(videos.map((v) => v.views)),
    over100k: videos.filter((v) => v.views >= 100000).length,
    over1m: videos.filter((v) => v.views >= 1000000).length,
    outliers: videos.filter((v) => v.outlier >= 1).length,
    channels: new Set(videos.map((v) => v.channelId)).size,
  };
}

// ---------------- channel search (Playboard-style) ----------------
/**
 * params: { keywords, source: 'channels'|'videos'|'both', perKeyword, gl, upload }
 * Returns channels with stats computed from their latest videos + About panel.
 */
export async function channelSearch(params, progress = noop) {
  const s = settingsStore.all();
  const keywords = splitList(params.keywords);
  if (!keywords.length) throw new Error('Nhập ít nhất một từ khoá');
  const source = params.source || 'both';
  const per = Math.min(Number(params.perKeyword) || 40, 200);
  const gl = params.gl || s.gl;
  const found = new Map(); // id -> { base, hits: [video] }
  for (const [i, kw] of keywords.entries()) {
    const label = `Tìm kênh "${kw}" (${i + 1}/${keywords.length})`;
    if (source !== 'videos') {
      const list = await searchChannels(kw, { max: per, gl }, (n) => progress({ step: label, done: n, total: per }));
      for (const c of list) if (!found.has(c.id)) found.set(c.id, { base: c, hits: [], queries: new Set([kw]) });
      else found.get(c.id).queries.add(kw);
    }
    if (source !== 'channels') {
      const vids = await searchVideos(kw, { sort: 'popularity', upload: params.upload || 'year', max: per, gl }, (n) => progress({ step: `Tìm video "${kw}" để gom kênh`, done: n, total: per }));
      for (const v of vids) {
        if (!v.channelId) continue;
        if (!found.has(v.channelId)) found.set(v.channelId, { base: { id: v.channelId, title: v.channelTitle, handle: v.channelHandle }, hits: [], queries: new Set([kw]) });
        const f = found.get(v.channelId);
        f.queries.add(kw);
        f.hits.push({ id: v.id, title: v.title, views: v.views, durationSec: v.durationSec, published: v.published });
      }
    }
  }
  const entries = [...found.values()];
  const channels = await mapLimit(
    entries,
    async ({ base, hits, queries }) => {
      const info = await channelInfo(base.id, { about: true });
      const vids = await channelVideos(base.id, { max: 30, channel: info });
      const st = channelStats(info, vids, { outlierMultiple: s.outlierMultiple });
      const top = [...vids].sort((a, b) => (b.views ?? 0) - (a.views ?? 0))[0];
      return {
        ...info,
        description: (info.description || base.description || '').slice(0, 300),
        queries: [...queries],
        hits: hits.sort((a, b) => b.views - a.views).slice(0, 5),
        ...st,
        topVideo: top ? { id: top.id, title: top.title, views: top.views } : null,
        latestVideo: vids[0] ? { id: vids[0].id, title: vids[0].title, views: vids[0].views, published: vids[0].published } : null,
      };
    },
    (done, total) => progress({ step: 'Phân tích từng kênh', done, total }),
  );
  const ok = channels.filter((c) => c && !c.error);
  ok.sort((a, b) => (b.views30d ?? 0) - (a.views30d ?? 0));
  const result = { channels: ok, keywords, source, failed: channels.length - ok.length };
  const id = records.add('channel_search', keywords.join(', '), { params, data: result });
  return { id, ...result };
}

// ---------------- channel analysis ----------------
export async function analyzeChannel(input, { max = 120, exactDates = 30 } = {}, progress = noop) {
  const s = settingsStore.all();
  progress({ step: 'Tìm kênh', done: 0, total: 1 });
  const id = await resolveChannelId(input);
  const info = await getChannelInfo(id, { about: true });
  cache.putChannel(info, true);
  progress({ step: 'Lấy danh sách video', done: 0, total: max });
  const vids = await getChannelVideos(id, { max, channel: info }, (n) => progress({ step: 'Lấy danh sách video', done: n, total: max }));
  cache.putChannelVideos(id, vids);
  let shorts = [];
  try {
    shorts = await getChannelShorts(id, { max: 60 });
  } catch {
    /* some channels have no shorts tab */
  }
  const details = new Map();
  await mapLimit(
    vids.slice(0, exactDates),
    async (v) => details.set(v.id, await videoDetails(v.id)),
    (done, total) => progress({ step: 'Lấy ngày đăng chính xác', done, total }),
  );
  const long = addVideoMetrics(
    vids.filter((v) => !v.isLive).map((v) => {
      const d = details.get(v.id);
      return d && !d.error ? { ...v, publishedAt: d.publishedAt, channelSubs: info.subs } : { ...v, channelSubs: info.subs };
    }),
    { minSubs: 0 },
  );
  const med = median(long.map((v) => v.views));
  const mult = s.outlierMultiple;
  const videos = long.map((v) => ({ ...v, vsMedian: med ? round(v.views / med, 1) : null, standout: med ? v.views >= mult * med : false }));
  const exact = videos.filter((v) => v.ageExact);
  const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dow = days.map((label, i) => {
    const list = exact.filter((v) => new Date(v.publishedAt).getDay() === i);
    return { label, count: list.length, medianViews: median(list.map((v) => v.views)) };
  });
  const span = exact.length > 1 ? (Date.parse(exact[0].publishedAt) - Date.parse(exact[exact.length - 1].publishedAt)) / 86400000 : null;
  const data = {
    info,
    stats: {
      ...channelStats(info, vids, { outlierMultiple: mult }),
      longCount: videos.length,
      longViews: sum(videos.map((v) => v.views)),
      shortsCount: shorts.length,
      shortsViews: sum(shorts.map((v) => v.views)),
      shortsMedian: median(shorts.map((v) => v.views)),
      medianAll: med,
      standoutCount: videos.filter((v) => v.standout).length,
      daysPerVideo: span && exact.length > 1 ? round(span / (exact.length - 1), 1) : null,
      exactFrom: exact[exact.length - 1]?.publishedAt || null,
      exactTo: exact[0]?.publishedAt || null,
      outlierMultiple: mult,
    },
    videos,
    shorts: shorts.slice(0, 30),
    durations: durationBuckets(videos),
    phrases: titlePhrases(videos, { metric: 'views', minCount: 2, limit: 30 }),
    patterns: titlePatterns(videos, { metric: 'vsMedian' }),
    titleShape: titleShape(videos),
    dayOfWeek: dow,
  };
  const recId = records.add('channel_analysis', info.title, { ref: id, params: { input }, data });
  return { id: recId, ...data };
}

export function compareChannels(ids) {
  return ids
    .map((cid) => records.latestByRef('channel_analysis', cid))
    .filter(Boolean)
    .map((r) => ({
      id: r.ref,
      recordId: r.id,
      created_at: r.created_at,
      info: r.data.info,
      stats: r.data.stats,
      durations: r.data.durations,
      phrases: r.data.phrases.slice(0, 10),
      patterns: r.data.patterns,
      dayOfWeek: r.data.dayOfWeek,
      top: [...r.data.videos].sort((a, b) => b.views - a.views).slice(0, 5),
    }));
}

// ---------------- comments ----------------
/** params: { videos: [id|url], max, sort, replies } */
export async function fetchComments(params, progress = noop) {
  const ids = splitList(params.videos).map((x) => x.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] || x).filter((x) => /^[\w-]{11}$/.test(x));
  if (!ids.length) throw new Error('Không có video hợp lệ');
  const out = [];
  for (const [i, vid] of ids.entries()) {
    const label = `Comment video ${i + 1}/${ids.length}`;
    progress({ step: label, done: 0, total: params.max || 100 });
    const d = await videoDetails(vid).catch(() => ({ id: vid, title: vid }));
    const res = await getComments(vid, { max: Number(params.max) || 100, sort: params.sort || 'top', replies: !!params.replies, maxRepliesPerThread: 10 }, (n) => progress({ step: label, done: n, total: params.max || 100 }));
    const video = { id: vid, title: d.title, channelTitle: d.channelTitle, views: d.views, publishedAt: d.publishedAt, url: `https://www.youtube.com/watch?v=${vid}` };
    const data = { video, disabled: res.disabled, comments: res.comments, insights: commentInsights(res.comments), params };
    const recId = records.add('comments', d.title || vid, { ref: vid, params, data });
    out.push({ id: recId, video, count: res.comments.length, disabled: res.disabled });
  }
  return { jobs: out };
}

// ---------------- topic research (the 4 questions) ----------------
/**
 * params: { topic, keywords, direction: 'top'|'trend'|'keyword', upload, minDur, maxDur, perKeyword, gl, competitors, comments: {top, max} }
 */
export async function research(params, progress = noop) {
  const s = settingsStore.all();
  const topic = String(params.topic || '').trim();
  let keywords = splitList(params.keywords);
  if (!topic && !keywords.length) throw new Error('Nhập chủ đề');
  if (!keywords.length) keywords = [topic];
  const direction = params.direction || 'top';
  let suggestions = [];
  if (direction === 'keyword') {
    progress({ step: 'Lấy từ khoá người xem đang gõ', done: 0, total: 1 });
    suggestions = await keywordIdeas(topic || keywords[0], { gl: params.gl, depth: 'quick' });
    const extra = suggestions.slice(0, 6).map((x) => x.keyword).filter((k) => !keywords.includes(k));
    keywords = [...keywords, ...extra].slice(0, 6);
  }
  const upload = params.upload || (direction === 'trend' ? 'week' : 'year');
  const search = await videoSearch(
    { keywords, upload, sort: 'popularity', minDur: params.minDur, maxDur: params.maxDur, perKeyword: params.perKeyword || 40, gl: params.gl, exactTop: params.exactTop ?? 40, likes: true },
    progress,
  );
  records.remove(search.id); // keep only the research record
  let videos = search.videos;
  // Competitors: add their latest videos so they show up in the ranking.
  const competitors = splitList(params.competitors);
  for (const c of competitors) {
    try {
      const cid = await resolveChannelId(c);
      const info = await channelInfo(cid);
      const vids = await channelVideos(cid, { max: 30, channel: info });
      const extra = addVideoMetrics(vids.filter((v) => !videos.some((x) => x.id === v.id)).map((v) => ({ ...v, channelTitle: info.title, channelSubs: info.subs, queries: ['@' + (info.handle || info.title)] })), { minSubs: s.minSubsForOutlier });
      videos = videos.concat(extra);
    } catch {
      /* skip unknown competitor */
    }
  }
  const ranked = [...videos].filter((v) => v.outlier != null).sort((a, b) => b.outlier - a.outlier);
  const byVpd = [...videos].sort((a, b) => (b.viewsPerDay ?? 0) - (a.viewsPerDay ?? 0));
  // Small channels winning (Thanh Hai step 1: nhiều view nhưng ít sub)
  const chMap = new Map();
  for (const v of videos) {
    if (!v.channelId) continue;
    if (!chMap.has(v.channelId)) chMap.set(v.channelId, { id: v.channelId, title: v.channelTitle, handle: v.channelHandle, avatar: v.channelAvatar, subs: v.channelSubs, videos: [] });
    chMap.get(v.channelId).videos.push(v);
  }
  const channels = [...chMap.values()]
    .map((c) => ({ ...c, count: c.videos.length, bestOutlier: Math.max(...c.videos.map((v) => v.outlier ?? 0)), totalViews: sum(c.videos.map((v) => v.views)), videos: c.videos.sort((a, b) => b.views - a.views).slice(0, 3).map((v) => ({ id: v.id, title: v.title, views: v.views, outlier: v.outlier })) }))
    .sort((a, b) => b.bestOutlier - a.bestOutlier);
  const data = {
    topic: topic || keywords[0],
    keywords,
    direction,
    upload,
    suggestions,
    competitors,
    summary: summarizeVideos(videos),
    videos: videos.sort((a, b) => (b.outlier ?? -1) - (a.outlier ?? -1)),
    topByOutlier: ranked.slice(0, 15).map((v) => v.id),
    topByViewsPerDay: byVpd.slice(0, 15).map((v) => v.id),
    patterns: titlePatterns(videos, { metric: 'outlier' }),
    phrases: titlePhrases(videos, { metric: 'outlier', minCount: 2, limit: 30 }),
    titleShape: titleShape(videos),
    durations: durationBuckets(videos, 'outlier'),
    channels: channels.slice(0, 30),
    smallWinners: channels.filter((c) => c.subs != null && c.subs < 100000 && c.bestOutlier >= 1).slice(0, 15),
    comments: null,
  };
  const id = records.add('research', `${data.topic} · ${dirLabel(direction)} · ${uploadLabel(upload)}`, { params, data });
  if (params.comments?.top) {
    await researchComments(id, { top: params.comments.top, max: params.comments.max }, progress);
  }
  return { id, ...records.get(id).data };
}

/** Comments for the top-N videos of a research record (by outlier); merged insights stored on the record. */
export async function researchComments(recordId, { top = 5, max = 50, videoIds } = {}, progress = noop) {
  const rec = records.get(recordId);
  if (!rec) throw new Error('Không tìm thấy báo cáo');
  const data = rec.data;
  const ids = videoIds?.length ? videoIds : data.topByOutlier.slice(0, top);
  const all = [];
  const perVideo = [];
  for (const [i, vid] of ids.entries()) {
    const label = `Đọc comment ${i + 1}/${ids.length}`;
    try {
      const res = await getComments(vid, { max: Number(max) || 50, sort: 'top' }, (n) => progress({ step: label, done: n, total: max }));
      const v = data.videos.find((x) => x.id === vid);
      perVideo.push({ id: vid, title: v?.title || vid, count: res.comments.length, disabled: res.disabled });
      all.push(...res.comments.map((c) => ({ ...c, videoId: vid, videoTitle: v?.title || vid })));
    } catch (e) {
      perVideo.push({ id: vid, title: vid, count: 0, error: e.message });
    }
  }
  data.comments = { videos: perVideo, insights: commentInsights(all, { limit: 30 }), fetchedAt: Date.now(), total: all.length };
  records.update(recordId, data);
  return data.comments;
}

const dirLabel = (d) => ({ top: 'Theo top', trend: 'Theo trend', keyword: 'Theo từ khoá' })[d] || d;
const uploadLabel = (u) => ({ today: 'Hôm nay', week: '7 ngày', month: '30 ngày', year: '1 năm', any: 'Mọi lúc' })[u] || u;

// ---------------- keyword ideas (autocomplete) ----------------
export async function keywordIdeas(seed, { gl, hl = 'vi', depth = 'full' } = {}, progress = noop) {
  const s = settingsStore.all();
  const g = gl || s.gl;
  const lang = /[à-ỹđ]/i.test(seed) ? 'vi' : hl === 'vi' && g !== 'VN' ? 'en' : hl;
  const letters = depth === 'quick' ? [''] : ['', ...'abcdefghiklmnopqrstuvxy'.split('')];
  const prefixes = [...letters.map((l) => (l ? `${seed} ${l}` : seed))];
  if (depth !== 'quick') prefixes.push(`${seed} là gì`, `cách ${seed}`, `tại sao ${seed}`, `how to ${seed}`, `${seed} for`);
  const counts = new Map();
  await mapLimit(
    prefixes,
    async (q, i) => {
      const list = await suggest(q, { gl: g, hl: lang });
      list.forEach((k, rank) => {
        const cur = counts.get(k) || { keyword: k, hits: 0, bestRank: 99, sources: [] };
        cur.hits++;
        cur.bestRank = Math.min(cur.bestRank, rank + (i === 0 ? 0 : 3));
        cur.sources.push(q);
        counts.set(k, cur);
      });
    },
    (done, total) => progress({ step: 'Gợi ý tìm kiếm của YouTube', done, total }),
  );
  return [...counts.values()].filter((k) => k.keyword !== seed).sort((a, b) => a.bestRank - b.bestRank || b.hits - a.hits);
}

// ---------------- idea check (Thanh Hai step 2: đã có ai làm format này chưa?) ----------------
export async function ideaCheck(params, progress = noop) {
  const s = settingsStore.all();
  const ideas = splitList(params.ideas);
  if (!ideas.length) throw new Error('Nhập ít nhất một ý tưởng');
  const results = [];
  for (const [i, idea] of ideas.entries()) {
    progress({ step: `Kiểm tra ý tưởng ${i + 1}/${ideas.length}`, done: i, total: ideas.length });
    const vids = await searchVideos(idea, { sort: 'relevance', upload: 'any', max: 20, gl: params.gl || s.gl });
    const enriched = await enrichVideos(vids.filter((v) => !v.isLive), { exactTop: 0, minSubs: s.minSubsForOutlier });
    const recent = enriched.filter((v) => v.ageDays != null && v.ageDays <= 365);
    const strong = enriched.filter((v) => v.outlier >= 1);
    const medViews = median(enriched.map((v) => v.views));
    // Verdict: demand = views; supply = how many recent, strong videos already exist.
    let verdict = 'unclear';
    if (medViews != null && medViews < 2000) verdict = 'low_demand';
    else if (recent.length <= 4 && medViews >= 10000) verdict = 'open';
    else if (strong.length >= 8 && recent.length >= 10) verdict = 'saturated';
    else verdict = 'competitive';
    results.push({
      idea,
      verdict,
      medianViews: medViews,
      recentCount: recent.length,
      strongCount: strong.length,
      medianSubs: median(enriched.map((v) => v.channelSubs)),
      oldestTopAgeDays: Math.max(...enriched.map((v) => v.ageDays ?? 0)),
      top: enriched.sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 6),
    });
  }
  const id = records.add('idea_check', ideas.slice(0, 3).join(' · '), { params, data: { results } });
  return { id, results };
}
