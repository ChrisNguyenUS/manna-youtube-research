// Composition root: the only place that picks concrete adapters (docs/ARCHITECTURE.md §2.3).
import path from 'node:path';
import { loadConfig } from './config.js';
import { openDatabase } from './store/sqlite/db.js';
import { createSqliteStore } from './store/sqlite/index.js';
import { createInnertubeSource } from './sources/innertube/index.js';
import { createTikTokSource } from './sources/tiktok/index.js';
import { createRunner } from './jobs/runner.js';
import { makeEnrich, recordsFor } from './features/shared.js';
import { makeVideoSearch } from './features/video-search.js';
import { makeChannelSearch } from './features/channel-search.js';
import { makeChannelAnalysis, makeCompareChannels } from './features/channel-analysis.js';
import { makeFetchComments } from './features/comments.js';
import { makeResearch, makeResearchComments } from './features/topic-research.js';
import { makeKeywordIdeas } from './features/keyword-ideas.js';
import { makeScoreOneKeyword, makeKeywordScores } from './features/keyword-score.js';
import { makeTikTokSearch } from './features/tiktok/search.js';
import { makeTikTokComments } from './features/tiktok/comments.js';
import { makeTikTokInsight, makeTikTokInsightTopics } from './features/tiktok/insight.js';
import { makeTikTokScrape } from './features/tiktok/scrape.js';
import { makeTikTokTopicKeywords, makeTikTokTopicScan } from './features/tiktok/topic.js';

/**
 * @param {{config?: ReturnType<typeof loadConfig>, source?: import('./ports/youtube-source.js').YouTubeSource, store?: import('./store/sqlite/index.js').Store,
 *   tiktok?: import('./ports/tiktok-source.js').TikTokSource}} [o]
 */
export function createApp({ config = loadConfig(), source, store, tiktok } = {}) {
  store ??= createSqliteStore(openDatabase({ dataDir: config.dataDir }));
  const ws = 'local'; // workspace; becomes the signed-in workspace when the app goes multi-user
  const settings = () => store.settings.all(ws);
  source ??= createInnertubeSource(settings());
  // The user's own TikTok sign-in (cookies only, never a password), next to the database.
  tiktok ??= createTikTokSource({ sessionFile: path.join(config.dataDir, 'tiktok-session.json') });
  const base = { source, store, ws, settings, now: Date.now, records: recordsFor(store, ws) };
  const enrich = makeEnrich(base);
  const tiktokSearch = makeTikTokSearch({ tiktok, records: base.records, now: base.now });

  const videoSearch = makeVideoSearch({ ...base, enrich });
  const keywordIdeas = makeKeywordIdeas(base);
  const researchComments = makeResearchComments(base);
  const scoreOneKeyword = makeScoreOneKeyword({ ...base, enrich });
  const features = {
    videoSearch,
    channelSearch: makeChannelSearch({ ...base, enrich }),
    analyzeChannel: makeChannelAnalysis({ ...base, enrich }),
    compareChannels: makeCompareChannels(base),
    fetchComments: makeFetchComments({ ...base, enrich }),
    research: makeResearch({ ...base, enrich, videoSearch, keywordIdeas, researchComments }),
    researchComments,
    keywordIdeas,
    keywordScores: makeKeywordScores({ ...base, scoreOneKeyword }),
    tiktokSearch,
    tiktokComments: makeTikTokComments({ tiktok, records: base.records, now: base.now }),
    tiktokInsight: makeTikTokInsight({ tiktok, records: base.records, now: base.now, tiktokSearch }),
    tiktokInsightTopics: makeTikTokInsightTopics({ records: base.records }),
    tiktokScrape: makeTikTokScrape({ tiktokSearch, now: base.now }),
    tiktokTopicKeywords: makeTikTokTopicKeywords({ tiktok }),
    tiktokTopicScan: makeTikTokTopicScan({ tiktok, records: base.records, now: base.now }),
  };

  /** Job kind → handler. ctx.progress throws after cancel, which is how jobs stop. */
  const handlers = {
    video_search: (p, ctx) => features.videoSearch(p, ctx.progress),
    channel_search: (p, ctx) => features.channelSearch(p, ctx.progress),
    channel_analysis: (p, ctx) => features.analyzeChannel(p.input, { max: Number(p.max) || 120 }, ctx.progress),
    research: (p, ctx) => features.research(p, ctx.progress),
    research_comments: (p, ctx) => features.researchComments(Number(p.recordId), p, ctx.progress),
    comments: (p, ctx) => features.fetchComments(p, ctx.progress),
    idea_check: (p, ctx) => features.keywordScores(p, ctx.progress),
    keyword_score: (p, ctx) => features.keywordScores(p, ctx.progress),
    keywords: async (p, ctx) => {
      const list = await features.keywordIdeas(p.seed, { gl: p.gl }, ctx.progress);
      return { id: base.records.add('keywords', p.seed, { params: p, data: { seed: p.seed, list } }) };
    },
  };
  handlers.tiktok_search = (p, ctx) => features.tiktokSearch(p, ctx.progress);
  handlers.tiktok_insight = (p, ctx) => features.tiktokInsight(p, ctx.progress);
  handlers.tiktok_comments = (p, ctx) => features.tiktokComments(p, ctx.progress);
  handlers.tiktok_topic = (p, ctx) => features.tiktokTopicScan(p, ctx.progress);
  const runner = createRunner({ jobsRepo: store.jobs, handlers, onCancelled: (job) => store.records.removeByJob(job.id) });
  return { config, store, source, tiktok, features, runner, ws, settings, close: () => tiktok.close() };
}
