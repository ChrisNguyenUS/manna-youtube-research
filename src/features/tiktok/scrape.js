// Use case: the scrape API (/api/v1/tiktok/videos). Returns the same rows as the old Apify actor
// "TikTok Search Scraper" (~/tiktok-keyword-comments-actor), ranked trending → engagement → fresh.
import { noop } from '../shared.js';
import { rankVideos, SORTS, WEIGHTS, FRESH_HALF_LIFE_DAYS } from '../../core/tiktok/rank.js';

/** One row per video, field names as in the actor's dataset so old pipelines can read it. */
const toRow = (v, scrapedAt) => ({
  rank: v.rank,
  videoId: v.id,
  videoUrl: v.url,
  caption: v.caption,
  hashtags: v.hashtags,
  createdAt: v.createdAt,
  ageDays: v.ageDays,
  durationSeconds: v.durationSec,
  playCount: v.plays,
  likeCount: v.likes,
  commentCount: v.comments,
  shareCount: v.shares,
  saveCount: v.saves,
  interactions: v.interactions,
  engagementRate: v.engagementRate,
  hotScore: v.hotScore,
  playsPerDay: v.playsPerDay,
  score: v.score,
  trendingScore: v.trendingScore,
  engagementScore: v.engagementScore,
  freshnessScore: v.freshnessScore,
  keywordInCaption: v.onTopic,
  searchQueries: v.queries,
  authorUsername: v.author,
  authorName: v.authorName ?? '',
  authorVerified: v.authorVerified ?? false,
  musicTitle: v.musicTitle ?? '',
  cover: v.cover,
  scrapedAt,
});

/** @param {{tiktokSearch: Function, now: () => number}} deps */
export function makeTikTokScrape({ tiktokSearch, now }) {
  // One scrape at a time: parallel searches from the same IP get blocked sooner. Later calls wait their turn.
  /** @type {Promise<unknown>} */
  let turn = Promise.resolve();

  /** @param {any} params @param {(p: any) => void} [progress] */
  return function tiktokScrape(params, progress = noop) {
    const run = async () => {
      progress({});
      const sort = SORTS.includes(params.sort) ? params.sort : 'score';
      const limit = Number(params.limit) > 0 ? Number(params.limit) : Infinity;
      const { keywords, perKeyword, keepOffTopic, minPlays, minLikes, maxAgeDays, minEngagement } = params;
      const search = await tiktokSearch({ keywords, perKeyword, keepOffTopic, minPlays, minLikes, maxAgeDays, minEngagement }, progress, { save: Boolean(params.save) });
      const scrapedAt = new Date(now()).toISOString();
      const ranked = rankVideos(search.videos, { sort });
      const videos = ranked.slice(0, limit).map((v) => toRow(v, scrapedAt));
      return {
        recordId: search.id,
        keywords: search.keywords,
        sort,
        ranking: { weights: WEIGHTS, freshHalfLifeDays: FRESH_HALF_LIFE_DAYS },
        scrapedAt,
        counts: { ...search.counts, kept: ranked.length, returned: videos.length },
        videos,
      };
    };
    const p = turn.then(run, run);
    turn = p.catch(() => {});
    return p;
  };
}
