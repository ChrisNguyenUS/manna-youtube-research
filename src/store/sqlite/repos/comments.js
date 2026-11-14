// Canonical TikTok comments: one row per comment (TikTok's id), shared by every report that collected it.
// Reports store references ({"$c": id, ...fields that differ}) instead of copies; reading a report puts the comments
// back exactly where they were, so the screens and exports that read reports work unchanged.
// A comment collected again keeps its row and takes the newest numbers (likes, replies).

import { maskMentions } from '../../../core/analysis/text.js';

const PLATFORM = 'tiktok';
/** Fields that belong to the comment itself (shared by every report). Anything else (rank, groups, scores…) stays in the report. */
const CANON = ['parentId', 'isReply', 'text', 'likes', 'replies', 'createdAt', 'pinned', 'videoId'];
const CHUNK = 400;

/**
 * Where each report kind keeps comment objects: [container, key] pairs whose value is an array of comments.
 * The first slot is the report's own list of read comments; the others are lists derived from it (groups, top…).
 * @type {Record<string, (d: any) => [any, string][]>}
 */
const SLOTS = {
  tiktok_comments: (d) => [[d, 'comments'], ...['questions', 'fears', 'buying', 'complaints', 'requests', 'positive', 'top'].map((k) => /** @type {[any, string]} */ ([d.insight, k]))],
  tiktok_insight: (d) => [[d, 'comments'], ...['questions', 'fears', 'buying', 'topByAttention'].map((k) => /** @type {[any, string]} */ ([d.insight, k]))],
  tiktok_video_analysis: (d) => (d.videos || []).map((e) => /** @type {[any, string]} */ ([e, 'comments'])),
};
export const COMMENT_KINDS = Object.keys(SLOTS);
const slotsOf = (kind, d) => (SLOTS[kind] && d ? SLOTS[kind](d).filter(([o, k]) => o && Array.isArray(o[k])) : []);
const isComment = (c) => c && typeof c === 'object' && !('$c' in c) && c.id != null && typeof c.text === 'string';

