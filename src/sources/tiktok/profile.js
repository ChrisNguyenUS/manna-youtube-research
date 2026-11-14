// A creator's profile and videos. Checked 2026-11-13:
// - the profile page over plain HTTP carries the account and its totals (not its videos);
// - its video list (/api/post/item_list) is signed by TikTok's own script, so the page is opened in the hidden browser
//   and the first list it fetches is read. Signed out, TikTok returns only that first page (≈20–35 newest videos)
//   and answers later pages with an empty body; signed in, the list fails outright. So this context is signed out;
// - more of the creator's videos come from searching "@username" (signed in), keeping only theirs. Search favours
//   popular videos, so callers must not take those as a fair sample of the channel.
import { parseProfileData, parseItemList } from './parse.js';
import { throwIfCancelled, sleep as cancellableSleep } from '../../core/cancel.js';

const fail = (code, message) => Object.assign(new Error(message), { code });
const DATA = /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/;

/** "@name", "name", a profile link or a video link → username (null when it is none of these). @param {string} input */
export function usernameOf(input) {
  const s = String(input || '').trim();
  const fromUrl = s.match(/tiktok\.com\/@([\w.]+)/i)?.[1];
  if (fromUrl) return fromUrl;
  const bare = s.replace(/^@/, '');
  return /^[\w.]{2,24}$/.test(bare) ? bare : null;
}

/**
 * @param {ReturnType<typeof import('./http.js').createTikTokHttp>} http
 * @param {string} username
 */
export async function fetchProfile(http, username) {
  const html = await http.getText(`https://www.tiktok.com/@${encodeURIComponent(username)}`);
  let data = null;
  try {
    data = JSON.parse(String(html).match(DATA)?.[1] ?? 'null');
  } catch {
    data = null;
  }
  const p = parseProfileData(data);
  if (p.ok) return p.profile;
  if (/** @type {any} */ (p).reason === 'not_found') throw fail('channel_not_found', `Không thấy kênh TikTok @${username}`);
  throw fail('tiktok_blocked', 'TikTok chặn trang kênh này, thử lại sau ít phút');
}

/**
 * The newest videos as the profile page lists them (pinned ones first). [] when TikTok sends none.
 * @param {ReturnType<typeof import('./browser.js').createBrowser>} browser
 * @param {string} username
 * @param {{waitMs?: number, pollMs?: number, sleep?: (ms: number) => Promise<void>}} [o]
 */
export async function latestVideos(browser, username, { waitMs = 15_000, pollMs = 500, sleep = cancellableSleep } = {}) {
  throwIfCancelled();
  return browser.withPage(async (page) => {
    /** @type {any[]} */
    let videos = [];
    page.on('response', async (res) => {
      if (!res.url().includes('/api/post/item_list') || videos.length) return;
      const r = parseItemList(await res.json().catch(() => null));
      if (r.ok && r.videos.length) videos = r.videos;
    });
    await page.goto(`https://www.tiktok.com/@${encodeURIComponent(username)}`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    for (let waited = 0; !videos.length && waited < waitMs; waited += pollMs) await sleep(pollMs);
    return videos;
  }, { signedIn: false });
}
