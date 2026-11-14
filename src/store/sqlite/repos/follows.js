// Followed channels: the list, and the result of the last check of each.

/** @param {import('node:sqlite').DatabaseSync} db @param {() => number} [now] */
export function followsRepo(db, now = Date.now) {
  const row = (r) => (r ? { platform: r.platform, ref: r.ref, title: r.title, note: r.note, data: JSON.parse(r.data), seen: JSON.parse(r.seen), lastScan: r.last_scan ? JSON.parse(r.last_scan) : null, checkedAt: r.checked_at, createdAt: r.created_at } : null);
  return {
    /** @param {string} ws @param {string} [platform] */
    list(ws, platform) {
      const rows = /** @type {any[]} */ (
        platform
          ? db.prepare('SELECT * FROM follows WHERE workspace_id = ? AND platform = ? ORDER BY created_at DESC').all(ws, platform)
          : db.prepare('SELECT * FROM follows WHERE workspace_id = ? ORDER BY created_at DESC').all(ws)
      );
      return rows.map(row);
    },
    get: (ws, platform, ref) => row(db.prepare('SELECT * FROM follows WHERE workspace_id = ? AND platform = ? AND ref = ?').get(ws, platform, ref)),
    /** Follow (or refresh the snapshot of) a channel; keeps its note and check history. */
    put(ws, platform, ref, title, data) {
      db.prepare(`INSERT INTO follows (workspace_id, platform, ref, title, data, created_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, platform, ref) DO UPDATE SET title = excluded.title, data = excluded.data`).run(ws, platform, ref, title, JSON.stringify(data ?? {}), now());
    },
    note: (ws, platform, ref, note) => void db.prepare('UPDATE follows SET note = ? WHERE workspace_id = ? AND platform = ? AND ref = ?').run(note, ws, platform, ref),
    remove: (ws, platform, ref) => void db.prepare('DELETE FROM follows WHERE workspace_id = ? AND platform = ? AND ref = ?').run(ws, platform, ref),
    /** @param {string} ws @param {string} platform @param {string} ref @param {{title?: string, data?: any, seen?: string[], lastScan: any}} o */
    saveScan(ws, platform, ref, { title, data, seen, lastScan }) {
      const cur = this.get(ws, platform, ref);
      if (!cur) return; // unfollowed while the check ran
      db.prepare('UPDATE follows SET title = ?, data = ?, seen = ?, last_scan = ?, checked_at = ? WHERE workspace_id = ? AND platform = ? AND ref = ?')
        .run(title ?? cur.title, JSON.stringify(data ?? cur.data), JSON.stringify(seen ?? cur.seen), JSON.stringify(lastScan), now(), ws, platform, ref);
    },
    keys: (ws) => /** @type {any[]} */ (db.prepare('SELECT platform, ref FROM follows WHERE workspace_id = ?').all(ws)).map((r) => `${r.platform}:${r.ref}`),
  };
}
