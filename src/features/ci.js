// Use case: Customer Intelligence & Content Opportunity Engine (docs/customer-intelligence/customer-intelligence-prd.md).
// Source data → comment intelligence → topics & pain points → evidence-backed insight → 5 Whys → 5W1H brief →
// content opportunities → idea board. Code counts, dedups and scores; the model labels, groups and reasons, and every
// answer it gives is checked against the IDs it was shown (core/ci/checks.js). Bulk stages run as the ci_analyze job;
// 5 Whys, briefs and opportunities run only when the owner asks (lazy reasoning).
import { noop } from './shared.js';
import { rethrowIfCancelled } from '../core/cancel.js';
import { aiError, DEFAULT_MODEL } from '../core/ai/base.js';
import { FATAL, pool } from './ai/run.js';
import { PROMPT_VERSION, SCHEMA_VERSION, DIM_KEYS, LABEL_VI, DIM_VI, INSIGHT_STATES, NODE_STATUSES, OPP_STATUSES, WEIGHTS, DIM_SCORE_VI, STAGES, STAGE_VI, EPISTEMIC_VI, INSIGHT_STATE_VI, OPPORTUNITY_TYPE_VI, STRENGTH_VI, STOP_VI, effectiveLabels, bandOf } from '../core/ci/taxonomy.js';
import { ciRequest, TIER } from '../core/ci/prompts.js';
import { normalizeSources, parseManualImport, analysable, hashOf, PLATFORMS } from '../core/ci/ingest.js';
import { checkClassify, checkDiscover, checkAssign, checkInsights, checkValidation, checkWhys, checkBrief, checkOpportunities, checkEvaluation, slug } from '../core/ci/checks.js';
import { countsOf, evidenceStrength, scoreDims, priorityOf } from '../core/ci/stats.js';

const PARALLEL = 3;
const LIMITS = { batchChars: 7000, batchMax: 40, discoverSample: 220, discoverChars: 32000, assignBatch: 60, maxTopics: 10, maxPains: 4, insightEvidence: 40, whyEvidence: 40, maxOpps: 5, pageSize: 50 };
const invalid = (message, field) => Object.assign(new Error(message), { code: 'invalid_input', field });
const notFound = (message) => Object.assign(new Error(message), { code: 'not_found' });
const short = (t, n) => (String(t ?? '').length > n ? `${String(t).slice(0, n - 1)}…` : String(t ?? ''));
const uniq = (a) => [...new Set(a)];

/**
 * @param {{repo: any, ws: string, llm: import('../ports/llm.js').LlmClient, settings: () => Record<string, any>, now?: () => number,
 *   data: {tiktokVideos: () => any[], tiktokComments: (ids: string[]) => {videos: any[], comments: any[]}, youtubeVideos: () => any[], youtubeComments: (ids: string[]) => {videos: any[], comments: any[]}},
 *   profileText?: () => string, ideas?: () => {create: (o: {from: string}) => any}}} deps
 */
