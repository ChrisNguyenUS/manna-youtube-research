// Bookmarked channels/videos with notes.

/** @param {import('node:sqlite').DatabaseSync} db @param {() => number} [now] */
export function savedRepo(db, now = Date.now) {
  return {
    /** @param {string} ws @param {string} [kind] */
    list(ws, kind) {
      const rows = /** @type {any[]} */ (
        kind
          ? db.prepare('SELECT * FROM saved WHERE workspace_id = ? AND kind = ? ORDER BY created_at DESC').all(ws, kind)
          : db.prepare('SELECT * FROM saved WHERE workspace_id = ? ORDER BY created_at DESC').all(ws)
      );
      return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
    },
    put(ws, kind, ref, title, data, note = '') {
      db.prepare('INSERT OR REPLACE INTO saved (workspace_id, kind, ref, title, note, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(ws, kind, ref, title, note, JSON.stringify(data), now());
    },
    note(ws, kind, ref, note) {
      db.prepare('UPDATE saved SET note = ? WHERE workspace_id = ? AND kind = ? AND ref = ?').run(note, ws, kind, ref);
    },
    remove(ws, kind, ref) {
      db.prepare('DELETE FROM saved WHERE workspace_id = ? AND kind = ? AND ref = ?').run(ws, kind, ref);
    },
    keys(ws) {
      return /** @type {any[]} */ (db.prepare('SELECT kind, ref FROM saved WHERE workspace_id = ?').all(ws)).map((r) => `${r.kind}:${r.ref}`);
    },
  };
}
