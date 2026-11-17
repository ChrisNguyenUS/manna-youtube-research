-- Soulprint: the root profile of the owner's content (game, avatar, pains, statement, pillars…). One row per workspace.
CREATE TABLE soulprint (
  workspace_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,                 -- the profile (JSON), already cleaned by core/soulprint/profile.js
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
