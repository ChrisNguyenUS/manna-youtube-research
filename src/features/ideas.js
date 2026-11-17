// Use case: the idea board (spec 2026-11-16-idea-board-design.md). Batches of up to ten live cards; each card is
// checked against Kallaway's six idea questions, the first one by searching the brick library.
import { LEGO, STATUSES, FUNNEL, QUESTIONS, LIMITS, emptyCard, cleanCard, statusOf, checksOf, batchCounts, batchNudge, isFromWinner } from '../core/ideas/card.js';
import { precedentOf } from '../core/ideas/precedent.js';
import { CONCEPTS } from '../core/bricks/schema.js';
import { ideasMarkdown } from '../core/report/ideas.js';
import { aiError } from '../core/ai/base.js';
import { ACTIONS, assistRequest, checkAssist } from '../core/ideas/assist.js';
import { modelOf } from './ai/run.js';
import { LENGTHS, cleanOutline, timelineOf, outlineGaps } from '../core/outline/outline.js';
import { lintScript } from '../core/outline/lint.js';
import { ACTIONS as OUTLINE_ACTIONS, outlineRequest, checkOutlineAssist } from '../core/outline/assist.js';
import { outlineMarkdown } from '../core/report/outline.js';

const invalid = (message, field) => Object.assign(new Error(message), { code: 'invalid_input', field });
const notFound = (message) => Object.assign(new Error(message), { code: 'not_found' });
const FULL = `Lô đang mở đã đủ ${LIMITS.live} thẻ. Bỏ một thẻ, hoặc mở lô mới.`;

/**
 * @param {{repo: any, ws: string, settings: () => Record<string, any>, profile: () => any,
 *   library: {list: () => any[], get: (platform: string, videoId: string) => any}, fiveW: {report: (id: number) => any}, llm: import('../ports/llm.js').LlmClient,
 *   knowledge?: string, hookKnowledge?: string, profileText?: () => string}} deps
 *   library: the brick library (features.bricks), read for question 1 and for cards made from a video
 */
