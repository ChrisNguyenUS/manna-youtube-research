// Cache of public YouTube data (shared by all workspaces).
const DAY = 86400000;

/** @param {import('node:sqlite').DatabaseSync} db @param {() => number} [now] */
export function cacheRepo(db, now = Date.now) {
  /** @param {string} sql @param {...any} args */
  const one = (sql, ...args) => /** @type {any} */ (db.prepare(sql).get(...args));
  return {
    /** @param {string} id @param {{maxAgeDays?: number, needAbout?: boolean}} [o] */
    getChannel(id, { maxAgeDays = 3, needAbout = false } = {}) {
      const r = one('SELECT data, about, fetched_at FROM channels WHERE id = ?', id);
      if (!r || now() - r.fetched_at > maxAgeDays * DAY || (needAbout && !r.about)) return null;
      return JSON.parse(r.data);
    },
    putChannel(info, about) {
      db.prepare('INSERT OR REPLACE INTO channels (id, data, about, fetched_at) VALUES (?, ?, ?, ?)').run(info.id, JSON.stringify(info), about ? 1 : 0, now());
    },
    /** @param {string} id @param {{maxAgeDays?: number, min?: number}} [o] */
    getChannelVideos(id, { maxAgeDays = 1, min = 0 } = {}) {
      const r = one('SELECT data, fetched_at FROM channel_videos WHERE channel_id = ?', id);
      if (!r || now() - r.fetched_at > maxAgeDays * DAY) return null;
      const list = JSON.parse(r.data);
      return list.length >= min ? list : null;
    },
    putChannelVideos(id, list) {
      db.prepare('INSERT OR REPLACE INTO channel_videos (channel_id, data, fetched_at) VALUES (?, ?, ?)').run(id, JSON.stringify(list), now());
    },
    /** @param {string} id @param {{maxAgeDays?: number}} [o] */
    getVideo(id, { maxAgeDays = 7 } = {}) {
      const r = one('SELECT data, fetched_at FROM video_details WHERE id = ?', id);
      if (!r || now() - r.fetched_at > maxAgeDays * DAY) return null;
      return JSON.parse(r.data);
    },
    putVideo(d) {
      db.prepare('INSERT OR REPLACE INTO video_details (id, data, fetched_at) VALUES (?, ?, ?)').run(d.id, JSON.stringify(d), now());
    },
  };
}
