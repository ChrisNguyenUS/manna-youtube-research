-- One row per public TikTok comment (keyed by TikTok's own id), shared by every screen that collects comments.
-- Reports keep references ({"$c": id}) instead of copies; comment_links says which report collected which comment.
-- Commenter names are never stored (the parsers drop them).
CREATE TABLE comments (
  platform TEXT NOT NULL,             -- 'tiktok'
  comment_id TEXT NOT NULL,
  video_id TEXT,
  parent_id TEXT,                     -- the comment this one replies to
  text TEXT NOT NULL DEFAULT '',
  likes INTEGER,
  replies INTEGER,
  created_at TEXT,                    -- when the comment was written (ISO)
  data TEXT NOT NULL,                 -- the comment as last collected (JSON)
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (platform, comment_id)
);
CREATE INDEX comments_video ON comments(platform, video_id);
CREATE TABLE comment_links (
  record_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  comment_id TEXT NOT NULL,
  PRIMARY KEY (record_id, platform, comment_id)
);
CREATE INDEX comment_links_comment ON comment_links(platform, comment_id);
-- Small key/value marks for one-time data moves (e.g. moving comments out of old reports).
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
