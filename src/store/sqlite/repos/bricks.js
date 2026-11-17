// The brick library: one row per video. A re-extract replaces what the model wrote and keeps the owner's edits and
// the deep dive.

/** @param {import('node:sqlite').DatabaseSync} db @param {() => number} [now] */
export function bricksRepo(db, now = Date.now) {
  const row = (r) => (r ? {
    platform: r.platform, videoId: r.video_id, channelRef: r.channel_ref, meta: JSON.parse(r.meta), source: JSON.parse(r.source), data: JSON.parse(r.data),
    edited: JSON.parse(r.edited), deepDive: r.deep_dive ? JSON.parse(r.deep_dive) : null, model: r.model, analyzedAt: r.analyzed_at,
  } : null);
  return {
    /** Newest first. @param {string} ws */
    list: (ws) => /** @type {any[]} */ (db.prepare('SELECT * FROM bricks WHERE workspace_id = ? ORDER BY analyzed_at DESC, video_id').all(ws)).map(row),
    get: (ws, platform, videoId) => row(db.prepare('SELECT * FROM bricks WHERE workspace_id = ? AND platform = ? AND video_id = ?').get(ws, platform, String(videoId))),
    /** @param {string} ws @param {{platform: string, videoId: string, channelRef: string, meta: any, source: any, data: any, model: string}} r */
    put(ws, r) {
      db.prepare(`INSERT INTO bricks (workspace_id, platform, video_id, channel_ref, meta, source, data, model, analyzed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (workspace_id, platform, video_id) DO UPDATE SET channel_ref = excluded.channel_ref, meta = excluded.meta, source = excluded.source, data = excluded.data, model = excluded.model, analyzed_at = excluded.analyzed_at`)
        .run(ws, r.platform, String(r.videoId), r.channelRef, JSON.stringify(r.meta), JSON.stringify(r.source), JSON.stringify(r.data), r.model, now());
    },
    setEdited: (ws, platform, videoId, edited) => void db.prepare('UPDATE bricks SET edited = ? WHERE workspace_id = ? AND platform = ? AND video_id = ?').run(JSON.stringify(edited), ws, platform, String(videoId)),
    setDeepDive: (ws, platform, videoId, deepDive) => void db.prepare('UPDATE bricks SET deep_dive = ? WHERE workspace_id = ? AND platform = ? AND video_id = ?').run(JSON.stringify(deepDive), ws, platform, String(videoId)),
    remove: (ws, platform, videoId) => void db.prepare('DELETE FROM bricks WHERE workspace_id = ? AND platform = ? AND video_id = ?').run(ws, platform, String(videoId)),
  };
}
