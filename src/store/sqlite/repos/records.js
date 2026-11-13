// Results of research tasks, scoped by workspace and versioned (schema_version).
import { upgradeRecord, LATEST } from '../../upgrades/index.js';
import { currentJobId, throwIfCancelled } from '../../../core/cancel.js';

/** @param {import('node:sqlite').DatabaseSync} db @param {() => number} [now] */
export function recordsRepo(db, now = Date.now) {
  const parse = (r) => {
    if (!r) return r;
    const up = upgradeRecord(r.kind, r.schema_version ?? 1, r.data != null ? JSON.parse(r.data) : null);
    return { ...r, params: r.params != null ? JSON.parse(r.params) : null, data: up.data, schema_version: up.version };
  };
  /** @param {string} sql @param {...any} args */
  const one = (sql, ...args) => /** @type {any} */ (db.prepare(sql).get(...args));
  /** @param {string} sql @param {...any} args */
  const all = (sql, ...args) => /** @type {any[]} */ (db.prepare(sql).all(...args));
  return {
    /**
     * @param {string} ws @param {string} kind @param {string} title
     * @param {{ref?: string|null, params?: any, data?: any, schemaVersion?: number, jobId?: number|null}} [o]
     */
    add(ws, kind, title, { ref = null, params = null, data = null, schemaVersion = LATEST[kind] ?? 1, jobId = currentJobId() } = {}) {
      throwIfCancelled(); // a cancelled job writes nothing
      const r = db
        .prepare('INSERT INTO records (workspace_id, kind, title, ref, params, data, schema_version, job_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(ws, kind, title, ref, JSON.stringify(params), JSON.stringify(data), schemaVersion, jobId, now());
      return Number(r.lastInsertRowid);
    },
    get: (ws, id) => parse(one('SELECT * FROM records WHERE workspace_id = ? AND id = ?', ws, id)),
    /** @param {string} ws @param {number} id @param {any} data @param {number} [schemaVersion] */
    update(ws, id, data, schemaVersion) {
      throwIfCancelled();
      db.prepare('UPDATE records SET data = ?, schema_version = COALESCE(?, schema_version) WHERE workspace_id = ? AND id = ?').run(JSON.stringify(data), schemaVersion ?? null, ws, id);
    },
    /** @param {string} ws @param {string|null} [kind] @param {number} [limit] */
    list(ws, kind = null, limit = 50) {
      const rows = kind
        ? all('SELECT id, kind, title, ref, params, created_at FROM records WHERE workspace_id = ? AND kind = ? ORDER BY created_at DESC LIMIT ?', ws, kind, limit)
        : all('SELECT id, kind, title, ref, params, created_at FROM records WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?', ws, limit);
      return rows.map((r) => ({ ...r, params: r.params != null ? JSON.parse(r.params) : null }));
    },
    /** Every result of the workspace without its params and data (newest first): small enough to search and page in memory. @param {string} ws */
    index: (ws) => all('SELECT id, kind, title, ref, created_at FROM records WHERE workspace_id = ? ORDER BY created_at DESC, id DESC', ws),
    remove: (ws, id) => void db.prepare('DELETE FROM records WHERE workspace_id = ? AND id = ?').run(ws, id),
    /** Undo a cancelled job: delete what it wrote. @param {number} jobId */
    removeByJob: (jobId) => void db.prepare('DELETE FROM records WHERE job_id = ?').run(jobId),
    latestByRef: (ws, kind, ref) => parse(one('SELECT * FROM records WHERE workspace_id = ? AND kind = ? AND ref = ? ORDER BY created_at DESC LIMIT 1', ws, kind, ref)),
    counts: (ws) => Object.fromEntries(all('SELECT kind, COUNT(*) n FROM records WHERE workspace_id = ? GROUP BY kind', ws).map((r) => [r.kind, r.n])),
  };
}
