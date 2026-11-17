// The idea board: batches and their cards.

/** @param {import('node:sqlite').DatabaseSync} db @param {() => number} [now] */
export function ideasRepo(db, now = Date.now) {
  const batch = (r) => (r ? { id: r.id, title: r.title, status: r.status, learned: r.learned ? JSON.parse(r.learned) : null, createdAt: r.created_at, closedAt: r.closed_at } : null);
  const card = (r) => (r ? { id: r.id, batchId: r.batch_id, status: r.status, data: JSON.parse(r.data), outline: r.outline ? JSON.parse(r.outline) : null, script: r.script ?? '', createdAt: r.created_at, updatedAt: r.updated_at } : null);
  return {
    openBatch: (ws) => batch(db.prepare("SELECT * FROM idea_batches WHERE workspace_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1").get(ws)),
    /** Newest first, with the number of live cards. @param {string} ws */
    listBatches: (ws) => /** @type {any[]} */ (db.prepare("SELECT b.*, (SELECT COUNT(*) FROM ideas i WHERE i.batch_id = b.id AND i.status != 'dropped') AS live FROM idea_batches b WHERE b.workspace_id = ? ORDER BY b.id DESC").all(ws)).map((r) => ({ ...batch(r), live: r.live })),
    getBatch: (ws, id) => batch(db.prepare('SELECT * FROM idea_batches WHERE workspace_id = ? AND id = ?').get(ws, id)),
    /** @returns {number} */
    addBatch: (ws, title) => Number(db.prepare('INSERT INTO idea_batches (workspace_id, title, created_at) VALUES (?, ?, ?)').run(ws, title, now()).lastInsertRowid),
    renameBatch: (ws, id, title) => void db.prepare('UPDATE idea_batches SET title = ? WHERE workspace_id = ? AND id = ?').run(title, ws, id),
    closeBatch: (ws, id, learned = null) => void db.prepare("UPDATE idea_batches SET status = 'closed', closed_at = ?, learned = COALESCE(?, learned) WHERE workspace_id = ? AND id = ?").run(now(), learned == null ? null : JSON.stringify(learned), ws, id),
    /** Oldest first, the order they were added. */
    cards: (ws, batchId) => /** @type {any[]} */ (db.prepare('SELECT * FROM ideas WHERE workspace_id = ? AND batch_id = ? ORDER BY id').all(ws, batchId)).map(card),
    getCard: (ws, id) => card(db.prepare('SELECT * FROM ideas WHERE workspace_id = ? AND id = ?').get(ws, id)),
    /** @returns {number} */
    addCard: (ws, batchId, status, data) => Number(db.prepare('INSERT INTO ideas (workspace_id, batch_id, status, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(ws, batchId, status, JSON.stringify(data), now(), now()).lastInsertRowid),
    saveCard: (ws, id, status, data) => void db.prepare('UPDATE ideas SET status = ?, data = ?, updated_at = ? WHERE workspace_id = ? AND id = ?').run(status, JSON.stringify(data), now(), ws, id),
    saveOutline: (ws, id, outline) => void db.prepare('UPDATE ideas SET outline = ?, updated_at = ? WHERE workspace_id = ? AND id = ?').run(JSON.stringify(outline), now(), ws, id),
    saveScript: (ws, id, script) => void db.prepare('UPDATE ideas SET script = ?, updated_at = ? WHERE workspace_id = ? AND id = ?').run(script, now(), ws, id),
    removeCard: (ws, id) => void db.prepare('DELETE FROM ideas WHERE workspace_id = ? AND id = ?').run(ws, id),
  };
}
