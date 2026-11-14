-- Followed channels (YouTube and TikTok): what the user follows, and what the last "Cập nhật" found.
CREATE TABLE follows (
  workspace_id TEXT NOT NULL DEFAULT 'local',
  platform TEXT NOT NULL,             -- 'youtube' | 'tiktok'
  ref TEXT NOT NULL,                  -- YouTube channel id | TikTok username (lower case)
  title TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '{}',    -- small snapshot: avatar, handle, followers, typical views
  seen TEXT NOT NULL DEFAULT '[]',    -- video ids already shown, to tell what is new
  last_scan TEXT,                     -- JSON: latest videos with scores, new ids, error
  checked_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, platform, ref)
);
