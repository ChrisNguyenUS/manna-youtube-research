// Comments and replies over plain HTTP (no login, no browser), plus short-link resolution.
import { commentListUrl, replyListUrl, parseCommentPage, takeNew, extractVideoId, isShortLink } from './parse.js';

const MAX_PAGES = 30;

/** @param {ReturnType<typeof import('./http.js').createTikTokHttp>} http */
export function makeComments(http) {
  async function pages(urlFor, parentId, room, seen) {
    const out = [];
    let cursor = 0;
    let total = 0;
    for (let i = 0; i < MAX_PAGES && out.length < room; i++) {
      const page = parseCommentPage(await http.getJson(urlFor(cursor)), parentId);
      if (!page.ok) throw new Error('TikTok từ chối trang comment');
      total = page.total || total;
      const fresh = takeNew(page.comments, seen, room - out.length);
      out.push(...fresh);
      if (!page.hasMore || page.comments.length === 0 || fresh.length === 0) break;
      cursor = page.cursor;
    }
    return { list: out, total };
  }

  return {
    /** @param {string} urlOrId */
    async resolveVideo(urlOrId) {
      const raw = String(urlOrId || '').trim();
      let url = raw;
      if (isShortLink(raw)) url = await http.finalUrl(raw);
      const isId = /^\d{15,25}$/.test(url);
      // Only tiktok.com links, and the saved URL is rebuilt so nothing typed by hand ends up in a link.
      if (!isId && !/^https?:\/\/([a-z0-9-]+\.)*tiktok\.com\//i.test(url)) throw new Error(`Không phải link video TikTok: ${raw}`);
      const id = extractVideoId(url);
      if (!id) throw new Error(`Không phải link video TikTok: ${raw}`);
      const m = isId ? null : url.match(/\/@([\w.-]+)\/(video|photo)\//);
      return { id, url: m ? `https://www.tiktok.com/@${m[1]}/${m[2]}/${id}` : `https://www.tiktok.com/video/${id}` };
    },
    /** @param {string} id @param {{max?: number, replies?: boolean, maxRepliesPerComment?: number}} [o] @param {(n: number) => void} [onProgress] */
    async getComments(id, { max = 300, replies = true, maxRepliesPerComment = 20 } = {}, onProgress) {
      const seen = new Set();
      const top = await pages((c) => commentListUrl(id, c), null, max, seen);
      onProgress?.(top.list.length);
      const all = [...top.list];
      if (replies) {
        const withReplies = top.list.filter((c) => c.replies > 0);
        const groups = await Promise.all(withReplies.map((c) => pages((cur) => replyListUrl(id, c.id, cur), c.id, maxRepliesPerComment, seen)));
        for (const g of groups) all.push(...g.list);
        onProgress?.(all.length);
      }
      return { comments: all, total: top.total };
    },
  };
}
