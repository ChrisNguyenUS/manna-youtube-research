// TikTok "Top" search, fetched from inside a tiktok.com page so TikTok's own script signs it.
import { searchApiPath, parseSearchPage, suggestApiPath, parseSuggestions, parseRelatedSearches } from './parse.js';
import { throwIfCancelled, sleep as cancellableSleep } from '../../core/cancel.js';

class Blocked extends Error {}
const LOGIN_WALL = 2483;
const HOW_TO_LOGIN = 'Đăng nhập một lần: Cài đặt → TikTok → Đăng nhập TikTok, hoặc chạy npm run login:tiktok.';
/** @param {boolean} signedIn whether the search ran with a saved sign-in (then it has expired or was signed out) */
const loginRequired = (signedIn) =>
  Object.assign(
    new Error(signedIn
      ? `Phiên đăng nhập TikTok đã hết hạn hoặc bị TikTok đăng xuất (mã 2483). ${HOW_TO_LOGIN}`
      : `TikTok bắt đăng nhập mới cho tìm kiếm (mã 2483). ${HOW_TO_LOGIN} Comment theo link vẫn không cần đăng nhập.`),
    { code: 'tiktok_login_required' },
  );

/**
 * Returns [] when TikTok keeps blocking after all retries (the caller reports the keyword as empty).
 * @param {ReturnType<typeof import('./browser.js').createBrowser>} browser
 * @param {string} keyword
 * @param {{max?: number, maxPages?: number, pageDelayMs?: number, warmupMs?: number, retryDelaysMs?: number[], sleep?: (ms: number) => Promise<void>, signedIn?: () => boolean}} [o]
 * @param {(n: number) => void} [onPage]
 */
export async function searchKeyword(browser, keyword, { max = 60, maxPages = 20, pageDelayMs = 1500, warmupMs = 3000, retryDelaysMs = [5000, 10000, 20000], sleep = cancellableSleep, signedIn = () => false } = {}, onPage) {
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt++) {
    throwIfCancelled();
    try {
      return await browser.withPage(async (page) => {
        await page.waitForLoadState('load').catch(() => {});
        await sleep(warmupMs);
        const seen = new Set();
        const kept = [];
        let offset = 0;
        let searchId = '';
        let idlePages = 0;
        for (let i = 0; i < maxPages && kept.length < max; i++) {
          throwIfCancelled();
          const { body } = await page.evaluate(async (path) => {
            const res = await fetch(path, { credentials: 'include' });
            return { status: res.status, body: await res.json().catch(() => null) };
          }, searchApiPath(keyword, offset, searchId));
          const r = parseSearchPage(body, keyword);
          if (i === 0 && r.statusCode === LOGIN_WALL) throw loginRequired(signedIn());
          if (i === 0 && (!r.ok || r.videos.length === 0)) throw new Blocked();
          if (!r.ok) break;
          let added = 0;
          for (const v of r.videos) {
            if (seen.has(v.id) || kept.length >= max) continue;
            seen.add(v.id);
            kept.push(v);
            added++;
          }
          onPage?.(kept.length);
          idlePages = added === 0 ? idlePages + 1 : 0;
          if (!r.hasMore || idlePages >= 2) break;
          offset = r.cursor;
          searchId = r.searchId || searchId;
          await sleep(pageDelayMs);
        }
        return kept;
      });
    } catch (e) {
      if (!(e instanceof Blocked)) throw e;
      if (attempt < retryDelaysMs.length) await sleep(retryDelaysMs[attempt]);
    }
  }
  return [];
}

const GUIDE_PATH = '/api/search/suggest/guide/';

/**
 * Keywords TikTok itself links to `keyword`: its autocomplete, and the "others searched for" list it shows
 * on the search page (only correct when the search page asks for it, so the page is opened and the answer read).
 * @param {ReturnType<typeof import('./browser.js').createBrowser>} browser
 * @param {string} keyword
 * @param {{warmupMs?: number, guideTimeoutMs?: number, sleep?: (ms: number) => Promise<void>, signedIn?: () => boolean}} [o]
 * @returns {Promise<{suggestions: string[], related: string[]}>}
 */
export async function relatedKeywords(browser, keyword, { warmupMs = 3000, guideTimeoutMs = 20_000, sleep = cancellableSleep, signedIn = () => false } = {}) {
  throwIfCancelled();
  return browser.withPage(async (page) => {
    await page.waitForLoadState('load').catch(() => {});
    await sleep(warmupMs);
    const fetchJson = (path) => page.evaluate(async (p) => {
      const res = await fetch(p, { credentials: 'include' });
      return res.json().catch(() => null);
    }, path);
    const sug = await fetchJson(suggestApiPath(keyword));
    if (Number(sug?.status_code) === LOGIN_WALL) throw loginRequired(signedIn());
    throwIfCancelled();
    const guide = page
      .waitForResponse((r) => r.url().includes(GUIDE_PATH) && new URL(r.url()).searchParams.get('keyword') === keyword, { timeout: guideTimeoutMs })
      .then((r) => r.json())
      .catch(() => null);
    await page.goto(`https://www.tiktok.com/search?q=${encodeURIComponent(keyword)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    return { suggestions: parseSuggestions(sug), related: parseRelatedSearches(await guide) };
  });
}
