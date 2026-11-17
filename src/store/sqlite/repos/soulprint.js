// The Soulprint profile of a workspace: one JSON document, last save wins.

/** @param {import('node:sqlite').DatabaseSync} db @param {() => number} [now] */
export function soulprintRepo(db, now = Date.now) {
  return {
    /** @param {string} ws @returns {{data: any, updatedAt: number} | null} */
    get(ws) {
      const r = /** @type {any} */ (db.prepare('SELECT data, updated_at FROM soulprint WHERE workspace_id = ?').get(ws));
      return r ? { data: JSON.parse(r.data), updatedAt: r.updated_at } : null;
    },
    /** @param {string} ws @param {any} data @returns {number} when it was saved */
    save(ws, data) {
      const at = now();
      db.prepare('INSERT INTO soulprint (workspace_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT (workspace_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').run(ws, JSON.stringify(data), at);
      return at;
    },
  };
}
