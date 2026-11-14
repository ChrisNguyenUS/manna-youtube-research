// Polite HTTP for TikTok's public JSON endpoints: limited concurrency, small delay, retry with backoff.
import { throwIfCancelled, sleep as cancellableSleep } from '../../core/cancel.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** Only the parts of fetch/Response this module uses, so tests can pass a small fake.
 * @typedef {(url: string, init?: any) => Promise<{status: number, url?: string, json: () => Promise<any>, text?: () => Promise<string>}>} FetchLike */
/** @param {{fetch?: FetchLike, concurrency?: number, delayMs?: number, retries?: number, sleep?: (ms: number) => Promise<void>}} [o] */
export function createTikTokHttp({ fetch: doFetch = /** @type {FetchLike} */ (globalThis.fetch), concurrency = 3, delayMs = 300, retries = 4, sleep = cancellableSleep } = {}) {
  let active = 0;
  const queue = [];
  const stats = { requests: 0, failures: 0 };
  const acquire = () => (active < concurrency ? (active++, Promise.resolve()) : new Promise((r) => queue.push(r)));
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else active--;
  };

  /** @param {string} url @param {RequestInit} [init] */
  async function request(url, init) {
    throwIfCancelled();
    await acquire();
    try {
      let lastErr;
      for (let attempt = 0; attempt < retries; attempt++) {
        await sleep(delayMs * (0.5 + Math.random()) + attempt * attempt * 1500);
        throwIfCancelled();
        stats.requests++;
        try {
          const res = await doFetch(url, { headers: { 'user-agent': UA, referer: 'https://www.tiktok.com/' }, redirect: 'follow', signal: AbortSignal.timeout(20000), ...init });
          if (res.status === 429 || res.status >= 500) {
            lastErr = new Error(`TikTok trả về ${res.status}`);
            continue;
          }
          return res;
        } catch (e) {
          lastErr = e;
        }
      }
      stats.failures++;
      throw lastErr;
    } finally {
      release();
    }
  }

  return {
    /** JSON body; a body that is not JSON counts as a failed request. @param {string} url */
    async getJson(url) {
      const res = await request(url);
      const body = await res.json().catch(() => null);
      if (body == null) throw new Error('TikTok trả về dữ liệu không đọc được');
      return body;
    },
    /** Body as text (a video's page, a subtitle file). An empty body counts as a failed request. @param {string} url */
    async getText(url) {
      const res = await request(url);
      const body = res.text ? await res.text().catch(() => '') : '';
      if (!body) throw new Error('TikTok trả về dữ liệu không đọc được');
      return body;
    },
    /** Final URL after redirects (vm.tiktok.com short links). @param {string} url */
    async finalUrl(url) {
      return (await request(url)).url || url;
    },
    stats: () => ({ ...stats }),
  };
}