export function makeIdeas({ repo, ws, settings, profile, library, fiveW, llm, knowledge = '', hookKnowledge = '', profileText = () => '' }) {
  /** Ways to make a new card: `from` prefix → card fields. Later tasks add sources here. @type {Record<string, (parts: string[]) => any>} */
  const sources = { self: () => emptyCard() };

  /** brick:PLATFORM:VIDEOID — the owner keeps the topic and the crowd's belief, and writes their own angle and reality. */
  sources.brick = ([platform, ...rest]) => {
    const videoId = rest.join(':');
    if (!['tiktok', 'youtube'].includes(platform) || !videoId) throw invalid('Nguồn video không hợp lệ', 'from');
    const r = library.get(platform, videoId);
    const b = r.bricks;
    return {
      origin: { kind: 'brick', ref: `${platform}:${videoId}`, snapshot: {
        title: r.meta.title, url: r.meta.url, platform, videoId, channelTitle: r.meta.channelTitle, score: r.meta.score ?? null,
        topic: b.topic, angle: b.angle, concept: b.concept, pillar: b.pillar, hook: { spoken: b.hook.spoken, formula: b.hook.formula, archetype: b.hook.archetype }, story: { category: b.story.category }, belief: b.belief,
      } },
      topic: b.topic, pillar: b.pillar, concept: b.concept, belief: { common: b.belief?.common ?? '', reality: '' },
    };
  };
  /** pain:INDEX — a pain of Soulprint's pain bank. */
  sources.pain = ([i]) => {
    const p = (profile()?.pains ?? [])[Number(i)];
    if (!p || !/^\d+$/.test(String(i))) throw notFound('Nỗi đau này không còn trong Soulprint');
    return { origin: { kind: 'pain', ref: String(i), snapshot: { text: p.text } }, pain: { text: p.text, source: p.source === '5w1h' ? '5w1h' : 'soulprint', evidence: [] } };
  };
  /** 5w1h:RECORDID:INDEX — a content idea of a 5W1H report, with its evidence comments' words. */
  sources['5w1h'] = ([recordId, i]) => {
    const rep = fiveW.report(Number(recordId));
    const x = (rep.data?.ideas ?? [])[Number(i)];
    if (!x) throw notFound('Gợi ý này không còn trong báo cáo 5W1H');
    const byId = new Map(rep.comments.map((c) => [String(c.id), c]));
    const quotes = (ids) => (ids ?? []).map((id) => byId.get(String(id))).filter(Boolean).map((c) => ({ text: c.text, likes: c.likes ?? 0 }));
    return {
      origin: { kind: '5w1h', ref: `${recordId}:${i}`, snapshot: { recordId: rep.id, recordTitle: rep.title, title: x.title } },
      title: { text: x.title }, pain: { text: x.pain ?? '', source: '5w1h', evidence: quotes(x.evidence) },
      belief: { common: x.belief?.text ?? '', reality: '' }, concept: x.concept, funnel: x.funnel,
    };
  };

  function openBatchId() {
    const open = repo.openBatch(ws);
    return open ? open.id : repo.addBatch(ws, `Lô ${repo.listBatches(ws).length + 1}`);
  }
  const liveIn = (batchId) => repo.cards(ws, batchId).filter((x) => x.status !== 'dropped').length;

  /** A stored card with its checks, read against today's library and Soulprint. */
  function view(row, ctx) {
    const card = cleanCard(row.data);
    const outline = cleanOutline(row.outline);
    const precedent = precedentOf(card, ctx.rows, { min: ctx.min });
    const { checks, ready, missing } = checksOf(card, precedent, { hasFilter: ctx.hasFilter });
    return { id: row.id, batchId: row.batchId, status: row.status, card, checks, ready, missing, trial: card.origin.kind === 'self', fromWinner: isFromWinner(card, ctx.min), matches: precedent.matches, outline, script: row.script ?? '', timeline: timelineOf(outline), gaps: outlineGaps(outline, card), createdAt: row.createdAt, updatedAt: row.updatedAt };
  }
  function context() {
    const p = profile() ?? {};
    return { rows: library.list(), min: Number(settings().bricksMinScore) || 3, hasFilter: !!p.filter, pillars: (p.pillars ?? []).map((x) => x.name).filter(Boolean) };
  }
  function one(id) {
    const row = Number.isInteger(Number(id)) ? repo.getCard(ws, Number(id)) : null;
    if (!row) throw notFound('Không thấy thẻ ý tưởng này');
    return row;
  }

  /** @param {number} [batchId] none: the open batch, made when there is none */
  function board(batchId) {
    const id = batchId ?? openBatchId();
    const batch = repo.getBatch(ws, id);
    if (!batch) throw notFound('Không thấy lô này');
    const ctx = context();
    const cards = repo.cards(ws, id).map((r) => view(r, ctx));
    const counts = batchCounts(cards);
    return {
      batch, batches: repo.listBatches(ws), cards, counts, nudge: batchNudge(counts), hasFilter: ctx.hasFilter, pillars: ctx.pillars,
      lists: { lego: LEGO, statuses: STATUSES, funnel: FUNNEL, questions: QUESTIONS, concepts: CONCEPTS }, ai: llm.ready(),
    };
  }

  /** @param {{from?: string}} input "self", or a source registered by a later task ("brick:…", "pain:…", "5w1h:…") */
  function create({ from } = {}) {
    const [kind, ...parts] = String(from ?? '').split(':');
    const make = sources[kind];
    if (!make) throw invalid('Không biết tạo thẻ từ đâu', 'from');
    const batchId = openBatchId();
    if (liveIn(batchId) >= LIMITS.live) throw invalid(FULL, 'batch');
    const card = cleanCard(make(parts));
    const id = repo.addCard(ws, batchId, 'draft', card);
    return view(repo.getCard(ws, id), context());
  }

  /** @param {number|string} id @param {Record<string, any>} patch fields of the card, and `status`; the origin never changes */
  function update(id, patch) {
    const row = one(id);
    const p = patch && typeof patch === 'object' ? patch : {};
    const status = p.status === undefined ? row.status : statusOf(p.status);
    if (row.status === 'dropped' && status !== 'dropped' && liveIn(row.batchId) >= LIMITS.live) throw invalid(FULL, 'status');
    const { status: _s, origin: _o, ...fields } = p;
    const card = cleanCard({ ...row.data, ...fields, origin: row.data.origin });
    repo.saveCard(ws, row.id, status, card);
    return view(repo.getCard(ws, row.id), context());
  }

  /**
   * @param {string} [title] the open batch is closed and a new one opened; none: "Lô N". An open batch with no card at
   * all is reused (renamed when a title is given) instead of leaving an empty closed batch behind.
   */
  function newBatch(title) {
    const name = String(title ?? '').trim().slice(0, 80);
    const open = repo.openBatch(ws);
    if (open && !repo.cards(ws, open.id).length) {
      if (name) repo.renameBatch(ws, open.id, name);
      return board(open.id);
    }
    if (open) repo.closeBatch(ws, open.id);
    return board(repo.addBatch(ws, name || `Lô ${repo.listBatches(ws).length + 1}`));
  }

  /**
   * One AI helper on a card. `card` is the unsaved card on screen; the stored one is used when it is missing.
   * Returns a suggestion and saves nothing. @param {string} action @param {{id: number|string, card?: any}} input
   */
  async function assist(action, { id, card } = /** @type {any} */ ({})) {
    if (!ACTIONS.includes(action)) throw invalid('Không có trợ lý này', 'action');
    const row = one(id);
    if (!llm.ready()) throw aiError('llm_no_key', 'Chưa nhập API key OpenRouter. Vào Cài đặt để nhập.');
    const onScreen = cleanCard({ ...row.data, ...(card && typeof card === 'object' ? card : {}), origin: row.data.origin });
    const model = modelOf(settings().aiWriteModel);
    const r = await llm.complete({ ...assistRequest(action, { card: onScreen, profileText: profileText(), knowledge }), model });
    return { action, suggestion: checkAssist(action, r.json), usage: { model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd } };
  }

  /** @param {number|string} id @param {any} outline the whole outline on screen */
  function saveOutline(id, outline) {
    const row = one(id);
    repo.saveOutline(ws, row.id, cleanOutline(outline));
    return view(repo.getCard(ws, row.id), context());
  }
  /** The owner's own script, saved with its check. @param {number|string} id @param {string} text */
  function saveScript(id, text) {
    const row = one(id);
    const script = String(text ?? '').slice(0, 20_000);
    repo.saveScript(ws, row.id, script);
    const v = view(repo.getCard(ws, row.id), context());
    return { view: v, lint: lintScript(script, { length: v.outline.length, leadMagnet: v.card.leadMagnet }) };
  }
  /** @param {number|string} id */
  function outlineMd(id) {
    const v = view(one(id), context());
    return outlineMarkdown(v, { voice: String(profile()?.voice ?? '') });
  }

  /**
   * One outline helper. `outline` and `card` are what is on screen; the stored ones are used when missing.
   * Returns a suggestion and saves nothing. @param {string} action @param {{id: number|string, outline?: any, card?: any, archetype?: string}} input
   */
  async function outlineAssist(action, { id, outline, card, archetype } = /** @type {any} */ ({})) {
    if (!OUTLINE_ACTIONS.includes(action)) throw invalid('Không có trợ lý này', 'action');
    const row = one(id);
    if (!llm.ready()) throw aiError('llm_no_key', 'Chưa nhập API key OpenRouter. Vào Cài đặt để nhập.');
    const onCard = cleanCard({ ...row.data, ...(card && typeof card === 'object' ? card : {}), origin: row.data.origin });
    const onOutline = cleanOutline(outline && typeof outline === 'object' ? outline : row.outline);
    const model = modelOf(settings().aiWriteModel);
    const r = await llm.complete({ ...outlineRequest(action, { card: onCard, outline: onOutline, archetype, profileText: profileText(), knowledge: hookKnowledge }), model });
    return { action, suggestion: checkOutlineAssist(action, r.json, onOutline), usage: { model, tokensIn: r.tokensIn, tokensOut: r.tokensOut, costUsd: r.costUsd } };
  }

  return {
    outlineAssist, saveOutline, saveScript, outlineMarkdown: outlineMd, lint: (text, o) => lintScript(text, { length: LENGTHS.includes(Number(o?.length)) ? Number(o.length) : 45, leadMagnet: String(o?.leadMagnet ?? '') }),
    sources, assist, board, create, update, newBatch,
    get: (id) => view(one(id), context()),
    remove: (id) => void repo.removeCard(ws, one(id).id),
    /** @param {number} [batchId] */
    markdown: (batchId) => ideasMarkdown(board(batchId)),
  };
}
