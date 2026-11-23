// TikTok image links (video covers, avatars) expire within hours, so old results lost their pictures. The app keeps a
// copy of each TikTok image on this computer (data/thumbs) the first time it is seen, and serves that copy afterwards.
// Only TikTok's own image hosts are fetched: the endpoint cannot be used to reach anything else.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const HOSTS = /(^|\.)(tiktokcdn(-[a-z0-9]+)?\.com|ibyteimg\.com|byteimg\.com|muscdn\.com)$/i;
const URL_RE = /https:\/\/[^"'\s\\<>]+/g;
const MAX_BYTES = 3_000_000;

/** @param {unknown} u */
export function isThumbUrl(u) {
  try {
    const x = new URL(String(u));
    return x.protocol === 'https:' && HOSTS.test(x.hostname);
  } catch {
    return false;
  }
}

/**
 * @param {{dir: string, fetchImpl?: typeof fetch, timeoutMs?: number}} o dir: where the copies live
 */
export function makeThumbs({ dir, fetchImpl = globalThis.fetch, timeoutMs = 10_000 }) {
  const file = (/** @type {string} */ u) => path.join(dir, crypto.createHash('sha1').update(u).digest('hex'));
  /** @type {Map<string, Promise<boolean>>} */
  const inflight = new Map();

  /** Keep a copy of one image. @param {string} u @returns {Promise<boolean>} whether a copy exists now */
  function keep(u) {
    if (fs.existsSync(file(u))) return Promise.resolve(true);
    const running = inflight.get(u);
    if (running) return running;
    const p = (async () => {
      try {
        const res = await fetchImpl(u, { signal: AbortSignal.timeout(timeoutMs), headers: { referer: 'https://www.tiktok.com/' } });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || !type.startsWith('image/')) return false;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > MAX_BYTES) return false;
        fs.mkdirSync(dir, { recursive: true });
        const f = file(u);
        fs.writeFileSync(f + '.type', type);
        fs.writeFileSync(f + '.tmp', buf);
        fs.renameSync(f + '.tmp', f); // the image file appears last: its presence means the copy is whole
        return true;
      } catch {
        return false;
      } finally {
        inflight.delete(u);
      }
    })();
    inflight.set(u, p);
    return p;
  }

  return {
    /** The kept copy of a TikTok image, fetched now if not kept yet; null when it cannot be had. @param {string} u */
    async get(u) {
      if (!isThumbUrl(u) || !(await keep(u))) return null;
      const f = file(u);
      return { body: fs.readFileSync(f), type: fs.readFileSync(f + '.type', 'utf8') || 'image/jpeg' };
    },
    /**
     * Keep copies of every TikTok image in a saved result while its links still work, a few at a time. Does not wait.
     * @param {unknown} data
     */
    warm(data) {
      const urls = [...new Set(JSON.stringify(data ?? null).match(URL_RE) ?? [])].filter(isThumbUrl).filter((u) => !fs.existsSync(file(u)));
      if (!urls.length) return;
      let next = 0;
      const worker = async () => {
        while (next < urls.length) await keep(urls[next++]);
      };
      Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker)).catch(() => {});
    },
  };
}
