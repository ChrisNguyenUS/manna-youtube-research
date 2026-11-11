// Use case: TikTok videos for keywords, strict on-topic filter, ranked by Hot score (spec §4.1).
import { noop, splitList } from '../shared.js';
import { videoMetrics } from '../../core/tiktok/metrics.js';
import { keywordInText } from '../../core/analysis/topic.js';

/** @param {{tiktok: import('../../ports/tiktok-source.js').TikTokSource, records: any, now: () => number}} deps */
export function makeTikTokSearch({ tiktok, records, now }) {
  /** @param {any} params @param {(p: any) => void} [progress] @param {{save?: boolean}} [o] */
  return async function tiktokSearch(params, progress = noop, { save = true } = {}) {
    const keywords = splitList(params.keywords);
    if (!keywords.length) throw new Error('Nhập ít nhất một từ khoá');
    const caps = tiktok.capabilities();
    if (!caps.searchReady) throw Object.assign(new Error(caps.reason || 'Cần cài: npm run setup:tiktok'), { code: 'tiktok_setup_required' });
    const max = Math.min(Math.max(Number(params.perKeyword) || 60, 10), 200);
    const merged = new Map();
    const emptyKeywords = [];
    let rows = 0;
    for (const [i, kw] of keywords.entries()) {
      const label = `Tìm TikTok "${kw}" (${i + 1}/${keywords.length})`;
      progress({ step: label, done: 0, total: max });
      const list = await tiktok.searchVideos(kw, { max }, (n) => progress({ step: label, done: n, total: max }));
      if (!list.length) emptyKeywords.push(kw);
      rows += list.length;
      for (const v of list) {
        const cur = merged.get(v.id);
        if (cur) cur.queries.includes(kw) || cur.queries.push(kw);
        else merged.set(v.id, { ...v, queries: [kw] });
      }
    }
    if (emptyKeywords.length === keywords.length) throw Object.assign(new Error('TikTok đang chặn tìm kiếm, thử lại sau vài phút'), { code: 'tiktok_blocked' });
    const t = now();
    const all = [...merged.values()].map((v) => ({ ...v, ...videoMetrics(v, t), onTopic: keywordInText(`${v.caption} ${v.hashtags.join(' ')}`, v.queries) }));
    const kept = params.keepOffTopic ? all : all.filter((v) => v.onTopic);
    kept.sort((a, b) => (b.hotScore ?? -Infinity) - (a.hotScore ?? -Infinity) || b.interactions - a.interactions);
    const result = {
      keywords,
      videos: kept,
      counts: { found: merged.size, duplicates: rows - merged.size, offTopic: all.length - kept.length, zeroComment: kept.filter((v) => v.comments === 0).length, emptyKeywords },
    };
    const id = save ? records.add('tiktok_search', keywords.join(', '), { params, data: result }) : null;
    return { id, ...result };
  };
}
