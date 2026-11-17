// "Phân tích video": pasted text → the links of each platform. Pure, so it is tested in Node.
// TikTok and YouTube links go to different jobs; a line that is neither is named and never sent.

export const MAX_PER_PLATFORM = 10;

const TIKTOK_HOST = /^(https?:\/\/)?([a-z0-9-]+\.)*tiktok\.com\//i;
const YOUTUBE_HOST = /^(https?:\/\/)?([a-z0-9-]+\.)*(youtube\.com|youtu\.be)\//i;
const TIKTOK_ID = /^\d{15,25}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_IN_LINK = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/embed\/|\/live\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/;

/** @param {string} line @returns {'tiktok'|'youtube'|null} */
export function platformOfLink(line) {
  const s = String(line ?? '').trim();
  if (TIKTOK_HOST.test(s) || TIKTOK_ID.test(s)) return 'tiktok';
  if (YOUTUBE_HOST.test(s) || YOUTUBE_ID.test(s)) return 'youtube';
  return null;
}

/** What makes two lines the same video: the id when the link shows it, else the link without its query. */
function keyOf(platform, link) {
  const bare = link.replace(/[?#].*$/, '');
  if (platform === 'youtube') return `y:${YOUTUBE_ID.test(link) ? link : link.match(YT_IN_LINK)?.[1] ?? bare}`;
  return `t:${bare.match(/\/(?:video|photo)\/(\d{15,25})/)?.[1] ?? bare}`;
}

/**
 * @param {string} text one link per line; several links on a line, or commas, also work
 * @param {'auto'|'tiktok'|'youtube'} [force] 'auto' recognises each line; a platform makes unrecognised lines count as
 *   that platform (they fail in the job if they are not) and sets the other platform's links aside as `wrong`
 * @returns {{tiktok: string[], youtube: string[], dup: string[], bad: string[], wrong: string[]}}
 */
export function readVideoLinks(text, force = 'auto') {
  const out = { tiktok: /** @type {string[]} */ ([]), youtube: /** @type {string[]} */ ([]), dup: /** @type {string[]} */ ([]), bad: /** @type {string[]} */ ([]), wrong: /** @type {string[]} */ ([]) };
  const seen = new Set();
  // One entry per line or comma; inside a line every token that looks like a link or an id is its own entry, and a
  // line with none is one entry (a sentence is one wrong line, not one per word).
  const entries = String(text || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)
    .flatMap((line) => {
      const tokens = line.split(/\s+/).filter((t) => platformOfLink(t));
      return tokens.length ? tokens : [line];
    });
  for (const raw of entries) {
    const found = platformOfLink(raw);
    if (force !== 'auto' && found && found !== force) {
      out.wrong.push(raw);
      continue;
    }
    const platform = found ?? (force === 'auto' ? null : force);
    if (!platform) {
      out.bad.push(raw);
      continue;
    }
    // TikTok links lose their tracking query; YouTube links keep theirs (the id is in it).
    const link = platform === 'tiktok' ? raw.replace(/[?#].*$/, '') : raw;
    const key = keyOf(platform, link);
    if (seen.has(key)) out.dup.push(raw);
    else (seen.add(key), out[platform].push(link));
  }
  return out;
}
