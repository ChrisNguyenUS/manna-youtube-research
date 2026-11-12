// Use case: "Tìm theo chủ đề" — a topic becomes ~10 related keywords (TikTok's own suggestions), each keyword
// a column of its best videos with their 3 most liked comments. Rescanning a topic compares views with the last scan.
import { noop, splitList } from '../shared.js';
import { videoMetrics } from '../../core/tiktok/metrics.js';
import { rankVideos } from '../../core/tiktok/rank.js';
import { expandKeywords, intentOf, INTENT_LABELS, foldWords, topHashtags } from '../../core/tiktok/keywords.js';
import { classifyOnTopic, OFF_TOPIC_REASONS } from '../../core/tiktok/on-topic.js';
import { hasWords } from '../../core/analysis/text.js';
import { median } from '../../core/metrics/video.js';
import { rethrowIfCancelled } from '../../core/cancel.js';

export const TOPIC_SORTS = ['score', 'plays', 'trending', 'fresh'];
const DAY = 86_400_000;
const clamp = (x, lo, hi, d) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Math.min(Math.max(Number(x), lo), hi) : d);
/** Same topic whatever the accents or spacing: the key that links a rescan to the previous scan. */
export const topicRef = (topic) => foldWords(topic);

const setupCheck = (tiktok) => {
  const caps = tiktok.capabilities();
  if (!caps.searchReady) throw Object.assign(new Error(caps.reason || 'Cần cài: npm run setup:tiktok'), { code: 'tiktok_setup_required' });
};

/** @param {{tiktok: import('../../ports/tiktok-source.js').TikTokSource}} deps */
export function makeTikTokTopicKeywords({ tiktok }) {
  /** @param {{topic: string, limit?: number}} params */
  return async function tiktokTopicKeywords(params) {
    const topic = String(params.topic || '').trim();
    if (!topic) throw Object.assign(new Error('Nhập chủ đề'), { code: 'invalid_input' });
    setupCheck(tiktok);
    const found = await tiktok.relatedKeywords(topic);
    return { topic, keywords: expandKeywords(topic, found, { limit: clamp(params.limit, 3, 20, 10) }) };
  };
}

/** Row kept for each video: enough for the screen, the sheet, and the next scan's comparison. */
const row = (v) => ({
  id: v.id, url: v.url, caption: v.caption, hashtags: v.hashtags, author: v.author, authorName: v.authorName, cover: v.cover,
  createdAt: v.createdAt, plays: v.plays, likes: v.likes, comments: v.comments, shares: v.shares, saves: v.saves,
  ageDays: v.ageDays, interactions: v.interactions, engagementRate: v.engagementRate, playsPerDay: v.playsPerDay, score: v.score, onTopic: v.onTopic,
});

