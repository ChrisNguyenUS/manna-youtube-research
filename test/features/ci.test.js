import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';
import { createFakeLlm } from '../../src/llm/fake.js';

const CSV = `source,author,likes,date,text
https://fb.com/p/1,an,12,2026-11-01,Hồ sơ F4 của mình đang chờ thì có cần làm gì thêm không?
https://fb.com/p/1,binh,8,2026-11-02,Mất bao lâu thì tới lượt phỏng vấn vậy mọi người
https://fb.com/p/1,chi,3,2026-11-03,"Bên chị nhận làm hồ sơ không, giá bao nhiêu?"
https://fb.com/p/2,dung,20,2026-11-04,Priority Date 01/2022 đã tới lượt chưa mọi người?
https://fb.com/p/2,an,1,2026-11-05,Chờ lâu quá lo ghê
https://fb.com/p/2,em,0,2026-11-06,😂
https://fb.com/p/2,gia,4,2026-11-06,Mất bao lâu thì tới lượt phỏng vấn vậy mọi người`;

const env = (req) => JSON.parse(req.user);
const LABEL = { intent: ['question'], pain: ['uncertainty'], emotion: ['anxiety'], objection: [], buying_signal: ['none'], experience: ['unclear'], topics: [] };
/** A model that answers every mode from the IDs it was given, plus one made-up ID to check that it is dropped. */
/** @type {(req: any) => any} */
const model = (req) => {
  const e = env(req);
  if (req.task === 'classify_comments') return { results: e.comments.map((c) => ({ comment_id: c.evidence_id, language: 'vi', labels: c.text.includes('giá') ? { ...LABEL, intent: ['service_request'], buying_signal: ['asks_price'] } : LABEL, neutral_summary: 'Hỏi về hồ sơ', evidence_spans: [c.text.slice(0, 10)], confidence: 0.8, needs_review: false, reason: 'x' })).concat([{ comment_id: 'C999', language: 'vi', labels: LABEL, neutral_summary: '', evidence_spans: [], confidence: 1, needs_review: false, reason: '' }]), suggested_new_labels: [], warnings: [] };
  if (req.task === 'discover_topics') {
    const ids = e.evidence.map((x) => x.evidence_id);
    return { topics: [{ topic_key: 'processing_time', name: 'Thời gian xử lý', description: 'Hỏi thời gian', comment_ids: ids, suggested_pain_points: [{ pain_key: 'case_status', title: 'Không biết hồ sơ đang ở đâu', statement: 'Tôi không biết hồ sơ đang tới đâu', evidence_ids: [...ids, 'C404'], epistemic_status: 'supported' }], confidence: 0.7 }], unclassified_comment_ids: [], merge_split_notes: [], warnings: [] };
  }
  if (req.task === 'synthesize_insight') {
    const ids = e.evidence.map((x) => x.evidence_id);
    return { insights: [{ insight_key: 'case_status', title: 'Cần biết tình trạng và bước tiếp theo', observed_pattern: 'Nhiều câu hỏi về thời gian chờ', customer_segment: { description: 'Người đang chờ hồ sơ F4', epistemic_status: 'supported', evidence_ids: [ids[0]] }, possible_underlying_need: { statement: 'Có thể họ cần biết bước tiếp theo', epistemic_status: 'hypothesis', evidence_ids: [ids[0]] }, what_customers_say: [{ comment_id: ids[0], quote: e.evidence[0].text.slice(0, 15) }, { comment_id: ids[1], quote: 'câu này không có thật' }], supporting_evidence_ids: ids, contradicting_evidence_ids: [], epistemic_status: 'supported', confidence: 0.6, evidence_gaps: [], warnings: [] }] };
  }
  if (req.task === 'five_whys') {
    const ids = e.evidence.map((x) => x.evidence_id);
    if (e.focus_node_key) return { root_problem: { statement: 'x', evidence_ids: [], epistemic_status: 'observed' }, nodes: [{ node_key: 'NEW_1', parent_node_key: e.focus_node_key, question: 'Vì sao khó tự kiểm tra?', answer: 'Có thể vì thông tin chính thức khó đối chiếu', reasoning_summary: '', supporting_evidence_ids: [], contradicting_evidence_ids: [], epistemic_status: 'supported', confidence: 0.4, evidence_gap: 'Chưa có comment nói thẳng' }], next_action: 'stop_evidence_insufficient', stop_reason: 'Hết bằng chứng', root_cause_candidates: [], warnings: [] };
    return { root_problem: { statement: 'Không biết bước tiếp theo khi hồ sơ đang chờ', evidence_ids: [ids[0]], epistemic_status: 'observed' }, nodes: [{ node_key: 'NEW_1', parent_node_key: null, question: 'Vì sao họ hỏi thời gian?', answer: 'Họ muốn biết hồ sơ đang ở đâu', reasoning_summary: 'Hỏi trực tiếp', supporting_evidence_ids: [ids[0], 'C777'], contradicting_evidence_ids: [], epistemic_status: 'supported', confidence: 0.7, evidence_gap: null }, { node_key: 'NEW_9', parent_node_key: 'MISSING', question: 'q', answer: 'a', reasoning_summary: '', supporting_evidence_ids: [], contradicting_evidence_ids: [], epistemic_status: 'hypothesis', confidence: 0.1, evidence_gap: null }], next_action: 'continue', stop_reason: '', root_cause_candidates: [], warnings: [] };
  }
  if (req.task === 'five_w_one_h') {
    const id = e.evidence[0].evidence_id;
    const f = (value, status = 'supported') => ({ value, status, evidence_ids: value ? [id] : [] });
    return { who: f('Người đang chờ hồ sơ F4'), what: f('Muốn biết bước tiếp'), why: f('Không biết tự kiểm tra', 'hypothesis'), when: f(null, 'needs_input'), where: { value: 'Facebook', status: 'observed', evidence_ids: [] }, how: { recommended_format: ['step_by_step_explainer'], narrative_approach: null, proof_type: null, visual_demonstration: null, cta_intent: null, status: 'hypothesis', evidence_ids: [] }, central_insight: 'Cần biết bước tiếp theo', communication_objective: 'educate', message_to_land: 'Kiểm tra nguồn chính thức', misconception_to_address: f(null, 'needs_input'), proof_required: ['Nguồn chính thức'], cta_intent: 'Lưu checklist', compliance_notes: ['Không bảo đảm thời gian'], open_questions: [], warnings: [] };
  }
  if (req.task === 'generate_opportunities') {
    const id = e.evidence[0].evidence_id;
    return { opportunities: [{ opportunity_key: 'OPP_1', title: 'Hồ sơ đang chờ: kiểm tra gì trước?', target_segment: 'Người chờ F4', opportunity_type: 'process_walkthrough', angle: 'Phân biệt cái tự kiểm tra được', why_prioritize: 'Hỏi nhiều', hook_options: ['Hồ sơ đang chờ? Kiểm tra 3 điều này', 'b', 'c', 'd'], recommended_format: { platform: 'TikTok', format: 'short_video', duration_seconds: null }, outline: ['a', 'b', 'c'], cta: 'Lưu lại', audience_action: 'Kiểm tra', evidence_ids: [id, 'C555'], facts_to_verify: ['Quy trình'], compliance_notes: ['Không hứa'], evidence_strength: 'strong', epistemic_status: 'supported', warnings: [] }], near_duplicates: [], overall_warnings: [] };
  }
  throw new Error(`unexpected task ${req.task}`);
};

