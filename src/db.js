import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.YTR_DATA_DIR || path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'research.db'));
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY, data TEXT NOT NULL, about INTEGER DEFAULT 0, fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS channel_videos (
  channel_id TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS video_details (
  id TEXT PRIMARY KEY, data TEXT NOT NULL, fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,            -- video_search | channel_search | research | channel_analysis | comments | idea_check | keywords
  title TEXT NOT NULL,
  ref TEXT,                       -- channel id for analyses, video id for comments
  params TEXT,
  data TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS records_kind ON records(kind, created_at DESC);
CREATE TABLE IF NOT EXISTS saved (
  kind TEXT NOT NULL, ref TEXT NOT NULL, title TEXT, note TEXT, data TEXT, created_at INTEGER NOT NULL,
  PRIMARY KEY (kind, ref)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);

const now = () => Date.now();
const DAY = 86400000;

export const cache = {
  getChannel(id, { maxAgeDays = 3, needAbout = false } = {}) {
    const r = db.prepare('SELECT data, about, fetched_at FROM channels WHERE id = ?').get(id);
    if (!r || now() - r.fetched_at > maxAgeDays * DAY || (needAbout && !r.about)) return null;
    return JSON.parse(r.data);
  },
  putChannel(info, about) {
    db.prepare('INSERT OR REPLACE INTO channels (id, data, about, fetched_at) VALUES (?, ?, ?, ?)').run(info.id, JSON.stringify(info), about ? 1 : 0, now());
  },
  getChannelVideos(id, { maxAgeDays = 1, min = 0 } = {}) {
    const r = db.prepare('SELECT data, fetched_at FROM channel_videos WHERE channel_id = ?').get(id);
    if (!r || now() - r.fetched_at > maxAgeDays * DAY) return null;
    const list = JSON.parse(r.data);
    return list.length >= min ? list : null;
  },
  putChannelVideos(id, list) {
    db.prepare('INSERT OR REPLACE INTO channel_videos (channel_id, data, fetched_at) VALUES (?, ?, ?)').run(id, JSON.stringify(list), now());
  },
  getVideo(id, { maxAgeDays = 7 } = {}) {
    const r = db.prepare('SELECT data, fetched_at FROM video_details WHERE id = ?').get(id);
    if (!r || now() - r.fetched_at > maxAgeDays * DAY) return null;
    return JSON.parse(r.data);
  },
  putVideo(d) {
    db.prepare('INSERT OR REPLACE INTO video_details (id, data, fetched_at) VALUES (?, ?, ?)').run(d.id, JSON.stringify(d), now());
  },
};

export const records = {
  add(kind, title, { ref = null, params = null, data = null } = {}) {
    const r = db.prepare('INSERT INTO records (kind, title, ref, params, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(kind, title, ref, JSON.stringify(params), JSON.stringify(data), now());
    return Number(r.lastInsertRowid);
  },
  update(id, data) {
    db.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
  },
  get(id) {
    const r = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
    return r && { ...r, params: JSON.parse(r.params), data: JSON.parse(r.data) };
  },
  latestByRef(kind, ref) {
    const r = db.prepare('SELECT * FROM records WHERE kind = ? AND ref = ? ORDER BY created_at DESC LIMIT 1').get(kind, ref);
    return r && { ...r, params: JSON.parse(r.params), data: JSON.parse(r.data) };
  },
  list(kind, limit = 50) {
    const rows = kind
      ? db.prepare('SELECT id, kind, title, ref, params, created_at FROM records WHERE kind = ? ORDER BY created_at DESC LIMIT ?').all(kind, limit)
      : db.prepare('SELECT id, kind, title, ref, params, created_at FROM records ORDER BY created_at DESC LIMIT ?').all(limit);
    return rows.map((r) => ({ ...r, params: JSON.parse(r.params) }));
  },
  remove(id) {
    db.prepare('DELETE FROM records WHERE id = ?').run(id);
  },
  counts() {
    return Object.fromEntries(db.prepare('SELECT kind, COUNT(*) n FROM records GROUP BY kind').all().map((r) => [r.kind, r.n]));
  },
};

export const saved = {
  list(kind) {
    const rows = kind ? db.prepare('SELECT * FROM saved WHERE kind = ? ORDER BY created_at DESC').all(kind) : db.prepare('SELECT * FROM saved ORDER BY created_at DESC').all();
    return rows.map((r) => ({ ...r, data: JSON.parse(r.data) }));
  },
  put(kind, ref, title, data, note = '') {
    db.prepare('INSERT OR REPLACE INTO saved (kind, ref, title, note, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(kind, ref, title, note, JSON.stringify(data), now());
  },
  note(kind, ref, note) {
    db.prepare('UPDATE saved SET note = ? WHERE kind = ? AND ref = ?').run(note, kind, ref);
  },
  remove(kind, ref) {
    db.prepare('DELETE FROM saved WHERE kind = ? AND ref = ?').run(kind, ref);
  },
  keys() {
    return db.prepare('SELECT kind, ref FROM saved').all().map((r) => `${r.kind}:${r.ref}`);
  },
};

export const DEFAULT_SETTINGS = { gl: 'US', concurrency: 4, delayMs: 200, minSubsForOutlier: 500, outlierMultiple: 3, aiProvider: '', aiKey: '' };
export const settingsStore = {
  all() {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const out = { ...DEFAULT_SETTINGS };
    for (const r of rows) out[r.key] = JSON.parse(r.value);
    return out;
  },
  set(obj) {
    const st = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(obj)) if (k in DEFAULT_SETTINGS) st.run(k, JSON.stringify(v));
    return this.all();
  },
};
