// In-memory YouTubeSource for tests: no network, deterministic.
import { VIDEOS, CHANNELS, CHANNEL_VIDEOS } from './fixtures.js';

/** @returns {import('../../ports/youtube-source.js').YouTubeSource} */
export function createFakeSource({ videos = VIDEOS, channels = CHANNELS } = {}) {
  let requests = 0;
  /** @template T @param {T} x @returns {Promise<T>} */
  const count = (x) => {
    requests++;
    return Promise.resolve(x);
  };
  return {
    searchVideos: (q, o = {}) => count(videos.slice(0, o.max ?? 20).map((v) => ({ ...v, query: q, regions: (o.regions || []).filter(Boolean) }))),
    searchChannels: (q, o = {}) => count(Object.values(channels).slice(0, o.max ?? 20).map((c) => ({ ...c, query: q, regions: [] }))),
    resolveChannelId: (input) => count(Object.values(channels).find((c) => input === c.id || input.includes(c.handle))?.id ?? Object.keys(channels)[0]),
    getChannel: (id) => count(channels[id]),
    getChannelVideos: (id, o = {}) => count(CHANNEL_VIDEOS(id).slice(0, o.max ?? 30)),
    getChannelShorts: () => count([]),
    getVideo: (id) => count({ id, title: 'x', channelId: null, channelTitle: '', views: 1, durationSec: 60, publishedAt: '2026-10-01T00:00:00Z', category: null, tags: [], description: '', isShort: false, likes: 10 }),
    getComments: () => count({ comments: [{ id: 'c1', text: 'Làm phần 2 đi ad?', likes: 5, replies: 1, published: '1 day ago', ageDays: 1, isReply: false, byCreator: false, hearted: false }], disabled: false }),
    suggest: (q) => count([q, `${q} hay nhất`]),
    mapLimit: (items, fn, onEach) =>
      Promise.all(
        items.map(async (x, i) => {
          try {
            return await fn(x, i);
          } catch (e) {
            return { error: e.message };
          } finally {
            onEach?.(i + 1, items.length);
          }
        }),
      ),
    capabilities: () => ({ captionsFilter: true, ccFilter: true, globalSearch: true }),
    stats: () => ({ requests, failures: 0 }),
  };
}
