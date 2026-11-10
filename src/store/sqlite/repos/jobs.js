// Persistent background jobs (docs/jobs-and-scraping-L4.md).

/** @param {import('node:sqlite').DatabaseSync} db @param {() => number} [now] */
export function jobsRepo(db, now = Date.now) {
  const parse = (r) => r && { ...r, params: JSON.parse(r.params), progress: r.progress ? JSON.parse(r.progress) : null, result: r.result ? JSON.parse(r.result) : null };
  /** @param {string} sql @param {...any} args */
  const one = (sql, ...args) => parse(/** @type {any} */ (db.prepare(sql).get(...args)));
  return {
    /** @param {{workspace_id: string, kind: string, title: string, status: string, params: string, idempotency_key: string, created_at: number}} j */
    insert(j) {
      const r = db
        .prepare('INSERT INTO jobs (workspace_id, kind, title, status, params, idempotency_key, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(j.workspace_id, j.kind, j.title, j.status, j.params, j.idempotency_key, j.created_at);
      return Number(r.lastInsertRowid);
    },
    findActiveByKey: (key) => one("SELECT * FROM jobs WHERE idempotency_key = ? AND status IN ('queued','running')", key),
    get: (id) => one('SELECT * FROM jobs WHERE id = ?', id),
    /** @param {number} id @param {Record<string, any>} patch */
    update(id, patch) {
      const cols = Object.keys(patch);
      if (!cols.length) return;
      const vals = cols.map((c) => (patch[c] !== null && typeof patch[c] === 'object' ? JSON.stringify(patch[c]) : patch[c]));
      db.prepare(`UPDATE jobs SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...vals, id);
    },
    /** @param {string} ws @param {number} [limit] */
    list: (ws, limit = 20) => /** @type {any[]} */ (db.prepare('SELECT * FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT ?').all(ws, limit)).map(parse),
    nextQueued: () => one("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at, id LIMIT 1"),
    markInterrupted: () => void db.prepare("UPDATE jobs SET status = 'interrupted', finished_at = ? WHERE status = 'running'").run(now()),
  };
}
