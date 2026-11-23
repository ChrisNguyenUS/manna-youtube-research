// Which pasted lines are video links, per platform (Collect Comments, web/views/comment-collect.js). No DOM: tested in node.
const TT_ID = /(?:\/(?:video|photo|v)\/|^)(\d{15,25})(?:\D|$)/;
const TT_SHORT = /^https?:\/\/(vm|vt)\.tiktok\.com\/|^https?:\/\/(www\.)?tiktok\.com\/t\//i;
const YT_ID = /(?:[?&]v=|youtu\.be\/|\/shorts\/|\/live\/|\/embed\/)([\w-]{11})(?![\w-])/;

/** One pasted entry → {link, id} (id null for a TikTok short link), or null when it is not a video of this platform. */
export const PARSE = {
  /** @param {string} raw */
  tiktok(raw) {
    const link = raw.replace(/[?#].*$/, '');
    const id = link.match(TT_ID)?.[1] ?? null;
    return id || TT_SHORT.test(link) ? { link, id } : null;
  },
  /** @param {string} raw */
  youtube(raw) {
    const id = /^[\w-]{11}$/.test(raw) ? raw : raw.match(YT_ID)?.[1];
    return id ? { link: `https://www.youtube.com/watch?v=${id}`, id } : null;
  },
};

/**
 * Pasted text → valid links (with the video id when the link shows it), duplicates, and lines that are not links of
 * this platform. @param {string} text @param {'tiktok'|'youtube'} [platform]
 */
export function readLinks(text, platform = 'tiktok') {
  const parse = PARSE[platform];
  const seen = new Set();
  const ok = [];
  const dup = [];
  const bad = [];
  // One entry per line (or comma); a line of plain words is one wrong entry, not one per word.
  const entries = String(text || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)
    .flatMap((line) => {
      const links = line.split(/\s+/).filter((t) => /^https?:\/\//i.test(t) || /^\d{15,25}$/.test(t) || (platform === 'youtube' && /^[\w-]{11}$/.test(t)));
      return links.length ? links : [line];
    });
  for (const raw of entries) {
    const hit = parse(raw);
    const key = hit?.id ?? hit?.link;
    if (!hit) bad.push(raw);
    else if (seen.has(key)) dup.push(raw);
    else (seen.add(key), ok.push(hit));
  }
  return { ok, dup, bad };
}