/** @param {(req: any) => any} [script] */
async function setup(script = model) {
  const llm = createFakeLlm(script);
  const app = testApp(undefined, undefined, { llm });
  app.store.settings.set(app.ws, { aiTagModel: 'tag/m', aiWriteModel: 'write/m', ciReasonModel: 'reason/m' });
  const ci = app.features.ci;
  const run = ci.createRun({ manualText: CSV, manualPlatform: 'facebook', title: 'Thử' });
  return { app, ci, llm, run };
}

test('ingest: refs, sources per post, duplicates and empty comments, authors hashed, nulls kept', async () => {
  const { ci, app, run } = await setup();
  assert.equal(run.sources, 2);
  assert.equal(run.comments, 6, 'the emoji-only comment is dropped');
  const comments = app.store.ci.comments(run.id);
  assert.deepEqual(comments.map((c) => c.ref), ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
  assert.equal(comments[5].duplicateOf, null, 'same text on another post is not a duplicate');
  assert.ok(comments.every((c) => c.authorHash && !c.authorHash.includes('an')), 'author names are hashed');
  assert.equal(run.uniqueCommenters, 5, 'people counted from author hashes, not from comments');
  const p = ci.preview({ manualText: 'text\nxin chào mọi người', manualPlatform: 'other' });
  assert.equal(p.comments, 1);
  assert.equal(p.authorsKnown, false);
});

test('the whole flow: classify → topics → insight → 5 Whys → brief → opportunity → idea board', async () => {
  const { ci, llm, run, app } = await setup();
  await ci.analyze({ runId: run.id, stage: 'all' });
  const r = ci.run(run.id);
  assert.equal(r.status, 'complete');
  assert.equal(r.labelled, 6);
  assert.deepEqual(llm.calls.map((c) => [c.task, c.model]).slice(0, 3), [['classify_comments', 'tag/m'], ['discover_topics', 'write/m'], ['synthesize_insight', 'write/m']]);
  assert.match(llm.calls[0].system, /Customer Intelligence Analyst/);
  assert.equal(r.stages.classify.audit.fabricated, 1, 'C999 was never sent and is thrown away');

  const topics = ci.topicList(run.id);
  assert.equal(topics.pains.length, 1);
  const pain = topics.pains[0];
  assert.equal(pain.counts.commentCount, 6);
  assert.equal(pain.counts.sourceItemCount, 2);
  const detail = ci.painDetail(run.id, pain.id);
  const ins = detail.insight;
  assert.ok(ins);
  assert.equal(ins.state, 'draft');
  assert.equal(ins.data.quotes.length, 1, 'a quote that is not in the comment is dropped');
  assert.equal(ins.data.counts.uniqueCommenterCount, 5);

  const whys = await ci.startWhys(ins.id);
  assert.equal(whys.nodes.length, 1, 'a node whose parent does not exist is dropped');
  assert.deepEqual(whys.nodes[0].supporting, ['C1'].filter((x) => whys.nodes[0].supporting.includes(x)), 'made-up C777 removed');
  assert.ok(!whys.nodes[0].supporting.includes('C777'));
  assert.ok(whys.warnings.some((w) => w.includes('giả thuyết')), 'an unchecked insight is flagged');
  assert.equal(llm.calls.at(-1).model, 'reason/m');
  const deeper = await ci.continueWhy(whys.nodes[0].id);
  const child = deeper.nodes.find((n) => n.depth === 2);
  assert.equal(child.status, 'hypothesis', '"supported" with no evidence becomes a hypothesis');
  ci.editNode(whys.nodes[0].id, { status: 'accepted' });

  const brief = await ci.makeBrief(ins.id, [child.id]);
  assert.deepEqual(brief.whyNodes.map((n) => n.depth), [1, 2], 'the chain above the chosen node is included');
  assert.equal(brief.data.when.status, 'needs_input');
  assert.equal(brief.data.where.status, 'hypothesis', 'observed without evidence is not observed');

  const withOpps = await ci.makeOpportunities(brief.id);
  const o = withOpps.opportunities[0];
  assert.equal(o.hooks.length, 3);
  assert.ok(!o.refs.includes('C555'));
  assert.ok(o.score.priority.score != null);
  assert.equal(o.score.dims.strategic_fit, null, 'not scored until the owner says');
  assert.ok(o.score.priority.coverage < 1);
  assert.equal(o.status, 'suggested', 'the workflow status, not the AI\'s epistemic status');
  assert.equal(o.epistemicStatus, 'supported');
  const fit = ci.setOpportunity(o.id, { strategicFit: 90 });
  assert.equal(fit.score.dims.strategic_fit, 90);
  assert.equal(fit.score.priority.coverage, 1);

  const ap = ci.approve(o.id);
  const card = app.features.ideas.get(ap.ideaId);
  assert.equal(card.card.origin.kind, 'ci');
  assert.equal(card.card.title.text, 'Hồ sơ đang chờ: kiểm tra gì trước?');
  assert.equal(card.card.pain.source, 'ci');
  assert.equal(ci.approve(o.id).already, true, 'approving twice makes one card');

  const md = ci.exportRun(run.id, 'md');
  assert.match(md, /## 5 Whys/);
  assert.match(ci.exportRun(run.id, 'csv'), /^﻿ref,source/);
  const usage = ci.usage(run.id);
  assert.ok(usage.total.calls >= 7);
});

test('incremental: classifying again sends nothing new; the per-comment cache answers a full rerun', async () => {
  const { ci, llm, run } = await setup();
  await ci.analyze({ runId: run.id, stage: 'classify' });
  const before = llm.calls.length;
  await ci.analyze({ runId: run.id, stage: 'classify', scope: 'new' });
  assert.equal(llm.calls.length, before, 'nothing new to label');
  await ci.analyze({ runId: run.id, stage: 'classify', scope: 'full' });
  assert.equal(llm.calls.length, before, 'same text, prompt and model: answered from the cache');
  assert.equal(ci.run(run.id).stages.classify.cached, 6);
});

test('owner edits stay apart from the AI: relabel, irrelevant, insight states', async () => {
  const { ci, run } = await setup();
  await ci.analyze({ runId: run.id, stage: 'all' });
  const v = ci.relabel(run.id, 'C1', { labels: { intent: ['complaint', 'nope'] } });
  assert.deepEqual(v.labels.intent, ['complaint']);
  assert.equal(v.corrected, true);
  ci.relabel(run.id, 'C2', { irrelevant: true });
  assert.equal(ci.overview(run.id).kpis.comments, 5);
  const pain = ci.topicList(run.id).pains[0];
  const ins = ci.painDetail(run.id, pain.id).insight;
  assert.equal(ci.insightAction(ins.id, { action: 'validate' }).state, 'validated_by_user');
  const e = ci.insightAction(ins.id, { action: 'edit', title: 'Tên mới' });
  assert.equal(e.data.title, 'Tên mới');
  assert.equal(e.ai.title, 'Cần biết tình trạng và bước tiếp theo');
});

test('a failed classify batch is retried once and the run stays partial, not failed', async () => {
  let n = 0;
  const { ci, run } = await setup((req) => (req.task === 'classify_comments' && n++ < 2 ? new Error('busy') : model(req)));
  await ci.analyze({ runId: run.id, stage: 'classify' });
  const st = ci.run(run.id).stages.classify;
  assert.equal(st.failedBatches, 1);
  assert.equal(st.unlabelled, 0, 'the missing part was sent again');
  assert.equal(st.status, 'complete');
});

test('budget: no call once the run spent what it was given', async () => {
  const { ci, run } = await setup();
  ci.setBudget(run.id, 0.1);
  await ci.analyze({ runId: run.id, stage: 'classify' }); // the fake costs 0.25 per call
  await assert.rejects(() => ci.analyze({ runId: run.id, stage: 'topics' }), { code: 'ci_budget' });
  assert.equal(ci.run(run.id).stages.topics.status, 'failed');
});
