// TikTokSource adapter: search through a hidden Chromium, comments over plain HTTP.
import { createRequire } from 'node:module';
import { createBrowser } from './browser.js';
import { searchKeyword } from './search.js';
import { createTikTokHttp } from './http.js';
import { makeComments } from './comments.js';

const SETUP = 'Cần cài: npm run setup:tiktok';
const playwrightInstalled = () => {
  try {
    createRequire(import.meta.url).resolve('playwright');
    return true;
  } catch {
    return false;
  }
};

/**
 * @param {{fetch?: import('./http.js').FetchLike, loadPlaywright?: () => Promise<any>, hasPlaywright?: () => boolean,
 *   sleep?: (ms: number) => Promise<void>, searchOpts?: Record<string, any>}} [o]
 * @returns {import('../../ports/tiktok-source.js').TikTokSource}
 */
export function createTikTokSource({ fetch, loadPlaywright, hasPlaywright = playwrightInstalled, sleep, searchOpts = {} } = {}) {
  const http = createTikTokHttp({ fetch, sleep });
  const comments = makeComments(http);
  const browser = createBrowser({ loadPlaywright });
  return {
    async searchVideos(q, o = {}, onPage) {
      if (!hasPlaywright()) throw Object.assign(new Error(SETUP), { code: 'tiktok_setup_required' });
      try {
        return await searchKeyword(browser, q, { ...searchOpts, ...(sleep ? { sleep } : {}), max: o.max ?? 60 }, onPage);
      } catch (e) {
        // Package present but Chromium not downloaded (or deleted from the cache).
        if (/Executable doesn't exist|playwright install|Cannot find (package|module)/i.test(e?.message || '')) throw Object.assign(new Error(SETUP), { code: 'tiktok_setup_required' });
        throw e;
      }
    },
    resolveVideo: comments.resolveVideo,
    getComments: comments.getComments,
    capabilities: () => (hasPlaywright() ? { searchReady: true } : { searchReady: false, reason: SETUP }),
    close: () => browser.close(),
    stats: http.stats,
  };
}