/** @param {import('node:sqlite').DatabaseSync} db @param {() => number} [now] */
export function commentsRepo(db, now = Date.now) {
  const upsert = db.prepare(`INSERT INTO comments (platform, comment_id, video_id, parent_id, text, likes, replies, created_at, data, first_seen, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (platform, comment_id) DO UPDATE SET video_id = COALESCE(excluded.video_id, comments.video_id), text = excluded.text,
      likes = excluded.likes, replies = excluded.replies, data = excluded.data, last_seen = excluded.last_seen`);
  const link = db.prepare('INSERT OR IGNORE INTO comment_links (record_id, platform, comment_id) VALUES (?, ?, ?)');

  /** Rows by id (chunked). @param {string[]} ids @returns {Map<string, any>} */
  function byIds(ids) {
    const out = new Map();
    const uniq = [...new Set(ids.map(String))];
    for (let i = 0; i < uniq.length; i += CHUNK) {
      const part = uniq.slice(i, i + CHUNK);
      const rows = /** @type {any[]} */ (db.prepare(`SELECT comment_id, data FROM comments WHERE platform = ? AND comment_id IN (${part.map(() => '?').join(',')})`).all(PLATFORM, ...part));
      for (const r of rows) out.set(r.comment_id, JSON.parse(r.data));
    }
    return out;
  }

  /**
   * Replaces the comments in a report's data by references and saves them as canonical rows.
   * @param {string} kind @param {any} data (not modified) @param {number} [at] when these comments were collected (default: now)
   * @returns {{data: any, ids: string[]}}
   */
  function pack(kind, data, at = now()) {
    const slots = slotsOf(kind, data);
    if (!slots.length) return { data, ids: [] };
    const copy = structuredClone(data);
    const canon = new Map();
    const fallbackVideo = kind === 'tiktok_comments' ? data.video?.id ?? null : null;
    for (const [o, k] of slotsOf(kind, copy)) {
      o[k] = o[k].map((c) => {
        if (!isComment(c)) return c;
        const id = String(c.id);
        if (!canon.has(id)) {
          /** @type {Record<string, any>} */
          const row = { id, ...Object.fromEntries(CANON.filter((k) => c[k] !== undefined).map((k) => [k, c[k]])), text: maskMentions(c.text) };
          if (row.videoId == null && fallbackVideo) row.videoId = fallbackVideo;
          upsert.run(PLATFORM, id, row.videoId ?? null, c.parentId ?? null, row.text, c.likes ?? null, c.replies ?? null, c.createdAt ?? null, JSON.stringify(row), at, at);
          canon.set(id, row);
        }
        // The report keeps what is its own; the comment's own fields always come from the shared row.
        return { $c: id, ...Object.fromEntries(Object.entries(c).filter(([key]) => key !== 'id' && !CANON.includes(key))) };
      });
    }
    return { data: copy, ids: [...canon.keys()] };
  }

  /** Puts the comments back into a report's data. @param {string} kind @param {any} data */
  function unpack(kind, data) {
    const slots = slotsOf(kind, data);
    if (!slots.length) return data;
    const refs = slots.flatMap(([o, k]) => o[k].filter((c) => c && typeof c === 'object' && '$c' in c).map((c) => c.$c));
    if (!refs.length) return data;
    const rows = byIds(refs);
    for (const [o, k] of slots) {
      o[k] = o[k].map((c) => {
        if (!(c && typeof c === 'object' && '$c' in c)) return c;
        const { $c, ...diff } = c;
        return { ...(rows.get(String($c)) ?? { id: String($c), text: '' }), ...diff };
      });
    }
    return data;
  }

  /** @param {number} recordId @param {string[]} ids */
  function linkAll(recordId, ids) {
    db.prepare('DELETE FROM comment_links WHERE record_id = ?').run(recordId);
    for (const id of ids) link.run(recordId, PLATFORM, id);
  }

  /** Comments of one video, newest collection numbers, with when they were first and last seen. @param {string} videoId */
  function ofVideo(videoId) {
    return /** @type {any[]} */ (db.prepare('SELECT data, first_seen, last_seen FROM comments WHERE platform = ? AND video_id = ? ORDER BY likes DESC').all(PLATFORM, String(videoId)))
      .map((r) => ({ ...JSON.parse(r.data), firstSeen: r.first_seen, lastSeen: r.last_seen }));
  }

  /**
   * How much of each video is already collected in this workspace: parent comments, replies, last collected.
   * @param {string} ws @param {string[]} videoIds
   */
  function coverage(ws, videoIds) {
    if (!videoIds.length) return [];
    const ids = [...new Set(videoIds.map(String))];
    return /** @type {any[]} */ (db.prepare(`SELECT c.video_id AS videoId, SUM(c.parent_id IS NULL) AS parents, SUM(c.parent_id IS NOT NULL) AS replies, MAX(c.last_seen) AS lastSeen
        FROM comments c WHERE c.platform = ? AND c.video_id IN (${ids.map(() => '?').join(',')})
          AND EXISTS (SELECT 1 FROM comment_links l JOIN records r ON r.id = l.record_id WHERE l.platform = c.platform AND l.comment_id = c.comment_id AND r.workspace_id = ?)
        GROUP BY c.video_id`).all(PLATFORM, ...ids, ws));
  }

  /** Every video with comments collected in this workspace, with counts and its reports. @param {string} ws */
  function videos(ws) {
    return /** @type {any[]} */ (db.prepare(`SELECT c.video_id AS videoId, COUNT(DISTINCT c.comment_id) AS total, COUNT(DISTINCT CASE WHEN c.parent_id IS NULL THEN c.comment_id END) AS parents,
          MAX(c.last_seen) AS lastSeen, GROUP_CONCAT(DISTINCT r.id) AS recordIds
        FROM comments c JOIN comment_links l ON l.platform = c.platform AND l.comment_id = c.comment_id JOIN records r ON r.id = l.record_id
        WHERE c.platform = ? AND r.workspace_id = ? GROUP BY c.video_id ORDER BY lastSeen DESC`).all(PLATFORM, ws))
      .map((r) => ({ ...r, replies: r.total - r.parents, recordIds: String(r.recordIds || '').split(',').filter(Boolean).map(Number) }));
  }

  /** Counts of the comments a report links to. @param {number[]} recordIds */
  function countsByRecord(recordIds) {
    if (!recordIds.length) return new Map();
    return new Map(/** @type {any[]} */ (db.prepare(`SELECT l.record_id AS id, COUNT(*) AS total, SUM(c.parent_id IS NULL) AS parents FROM comment_links l
        JOIN comments c ON c.platform = l.platform AND c.comment_id = l.comment_id WHERE l.record_id IN (${recordIds.map(() => '?').join(',')}) GROUP BY l.record_id`).all(...recordIds))
      .map((r) => [r.id, { total: r.total, parents: r.parents, replies: r.total - r.parents }]));
  }

  /** One-time move of comments embedded in reports written before this table existed. Safe to call again. */
  function moveEmbedded() {
    if (db.prepare("SELECT 1 FROM meta WHERE key = 'comments_moved'").get()) return 0;
    let moved = 0;
    db.exec('BEGIN');
    try {
      const rows = /** @type {any[]} */ (db.prepare(`SELECT id, kind, data, created_at FROM records WHERE kind IN (${COMMENT_KINDS.map(() => '?').join(',')}) ORDER BY created_at, id`).all(...COMMENT_KINDS));
      for (const r of rows) {
        if (r.data == null) continue;
        const { data, ids } = pack(r.kind, JSON.parse(r.data), r.created_at); // seen when that report was made, not today
        if (!ids.length) continue;
        db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), r.id);
        linkAll(r.id, ids);
        moved++;
      }
      db.prepare("INSERT INTO meta (key, value) VALUES ('comments_moved', ?)").run(String(now()));
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return moved;
  }

  return { pack, unpack, linkAll, byIds, ofVideo, coverage, videos, countsByRecord, moveEmbedded };
}
