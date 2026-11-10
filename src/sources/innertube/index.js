// YouTubeSource adapter over YouTube's web API (youtubei/v1). The only place that knows
// InnerTube response shapes; parsers live next to it (parse.js, search.js, channel.js, comments.js).
import { configure, mapLimit, suggest, stats, realGl } from './client.js';
import { searchVideosRegions, searchChannelsRegions } from './search.js';
import { resolveChannelId, getChannelInfo, getChannelVideos, getChannelShorts, getVideoDetails } from './channel.js';
import { getComments } from './comments.js';

/**
 * Deduplicate concurrent identical calls (two jobs asking for the same channel at once).
 * @template {(...a: any[]) => Promise<any>} F @param {F} fn
 * @returns {(key: string, ...args: Parameters<F>) => ReturnType<F>}
 */
function singleFlight(fn) {
  const inflight = new Map();
  return /** @type {any} */ ((key, ...args) => {
    if (inflight.has(key)) return inflight.get(key);
    const p = fn(...args).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  });
}

/**
 * @param {Record<string, any>} [cfg] client settings: gl, concurrency, delayMs
 * @returns {import('../../ports/youtube-source.js').YouTubeSource}
 */
export function createInnertubeSource(cfg = {}) {
  // The HTTP client keeps module-level settings: one source per process (accepted in phase 0).
  configure(cfg);
  const channel = singleFlight(getChannelInfo);
  const channelVids = singleFlight(getChannelVideos);
  const regionsOf = (o) => (o.regions && o.regions.length ? o.regions : [realGl(o.gl)]);
  return {
    searchVideos: (q, o = {}, onPage) => searchVideosRegions(q, o, regionsOf(o), onPage),
    searchChannels: (q, o = {}, onPage) => searchChannelsRegions(q, o, regionsOf(o), onPage),
    resolveChannelId,
    getChannel: (id, o = {}) => channel(`${id}:${!!o.about}`, id, o),
    getChannelVideos: (id, o = {}, onPage) => channelVids(`${id}:${o.max ?? 120}`, id, o, onPage),
    getChannelShorts,
    getVideo: getVideoDetails,
    getComments,
    suggest: (q, o = {}) => suggest(q, o),
    mapLimit,
    capabilities: () => ({ captionsFilter: true, ccFilter: true, globalSearch: true }),
    stats: () => ({ ...stats }),
    configure,
  };
}
