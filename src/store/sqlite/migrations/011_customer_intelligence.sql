-- Customer Intelligence (docs/customer-intelligence/customer-intelligence-prd.md): one analysis run holds a frozen copy
-- of the comments it analyses, so every insight, Why node and opportunity can be traced back to a comment (ref C1, C2…)
-- and a source item (V1, V2…) of that run. AI output is stored apart from what the owner changed (user_* columns).
CREATE TABLE ci_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL DEFAULT 'local',
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | queued | running | complete | partial | failed
  config TEXT NOT NULL,                      -- snapshot of what was chosen (sources, limits, budget)
  stages TEXT NOT NULL DEFAULT '{}',         -- per stage: status, when, counts, error
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE ci_sources (
  run_id INTEGER NOT NULL REFERENCES ci_runs(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,                         -- V1, V2… (what prompts and the UI cite)
  platform TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  url TEXT,
  author TEXT,
  published_at TEXT,
  metrics TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (run_id, ref)
);
CREATE TABLE ci_comments (
  run_id INTEGER NOT NULL REFERENCES ci_runs(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,                         -- C1, C2…: the evidence id
  source_ref TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_id TEXT,
  parent_ref TEXT,
  text TEXT NOT NULL,                        -- as collected (mentions masked); never edited
  likes INTEGER,
  replies INTEGER,
  created_at TEXT,
  author_hash TEXT,                          -- only when the source gave an author; never the name
  fingerprint TEXT NOT NULL,
  duplicate_of TEXT,                         -- probable duplicate (same text, no platform id)
  PRIMARY KEY (run_id, ref)
);
CREATE TABLE ci_labels (
  run_id INTEGER NOT NULL REFERENCES ci_runs(id) ON DELETE CASCADE,
  ref TEXT NOT NULL,
  labels TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  spans TEXT NOT NULL DEFAULT '[]',
  confidence REAL,
  needs_review INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  model TEXT,
  prompt_version TEXT,
  user_labels TEXT,                          -- the owner's correction (kept apart from the AI's)
  irrelevant INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (run_id, ref)
);
CREATE TABLE ci_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ci_runs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  comment_refs TEXT NOT NULL DEFAULT '[]',
  origin TEXT NOT NULL DEFAULT 'ai',         -- ai | user
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE ci_pains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ci_runs(id) ON DELETE CASCADE,
  topic_id INTEGER NOT NULL REFERENCES ci_topics(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  statement TEXT NOT NULL DEFAULT '',
  comment_refs TEXT NOT NULL DEFAULT '[]',
  epistemic_status TEXT NOT NULL DEFAULT 'hypothesis',
  hidden INTEGER NOT NULL DEFAULT 0,
  origin TEXT NOT NULL DEFAULT 'ai',
  created_at INTEGER NOT NULL
);
CREATE TABLE ci_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ci_runs(id) ON DELETE CASCADE,
  pain_id INTEGER NOT NULL REFERENCES ci_pains(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'draft',       -- draft | needs_evidence | ready_for_analysis | validated_by_user | rejected
  data TEXT NOT NULL,
  validation TEXT,
  user_data TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE ci_why_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ci_runs(id) ON DELETE CASCADE,
  insight_id INTEGER NOT NULL REFERENCES ci_insights(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE ci_why_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  analysis_id INTEGER NOT NULL REFERENCES ci_why_analyses(id) ON DELETE CASCADE,
  parent_id INTEGER,
  depth INTEGER NOT NULL,
  data TEXT NOT NULL,
  user_status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | edited | rejected
  user_data TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE ci_briefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ci_runs(id) ON DELETE CASCADE,
  insight_id INTEGER NOT NULL REFERENCES ci_insights(id) ON DELETE CASCADE,
  why_node_ids TEXT NOT NULL DEFAULT '[]',
  data TEXT NOT NULL,
  user_data TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE ci_opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES ci_runs(id) ON DELETE CASCADE,
  brief_id INTEGER NOT NULL REFERENCES ci_briefs(id) ON DELETE CASCADE,
  insight_id INTEGER NOT NULL,
  data TEXT NOT NULL,
  score TEXT NOT NULL,                       -- computed in code: dims, weights, priority, coverage
  user_dims TEXT,                            -- dimensions the owner set (strategic fit…)
  evaluation TEXT,
  status TEXT NOT NULL DEFAULT 'suggested',  -- suggested | reviewed | approved | rejected | on_hold
  idea_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE ci_generations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER,
  stage TEXT NOT NULL,
  task TEXT NOT NULL,
  model TEXT,
  prompt_version TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  input_hash TEXT NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  latency_ms INTEGER,
  status TEXT NOT NULL,                      -- ok | error | invalid
  error TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX ci_generations_run ON ci_generations(run_id);
CREATE TABLE ci_cache (
  key TEXT PRIMARY KEY,
  output TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE ci_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before TEXT,
  after TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX ci_pains_run ON ci_pains(run_id);
CREATE INDEX ci_insights_run ON ci_insights(run_id);
CREATE INDEX ci_opps_run ON ci_opportunities(run_id);
