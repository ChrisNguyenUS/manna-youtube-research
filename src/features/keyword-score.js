import { rethrowIfCancelled } from '../core/cancel.js';
// Use case: vidIQ-style keyword scoring. Receives everything through deps (docs/ARCHITECTURE.md §4).
import { noop, splitList, regionsFor } from './shared.js';
import { addVideoMetrics, median } from '../core/metrics/index.js';
import { scoreKeyword as computeScore, autocompleteMatch, topChannels, normalize as normalizeKw } from '../core/analysis/keyword-score.js';

/** Has someone already made this? Demand = views; supply = recent, strong videos (Thanh Hải step 2). */
function verdictFor(enriched) {
  const recent = enriched.filter((v) => (v.age ?? v.ageDays) != null && (v.age ?? v.ageDays) <= 365).length;
  const strong = enriched.filter((v) => v.viewSub >= 1).length;
  const med = median(enriched.map((v) => v.views));
  let verdict;
  if (med != null && med < 2000) verdict = 'low_demand';
  else if (recent <= 4 && med >= 10000) verdict = 'open';
  else if (strong >= 8 && recent >= 10) verdict = 'saturated';
  else verdict = 'competitive';
  return { verdict, recentYear: recent, strong };
}

/** @param {import('./shared.js').Deps & Record<string, any>} deps */
export function makeScoreOneKeyword(deps) {
  const { source, store, settings, now, records } = deps;
  const { channelInfo, channelVideos, videoDetails, enrichVideos } = deps.enrich;
  /**
   * Full: top 20 by relevance + channel subs, CC and captions counts, uploads in the last 30 days
   * (count + median VPH), top channels, related keywords (names only; scored on demand), verdict.
   * Lite: top 20 + subs only — used to score related keywords when the user asks.
   */
  /** @param {string} keyword @param {{gl?: string, lite?: boolean, autocomplete?: string}} [o] */
  return async function scoreOneKeyword(keyword, { gl, lite = false, autocomplete: knownAc } = {}) {
    const s = settings();
    const regions = regionsFor(gl || s.gl, s.globalRegions);
    const first = regions.slice(0, 1);
    const hl = /[à-ỹđ]/i.test(keyword) ? 'vi' : 'en';
    const safe = (p, fallback) => p.catch((e) => (rethrowIfCancelled(e), fallback));

    const [topRaw, ccList, capList, recentRaw, suggestions] = await Promise.all([
      source.searchVideos(keyword, { ...{ sort: 'relevance', upload: 'any', max: 20 }, regions: regions }),
      lite ? null : safe(source.searchVideos(keyword, { ...{ sort: 'relevance', upload: 'any', max: 20, cc: true }, regions: first }), null),
      lite ? null : safe(source.searchVideos(keyword, { ...{ sort: 'relevance', upload: 'any', max: 20, captions: true }, regions: first }), null),
      lite ? [] : safe(source.searchVideos(keyword, { ...{ sort: 'relevance', upload: 'month', max: 40 }, regions: first }), []),
      knownAc ? [] : safe(source.suggest(keyword, { gl: first[0] || undefined, hl }), []),
    ]);
    const top = topRaw.filter((v) => !v.isLive).slice(0, 20);
    const enriched = await enrichVideos(top, { exactTop: 0, minSubs: s.minSubsForOutlier });
    const ids = new Set(enriched.map((v) => v.id));
    const countIn = (list) => (list ? list.filter((v) => ids.has(v.id)).length : null);
    const autocomplete = knownAc || autocompleteMatch(keyword, suggestions);
    const score = computeScore(keyword, enriched, { ccCount: countIn(ccList), captionsCount: countIn(capList), autocomplete });
    if (lite) return { keyword, overall: score.overall, volume: score.volume, competition: score.competition, bands: score.bands };

    // Fresh uploads: plain numbers instead of a VPH chart (YouTube only says "2 weeks ago", too coarse to plot).
    const recent = addVideoMetrics(recentRaw.filter((v) => !v.isLive && (v.ageDays ?? 99) <= 31), {});
    const k = normalizeKw(keyword);
    return {
      ...score,
      ...verdictFor(enriched),
      regions,
      recent30: { count: recent.length, medianVph: median(recent.map((v) => v.vph)), best: [...recent].sort((a, b) => (b.vph ?? 0) - (a.vph ?? 0)).slice(0, 3) },
      topChannels: topChannels(enriched),
      related: [...new Set(suggestions.filter((x) => normalizeKw(x) !== k))].slice(0, 10).map((kw) => ({ keyword: kw })),
      top: [...enriched].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 8),
    };
  };
}

/** @param {import('./shared.js').Deps & Record<string, any>} deps */
export function makeKeywordScores(deps) {
  const { source, store, settings, now, records } = deps;
  const scoreOneKeyword = deps.scoreOneKeyword;
  /** params: { keywords|ideas, gl, lite }. Lite runs are returned inline (not saved): used for related keywords. */
  return async function keywordScores(params, progress = noop) {
    const s = settings();
    const keywords = splitList(params.keywords ?? params.ideas).slice(0, 30);
    if (!keywords.length) throw new Error('Nhập ít nhất một từ khoá');
    const lite = !!params.lite;
    const results = [];
    await source.mapLimit(
      keywords,
      async (kw) => {
        try {
          results.push(await scoreOneKeyword(kw, { gl: params.gl || s.gl, lite, autocomplete: lite ? 'exact' : undefined }));
        } catch (e) {
          rethrowIfCancelled(e);
          results.push({ keyword: kw, error: e.message });
        }
      },
      (done, total) => progress({ step: lite ? 'Chấm điểm từ khoá liên quan' : `Chấm điểm từ khoá ${done}/${total}`, done, total }),
    );
    results.sort((a, b) => keywords.indexOf(a.keyword) - keywords.indexOf(b.keyword));
    if (lite) return { inline: true, results };
    const id = records.add('idea_check', keywords.slice(0, 3).join(' · ') + (keywords.length > 3 ? ` +${keywords.length - 3}` : ''), { params, data: { results } });
    return { id, results };
  };
}
