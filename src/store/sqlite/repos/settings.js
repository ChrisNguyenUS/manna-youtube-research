// Per-workspace settings; unknown keys are ignored, missing keys fall back to defaults.
export const DEFAULT_SETTINGS = { gl: 'US', concurrency: 4, delayMs: 200, minSubsForOutlier: 500, outlierMultiple: 3, globalRegions: 'US,GB,IN,CA,AU,PH,VN,ID', aiProvider: '', aiKey: '' };

/** @param {import('node:sqlite').DatabaseSync} db */
export function settingsRepo(db) {
  const repo = {
    /** @param {string} ws @returns {typeof DEFAULT_SETTINGS & Record<string, any>} */
    all(ws) {
      const out = { ...DEFAULT_SETTINGS };
      for (const r of /** @type {any[]} */ (db.prepare('SELECT key, value FROM settings WHERE workspace_id = ?').all(ws))) out[r.key] = JSON.parse(r.value);
      return out;
    },
    /** @param {string} ws @param {Record<string, any>} obj */
    set(ws, obj) {
      const st = db.prepare('INSERT OR REPLACE INTO settings (workspace_id, key, value) VALUES (?, ?, ?)');
      for (const [k, v] of Object.entries(obj)) if (k in DEFAULT_SETTINGS) st.run(ws, k, JSON.stringify(v));
      return repo.all(ws);
    },
  };
  return repo;
}
