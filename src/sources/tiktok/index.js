// TikTokSource adapter: search through a hidden Chromium, comments over plain HTTP.
import { createRequire } from 'node:module';
import { createBrowser } from './browser.js';
import { searchKeyword, relatedKeywords } from './search.js';
import { createTikTokHttp } from './http.js';
import { makeComments } from './comments.js';
import { createSession } from './session.js';
import { loginInWindow } from './login.js';

const SETUP = 'Cần cài: npm run setup:tiktok';
const playwrightInstalled = () => {
  try {
    createRequire(import.meta.url).resolve('playwright');
    return true;
  } catch {
    return false;
  }
};

const setupRequired = () => Object.assign(new Error(SETUP), { code: 'tiktok_setup_required' });
/** Package present but Chromium not downloaded (or deleted from the cache). */
const isMissingChromium = (e) => /Executable doesn't exist|playwright install|Cannot find (package|module)/i.test(e?.message || '');

/**
 * @param {{fetch?: import('./http.js').FetchLike, loadPlaywright?: () => Promise<any>, hasPlaywright?: () => boolean,
 *   sleep?: (ms: number) => Promise<void>, searchOpts?: Record<string, any>, sessionFile?: string, loginOpts?: Record<string, any>}} [o]
 *   sessionFile: where the user's TikTok sign-in is kept (without it, login() is unavailable)
 * @returns {import('../../ports/tiktok-source.js').TikTokSource}
 */
export function createTikTokSource({ fetch, loadPlaywright, hasPlaywright = playwrightInstalled, sleep, searchOpts = {}, sessionFile, loginOpts = {} } = {}) {
  const http = createTikTokHttp({ fetch, sleep });
  const comments = makeComments(http);
  const session = createSession(sessionFile);
  const browser = createBrowser({ loadPlaywright, session });
  let loggingIn = null;
  return {
    async searchVideos(q, o = {}, onPage) {
      if (!hasPlaywright()) throw setupRequired();
      try {
        return await searchKeyword(browser, q, { ...searchOpts, ...(sleep ? { sleep } : {}), signedIn: session.has, max: o.max ?? 60 }, onPage);
      } catch (e) {
        if (isMissingChromium(e)) throw setupRequired();
        throw e;
      }
    },
    async relatedKeywords(q) {
      if (!hasPlaywright()) throw setupRequired();
      try {
        return await relatedKeywords(browser, q, { ...(sleep ? { sleep } : {}), ...(searchOpts.warmupMs != null ? { warmupMs: searchOpts.warmupMs } : {}), signedIn: session.has });
      } catch (e) {
        if (isMissingChromium(e)) throw setupRequired();
        throw e;
      }
    },
    login() {
      if (!hasPlaywright()) return Promise.reject(setupRequired());
      // A second click while the window is open waits for the same sign-in instead of opening another window.
      loggingIn ??= loginInWindow({ session, loadPlaywright, ...(sleep ? { sleep } : {}), ...loginOpts })
        .catch((e) => {
          throw isMissingChromium(e) ? setupRequired() : e;
        })
        .finally(() => (loggingIn = null));
      return loggingIn;
    },
    loginStatus: () => session.status(),
    logout: async () => session.clear(),
    resolveVideo: comments.resolveVideo,
    getComments: comments.getComments,
    capabilities: () => (hasPlaywright() ? { searchReady: true } : { searchReady: false, reason: SETUP }),
    close: () => browser.close(),
    stats: http.stats,
  };
}