export function makeCustomerIntelligence({ repo, ws, llm, settings, now = Date.now, data, profileText = () => '', ideas }) {
  // ---------- runs ----------
  function runOf(id) {
    const r = Number.isInteger(Number(id)) ? repo.getRun(ws, Number(id)) : null;
    if (!r) throw notFound('Không thấy lần phân tích này');
    return r;
  }
  const insightOf = (id) => repo.getInsight(Number(id)) ?? (() => { throw notFound('Không thấy insight này'); })();
  const own = (runId) => runOf(runId); // every entity is reached through a run of this workspace

  /** What can be analysed: videos with collected comments on both platforms. */
  function available() {
    const pick = (v) => ({ id: v.id, caption: v.caption, author: v.author, url: v.url, total: v.total ?? (v.parents ?? 0) + (v.replies ?? 0), lastSeen: v.lastSeen });
    return { tiktok: data.tiktokVideos().map(pick), youtube: data.youtubeVideos().map(pick), ai: llm.ready(), platforms: PLATFORMS };
  }

  /** Chosen videos + pasted data → normalised inputs. */
  function gather(input) {
    const inputs = [];
    const add = (platform, read, ids) => {
      if (!ids.length) return;
      const { videos, comments } = read(ids);
      for (const v of videos) inputs.push({ platform, video: { ...v, title: v.caption ?? v.title }, comments: comments.filter((c) => String(c.videoId) === String(v.id)).map((c) => ({ id: c.id, text: c.text, likes: c.likes, replies: c.replies, parentId: c.parentId, isReply: c.isReply, createdAt: c.createdAt })) });
    };
    const ids = (v) => uniq(String(v ?? '').split(/[\s,]+/).filter(Boolean)).slice(0, 200);
    add('tiktok', data.tiktokComments, ids(input.tiktok));
    add('youtube', data.youtubeComments, ids(input.youtube));
    let manual = { rows: 0, errors: /** @type {string[]} */ ([]) };
    if (String(input.manualText ?? '').trim()) {
      const m = parseManualImport(input.manualText, input.manualPlatform || 'other');
      inputs.push(...m.inputs);
      manual = { rows: m.rows, errors: m.errors };
    }
    const opts = { maxComments: Math.min(Number(input.maxComments) || 3000, 10000), includeReplies: input.includeReplies !== false, minLikes: Math.max(0, Number(input.minLikes) || 0) };
    return { inputs, manual, opts };
  }

  /** Stage 0: what would be processed, before anything is saved. */
  function preview(input = {}) {
    const { inputs, manual, opts } = gather(input);
    const n = normalizeSources(inputs, opts);
    const usable = analysable(n.comments);
    const chars = usable.reduce((s, c) => s + c.text.length, 0);
    return {
      sources: n.sources.map((s) => ({ ref: s.ref, platform: s.platform, title: s.title, comments: n.comments.filter((c) => c.sourceRef === s.ref).length })),
      comments: n.comments.length, analysable: usable.length, duplicates: n.comments.length - usable.length, skipped: n.skipped,
      authorsKnown: n.comments.length > 0 && n.comments.every((c) => c.authorHash), manual,
      workload: { classifyBatches: Math.ceil(chars / LIMITS.batchChars) || 0, approxTokens: Math.ceil(chars / 3) }, ai: llm.ready(),
    };
  }

  /** Stage 0 + 1: save the run and its frozen dataset (code only). */
  function createRun(input = {}) {
    const { inputs, manual, opts } = gather(input);
    if (manual.errors.length && !inputs.length) throw invalid(manual.errors[0], 'manualText');
    const n = normalizeSources(inputs, opts);
    if (!n.comments.length) throw invalid('Không có comment nào có chữ trong dữ liệu đã chọn', 'sources');
    const platforms = uniq(n.sources.map((s) => s.platform));
    const title = String(input.title ?? '').trim().slice(0, 120) || `${platforms.map((p) => p[0].toUpperCase() + p.slice(1)).join(' + ')} · ${n.sources.length} nguồn · ${n.comments.length} comment`;
    const config = {
      platforms, sourceIds: { tiktok: input.tiktok ?? '', youtube: input.youtube ?? '' }, manualRows: manual.rows, ...opts,
      industry: String(input.industry ?? '').trim().slice(0, 120) || null, goals: Array.isArray(input.goals) ? input.goals.slice(0, 6) : ['educate', 'build_trust', 'qualified_leads'],
      budgetUsd: input.budgetUsd == null || input.budgetUsd === '' ? null : Math.max(0, Number(input.budgetUsd)), skipped: n.skipped,
    };
    const id = repo.tx(() => {
      const runId = repo.addRun(ws, title, config);
      for (const s of n.sources) repo.addSource(runId, s);
      for (const c of n.comments) repo.addComment(runId, c);
      repo.saveRun(ws, runId, { stages: { ingest: { status: 'complete', at: now(), sources: n.sources.length, comments: n.comments.length, duplicates: n.comments.filter((c) => c.duplicateOf).length } } });
      return runId;
    });
    return runSummary(repo.getRun(ws, id));
  }

  function runSummary(r) {
    const comments = repo.comments(r.id);
    const usable = analysable(comments);
    const labels = repo.labels(r.id);
    return {
      ...r, sources: repo.sources(r.id).length, comments: comments.length, analysable: usable.length,
      uniqueCommenters: usable.length && usable.every((c) => c.authorHash) ? new Set(usable.map((c) => c.authorHash)).size : null,
      labelled: labels.filter((l) => l.promptVersion).length, topics: repo.topics(r.id).filter((t) => !t.hidden).length,
      insights: repo.insights(r.id).length, opportunities: repo.opportunities(r.id).length, spentUsd: repo.spent(r.id),
    };
  }
  const runs = () => repo.listRuns(ws).map(runSummary);
  function rename(runId, title) {
    own(runId);
    repo.saveRun(ws, Number(runId), { title: String(title ?? '').trim().slice(0, 120) || undefined });
    return runSummary(runOf(runId));
  }
  function removeRun(runId) {
    own(runId);
    repo.removeRun(ws, Number(runId));
    return { ok: true };
  }

  // ---------- model calls: routing, budget, cache, usage log ----------
  function modelFor(mode) {
    const s = settings();
    const tier = TIER[mode];
    const pick = tier === 'tag' ? s.aiTagModel : tier === 'reason' ? s.ciReasonModel || s.aiWriteModel : s.aiWriteModel;
    return String(pick || '').trim() || DEFAULT_MODEL;
  }
  function checkBudget(run) {
    const b = run.config?.budgetUsd;
    if (b != null && b > 0 && repo.spent(run.id) >= b) throw aiError('ci_budget', `Đã chạm ngân sách AI của lần phân tích này ($${b}). Tăng ngân sách ở Lịch sử & AI để chạy tiếp.`);
  }
  /** One model call with the cache and the usage log. Returns the raw JSON (cleaned by the caller). */
  async function ask(run, stage, mode, envelope, vars = {}, { cache = true } = {}) {
    if (!llm.ready()) throw aiError('llm_no_key', 'Chưa nhập API key OpenRouter. Vào Cài đặt để nhập.');
    checkBudget(run);
    const model = modelFor(mode);
    const req = ciRequest(/** @type {any} */ (mode), envelope, vars);
    const inputHash = hashOf([req.system, req.user]);
    const key = hashOf([mode, PROMPT_VERSION, SCHEMA_VERSION, model, inputHash]);
    const base = { runId: run.id, stage, task: mode, model, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION, inputHash };
    if (cache) {
      const hit = repo.cacheGet(key);
      if (hit !== undefined) {
        repo.addGeneration({ ...base, cacheHit: true, tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0, status: 'ok' });
        return hit;
      }
    }
    const t0 = now();
    try {
      const r = await llm.complete({ ...req, model });
      repo.addGeneration({ ...base, model: r.model || model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd, latencyMs: now() - t0, status: 'ok' });
      if (cache) repo.cacheSet(key, r.json);
      return r.json;
    } catch (e) {
      rethrowIfCancelled(e);
      repo.addGeneration({ ...base, latencyMs: now() - t0, status: 'error', error: String(e?.message || e).slice(0, 300) });
      throw e;
    }
  }
  /** One retry for a bad answer or a busy provider; never for a missing key, a wrong key or the budget. */
  async function twice(fn) {
    try {
      return await fn(false);
    } catch (e) {
      rethrowIfCancelled(e);
      if (FATAL.has(e?.code) || e?.code === 'ci_budget') throw e;
      return fn(true);
    }
  }

  // ---------- shared context ----------
  function contextOf(runId) {
    const run = runOf(runId);
    const all = repo.comments(run.id);
    const labelRows = repo.labels(run.id);
    const labelRow = new Map(labelRows.map((l) => [l.ref, l]));
    const irrelevant = new Set(labelRows.filter((l) => l.irrelevant).map((l) => l.ref));
    const usable = analysable(all).filter((c) => !irrelevant.has(c.ref));
    const comments = new Map(usable.map((c) => [c.ref, c]));
    const byRef = new Map(all.map((c) => [c.ref, c]));
    const labels = new Map(labelRows.filter((l) => l.promptVersion || l.userLabels).map((l) => [l.ref, effectiveLabels(l)]));
    const sources = repo.sources(run.id);
    const sourceOf = new Map(sources.map((s) => [s.ref, s]));
    return { run, all, byRef, comments, labels, labelRow, irrelevant, sources, sourceOf, total: comments.size, thresholds: run.config?.thresholds ?? {}, now: now() };
  }
  /** Pains with their share, for prevalence relative to the biggest pain of the run. */
  function maxShareOf(ctx) {
    const shares = repo.pains(ctx.run.id).filter((p) => !p.hidden).map((p) => p.refs.filter((r) => ctx.comments.has(r)).length / (ctx.total || 1));
    return Math.max(0, ...shares) || null;
  }
  const workspaceContext = (run) => ({ industry: run.config?.industry ?? null, business_goals: run.config?.goals ?? [], language: 'vi', channel_profile: profileText() || null });
  const analysisContext = (ctx) => ({
    analysis_run_id: `RUN_${ctx.run.id}`, platforms: ctx.run.config?.platforms ?? [],
    sample_size: { comments: ctx.total, unique_commenters: ctx.total && [...ctx.comments.values()].every((c) => c.authorHash) ? new Set([...ctx.comments.values()].map((c) => c.authorHash)).size : null, source_items: ctx.sources.length },
  });
  /** One comment as evidence for a prompt: exact text, its source, reply context, numbers (null kept null). */
  function evidenceOf(ctx, ref, maxText = 400, role) {
    const c = ctx.byRef.get(ref);
    if (!c) return null;
    const parent = c.parentRef ? ctx.byRef.get(c.parentRef) : null;
    const l = ctx.labels.get(ref);
    return {
      evidence_id: ref, type: 'direct_quote', text: short(c.text, maxText), source_item_id: c.sourceRef, platform: c.platform, created_at: c.createdAt,
      ...(parent ? { reply_to: short(parent.text, 160) } : {}), metrics: { likes: c.likes, replies: c.replies },
      ...(l ? { labels: { intent: l.intent, pain: l.pain, emotion: l.emotion, objection: l.objection, buying_signal: l.buying_signal } } : {}), ...(role ? { role } : {}),
    };
  }
  /** Most noticed first, spread over sources (round robin), at most n. */
  function representative(ctx, refs, n) {
    const bySource = new Map();
    for (const r of uniq(refs)) {
      const c = ctx.comments.get(r);
      if (!c) continue;
      (bySource.get(c.sourceRef) ?? bySource.set(c.sourceRef, []).get(c.sourceRef)).push(c);
    }
    for (const l of bySource.values()) l.sort((a, b) => (b.likes ?? -1) - (a.likes ?? -1) || b.text.length - a.text.length);
    const lists = [...bySource.values()];
    const out = [];
    for (let i = 0; out.length < n && lists.some((l) => l.length > i); i++) for (const l of lists) if (l[i] && out.length < n) out.push(l[i].ref);
    return out;
  }
  function setStage(runId, stage, patch) {
    const r = runOf(runId);
    const stages = { ...r.stages, [stage]: { ...(r.stages?.[stage] ?? {}), ...patch, at: now() } };
    const st = STAGES.map((s) => stages[s]?.status);
    const status = st.some((s) => s === 'running') ? 'running' : st.some((s) => s === 'failed') ? 'failed' : st.every((s) => s === 'complete') ? 'complete' : st.some((s) => s === 'partial') ? 'partial' : st.some(Boolean) ? 'partial' : 'draft';
    repo.saveRun(ws, r.id, { stages, status });
  }

  // ---------- Stage 2: classify (batched, cached per comment, incremental) ----------
  async function classify(runId, scope, progress) {
    const ctx = contextOf(runId);
    const model = modelFor('classify_comments');
    const topicLabels = ctx.run.config?.topicLabels ?? [];
    const labelled = new Set(repo.labels(ctx.run.id).filter((l) => l.promptVersion === PROMPT_VERSION && l.model === model).map((l) => l.ref));
    const todo = [...ctx.comments.values()].filter((c) => scope === 'full' || !labelled.has(c.ref));
    const keyOf = (c) => hashOf(['classify_comment', PROMPT_VERSION, SCHEMA_VERSION, model, c.text, c.parentRef ? ctx.byRef.get(c.parentRef)?.text ?? '' : '', topicLabels]);
    const cached = repo.cacheMany(todo.map(keyOf));
    let fromCache = 0;
    const send = [];
    for (const c of todo) {
      const hit = cached.get(keyOf(c));
      if (hit) {
        repo.saveLabel(ctx.run.id, { ref: c.ref, ...hit, model, promptVersion: PROMPT_VERSION });
        fromCache++;
      } else send.push(c);
    }
    // Batches by size, not a fixed count (PRD §9.2 #1).
    const batches = [];
    let cur = [];
    let chars = 0;
    for (const c of send) {
      const len = Math.min(c.text.length, 600) + 60;
      if (cur.length && (chars + len > LIMITS.batchChars || cur.length >= LIMITS.batchMax)) (batches.push(cur), (cur = []), (chars = 0));
      cur.push(c);
      chars += len;
    }
    if (cur.length) batches.push(cur);
    setStage(runId, 'classify', { status: 'running', total: todo.length, cached: fromCache, batches: batches.length });
    let done = 0;
    let failed = 0;
    const missing = [];
    const audit = { fabricated: 0, badEnums: 0 };
    const suggested = new Set();
    const runBatch = async (batch) => {
      const asked = new Set(batch.map((c) => c.ref));
      const envelope = { workspace_context: workspaceContext(ctx.run), topic_labels: topicLabels, comments: batch.map((c) => evidenceOf(ctx, c.ref, 600)).map(({ labels, ...e }) => e) };
      const out = await twice(async () => {
        const r = checkClassify(await ask(ctx.run, 'classify', 'classify_comments', envelope, {}, { cache: false }), asked, topicLabels);
        if (!r.results.size) throw aiError('llm_bad_output', 'AI không phân loại được comment nào trong lô');
        return r;
      });
      for (const [ref, l] of out.results) {
        const c = ctx.comments.get(ref);
        repo.saveLabel(ctx.run.id, { ref, ...l, model, promptVersion: PROMPT_VERSION });
        if (c) repo.cacheSet(keyOf(c), l);
      }
      audit.fabricated += out.audit.fabricatedCount;
      audit.badEnums += out.audit.badEnums;
      out.suggested.forEach((s) => suggested.add(s));
      return out.missing;
    };
    progress({ step: 'Phân loại comment', done: 0, total: batches.length });
    await pool(batches, PARALLEL, async (batch) => {
      try {
        missing.push(...(await runBatch(batch)));
      } catch (e) {
        rethrowIfCancelled(e);
        if (FATAL.has(e?.code) || e?.code === 'ci_budget') throw e;
        failed++;
        missing.push(...batch.map((c) => c.ref));
      }
      progress({ step: 'Phân loại comment', done: ++done, total: batches.length });
    });
    // Retry only what is missing, once, in small batches.
    let stillMissing = missing;
    if (missing.length) {
      progress({ step: 'Phân loại lại phần thiếu', done: 0, total: 1 });
      const again = [];
      for (let i = 0; i < missing.length; i += 20) again.push(missing.slice(i, i + 20).map((r) => ctx.comments.get(r)).filter(Boolean));
      stillMissing = [];
      for (const b of again) {
        try {
          stillMissing.push(...(await runBatch(b)));
        } catch (e) {
          rethrowIfCancelled(e);
          if (FATAL.has(e?.code) || e?.code === 'ci_budget') throw e;
          stillMissing.push(...b.map((c) => c.ref));
        }
      }
    }
    setStage(runId, 'classify', { status: stillMissing.length ? 'partial' : 'complete', total: todo.length, cached: fromCache, sent: send.length, failedBatches: failed, unlabelled: stillMissing.length, audit, suggestedLabels: [...suggested].slice(0, 10) });
    return { labelled: todo.length - stillMissing.length, unlabelled: stillMissing.length };
  }

  // ---------- Stage 3: topics & pain points ----------
  async function discover(runId, progress) {
    const ctx = contextOf(runId);
    const labelledRefs = [...ctx.comments.keys()].filter((r) => ctx.labels.has(r));
    if (!labelledRefs.length) throw invalid('Chưa có comment nào được phân loại. Chạy bước phân loại trước.', 'stage');
    setStage(runId, 'topics', { status: 'running' });
    // Sample: most noticed, spread over sources, within a character budget.
    const ordered = representative(ctx, labelledRefs, labelledRefs.length);
    const sample = [];
    let chars = 0;
    for (const r of ordered) {
      const c = ctx.comments.get(r);
      if (sample.length >= LIMITS.discoverSample || chars > LIMITS.discoverChars) break;
      sample.push(r);
      chars += Math.min(c.text.length, 280) + 80;
    }
    const allowed = new Set(sample);
    progress({ step: 'Gom chủ đề & nỗi đau', done: 0, total: 1 });
    const envelope = { workspace_context: workspaceContext(ctx.run), analysis_context: analysisContext(ctx), evidence: sample.map((r) => evidenceOf(ctx, r, 280)), constraints: { max_topics: LIMITS.maxTopics, max_pain_points_per_topic: LIMITS.maxPains } };
    const found = await twice(async () => {
      const d = checkDiscover(await ask(ctx.run, 'topics', 'discover_topics', envelope, { maxTopics: LIMITS.maxTopics, maxPains: LIMITS.maxPains }), allowed, LIMITS);
      if (!d.topics.length) throw aiError('llm_bad_output', 'AI không lập được chủ đề nào từ các comment này');
      return d;
    });
    // Everything else is assigned to the pains in batches.
    const pains = found.topics.flatMap((t) => t.pains.map((p) => ({ ...p, topicKey: t.key })));
    const painKeys = new Set(pains.map((p) => p.key));
    const rest = labelledRefs.filter((r) => !allowed.has(r));
    const assigned = new Map();
    const batches = [];
    for (let i = 0; i < rest.length; i += LIMITS.assignBatch) batches.push(rest.slice(i, i + LIMITS.assignBatch));
    let done = 0;
    let failed = 0;
    progress({ step: 'Gán comment vào nỗi đau', done: 0, total: batches.length });
    const painList = pains.map((p) => ({ pain_key: p.key, title: p.title, statement: p.statement }));
    await pool(batches, PARALLEL, async (b) => {
      try {
        const asked = new Set(b);
        const r = await twice(async () => checkAssign(await ask(ctx.run, 'topics', 'assign_topics', { pain_points: painList, comments: b.map((x) => evidenceOf(ctx, x, 280)).map(({ metrics, ...e }) => e) }, {}, { cache: true }), asked, painKeys));
        for (const [ref, keys] of r.byRef) if (keys.length) assigned.set(ref, keys);
      } catch (e) {
        rethrowIfCancelled(e);
        if (FATAL.has(e?.code) || e?.code === 'ci_budget') throw e;
        failed++;
      }
      progress({ step: 'Gán comment vào nỗi đau', done: ++done, total: batches.length });
    });
    const refsOfPain = new Map(pains.map((p) => [p.key, new Set(p.refs)]));
    for (const [ref, keys] of assigned) for (const k of keys) refsOfPain.get(k)?.add(ref);
    repo.tx(() => {
      repo.clearTopics(ctx.run.id); // cascades to pains, insights, whys, briefs, opportunities of this run
      for (const t of found.topics) {
        const tRefs = new Set(t.refs);
        for (const p of t.pains) for (const r of refsOfPain.get(p.key) ?? []) tRefs.add(r);
        const topicId = repo.addTopic(ctx.run.id, { key: t.key, name: t.name, description: t.description, refs: [...tRefs] });
        for (const p of t.pains) repo.addPain(ctx.run.id, { topicId, key: p.key, title: p.title, statement: p.statement, refs: [...(refsOfPain.get(p.key) ?? [])], status: p.status });
      }
    });
    const covered = new Set(repo.topics(ctx.run.id).flatMap((t) => t.refs));
    setStage(runId, 'topics', { status: failed ? 'partial' : 'complete', topics: found.topics.length, pains: pains.length, assignFailedBatches: failed, unclassified: labelledRefs.filter((r) => !covered.has(r)).length, notes: found.notes, warnings: found.warnings, audit: found.audit });
    setStage(runId, 'insights', { status: undefined });
    return { topics: found.topics.length, pains: pains.length };
  }

  // ---------- Stage 3b: insight synthesis (one call per topic) ----------
  function insightData(ctx, pain, topic, ai, maxShare) {
    const counts = countsOf(pain.refs, ctx);
    const contradictionChecked = !!ai;
    const strength = evidenceStrength(counts, contradictionChecked, ctx.thresholds);
    const supporting = ai?.supporting?.length ? ai.supporting : pain.refs.slice(0, 5);
    return {
      insightKey: pain.key, topicKey: topic.key, title: ai?.title ?? pain.title, painStatement: pain.statement, observedPattern: ai?.observedPattern ?? '',
      segment: ai?.segment ?? { description: null, status: 'unverified', refs: [] }, need: ai?.need ?? { statement: null, status: 'hypothesis', refs: [] },
      quotes: ai?.quotes ?? [], supporting, contradicting: ai?.contradicting ?? [], status: ai?.status ?? 'hypothesis', confidence: ai?.confidence ?? null,
      gaps: [...(ai?.gaps ?? []), ...(counts.sourceItemCount < 2 ? ['Chỉ đến từ một nguồn: cần thêm video/bài khác để biết có lặp lại không.'] : []), ...(counts.uniqueCommenterCount == null ? ['Không biết số người bình luận (nguồn không cho tác giả).'] : [])],
      warnings: ai?.warnings ?? (ai ? [] : ['AI chưa tổng hợp được insight này; đang hiện nỗi đau gốc.']),
      counts, evidenceStrength: strength, prevalenceShare: counts.share, maxShare, audit: ai?.audit ?? null,
    };
  }
  async function synthesize(runId, progress) {
    const ctx = contextOf(runId);
    const topics = repo.topics(ctx.run.id).filter((t) => !t.hidden);
    const pains = repo.pains(ctx.run.id).filter((p) => !p.hidden);
    if (!pains.length) throw invalid('Chưa có nỗi đau nào. Chạy bước gom chủ đề trước.', 'stage');
    setStage(runId, 'insights', { status: 'running' });
    repo.removeInsightsOfRun(ctx.run.id);
    const maxShare = maxShareOf(ctx);
    let done = 0;
    let failed = 0;
    progress({ step: 'Tổng hợp insight', done: 0, total: topics.length });
    await pool(topics, PARALLEL, async (topic) => {
      const mine = pains.filter((p) => p.topicId === topic.id);
      if (!mine.length) return void progress({ step: 'Tổng hợp insight', done: ++done, total: topics.length });
      const evidenceRefs = uniq(mine.flatMap((p) => representative(ctx, p.refs, Math.ceil(LIMITS.insightEvidence / mine.length))));
      const others = representative(ctx, topic.refs.filter((r) => !evidenceRefs.includes(r)), 10);
      const allowed = new Set([...evidenceRefs, ...others]);
      const textByRef = new Map([...allowed].map((r) => [r, ctx.byRef.get(r)?.text ?? '']));
      let result = null;
      try {
        const envelope = {
          workspace_context: workspaceContext(ctx.run), analysis_context: analysisContext(ctx), topic: { topic_key: topic.key, name: topic.name, description: topic.description },
          pain_points: mine.map((p) => ({ pain_key: p.key, title: p.title, statement: p.statement, counts_by_code: countsOf(p.refs, ctx) })),
          evidence: [...evidenceRefs.map((r) => evidenceOf(ctx, r, 400)), ...others.map((r) => evidenceOf(ctx, r, 300, 'same_topic_other_pain'))].filter(Boolean),
        };
        result = await twice(async () => checkInsights(await ask(ctx.run, 'insights', 'synthesize_insight', envelope), allowed, new Set(mine.map((p) => p.key)), textByRef));
      } catch (e) {
        rethrowIfCancelled(e);
        if (FATAL.has(e?.code) || e?.code === 'ci_budget') throw e;
        failed++;
      }
      for (const p of mine) {
        const ai = result?.insights.get(p.key) ?? null;
        const d = insightData(ctx, p, topic, ai && { ...ai, audit: result.audit }, maxShare);
        repo.addInsight(ctx.run.id, p.id, d.supporting.length && ai ? 'draft' : 'needs_evidence', d);
      }
      progress({ step: 'Tổng hợp insight', done: ++done, total: topics.length });
    });
    setStage(runId, 'insights', { status: failed ? 'partial' : 'complete', insights: repo.insights(ctx.run.id).length, failedTopics: failed });
    return { insights: repo.insights(ctx.run.id).length };
  }

  /** Job ci_analyze: one stage, or all of them. @param {{runId: number, stage?: string, scope?: string}} p */
  async function analyze(p, progress = noop) {
    const run = runOf(p.runId);
    const stage = p.stage || 'all';
    // A stage alone, except regrouping topics: it replaces the pains, so their insights are written again.
    const order = stage === 'all' ? [...STAGES] : stage === 'topics' ? ['topics', 'insights'] : STAGES.includes(/** @type {any} */ (stage)) ? [stage] : [];
    if (!order.length) throw invalid('Bước không hợp lệ', 'stage');
    if (!llm.ready()) throw aiError('llm_no_key', 'Chưa nhập API key OpenRouter. Vào Cài đặt để nhập.');
    const current = { s: '' };
    try {
      for (const s of order) {
        current.s = s;
        if (s === 'classify') await classify(run.id, p.scope === 'full' ? 'full' : 'new', progress);
        if (s === 'topics') await discover(run.id, progress);
        if (s === 'insights') await synthesize(run.id, progress);
      }
    } catch (e) {
      if (current.s) {
        try {
          setStage(run.id, current.s, { status: 'failed', error: String(e?.message || e).slice(0, 300) });
        } catch { /* the run was removed meanwhile */ }
      }
      throw e;
    }
    return { inline: true, runId: run.id };
  }

  // ---------- reading: overview, topics, comments ----------
  const labelText = (d, v) => LABEL_VI[d]?.[v] ?? v;
  function commentView(ctx, ref) {
    const c = ctx.byRef.get(ref);
    if (!c) return null;
    const s = ctx.sourceOf.get(c.sourceRef);
    const row = ctx.labelRow.get(ref);
    const parent = c.parentRef ? ctx.byRef.get(c.parentRef) : null;
    return {
      ref, text: c.text, likes: c.likes, replies: c.replies, createdAt: c.createdAt, platform: c.platform, isReply: !!c.parentRef, parentText: parent ? short(parent.text, 200) : null,
      duplicateOf: c.duplicateOf, source: s ? { ref: s.ref, title: s.title, url: s.url, platform: s.platform, author: s.author } : null,
      labels: ctx.labels.get(ref) ?? null, ai: row?.promptVersion ? { summary: row.summary, spans: row.spans, confidence: row.confidence, needsReview: row.needsReview, reason: row.reason } : null,
      corrected: !!row?.userLabels, irrelevant: ctx.irrelevant.has(ref),
    };
  }
  const isQuestion = (l) => (l?.intent ?? []).some((x) => ['question', 'information_seeking', 'recommendation_request'].includes(x));
  const hasBuying = (l) => (l?.buying_signal ?? []).some((x) => !['none', 'unknown'].includes(x));
  const hasObjection = (l) => (l?.objection ?? []).some((x) => !['no_objection', 'unknown'].includes(x));
  const hasPain = (l) => (l?.pain ?? []).some((x) => !['unknown', 'other'].includes(x));
  const byLikes = (ctx) => (a, b) => (ctx.byRef.get(b)?.likes ?? -1) - (ctx.byRef.get(a)?.likes ?? -1);

  function painRows(ctx) {
    const topics = new Map(repo.topics(ctx.run.id).map((t) => [t.id, t]));
    const insights = new Map(repo.insights(ctx.run.id).map((i) => [i.painId, i]));
    const opps = repo.opportunities(ctx.run.id);
    return repo.pains(ctx.run.id).filter((p) => !p.hidden && !topics.get(p.topicId)?.hidden).map((p) => {
      const refs = p.refs.filter((r) => ctx.comments.has(r));
      const counts = countsOf(refs, ctx);
      const ins = insights.get(p.id) ?? null;
      const best = opps.filter((o) => ins && o.insightId === ins.id).map((o) => o.score?.priority?.score ?? null).filter((x) => x != null).sort((a, b) => b - a)[0] ?? null;
      const l = refs.map((r) => ctx.labels.get(r)).filter(Boolean);
      const kind = l.filter(hasBuying).length / (l.length || 1) >= 0.25 ? 'decision' : l.filter(isQuestion).length / (l.length || 1) >= 0.5 ? 'question' : 'pain';
      return { id: p.id, topicId: p.topicId, topic: topics.get(p.topicId)?.name ?? '', title: p.title, statement: p.statement, status: p.status, kind, counts, insight: ins ? { id: ins.id, state: ins.state, strength: ins.data.evidenceStrength, title: ins.userData?.title ?? ins.data.title } : null, bestScore: best, opportunityBand: bandOf(best) };
    });
  }

  function overview(runId) {
    const ctx = contextOf(runId);
    const refs = [...ctx.comments.keys()];
    const l = (r) => ctx.labels.get(r);
    const topics = repo.topics(ctx.run.id).filter((t) => !t.hidden).map((t) => {
      const tr = t.refs.filter((r) => ctx.comments.has(r));
      return { id: t.id, name: t.name, count: tr.length, share: ctx.total ? tr.length / ctx.total : null };
    }).sort((a, b) => b.count - a.count);
    const covered = new Set(repo.topics(ctx.run.id).filter((t) => !t.hidden).flatMap((t) => t.refs));
    const pains = painRows(ctx).sort((a, b) => b.counts.commentCount - a.counts.commentCount);
    const objectionCounts = {};
    for (const r of refs) for (const o of l(r)?.objection ?? []) if (!['no_objection', 'unknown'].includes(o)) objectionCounts[o] = (objectionCounts[o] ?? 0) + 1;
    const opps = repo.opportunities(ctx.run.id).sort((a, b) => (b.score?.priority?.score ?? -1) - (a.score?.priority?.score ?? -1));
    const insights = repo.insights(ctx.run.id);
    const summary = runSummary(ctx.run);
    // Compare with the previous run that analysed the same platforms (pain titles that are new).
    const prev = repo.listRuns(ws).find((r) => r.id < ctx.run.id && (r.config?.platforms ?? []).join() === (ctx.run.config?.platforms ?? []).join());
    const prevPains = prev ? new Set(repo.pains(prev.id).map((p) => slug(p.title))) : null;
    const actions = [];
    if (!ctx.labels.size) actions.push({ text: 'Chạy phân tích để AI phân loại comment', href: `/ci/runs?run=${ctx.run.id}` });
    const toCheck = insights.filter((i) => i.state === 'draft').length;
    if (toCheck) actions.push({ text: `${toCheck} insight đang là nháp AI: kiểm tra bằng chứng trước khi đào 5 Whys`, href: `/ci/topics?run=${ctx.run.id}` });
    const top = pains[0];
    if (top?.insight && !repo.analyses(top.insight.id).length) actions.push({ text: `Đào 5 Whys cho nỗi đau lớn nhất: “${top.title}”`, href: `/ci/lab/whys?run=${ctx.run.id}&insight=${top.insight.id}` });
    if (repo.briefs(ctx.run.id).length && !opps.length) actions.push({ text: 'Đã có brief: tạo cơ hội nội dung', href: `/ci/lab/opportunities?run=${ctx.run.id}` });
    if (opps.some((o) => o.status === 'suggested')) actions.push({ text: `${opps.filter((o) => o.status === 'suggested').length} cơ hội chờ bạn xem và duyệt`, href: `/ci/lab/opportunities?run=${ctx.run.id}` });
    return {
      run: summary,
      kpis: {
        sources: ctx.sources.length, comments: ctx.total, uniqueCommenters: summary.uniqueCommenters, topics: topics.length, pains: pains.length,
        questions: refs.filter((r) => isQuestion(l(r))).length, buyingSignals: refs.filter((r) => hasBuying(l(r))).length, objections: refs.filter((r) => hasObjection(l(r))).length, labelled: ctx.labels.size,
      },
      topics, unclassified: ctx.labels.size ? refs.filter((r) => ctx.labels.has(r) && !covered.has(r)).length : null, pains: pains.slice(0, 8),
      questions: refs.filter((r) => isQuestion(l(r))).sort(byLikes(ctx)).slice(0, 8).map((r) => commentView(ctx, r)),
      objections: Object.entries(objectionCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: labelText('objection', k), count: n, examples: refs.filter((r) => (l(r)?.objection ?? []).includes(k)).sort(byLikes(ctx)).slice(0, 2).map((r) => commentView(ctx, r)) })),
      buying: refs.filter((r) => hasBuying(l(r))).sort(byLikes(ctx)).slice(0, 6).map((r) => commentView(ctx, r)),
      opportunities: opps.slice(0, 5).map(oppView),
      changes: prev ? { previous: { id: prev.id, title: prev.title }, newPains: pains.filter((p) => !prevPains.has(slug(p.title))).map((p) => p.title).slice(0, 6) } : null,
      actions,
    };
  }

  function topicList(runId) {
    const ctx = contextOf(runId);
    return { run: runSummary(ctx.run), topics: repo.topics(ctx.run.id).map((t) => ({ id: t.id, name: t.name, description: t.description, hidden: t.hidden, origin: t.origin, count: t.refs.filter((r) => ctx.comments.has(r)).length })), pains: painRows(ctx), total: ctx.total };
  }

  function insightView(ctx, ins) {
    if (!ins) return null;
    const pain = repo.getPain(ins.painId);
    const merged = { ...ins.data, ...(ins.userData ?? {}) };
    const ev = (refs) => refs.map((r) => commentView(ctx, r)).filter(Boolean);
    return {
      id: ins.id, state: ins.state, data: merged, ai: ins.data, edited: !!ins.userData, validation: ins.validation, pain: pain && { id: pain.id, title: pain.title, statement: pain.statement },
      supporting: ev(merged.supporting ?? []), contradicting: ev(merged.contradicting ?? []), analyses: repo.analyses(ins.id).map((a) => ({ id: a.id, createdAt: a.createdAt })),
    };
  }
  function painDetail(runId, painId) {
    const ctx = contextOf(runId);
    const p = repo.getPain(Number(painId));
    if (!p || p.runId !== ctx.run.id) throw notFound('Không thấy nỗi đau này');
    const topic = repo.getTopic(p.topicId);
    const refs = p.refs.filter((r) => ctx.comments.has(r)).sort(byLikes(ctx));
    const ins = repo.insightOfPain(p.id);
    return {
      run: runSummary(ctx.run), pain: { ...p, counts: countsOf(refs, ctx) }, topic: topic && { id: topic.id, name: topic.name },
      insight: insightView(ctx, ins), evidence: refs.slice(0, 200).map((r) => commentView(ctx, r)), evidenceTotal: refs.length,
      questions: refs.filter((r) => isQuestion(ctx.labels.get(r))).slice(0, 6).map((r) => commentView(ctx, r)),
    };
  }

  function comments(runId, q = {}) {
    const ctx = contextOf(runId);
    const tab = q.tab || 'all';
    const term = String(q.q ?? '').trim().toLowerCase();
    let refs = ctx.all.map((c) => c.ref);
    const l = (r) => ctx.labels.get(r);
    if (tab === 'questions') refs = refs.filter((r) => isQuestion(l(r)));
    if (tab === 'pain') refs = refs.filter((r) => hasPain(l(r)));
    if (tab === 'objections') refs = refs.filter((r) => hasObjection(l(r)));
    if (tab === 'buying') refs = refs.filter((r) => hasBuying(l(r)));
    if (tab === 'replies') refs = refs.filter((r) => ctx.byRef.get(r)?.parentRef);
    if (tab === 'review') refs = refs.filter((r) => ctx.labelRow.get(r)?.needsReview || !ctx.labels.has(r));
    if (q.dim && q.value) refs = refs.filter((r) => (l(r)?.[q.dim] ?? []).includes(q.value));
    if (q.source) refs = refs.filter((r) => ctx.byRef.get(r)?.sourceRef === q.source);
    if (q.pain) {
      const p = repo.getPain(Number(q.pain));
      const set = new Set(p?.runId === ctx.run.id ? p.refs : []);
      refs = refs.filter((r) => set.has(r));
    }
    if (term) refs = refs.filter((r) => ctx.byRef.get(r)?.text.toLowerCase().includes(term));
    if (q.ref) refs = refs.filter((r) => r === String(q.ref).toUpperCase());
    if (q.sort === 'likes') refs.sort(byLikes(ctx));
    const page = Math.max(0, Number(q.page) || 0);
    const counts = Object.fromEntries(['questions', 'pain', 'objections', 'buying'].map((k) => [k, ctx.all.filter((c) => (k === 'questions' ? isQuestion : k === 'pain' ? hasPain : k === 'objections' ? hasObjection : hasBuying)(l(c.ref))).length]));
    const painsOf = new Map();
    for (const p of repo.pains(ctx.run.id).filter((x) => !x.hidden)) for (const r of p.refs) (painsOf.get(r) ?? painsOf.set(r, []).get(r)).push({ id: p.id, title: p.title });
    return {
      run: runSummary(ctx.run), total: refs.length, page, pageSize: LIMITS.pageSize,
      counts: { all: ctx.all.length, ...counts, replies: ctx.all.filter((c) => c.parentRef).length, review: ctx.all.filter((c) => ctx.labelRow.get(c.ref)?.needsReview || !ctx.labels.has(c.ref)).length },
      rows: refs.slice(page * LIMITS.pageSize, (page + 1) * LIMITS.pageSize).map((r) => ({ ...commentView(ctx, r), pains: painsOf.get(r) ?? [] })),
      sources: ctx.sources.map((s) => ({ ref: s.ref, title: s.title, platform: s.platform })), taxonomy: { dims: DIM_KEYS, vi: LABEL_VI, dimVi: DIM_VI },
    };
  }

  // ---------- owner's edits (stored apart from the AI's, logged) ----------
  function relabel(runId, ref, { labels, irrelevant } = /** @type {any} */ ({})) {
    const ctx = contextOf(runId);
    const r = String(ref).toUpperCase();
    if (!ctx.byRef.has(r)) throw notFound('Không thấy comment này');
    const before = ctx.labelRow.get(r) ?? null;
    let clean = before?.userLabels ?? null;
    if (labels && typeof labels === 'object') {
      clean = {};
      for (const d of DIM_KEYS) if (Array.isArray(labels[d])) clean[d] = labels[d].filter((v) => LABEL_VI[d][v]);
    }
    repo.saveUserLabel(ctx.run.id, r, clean, irrelevant == null ? !!before?.irrelevant : !!irrelevant);
    repo.addFeedback(ctx.run.id, 'comment_label', r, 'relabel', before && { labels: before.userLabels, irrelevant: before.irrelevant }, { labels: clean, irrelevant });
    return commentView(contextOf(runId), r);
  }
  function editTopic(runId, topicId, patch = {}) {
    own(runId);
    const t = repo.getTopic(Number(topicId));
    if (!t || t.runId !== Number(runId)) throw notFound('Không thấy chủ đề này');
    repo.saveTopic(t.id, { name: patch.name != null ? String(patch.name).slice(0, 120) : undefined, description: patch.description != null ? String(patch.description).slice(0, 400) : undefined, hidden: patch.hidden, origin: 'user' });
    repo.addFeedback(t.runId, 'topic', t.id, patch.hidden ? 'hide' : 'edit', t, patch);
    return topicList(runId);
  }
  function mergeTopics(runId, intoId, fromIds) {
    own(runId);
    const into = repo.getTopic(Number(intoId));
    if (!into || into.runId !== Number(runId)) throw notFound('Không thấy chủ đề đích');
    repo.tx(() => {
      for (const id of fromIds.map(Number).filter((x) => x !== into.id)) {
        const t = repo.getTopic(id);
        if (!t || t.runId !== into.runId) continue;
        for (const p of repo.pains(into.runId).filter((x) => x.topicId === t.id)) repo.savePain(p.id, { topicId: into.id });
        repo.saveTopic(into.id, { refs: uniq([...repo.getTopic(into.id).refs, ...t.refs]), origin: 'user' });
        repo.removeTopic(t.id);
        repo.addFeedback(into.runId, 'topic', t.id, 'merge', { from: t.id }, { into: into.id });
      }
    });
    return topicList(runId);
  }
  function editPain(runId, painId, patch = {}) {
    own(runId);
    const p = repo.getPain(Number(painId));
    if (!p || p.runId !== Number(runId)) throw notFound('Không thấy nỗi đau này');
    let topicId = patch.topicId != null ? Number(patch.topicId) : undefined;
    if (patch.topicId === 'new') topicId = repo.addTopic(p.runId, { key: `user_${now()}`, name: String(patch.newTopicName || p.title).slice(0, 120), refs: p.refs, origin: 'user' }); // split
    else if (topicId != null && repo.getTopic(topicId)?.runId !== p.runId) throw invalid('Chủ đề không thuộc lần phân tích này', 'topicId');
    if (topicId != null) {
      const t = repo.getTopic(topicId);
      repo.saveTopic(topicId, { refs: uniq([...t.refs, ...p.refs]) });
    }
    repo.savePain(p.id, { topicId, title: patch.title != null ? String(patch.title).slice(0, 160) : undefined, statement: patch.statement != null ? String(patch.statement).slice(0, 400) : undefined, hidden: patch.hidden, origin: 'user' });
    repo.addFeedback(p.runId, 'pain', p.id, patch.hidden ? 'irrelevant' : topicId ? 'move' : 'edit', p, patch);
    return topicList(runId);
  }
  /** The owner validates, rejects or rewrites an insight (state machine of PRD §6 Stage 4). */
  function insightAction(id, { action, title, statement, need, segment } = /** @type {any} */ ({})) {
    const ins = insightOf(id);
    own(ins.runId);
    const map = { validate: 'validated_by_user', reject: 'rejected', ready: 'ready_for_analysis', needs_evidence: 'needs_evidence', reset: 'draft' };
    if (action === 'edit') {
      const u = { ...(ins.userData ?? {}) };
      if (title != null) u.title = String(title).slice(0, 200);
      if (statement != null) u.painStatement = String(statement).slice(0, 400);
      if (need != null) u.need = { ...(ins.data.need ?? {}), statement: String(need).slice(0, 400), status: 'hypothesis' };
      if (segment != null) u.segment = { ...(ins.data.segment ?? {}), description: String(segment).slice(0, 300) || null };
      repo.saveInsight(ins.id, { userData: u });
    } else if (map[action]) repo.saveInsight(ins.id, { state: map[action] });
    else throw invalid('Thao tác không hợp lệ', 'action');
    repo.addFeedback(ins.runId, 'insight', ins.id, action, { state: ins.state, userData: ins.userData }, { title, statement, need, segment });
    return insightView(contextOf(ins.runId), repo.getInsight(ins.id));
  }

  // ---------- Stage 4: validate insight (AI, on demand) ----------
  function selectedInsight(ctx, ins) {
    const d = { ...ins.data, ...(ins.userData ?? {}) };
    return {
      insight_id: `INS_${ins.id}`, title: d.title, pain_point: d.painStatement, observed_pattern: d.observedPattern, customer_segment: d.segment?.description ?? null,
      possible_underlying_need: d.need?.statement ?? null, epistemic_status: d.status, counts_by_code: d.counts, evidence_strength_by_code: d.evidenceStrength,
    };
  }
  async function validateInsight(id) {
    const ins = insightOf(id);
    const ctx = contextOf(ins.runId);
    const pain = repo.getPain(ins.painId);
    const d = { ...ins.data, ...(ins.userData ?? {}) };
    const refs = uniq([...(d.supporting ?? []), ...(d.contradicting ?? []), ...representative(ctx, pain?.refs ?? [], 20)]);
    const allowed = new Set(refs);
    const out = await twice(async () => checkValidation(await ask(ctx.run, 'validate', 'validate_insight', { selected_insight: selectedInsight(ctx, ins), evidence: refs.map((r) => evidenceOf(ctx, r, 400)).filter(Boolean) }), allowed));
    // AI may move a draft forward or back; it never validates or rejects for the owner.
    const next = ins.state === 'validated_by_user' || ins.state === 'rejected' ? ins.state : out.decision === 'ready_for_analysis' ? 'ready_for_analysis' : out.decision === 'needs_evidence' ? 'needs_evidence' : 'draft';
    repo.saveInsight(ins.id, { state: next, validation: { ...out, at: now() } });
    return insightView(contextOf(ins.runId), repo.getInsight(ins.id));
  }

  // ---------- Stage 5: 5 Whys (AI, on demand, branch by branch) ----------
  const nodeKey = (n) => `N${n.id}`;
  function nodeView(ctx, n) {
    const d = { ...n.data, ...(n.userData ?? {}) };
    return { id: n.id, key: nodeKey(n), parentId: n.parentId, depth: n.depth, ...d, userStatus: n.userStatus, edited: !!n.userData, supportingComments: (d.supporting ?? []).map((r) => commentView(ctx, r)).filter(Boolean), contradictingComments: (d.contradicting ?? []).map((r) => commentView(ctx, r)).filter(Boolean) };
  }
  function whyView(analysisId) {
    const a = repo.getAnalysis(Number(analysisId));
    if (!a) throw notFound('Không thấy phân tích 5 Whys này');
    const ctx = contextOf(a.runId);
    const ins = repo.getInsight(a.insightId);
    return { id: a.id, insightId: a.insightId, run: runSummary(ctx.run), insight: insightView(ctx, ins), ...a.data, nodes: repo.nodes(a.id).map((n) => nodeView(ctx, n)), createdAt: a.createdAt, updatedAt: a.updatedAt };
  }
  function whyEvidence(ctx, ins) {
    const d = { ...ins.data, ...(ins.userData ?? {}) };
    const pain = repo.getPain(ins.painId);
    const topic = pain ? repo.getTopic(pain.topicId) : null;
    const support = uniq([...(d.supporting ?? []), ...representative(ctx, pain?.refs ?? [], LIMITS.whyEvidence)]).slice(0, LIMITS.whyEvidence);
    const context = representative(ctx, (topic?.refs ?? []).filter((r) => !support.includes(r)), 12);
    return { support, context, contradicting: d.contradicting ?? [] };
  }
  async function runWhys(ins, analysisId, focus) {
    const ctx = contextOf(ins.runId);
    const ev = whyEvidence(ctx, ins);
    const allowed = new Set([...ev.support, ...ev.context, ...ev.contradicting]);
    const existing = analysisId ? repo.nodes(analysisId) : [];
    const prior = existing.filter((n) => n.userStatus !== 'rejected');
    const known = new Map(prior.map((n) => [nodeKey(n), n.depth]));
    const maxDepth = Number(ctx.run.config?.maxWhyDepth) || 5;
    const vars = focus ? { maxNodes: 2, maxDepth } : { maxNodes: 5, maxDepth: Math.min(3, maxDepth) };
    if (focus && focus.depth >= maxDepth) throw invalid(`Đã tới độ sâu tối đa (${maxDepth})`, 'node');
    const envelope = {
      workspace_context: workspaceContext(ctx.run), selected_insight: selectedInsight(ctx, ins),
      evidence: ev.support.map((r) => evidenceOf(ctx, r, 400)).filter(Boolean), context_evidence: ev.context.map((r) => evidenceOf(ctx, r, 300, 'context_only')).filter(Boolean),
      contradicting_evidence: ev.contradicting.map((r) => evidenceOf(ctx, r, 400)).filter(Boolean),
      prior_nodes: prior.map((n) => {
        const d = { ...n.data, ...(n.userData ?? {}) };
        const parent = existing.find((x) => x.id === n.parentId);
        return { node_key: nodeKey(n), parent_node_key: parent ? nodeKey(parent) : null, depth: n.depth, question: d.question, answer: d.answer, epistemic_status: d.status, user_review_status: n.userStatus, supporting_evidence_ids: d.supporting };
      }),
      focus_node_key: focus ? nodeKey(focus) : null, constraints: { max_why_depth: maxDepth, max_branches: 3, max_new_nodes: vars.maxNodes },
    };
    const out = await twice(async () => {
      const r = checkWhys(await ask(ctx.run, 'whys', 'five_whys', envelope, vars, { cache: false }), allowed, { known, focusKey: focus ? nodeKey(focus) : null, ...vars });
      if (!r.nodes.length && !r.stopReason) throw aiError('llm_bad_output', 'AI không đưa ra được câu Why nào');
      return r;
    });
    return { ctx, out };
  }
  function saveNodes(analysisId, out, existing) {
    const idOf = new Map(existing.map((n) => [nodeKey(n), n.id]));
    for (const n of out.nodes) {
      const parentId = n.parentKey ? idOf.get(n.parentKey) ?? null : null;
      const id = repo.addNode(analysisId, parentId, n.depth, { question: n.question, answer: n.answer, reasoning: n.reasoning, supporting: n.supporting, contradicting: n.contradicting, status: n.status, confidence: n.confidence, gap: n.gap });
      idOf.set(n.key, id);
    }
    return idOf;
  }
  async function startWhys(insightId) {
    const ins = insightOf(insightId);
    const { out } = await runWhys(ins, null, null);
    const analysisId = repo.addAnalysis(ins.runId, ins.id, {});
    const idOf = saveNodes(analysisId, out, []);
    repo.saveAnalysis(analysisId, {
      root: out.root, next: out.next, stopReason: out.stopReason, warnings: [...out.warnings, ...(['ready_for_analysis', 'validated_by_user'].includes(ins.state) ? [] : ['Insight chưa được kiểm tra: mọi kết luận ở đây chỉ là giả thuyết.'])],
      candidates: out.candidates.map((c) => ({ ...c, nodeIds: c.nodeKeys.map((k) => idOf.get(k)).filter(Boolean) })), audit: out.audit, history: [{ at: now(), focus: null, next: out.next, stopReason: out.stopReason, added: out.nodes.length }],
    });
    return whyView(analysisId);
  }
  async function continueWhy(nodeId) {
    const node = repo.getNode(Number(nodeId));
    if (!node) throw notFound('Không thấy câu Why này');
    if (node.userStatus === 'rejected') throw invalid('Câu Why này đã bị bác bỏ', 'node');
    const a = repo.getAnalysis(node.analysisId);
    const ins = insightOf(a.insightId);
    const existing = repo.nodes(a.id);
    const { out } = await runWhys(ins, a.id, node);
    const idOf = saveNodes(a.id, out, existing);
    repo.saveAnalysis(a.id, {
      ...a.data, next: out.next, stopReason: out.stopReason, audit: out.audit,
      candidates: [...(a.data.candidates ?? []), ...out.candidates.map((c) => ({ ...c, nodeIds: c.nodeKeys.map((k) => idOf.get(k)).filter(Boolean) }))].slice(-8),
      history: [...(a.data.history ?? []), { at: now(), focus: node.id, next: out.next, stopReason: out.stopReason, added: out.nodes.length }],
    });
    return whyView(a.id);
  }
  function editNode(nodeId, { status, question, answer, stop } = /** @type {any} */ ({})) {
    const node = repo.getNode(Number(nodeId));
    if (!node) throw notFound('Không thấy câu Why này');
    const a = repo.getAnalysis(node.analysisId);
    own(a.runId);
    if (question != null || answer != null) repo.saveNode(node.id, { userStatus: 'edited', userData: { ...(node.userData ?? {}), ...(question != null ? { question: String(question).slice(0, 300) } : {}), ...(answer != null ? { answer: String(answer).slice(0, 600) } : {}) } });
    if (status) {
      if (!NODE_STATUSES.includes(status)) throw invalid('Trạng thái không hợp lệ', 'status');
      repo.saveNode(node.id, { userStatus: status });
    }
    if (stop) repo.saveAnalysis(a.id, { ...a.data, stoppedAt: { nodeId: node.id, reason: String(stop).slice(0, 300), at: now() } });
    repo.addFeedback(a.runId, 'why_node', node.id, status || (stop ? 'stop' : 'edit'), { status: node.userStatus, data: node.userData }, { status, question, answer, stop });
    return whyView(a.id);
  }
  function whysOfRun(runId) {
    const ctx = contextOf(runId);
    const insights = repo.insights(ctx.run.id).map((i) => ({ id: i.id, title: i.userData?.title ?? i.data.title, state: i.state, strength: i.data.evidenceStrength, comments: i.data.counts?.commentCount ?? 0, analyses: repo.analyses(i.id).map((a) => ({ id: a.id, nodes: repo.nodes(a.id).length, createdAt: a.createdAt })) }));
    return { run: runSummary(ctx.run), insights: insights.sort((a, b) => b.comments - a.comments) };
  }

  // ---------- Stage 6: 5W1H brief ----------
  function briefView(b) {
    const ctx = contextOf(b.runId);
    const ins = repo.getInsight(b.insightId);
    const nodes = b.whyNodeIds.map((id) => repo.getNode(id)).filter(Boolean).map((n) => nodeView(ctx, n));
    const merged = { ...b.data };
    for (const [k, v] of Object.entries(b.userData ?? {})) merged[k] = v && typeof v === 'object' && !Array.isArray(v) && merged[k] && typeof merged[k] === 'object' ? { ...merged[k], ...v } : v;
    return { id: b.id, runId: b.runId, insightId: b.insightId, insight: insightView(ctx, ins), whyNodes: nodes, data: merged, ai: b.data, userEdited: Object.keys(b.userData ?? {}), opportunities: repo.opportunities(b.runId).filter((o) => o.briefId === b.id).map(oppView), refComments: Object.fromEntries(uniq(collectRefs(merged)).map((r) => [r, commentView(ctx, r)]).filter(([, v]) => v)), createdAt: b.createdAt };
  }
  const collectRefs = (o) => (o && typeof o === 'object' ? Object.entries(o).flatMap(([k, v]) => (k === 'refs' && Array.isArray(v) ? v : collectRefs(v))) : []);
  /** The chosen nodes plus the chain above each, root first. */
  function chainOf(nodeIds) {
    const out = new Map();
    for (const id of nodeIds) {
      let n = repo.getNode(Number(id));
      const chain = [];
      while (n) (chain.unshift(n), (n = n.parentId ? repo.getNode(n.parentId) : null));
      for (const x of chain) out.set(x.id, x);
    }
    return [...out.values()];
  }
  async function makeBrief(insightId, whyNodeIds = []) {
    const ins = insightOf(insightId);
    const ctx = contextOf(ins.runId);
    let ids = whyNodeIds.map(Number).filter(Boolean);
    if (!ids.length) {
      // Default: the deepest accepted node of the newest analysis, else its deepest node.
      const a = repo.analyses(ins.id)[0];
      const nodes = a ? repo.nodes(a.id).filter((n) => n.userStatus !== 'rejected') : [];
      const pick = [...nodes.filter((n) => n.userStatus === 'accepted' || n.userStatus === 'edited'), ...nodes].sort((x, y) => y.depth - x.depth)[0];
      ids = pick ? [pick.id] : [];
    }
    const chain = chainOf(ids).filter((n) => repo.getAnalysis(n.analysisId)?.insightId === ins.id);
    const ev = whyEvidence(ctx, ins);
    const nodeRefs = chain.flatMap((n) => [...(n.data.supporting ?? []), ...(n.data.contradicting ?? [])]);
    const refs = uniq([...ev.support, ...nodeRefs]).slice(0, 50);
    const allowed = new Set([...refs, ...ev.contradicting]);
    const envelope = {
      workspace_context: workspaceContext(ctx.run), analysis_context: analysisContext(ctx), selected_insight: selectedInsight(ctx, ins),
      selected_why_nodes: chain.map((n) => ({ node_key: nodeKey(n), depth: n.depth, question: (n.userData ?? n.data).question ?? n.data.question, answer: (n.userData ?? n.data).answer ?? n.data.answer, epistemic_status: n.data.status, user_review_status: n.userStatus })),
      source_platforms: uniq(refs.map((r) => ctx.byRef.get(r)?.platform).filter(Boolean)), evidence: refs.map((r) => evidenceOf(ctx, r, 400)).filter(Boolean), contradicting_evidence: ev.contradicting.map((r) => evidenceOf(ctx, r, 400)).filter(Boolean),
    };
    const out = await twice(async () => checkBrief(await ask(ctx.run, 'brief', 'five_w_one_h', envelope), allowed));
    const id = repo.addBrief(ins.runId, ins.id, chain.map((n) => n.id), out);
    return briefView(repo.getBrief(id));
  }
  function getBrief(id) {
    const b = repo.getBrief(Number(id));
    if (!b) throw notFound('Không thấy brief này');
    own(b.runId);
    return briefView(b);
  }
  const BRIEF_EDITABLE = ['who', 'what', 'why', 'when', 'where', 'centralInsight', 'objective', 'message', 'cta', 'notes'];
  function editBrief(id, patch = {}) {
    const b = repo.getBrief(Number(id));
    if (!b) throw notFound('Không thấy brief này');
    own(b.runId);
    const u = { ...(b.userData ?? {}) };
    for (const k of BRIEF_EDITABLE) {
      if (!(k in patch)) continue;
      const v = patch[k];
      u[k] = ['who', 'what', 'why', 'when', 'where'].includes(k) ? { value: String(v ?? '').slice(0, 500) || null, status: String(v ?? '').trim() ? 'supported' : 'needs_input', userNote: true } : String(v ?? '').slice(0, 800);
    }
    repo.saveBrief(b.id, u);
    repo.addFeedback(b.runId, 'brief', b.id, 'edit', b.userData, u);
    return briefView(repo.getBrief(b.id));
  }
  function briefsOfRun(runId) {
    const ctx = contextOf(runId);
    return { run: runSummary(ctx.run), briefs: repo.briefs(ctx.run.id).map((b) => ({ id: b.id, insightId: b.insightId, title: repo.getInsight(b.insightId)?.data.title ?? '', centralInsight: b.userData?.centralInsight ?? b.data.centralInsight, objective: b.data.objective, createdAt: b.createdAt, opportunities: repo.opportunities(ctx.run.id).filter((o) => o.briefId === b.id).length })), insights: whysOfRun(runId).insights };
  }

  // ---------- Stage 7: opportunities, scored in code ----------
  function scoreOf(ctx, ins, userDims) {
    const pain = repo.getPain(ins.painId);
    const refs = (pain?.refs ?? []).filter((r) => ctx.comments.has(r));
    const strength = ins.data.evidenceStrength ?? evidenceStrength(countsOf(refs, ctx), false, ctx.thresholds);
    const { dims, why } = scoreDims(refs, { ...ctx, maxShare: maxShareOf(ctx) ?? undefined }, { strength, userDims: userDims ?? {} });
    return { dims, why, weights: WEIGHTS, priority: priorityOf(dims), evidenceStrength: strength, computedAt: now() };
  }
  function oppView(o) {
    const ins = repo.getInsight(o.insightId);
    const pain = ins ? repo.getPain(ins.painId) : null;
    const brief = repo.getBrief(o.briefId);
    return {
      ...o.data, epistemicStatus: o.data.status, id: o.id, runId: o.runId, briefId: o.briefId, insightId: o.insightId, status: o.status, ideaId: o.ideaId, score: o.score, userDims: o.userDims, evaluation: o.evaluation,
      pain: pain && { id: pain.id, title: pain.title, statement: pain.statement }, insightTitle: ins ? ins.userData?.title ?? ins.data.title : null, whyNodeIds: brief?.whyNodeIds ?? [], createdAt: o.createdAt,
    };
  }
  async function makeOpportunities(briefId) {
    const b = repo.getBrief(Number(briefId));
    if (!b) throw notFound('Không thấy brief này');
    const ins = insightOf(b.insightId);
    const ctx = contextOf(b.runId);
    const view = briefView(b);
    const refs = uniq([...collectRefs(view.data), ...whyEvidence(ctx, ins).support]).slice(0, 40);
    const allowed = new Set(refs);
    const envelope = {
      workspace_context: workspaceContext(ctx.run), selected_insight: selectedInsight(ctx, ins),
      brief: { brief_id: `BRIEF_${b.id}`, who: view.data.who, what: view.data.what, why: view.data.why, when: view.data.when, where: view.data.where, how: view.data.how, central_insight: view.data.centralInsight, communication_objective: view.data.objective, message_to_land: view.data.message, misconception_to_address: view.data.misconception, proof_required: view.data.proof, cta_intent: view.data.cta, compliance_notes: view.data.compliance },
      selected_why_nodes: view.whyNodes.map((n) => ({ node_key: n.key, question: n.question, answer: n.answer, epistemic_status: n.status })),
      existing_opportunities: repo.opportunities(ctx.run.id).filter((o) => o.insightId === ins.id).map((o) => o.data.title),
      evidence: refs.map((r) => evidenceOf(ctx, r, 300)).filter(Boolean), constraints: { max_opportunities: LIMITS.maxOpps },
    };
    const out = await twice(async () => {
      const r = checkOpportunities(await ask(ctx.run, 'opportunities', 'generate_opportunities', envelope, { maxOpps: LIMITS.maxOpps }, { cache: false }), allowed, LIMITS.maxOpps);
      if (!r.opportunities.length) throw aiError('llm_bad_output', 'AI không đề xuất được cơ hội nào');
      return r;
    });
    const score = scoreOf(ctx, ins, null);
    for (const o of out.opportunities) repo.addOpportunity(ctx.run.id, b.id, ins.id, { ...o, nearDuplicates: out.duplicates.filter((d) => d.keys.includes(o.key)).map((d) => d.note), overallWarnings: out.warnings, audit: out.audit }, score);
    return briefView(repo.getBrief(b.id));
  }
  function opportunities(runId) {
    const ctx = contextOf(runId);
    return { run: runSummary(ctx.run), opportunities: repo.opportunities(ctx.run.id).map(oppView).sort((a, b) => (b.score?.priority?.score ?? -1) - (a.score?.priority?.score ?? -1)), briefs: briefsOfRun(runId).briefs, labels: { types: OPPORTUNITY_TYPE_VI, dims: DIM_SCORE_VI, strength: STRENGTH_VI } };
  }
  function setOpportunity(id, { status, strategicFit } = /** @type {any} */ ({})) {
    const o = repo.getOpportunity(Number(id));
    if (!o) throw notFound('Không thấy cơ hội này');
    own(o.runId);
    if (status === 'approved') throw invalid('Dùng nút Duyệt để đưa vào Bảng ý tưởng', 'status');
    if (status != null && !OPP_STATUSES.includes(status)) throw invalid('Trạng thái không hợp lệ', 'status');
    let score;
    let userDims;
    if (strategicFit !== undefined) {
      userDims = { ...(o.userDims ?? {}), strategic_fit: strategicFit === null || strategicFit === '' ? null : Math.max(0, Math.min(100, Number(strategicFit))) };
      score = scoreOf(contextOf(o.runId), insightOf(o.insightId), userDims);
    }
    repo.saveOpportunity(o.id, { status, score, userDims });
    repo.addFeedback(o.runId, 'opportunity', o.id, status ?? 'score', { status: o.status, userDims: o.userDims }, { status, strategicFit });
    return oppView(repo.getOpportunity(o.id));
  }
  async function evaluate(runId, ids = []) {
    const ctx = contextOf(runId);
    const list = repo.opportunities(ctx.run.id).filter((o) => !ids.length || ids.map(Number).includes(o.id)).slice(0, 12);
    if (list.length < 2) throw invalid('Cần ít nhất 2 cơ hội để so sánh', 'ids');
    const keyOf = (o) => `OPP_${o.id}`;
    const envelope = {
      workspace_context: workspaceContext(ctx.run),
      opportunities: list.map((o) => ({ opportunity_key: keyOf(o), title: o.data.title, type: o.data.type, target_segment: o.data.segment, angle: o.data.angle, evidence_count: o.data.refs?.length ?? 0, evidence_strength_by_code: o.score?.evidenceStrength, priority_score_by_code: o.score?.priority?.score ?? null, facts_to_verify: o.data.facts, compliance_notes: o.data.compliance })),
    };
    const out = checkEvaluation(await twice(() => ask(ctx.run, 'evaluate', 'evaluate_opportunities', envelope)), new Set(list.map(keyOf)));
    for (const o of list) {
      const e = out.byKey.get(keyOf(o));
      if (e) repo.saveOpportunity(o.id, { evaluation: { ...e, summary: out.summary, at: now() } });
    }
    return { summary: out.summary, warnings: out.warnings, ...opportunities(runId) };
  }

  /** The idea card fields for an opportunity (ideas feature, source "ci:ID"). */
  function cardOf(oppId) {
    const o = repo.getOpportunity(Number(oppId));
    if (!o) throw notFound('Không thấy cơ hội này');
    own(o.runId);
    const ctx = contextOf(o.runId);
    const ins = repo.getInsight(o.insightId);
    const pain = ins ? repo.getPain(ins.painId) : null;
    const topic = pain ? repo.getTopic(pain.topicId) : null;
    const brief = repo.getBrief(o.briefId);
    const bv = brief ? briefView(brief) : null;
    const d = o.data;
    return {
      origin: { kind: 'ci', ref: String(o.id), snapshot: {
        runId: o.runId, runTitle: ctx.run.title, opportunityId: o.id, title: d.title, type: d.type, insight: ins ? ins.userData?.title ?? ins.data.title : null, pain: pain?.title ?? null,
        priority: o.score?.priority?.score ?? null, coverage: o.score?.priority?.coverage ?? null, evidenceStrength: o.score?.evidenceStrength ?? null,
        hooks: d.hooks, format: d.format, outline: d.outline, cta: d.cta, facts: d.facts, compliance: d.compliance, evidenceRefs: d.refs, whyNodeIds: brief?.whyNodeIds ?? [], briefId: o.briefId,
      } },
      topic: topic?.name ?? '', angle: d.angle, title: { text: d.title },
      pain: { text: pain?.statement || pain?.title || '', source: 'ci', evidence: (d.refs ?? []).map((r) => ctx.byRef.get(r)).filter(Boolean).slice(0, 5).map((c) => ({ text: c.text, likes: c.likes ?? 0 })) },
      belief: { common: bv?.data.misconception?.value ?? '', reality: '' },
    };
  }
  /** The owner approves: the opportunity becomes a card of the idea board (never done by the model). */
  function approve(id) {
    const o = repo.getOpportunity(Number(id));
    if (!o) throw notFound('Không thấy cơ hội này');
    own(o.runId);
    if (o.ideaId) return { opportunity: oppView(o), ideaId: o.ideaId, already: true };
    if (!ideas) throw invalid('Bảng ý tưởng chưa sẵn sàng', 'ideas');
    const card = ideas().create({ from: `ci:${o.id}` });
    repo.saveOpportunity(o.id, { status: 'approved', ideaId: card.id });
    repo.addFeedback(o.runId, 'opportunity', o.id, 'approve', { status: o.status }, { ideaId: card.id });
    return { opportunity: oppView(repo.getOpportunity(o.id)), ideaId: card.id };
  }

  // ---------- AI usage ----------
  function usage(runId) {
    const run = runOf(runId);
    const gens = repo.generations(run.id, 1000);
    const sum = (list) => ({ calls: list.length, cacheHits: list.filter((g) => g.cacheHit).length, errors: list.filter((g) => g.status !== 'ok').length, tokensIn: list.reduce((s, g) => s + (g.tokensIn ?? 0), 0), tokensOut: list.reduce((s, g) => s + (g.tokensOut ?? 0), 0), costUsd: list.reduce((s, g) => s + (g.costUsd ?? 0), 0), costUnknown: list.filter((g) => g.status === 'ok' && !g.cacheHit && g.costUsd == null).length, latencyMs: list.reduce((s, g) => s + (g.latencyMs ?? 0), 0) });
    const stages = uniq(gens.map((g) => g.stage)).map((s) => ({ stage: s, label: STAGE_VI[s] ?? s, ...sum(gens.filter((g) => g.stage === s)) }));
    return { run: runSummary(run), total: sum(gens), stages, models: uniq(gens.map((g) => g.model).filter(Boolean)), recent: gens.slice(0, 60), budgetUsd: run.config?.budgetUsd ?? null, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION };
  }
  function setBudget(runId, budgetUsd) {
    const run = runOf(runId);
    repo.saveRun(ws, run.id, { config: { ...run.config, budgetUsd: budgetUsd == null || budgetUsd === '' ? null : Math.max(0, Number(budgetUsd)) } });
    return usage(run.id);
  }

  // ---------- export ----------
  function exportRun(runId, format) {
    const ctx = contextOf(runId);
    const ov = overview(runId);
    const insights = repo.insights(ctx.run.id).map((i) => insightView(ctx, i));
    const analyses = repo.analysesOfRun(ctx.run.id).map((a) => whyView(a.id));
    const briefs = repo.briefs(ctx.run.id).map(briefView);
    const opps = repo.opportunities(ctx.run.id).map(oppView);
    if (format === 'json') return { run: ov.run, kpis: ov.kpis, sources: ctx.sources, topics: repo.topics(ctx.run.id), pains: repo.pains(ctx.run.id), insights, whys: analyses, briefs, opportunities: opps, comments: ctx.all.map((c) => ({ ...c, authorHash: undefined, labels: ctx.labels.get(c.ref) ?? null })), promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION };
    if (format === 'csv') {
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const head = ['ref', 'source', 'platform', 'reply_to', 'likes', 'replies', 'created_at', 'text', ...DIM_KEYS, 'pains', 'irrelevant'];
      const painsOf = new Map();
      for (const p of repo.pains(ctx.run.id)) for (const r of p.refs) (painsOf.get(r) ?? painsOf.set(r, []).get(r)).push(p.title);
      const rows = ctx.all.map((c) => [c.ref, c.sourceRef, c.platform, c.parentRef ?? '', c.likes ?? '', c.replies ?? '', c.createdAt ?? '', c.text, ...DIM_KEYS.map((d) => (ctx.labels.get(c.ref)?.[d] ?? []).join('|')), (painsOf.get(c.ref) ?? []).join(' | '), ctx.irrelevant.has(c.ref) ? 'yes' : ''].map(q).join(','));
      return '﻿' + [head.join(','), ...rows].join('\n');
    }
    const cite = (refs) => (refs?.length ? ` [${refs.join(', ')}]` : '');
    const st = (s) => EPISTEMIC_VI[s] ?? s;
    const lines = [`# ${ctx.run.title}`, '', `Nguồn: ${ctx.sources.length} · Comment hợp lệ: ${ctx.total} · Người bình luận: ${ov.kpis.uniqueCommenters ?? 'Không rõ'} · Chủ đề: ${ov.kpis.topics} · Nỗi đau: ${ov.kpis.pains}`, '', '## Nguồn', ...ctx.sources.map((s) => `- ${s.ref} · ${s.platform} · ${s.title || s.url || ''}${s.url ? ` (${s.url})` : ''}`), ''];
    lines.push('## Insight');
    for (const i of insights) {
      lines.push(`### ${i.data.title} — ${INSIGHT_STATE_VI[i.state] ?? i.state}`, `- Nỗi đau: ${i.data.painStatement}`, `- Điều dữ liệu cho thấy: ${i.data.observedPattern}`, `- Nhóm khách: ${i.data.segment?.description ?? 'Chưa đủ dữ liệu'} (${st(i.data.segment?.status)})`, `- Nhu cầu có thể có: ${i.data.need?.statement ?? 'Chưa rõ'} (${st(i.data.need?.status)})`, `- ${i.data.counts?.commentCount ?? 0} comment · ${i.data.counts?.uniqueCommenterCount ?? 'không rõ số'} người · ${i.data.counts?.sourceItemCount ?? 0} nguồn · bằng chứng ${STRENGTH_VI[i.data.evidenceStrength] ?? ''}`);
      for (const q of i.data.quotes ?? []) lines.push(`  > “${q.quote}” [${q.ref}]`);
      if (i.data.gaps?.length) lines.push(`- Còn thiếu: ${i.data.gaps.join('; ')}`);
      lines.push('');
    }
    if (analyses.length) {
      lines.push('## 5 Whys');
      for (const a of analyses) {
        lines.push(`### ${a.insight?.data.title ?? ''}`, `Vấn đề gốc: ${a.root?.statement ?? ''}${cite(a.root?.refs)}`);
        for (const n of a.nodes) lines.push(`${'  '.repeat(n.depth - 1)}- Why ${n.depth}: ${n.question} → ${n.answer} (${st(n.status)}, ${n.userStatus})${cite(n.supporting)}${n.gap ? ` — thiếu: ${n.gap}` : ''}`);
        lines.push(`Kết luận: ${STOP_VI[a.next] ?? a.next}. ${a.stopReason ?? ''}`, '');
      }
    }
    if (briefs.length) {
      lines.push('## 5W1H Brief');
      for (const b of briefs) {
        const f = (k, label) => `- ${label}: ${b.data[k]?.value ?? 'Cần thêm dữ liệu'} (${st(b.data[k]?.status)})${cite(b.data[k]?.refs)}`;
        lines.push(`### ${b.insight?.data.title ?? ''}`, f('who', 'WHO'), f('what', 'WHAT'), f('why', 'WHY'), f('when', 'WHEN'), f('where', 'WHERE'), `- HOW: ${(b.data.how?.formats ?? []).join(', ')}; ${b.data.how?.narrative ?? ''}`, `- Thông điệp: ${b.data.message}`, `- CTA: ${b.data.cta}`, ...(b.data.compliance ?? []).map((c) => `- Lưu ý: ${c}`), '');
      }
    }
    if (opps.length) {
      lines.push('## Cơ hội nội dung');
      for (const o of opps.sort((a, b) => (b.score?.priority?.score ?? -1) - (a.score?.priority?.score ?? -1))) {
        lines.push(`### ${o.title}`, `- Loại: ${OPPORTUNITY_TYPE_VI[o.type] ?? o.type} · Điểm ưu tiên: ${o.score?.priority?.score ?? '–'} (${o.score?.priority?.band ?? ''}, dữ liệu ${Math.round((o.score?.priority?.coverage ?? 0) * 100)}%) · Bằng chứng: ${STRENGTH_VI[o.score?.evidenceStrength] ?? ''}`, `- Cho ai: ${o.segment}`, `- Góc: ${o.angle}`, ...o.hooks.map((h) => `- Hook: ${h}`), `- Dàn ý: ${o.outline.join(' → ')}`, `- CTA: ${o.cta}`, `- Bằng chứng: ${o.refs.join(', ') || 'chưa có'}`, ...o.facts.map((f) => `- Cần kiểm chứng: ${f}`), ...o.compliance.map((c) => `- Lưu ý: ${c}`), '');
      }
    }
    lines.push('---', `Phân tích bằng AI (prompt ${PROMPT_VERSION}). Số liệu do app tính. Mọi nhận định "giả thuyết" cần kiểm chứng trước khi dùng.`);
    return lines.join('\n');
  }

  return {
    available, preview, createRun, runs, run: (id) => runSummary(runOf(id)), rename, removeRun, analyze,
    overview, topicList, painDetail, comments, relabel, editTopic, mergeTopics, editPain, insightAction, validateInsight,
    insight: (id) => { const i = insightOf(id); return insightView(contextOf(i.runId), i); },
    whysOfRun, whyView, startWhys, continueWhy, editNode, makeBrief, getBrief, editBrief, briefsOfRun,
    makeOpportunities, opportunities, setOpportunity, evaluate, approve, cardOf, usage, setBudget, exportRun,
    labels: { states: INSIGHT_STATES, stateVi: INSIGHT_STATE_VI, epistemicVi: EPISTEMIC_VI, stopVi: STOP_VI, stageVi: STAGE_VI },
  };
}
