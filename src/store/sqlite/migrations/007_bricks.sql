-- The brick library: one row per video broken into bricks by the model. `source` is what the model saw (transcript
-- lines, comment sample), `data` its bricks, `edited` the owner's corrections on top (path → value), `deep_dive` the
-- optional 8-step analysis.
CREATE TABLE bricks (
  workspace_id TEXT NOT NULL DEFAULT 'local',
  platform TEXT NOT NULL,             -- 'tiktok' | 'youtube'
  video_id TEXT NOT NULL,
  channel_ref TEXT NOT NULL DEFAULT '',   -- 'tiktok:username' | 'youtube:channelId'
  meta TEXT NOT NULL DEFAULT '{}',
  source TEXT NOT NULL DEFAULT '{}',
  data TEXT NOT NULL,
  edited TEXT NOT NULL DEFAULT '{}',
  deep_dive TEXT,
  model TEXT NOT NULL DEFAULT '',
  schema_version INTEGER NOT NULL DEFAULT 1,
  analyzed_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, platform, video_id)
);
CREATE INDEX bricks_channel ON bricks(workspace_id, channel_ref);
