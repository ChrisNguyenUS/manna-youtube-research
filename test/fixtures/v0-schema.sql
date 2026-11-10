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
