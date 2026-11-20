// Customer Intelligence: runs and everything derived from them (migration 011). JSON columns are parsed here;
// the use case (features/ci.js) never sees SQL.

const J = (v, fallback = null) => (v == null ? fallback : JSON.parse(v));
const S = (v) => (v == null ? null : JSON.stringify(v));
const CHUNK = 300;

/** @param {import('node:sqlite').DatabaseSync} db @param {() => number} [now] */
export function ciRepo(db, now = Date.now) {
  const run = (r) => (r ? { id: r.id, title: r.title, status: r.status, config: J(r.config, {}), stages: J(r.stages, {}), createdAt: r.created_at, updatedAt: r.updated_at } : null);
  const source = (r) => ({ ref: r.ref, platform: r.platform, externalId: r.external_id, title: r.title, url: r.url, author: r.author, publishedAt: r.published_at, metrics: J(r.metrics, {}) });
  const comment = (r) => ({
    ref: r.ref, sourceRef: r.source_ref, platform: r.platform, externalId: r.external_id, parentRef: r.parent_ref, text: r.text,
    likes: r.likes, replies: r.replies, createdAt: r.created_at, authorHash: r.author_hash, fingerprint: r.fingerprint, duplicateOf: r.duplicate_of,
  });
  const label = (r) => ({
    ref: r.ref, labels: J(r.labels, {}), summary: r.summary, spans: J(r.spans, []), confidence: r.confidence, needsReview: !!r.needs_review, reason: r.reason,
    model: r.model, promptVersion: r.prompt_version, userLabels: J(r.user_labels), irrelevant: !!r.irrelevant,
  });
  const topic = (r) => (r ? { id: r.id, runId: r.run_id, key: r.key, name: r.name, description: r.description, refs: J(r.comment_refs, []), origin: r.origin, hidden: !!r.hidden, createdAt: r.created_at } : null);
  const pain = (r) => (r ? { id: r.id, runId: r.run_id, topicId: r.topic_id, key: r.key, title: r.title, statement: r.statement, refs: J(r.comment_refs, []), status: r.epistemic_status, hidden: !!r.hidden, origin: r.origin, createdAt: r.created_at } : null);
  const insight = (r) => (r ? { id: r.id, runId: r.run_id, painId: r.pain_id, state: r.state, data: J(r.data, {}), validation: J(r.validation), userData: J(r.user_data), createdAt: r.created_at, updatedAt: r.updated_at } : null);
  const analysis = (r) => (r ? { id: r.id, runId: r.run_id, insightId: r.insight_id, data: J(r.data, {}), createdAt: r.created_at, updatedAt: r.updated_at } : null);
  const node = (r) => (r ? { id: r.id, analysisId: r.analysis_id, parentId: r.parent_id, depth: r.depth, data: J(r.data, {}), userStatus: r.user_status, userData: J(r.user_data), createdAt: r.created_at, updatedAt: r.updated_at } : null);
  const brief = (r) => (r ? { id: r.id, runId: r.run_id, insightId: r.insight_id, whyNodeIds: J(r.why_node_ids, []), data: J(r.data, {}), userData: J(r.user_data), createdAt: r.created_at, updatedAt: r.updated_at } : null);
  const opp = (r) => (r ? { id: r.id, runId: r.run_id, briefId: r.brief_id, insightId: r.insight_id, data: J(r.data, {}), score: J(r.score, {}), userDims: J(r.user_dims), evaluation: J(r.evaluation), status: r.status, ideaId: r.idea_id, createdAt: r.created_at, updatedAt: r.updated_at } : null);
  const gen = (r) => ({ id: r.id, runId: r.run_id, stage: r.stage, task: r.task, model: r.model, promptVersion: r.prompt_version, schemaVersion: r.schema_version, inputHash: r.input_hash, cacheHit: !!r.cache_hit, tokensIn: r.tokens_in, tokensOut: r.tokens_out, costUsd: r.cost_usd, latencyMs: r.latency_ms, status: r.status, error: r.error, createdAt: r.created_at });
  const all = (sql, ...a) => /** @type {any[]} */ (db.prepare(sql).all(...a));
  const one = (sql, ...a) => /** @type {any} */ (db.prepare(sql).get(...a));
  const exec = (sql, ...a) => db.prepare(sql).run(...a);
  const id = (r) => Number(r.lastInsertRowid);

  function tx(fn) {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  return {
    tx,
    // ---------- runs ----------
    addRun: (ws, title, config) => id(exec('INSERT INTO ci_runs (workspace_id, title, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', ws, title, S(config), now(), now())),
    getRun: (ws, runId) => run(one('SELECT * FROM ci_runs WHERE workspace_id = ? AND id = ?', ws, runId)),
    listRuns: (ws) => all('SELECT * FROM ci_runs WHERE workspace_id = ? ORDER BY id DESC', ws).map(run),
    saveRun: (ws, runId, { title, status, config, stages }) => void exec('UPDATE ci_runs SET title = COALESCE(?, title), status = COALESCE(?, status), config = COALESCE(?, config), stages = COALESCE(?, stages), updated_at = ? WHERE workspace_id = ? AND id = ?', title ?? null, status ?? null, S(config), S(stages), now(), ws, runId),
    removeRun: (ws, runId) => void exec('DELETE FROM ci_runs WHERE workspace_id = ? AND id = ?', ws, runId),

    // ---------- sources & comments (written once, at ingest) ----------
    addSource: (runId, s) => void exec('INSERT INTO ci_sources (run_id, ref, platform, external_id, title, url, author, published_at, metrics) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', runId, s.ref, s.platform, s.externalId ?? null, s.title ?? '', s.url ?? null, s.author ?? null, s.publishedAt ?? null, S(s.metrics ?? {})),
    sources: (runId) => all('SELECT * FROM ci_sources WHERE run_id = ? ORDER BY rowid', runId).map(source),
    addComment: (runId, c) => void exec('INSERT INTO ci_comments (run_id, ref, source_ref, platform, external_id, parent_ref, text, likes, replies, created_at, author_hash, fingerprint, duplicate_of) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      runId, c.ref, c.sourceRef, c.platform, c.externalId ?? null, c.parentRef ?? null, c.text, c.likes ?? null, c.replies ?? null, c.createdAt ?? null, c.authorHash ?? null, c.fingerprint, c.duplicateOf ?? null),
    comments: (runId) => all('SELECT * FROM ci_comments WHERE run_id = ? ORDER BY rowid', runId).map(comment),
    commentCount: (runId) => Number(one('SELECT COUNT(*) AS n FROM ci_comments WHERE run_id = ?', runId).n),

    // ---------- labels ----------
    saveLabel: (runId, l) => void exec(`INSERT INTO ci_labels (run_id, ref, labels, summary, spans, confidence, needs_review, reason, model, prompt_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (run_id, ref) DO UPDATE SET labels = excluded.labels, summary = excluded.summary, spans = excluded.spans, confidence = excluded.confidence,
        needs_review = excluded.needs_review, reason = excluded.reason, model = excluded.model, prompt_version = excluded.prompt_version`,
      runId, l.ref, S(l.labels), l.summary ?? '', S(l.spans ?? []), l.confidence ?? null, l.needsReview ? 1 : 0, l.reason ?? '', l.model ?? null, l.promptVersion ?? null),
    labels: (runId) => all('SELECT * FROM ci_labels WHERE run_id = ?', runId).map(label),
    saveUserLabel: (runId, ref, userLabels, irrelevant) => void exec(`INSERT INTO ci_labels (run_id, ref, labels, user_labels, irrelevant) VALUES (?, ?, '{}', ?, ?)
        ON CONFLICT (run_id, ref) DO UPDATE SET user_labels = excluded.user_labels, irrelevant = excluded.irrelevant`, runId, ref, S(userLabels), irrelevant ? 1 : 0),
    clearLabels: (runId) => void exec('DELETE FROM ci_labels WHERE run_id = ? AND user_labels IS NULL AND irrelevant = 0', runId),

    // ---------- topics & pains ----------
    clearTopics: (runId) => void exec("DELETE FROM ci_topics WHERE run_id = ?", runId),
    addTopic: (runId, t) => id(exec('INSERT INTO ci_topics (run_id, key, name, description, comment_refs, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', runId, t.key, t.name, t.description ?? '', S(t.refs ?? []), t.origin ?? 'ai', now())),
    topics: (runId) => all('SELECT * FROM ci_topics WHERE run_id = ? ORDER BY id', runId).map(topic),
    getTopic: (topicId) => topic(one('SELECT * FROM ci_topics WHERE id = ?', topicId)),
    saveTopic: (topicId, t) => void exec('UPDATE ci_topics SET name = COALESCE(?, name), description = COALESCE(?, description), comment_refs = COALESCE(?, comment_refs), hidden = COALESCE(?, hidden), origin = COALESCE(?, origin) WHERE id = ?',
      t.name ?? null, t.description ?? null, S(t.refs), t.hidden == null ? null : t.hidden ? 1 : 0, t.origin ?? null, topicId),
    removeTopic: (topicId) => void exec('DELETE FROM ci_topics WHERE id = ?', topicId),
    addPain: (runId, p) => id(exec('INSERT INTO ci_pains (run_id, topic_id, key, title, statement, comment_refs, epistemic_status, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', runId, p.topicId, p.key, p.title, p.statement ?? '', S(p.refs ?? []), p.status ?? 'hypothesis', p.origin ?? 'ai', now())),
    pains: (runId) => all('SELECT * FROM ci_pains WHERE run_id = ? ORDER BY id', runId).map(pain),
    getPain: (painId) => pain(one('SELECT * FROM ci_pains WHERE id = ?', painId)),
    savePain: (painId, p) => void exec('UPDATE ci_pains SET topic_id = COALESCE(?, topic_id), title = COALESCE(?, title), statement = COALESCE(?, statement), comment_refs = COALESCE(?, comment_refs), hidden = COALESCE(?, hidden), origin = COALESCE(?, origin) WHERE id = ?',
      p.topicId ?? null, p.title ?? null, p.statement ?? null, S(p.refs), p.hidden == null ? null : p.hidden ? 1 : 0, p.origin ?? null, painId),

    // ---------- insights ----------
    addInsight: (runId, painId, state, data) => id(exec('INSERT INTO ci_insights (run_id, pain_id, state, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', runId, painId, state, S(data), now(), now())),
    insights: (runId) => all('SELECT * FROM ci_insights WHERE run_id = ? ORDER BY id', runId).map(insight),
    getInsight: (insightId) => insight(one('SELECT * FROM ci_insights WHERE id = ?', insightId)),
    insightOfPain: (painId) => insight(one('SELECT * FROM ci_insights WHERE pain_id = ? ORDER BY id DESC LIMIT 1', painId)),
    saveInsight: (insightId, { state, data, validation, userData }) => void exec('UPDATE ci_insights SET state = COALESCE(?, state), data = COALESCE(?, data), validation = COALESCE(?, validation), user_data = COALESCE(?, user_data), updated_at = ? WHERE id = ?',
      state ?? null, S(data), S(validation), S(userData), now(), insightId),
    removeInsightsOfRun: (runId) => void exec('DELETE FROM ci_insights WHERE run_id = ?', runId),

    // ---------- 5 Whys ----------
    addAnalysis: (runId, insightId, data) => id(exec('INSERT INTO ci_why_analyses (run_id, insight_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', runId, insightId, S(data), now(), now())),
    analyses: (insightId) => all('SELECT * FROM ci_why_analyses WHERE insight_id = ? ORDER BY id DESC', insightId).map(analysis),
    analysesOfRun: (runId) => all('SELECT * FROM ci_why_analyses WHERE run_id = ? ORDER BY id DESC', runId).map(analysis),
    getAnalysis: (analysisId) => analysis(one('SELECT * FROM ci_why_analyses WHERE id = ?', analysisId)),
    saveAnalysis: (analysisId, data) => void exec('UPDATE ci_why_analyses SET data = ?, updated_at = ? WHERE id = ?', S(data), now(), analysisId),
    addNode: (analysisId, parentId, depth, data) => id(exec('INSERT INTO ci_why_nodes (analysis_id, parent_id, depth, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', analysisId, parentId ?? null, depth, S(data), now(), now())),
    nodes: (analysisId) => all('SELECT * FROM ci_why_nodes WHERE analysis_id = ? ORDER BY depth, id', analysisId).map(node),
    getNode: (nodeId) => node(one('SELECT * FROM ci_why_nodes WHERE id = ?', nodeId)),
    saveNode: (nodeId, { userStatus, userData }) => void exec('UPDATE ci_why_nodes SET user_status = COALESCE(?, user_status), user_data = COALESCE(?, user_data), updated_at = ? WHERE id = ?', userStatus ?? null, S(userData), now(), nodeId),

    // ---------- briefs & opportunities ----------
    addBrief: (runId, insightId, whyNodeIds, data) => id(exec('INSERT INTO ci_briefs (run_id, insight_id, why_node_ids, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', runId, insightId, S(whyNodeIds), S(data), now(), now())),
    briefs: (runId) => all('SELECT * FROM ci_briefs WHERE run_id = ? ORDER BY id DESC', runId).map(brief),
    getBrief: (briefId) => brief(one('SELECT * FROM ci_briefs WHERE id = ?', briefId)),
    saveBrief: (briefId, userData) => void exec('UPDATE ci_briefs SET user_data = ?, updated_at = ? WHERE id = ?', S(userData), now(), briefId),
    addOpportunity: (runId, briefId, insightId, data, score) => id(exec('INSERT INTO ci_opportunities (run_id, brief_id, insight_id, data, score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', runId, briefId, insightId, S(data), S(score), now(), now())),
    opportunities: (runId) => all('SELECT * FROM ci_opportunities WHERE run_id = ? ORDER BY id DESC', runId).map(opp),
    getOpportunity: (oppId) => opp(one('SELECT * FROM ci_opportunities WHERE id = ?', oppId)),
    saveOpportunity: (oppId, { status, score, userDims, evaluation, ideaId }) => void exec('UPDATE ci_opportunities SET status = COALESCE(?, status), score = COALESCE(?, score), user_dims = COALESCE(?, user_dims), evaluation = COALESCE(?, evaluation), idea_id = COALESCE(?, idea_id), updated_at = ? WHERE id = ?',
      status ?? null, S(score), S(userDims), S(evaluation), ideaId ?? null, now(), oppId),

    // ---------- AI usage, cache, feedback ----------
    addGeneration: (g) => void exec('INSERT INTO ci_generations (run_id, stage, task, model, prompt_version, schema_version, input_hash, cache_hit, tokens_in, tokens_out, cost_usd, latency_ms, status, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      g.runId ?? null, g.stage, g.task, g.model ?? null, g.promptVersion, g.schemaVersion, g.inputHash, g.cacheHit ? 1 : 0, g.tokensIn ?? null, g.tokensOut ?? null, g.costUsd ?? null, g.latencyMs ?? null, g.status, g.error ?? null, now()),
    generations: (runId, limit = 500) => all('SELECT * FROM ci_generations WHERE run_id = ? ORDER BY id DESC LIMIT ?', runId, limit).map(gen),
    spent: (runId) => Number(one('SELECT COALESCE(SUM(cost_usd), 0) AS c FROM ci_generations WHERE run_id = ?', runId).c),
    cacheGet: (key) => {
      const r = one('SELECT output FROM ci_cache WHERE key = ?', key);
      return r ? JSON.parse(r.output) : undefined;
    },
    /** Several keys at once (chunked). @param {string[]} keys @returns {Map<string, any>} */
    cacheMany: (keys) => {
      const out = new Map();
      for (let i = 0; i < keys.length; i += CHUNK) {
        const part = keys.slice(i, i + CHUNK);
        for (const r of all(`SELECT key, output FROM ci_cache WHERE key IN (${part.map(() => '?').join(',')})`, ...part)) out.set(r.key, JSON.parse(r.output));
      }
      return out;
    },
    cacheSet: (key, output) => void exec('INSERT INTO ci_cache (key, output, created_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET output = excluded.output, created_at = excluded.created_at', key, S(output), now()),
    addFeedback: (runId, entity, entityId, action, before, after) => void exec('INSERT INTO ci_feedback (run_id, entity, entity_id, action, before, after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', runId ?? null, entity, String(entityId), action, S(before), S(after), now()),
  };
}
