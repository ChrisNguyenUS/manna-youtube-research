// TikTok "Top" search, fetched from inside a tiktok.com page so TikTok's own script signs it.
import { searchApiPath, parseSearchPage } from './parse.js';
import { throwIfCancelled } from '../../core/cancel.js';

const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
class Blocked extends Error {}

/**
 * Returns [] when TikTok keeps blocking after all retries (the caller reports the keyword as empty).
 * @param {ReturnType<typeof import('./browser.js').createBrowser>} browser
 * @param {string} keyword
 * @param {{max?: number, maxPages?: number, pageDelayMs?: number, warmupMs?: number, retryDelaysMs?: number[], sleep?: (ms: number) => Promise<void>}} [o]
 * @param {(n: number) => void} [onPage]
 */
export async function searchKeyword(browser, keyword, { max = 60, maxPages = 20, pageDelayMs = 1500, warmupMs = 3000, retryDelaysMs = [5000, 10000, 20000], sleep = realSleep } = {}, onPage) {
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