/** @param {{tiktok: import('../../ports/tiktok-source.js').TikTokSource, records: any, now: () => number}} deps */
export function makeTikTokTopicScan({ tiktok, records, now }) {
  return async function tiktokTopicScan(params, progress = noop) {
    const topic = String(params.topic || '').trim();
    if (!topic) throw new Error('Nhập chủ đề');
    setupCheck(tiktok);
    const perKeyword = clamp(params.perKeyword, 3, 30, 10);
    const sort = TOPIC_SORTS.includes(params.sort) ? params.sort : 'score';
    const minPlays = Number(params.minPlays) || 0;
    const maxAgeDays = Number(params.maxAgeDays) || 0;
    const topComments = params.topComments === 0 ? 0 : 3;
    const keepOffTopic = Boolean(params.keepOffTopic);

    // Keywords: the ones the user picked on screen, or TikTok's related searches when none were sent.
    let keywordList = splitList(params.keywords);
    /** @type {import('../../core/tiktok/keywords.js').TopicKeyword[]} */
    let discovered = [];
    if (!keywordList.length) {
      progress({ step: 'Tìm từ khoá liên quan', done: 0, total: 1 });
      discovered = expandKeywords(topic, await tiktok.relatedKeywords(topic), { limit: clamp(params.maxKeywords, 3, 20, 10) });
      keywordList = discovered.filter((k) => k.selected).map((k) => k.keyword);
    }
    keywordList = [...new Map(keywordList.map((k) => [foldWords(k), k])).values()].slice(0, 20);

    const ref = topicRef(topic);
    const prevRec = records.latestByRef('tiktok_topic', ref);
    const prev = prevRec?.data?.status === 'done' ? prevRec : null;
    const prevPlays = new Map();
    for (const col of prev?.data.columns ?? []) for (const v of col.videos) prevPlays.set(v.id, v.plays);
    const prevAt = prev ? Date.parse(prev.data.scannedAt) : null;

    const scannedAt = new Date(now()).toISOString();
    const data = {
      topic, scannedAt, status: 'running', params: { perKeyword, sort, minPlays, maxAgeDays, topComments, keepOffTopic },
      keywords: discovered, columns: [], summary: null, hashtags: [],
      previous: prev ? { id: prev.id, scannedAt: prev.data.scannedAt } : null,
    };
    const id = records.add('tiktok_topic', topic, { ref, params, data });
    const commentCache = new Map();
    // Every video seen in this scan: the topic's hashtags are learned from all of them, not one keyword at a time.
    /** @type {Map<string, any>} */
    const pool = new Map();

    async function commentsOf(videoId) {
      if (commentCache.has(videoId)) return commentCache.get(videoId);
      let top = null;
      try {
        // First page only (~45 comments, TikTok's own "top" order): the most liked ones are there.
        const r = await tiktok.getComments(videoId, { max: 50, replies: false });
        top = r.comments.filter((c) => hasWords(c.text)).sort((a, b) => b.likes - a.likes).slice(0, topComments).map((c) => ({ text: c.text, likes: c.likes }));
      } catch (e) {
        rethrowIfCancelled(e);
      }
      commentCache.set(videoId, top);
      return top;
    }

    try {
      for (const [i, kw] of keywordList.entries()) {
        const step = `Quét "${kw}" (${i + 1}/${keywordList.length})`;
        progress({ step, done: i, total: keywordList.length, recordId: id });
        const col = { keyword: kw, intent: intentOf(kw), intentLabel: INTENT_LABELS[intentOf(kw)], videos: [], found: 0, offTopic: 0, offTopicVideos: [], junk: false, stats: null, error: null };
        try {
          // Fetch more than shown, so the view/age filters still leave a full column.
          const list = await tiktok.searchVideos(kw, { max: Math.min(Math.max(perKeyword * 3, 30), 60) });
          col.found = list.length;
          const t = now();
          for (const v of list) pool.set(v.id, v);
          const poolList = [...pool.values()];
          const verdicts = classifyOnTopic(poolList, [topic, kw]);
          const verdictOf = new Map(poolList.map((v, k) => [v.id, verdicts[k]]));
          let vids = list.map((v) => ({ ...v, ...videoMetrics(v, t), onTopic: verdictOf.get(v.id).onTopic, offTopicReason: verdictOf.get(v.id).reason }));
          // Counted among the videos the view/age filters would show: smaller ones are left out either way.
          const shown = vids.filter((v) => v.plays >= minPlays && (!maxAgeDays || (v.ageDays != null && v.ageDays <= maxAgeDays)));
          const off = shown.filter((v) => !v.onTopic).sort((a, b) => b.plays - a.plays);
          col.offTopic = off.length;
          col.offTopicVideos = off.slice(0, 10).map((v) => ({ url: v.url, caption: v.caption.slice(0, 160), author: v.author, plays: v.plays, reason: OFF_TOPIC_REASONS[v.offTopicReason] }));
          // A suggestion TikTok made whose videos, among those big enough to show, are mostly unrelated
          // ("Di Trú Mỹ - Vogue": its top videos are JISOO and dance clips, the on-topic ones are small).
          col.junk = shown.length >= 4 && off.length > shown.length / 2;
          if (!keepOffTopic) vids = vids.filter((v) => v.onTopic);
          vids = vids.filter((v) => v.plays >= minPlays && (!maxAgeDays || (v.ageDays != null && v.ageDays <= maxAgeDays)));
          let ranked = rankVideos(vids, { sort: sort === 'plays' ? 'score' : sort });
          if (sort === 'plays') ranked = ranked.sort((a, b) => b.plays - a.plays).map((v, k) => ({ ...v, rank: k + 1 }));
          ranked = ranked.slice(0, perKeyword);
          const withComments = await Promise.all(ranked.map(async (v) => ({ ...row(v), rank: v.rank, topComments: topComments ? await commentsOf(v.id) : null })));
          col.videos = withComments.map((v) => {
            if (!prev) return v;
            if (!prevPlays.has(v.id)) return { ...v, isNew: true };
            const gain = v.plays - prevPlays.get(v.id);
            const days = Math.max((Date.parse(scannedAt) - prevAt) / DAY, 1 / 24);
            return { ...v, gain, gainPerDay: Math.round(gain / days) };
          });
        } catch (e) {
          rethrowIfCancelled(e);
          if (e?.code === 'tiktok_login_required' || e?.code === 'tiktok_setup_required') throw e;
          col.error = e?.message || String(e);
        }
        const plays = col.videos.map((v) => v.plays);
        col.stats = {
          count: col.videos.length,
          medianPlays: median(plays),
          medianPlaysPerDay: median(col.videos.map((v) => v.playsPerDay).filter((x) => x != null)),
          maxPlays: plays.length ? Math.max(...plays) : null,
          fresh30: col.videos.filter((v) => v.ageDays != null && v.ageDays <= 30).length,
        };
        data.columns.push(col);
        records.update(id, data);
      }
      if (data.columns.every((c) => c.error)) throw Object.assign(new Error('TikTok đang chặn tìm kiếm, thử lại sau vài phút'), { code: 'tiktok_blocked' });
      const unique = new Map();
      for (const col of data.columns) for (const v of col.videos) {
        const cur = unique.get(v.id);
        if (cur) cur.keywords.push(col.keyword);
        else unique.set(v.id, { ...v, keywords: [col.keyword] });
      }
      const all = [...unique.values()];
      data.summary = {
        keywords: data.columns.length,
        videos: all.length,
        totalPlays: all.reduce((s, v) => s + v.plays, 0),
        maxPlays: all.length ? Math.max(...all.map((v) => v.plays)) : 0,
        fresh30: all.filter((v) => v.ageDays != null && v.ageDays <= 30).length,
        newSincePrevious: prev ? all.filter((v) => v.isNew).length : null,
        offTopic: data.columns.reduce((s, c) => s + (c.offTopic ?? 0), 0),
        junkKeywords: data.columns.filter((c) => c.junk).map((c) => c.keyword),
      };
      data.hashtags = topHashtags(all);
      data.status = 'done';
      records.update(id, data);
      progress({ step: 'Xong', done: keywordList.length, total: keywordList.length, recordId: id });
      return { id };
    } catch (e) {
      // A failed scan keeps what it found but never becomes the baseline for the next scan.
      data.status = 'failed';
      records.update(id, data);
      throw e;
    }
  };
}
