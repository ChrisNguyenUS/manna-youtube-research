// Minimal client for YouTube's public web API (the same one youtube.com calls).
// No login, no key. Polite by default: limited concurrency, jitter, backoff on 429/5xx.

const BASE = 'https://www.youtube.com/youtubei/v1/';
const CLIENT_VERSION = '2.20261101.00.00';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const settings = { gl: 'US', concurrency: 4, delayMs: 200 };
export function configure(opts = {}) {
  for (const k of Object.keys(settings)) if (opts[k] != null && opts[k] !== '') settings[k] = opts[k];
}
/** 'GLOBAL' is an app-level mode (several regions merged); a single request always needs a real country. */
export function realGl(gl) {
  const g = gl || settings.gl;
  if (g && g !== 'GLOBAL') return g;
  return 'US';
}
export function getConfig() {
  return { ...settings };
}

let active = 0;
const queue = [];
function acquire() {
  if (active < settings.concurrency) {
    active++;
    return Promise.resolve();
  }
  return new Promise((r) => queue.push(r));
}
function release() {
  const next = queue.shift();
  if (next) next();
  else active--;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const stats = { requests: 0, failures: 0 };

/** @param {string} endpoint @param {any} body @param {{gl?: string}} [o] */
export async function call(endpoint, body, { gl } = {}) {
  await acquire();
  try {
    let lastErr;
    for (let attempt = 0; attempt < 4; attempt++) {
      await sleep(settings.delayMs * (0.5 + Math.random()) + attempt * attempt * 1500);
      stats.requests++;
      try {
        const res = await fetch(`${BASE}${endpoint}?prettyPrint=false`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
          body: JSON.stringify({
            context: { client: { clientName: 'WEB', clientVersion: CLIENT_VERSION, hl: 'en', gl: realGl(gl) } },
            ...body,
          }),
          signal: AbortSignal.timeout(20000),
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`YouTube trả về ${res.status}`);
          continue;
        }
        if (!res.ok) throw Object.assign(new Error(`YouTube trả về ${res.status} cho ${endpoint}`), { fatal: true });
        return await res.json();
      } catch (e) {
        if (e.fatal) throw e;
        lastErr = e;
      }
    }
    stats.failures++;
    throw lastErr;
  } finally {
    release();
  }
}

/** Run fn over items with the client's concurrency (the semaphore does the limiting). */
export async function mapLimit(items, fn, onEach) {
  let done = 0;
  return Promise.all(
    items.map(async (it, i) => {
      try {
        return await fn(it, i);
      } catch (e) {
        return { error: e.message };
      } finally {
        done++;
        onEach?.(done, items.length);
      }
    }),
  );
}

/** YouTube search autocomplete (public suggest endpoint). */
/** @param {string} q @param {{gl?: string, hl?: string}} [o] */
export async function suggest(q, { gl, hl = 'en' } = {}) {
  const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&hl=${hl}&gl=${realGl(gl)}&q=${encodeURIComponent(q)}`;
  await acquire();
  try {
    await sleep(settings.delayMs * (0.5 + Math.random()));
    stats.requests++;
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(15000) });
    const body = await res.text();
    const m = body.match(/\((.*)\)\s*$/s);
    if (!m) return [];
    return (JSON.parse(m[1])[1] || []).map((x) => x[0]);
  } finally {
    release();
  }
}
