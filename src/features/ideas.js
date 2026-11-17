// Use case: the idea board (spec 2026-11-16-idea-board-design.md). Batches of up to ten live cards; each card is
// checked against Kallaway's six idea questions, the first one by searching the brick library.
import { LEGO, STATUSES, FUNNEL, QUESTIONS, LIMITS, emptyCard, cleanCard, statusOf, checksOf, batchCounts, batchNudge } from '../core/ideas/card.js';
import { precedentOf } from '../core/ideas/precedent.js';
import { CONCEPTS } from '../core/bricks/schema.js';
import { ideasMarkdown } from '../core/report/ideas.js';

const invalid = (message, field) => Object.assign(new Error(message), { code: 'invalid_input', field });
const notFound = (message) => Object.assign(new Error(message), { code: 'not_found' });
const FULL = `Lô đang mở đã đủ ${LIMITS.live} thẻ. Bỏ một thẻ, hoặc mở lô mới.`;

/**
 * @param {{repo: any, ws: string, settings: () => Record<string, any>, profile: () => any,
 *   library: {list: () => any[], get: (platform: string, videoId: string) => any}, llm: import('../ports/llm.js').LlmClient}} deps
 *   library: the brick library (features.bricks), read for question 1 and for cards made from a video
 */
export function makeIdeas({ repo, ws, settings, profile, library, llm }) {
  /** Ways to make a new card: `from` prefix → card fields. Later tasks add sources here. @type {Record<string, (parts: string[]) => any>} */
  const sources = { self: () => emptyCard() };

  function openBatchId() {
    const open = repo.openBatch(ws);
    return open ? open.id : repo.addBatch(ws, `Lô ${repo.listBatches(ws).length + 1}`);
  }
  const liveIn = (batchId) => repo.cards(ws, batchId).filter((x) => x.status !== 'dropped').length;

  /** A stored card with its checks, read against today's library and Soulprint. */
  function view(row, ctx) {
    const card = cleanCard(row.data);
    const precedent = precedentOf(card, ctx.rows, { min: ctx.min });
    const { checks, ready, missing } = checksOf(card, precedent, { hasFilter: ctx.hasFilter });
    return { id: row.id, batchId: row.batchId, status: row.status, card, checks, ready, missing, trial: card.origin.kind === 'self', matches: precedent.matches, createdAt: row.createdAt, updatedAt: row.updatedAt };
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

  /** @param {string} [title] the open batch is closed; none: "Lô N" */
  function newBatch(title) {
    const open = repo.openBatch(ws);
    if (open) repo.closeBatch(ws, open.id);
    const id = repo.addBatch(ws, String(title ?? '').trim().slice(0, 80) || `Lô ${repo.listBatches(ws).length + 1}`);
    return board(id);
  }

  return {
    sources, board, create, update, newBatch,
    get: (id) => view(one(id), context()),
    remove: (id) => void repo.removeCard(ws, one(id).id),
    /** @param {number} [batchId] */
    markdown: (batchId) => ideasMarkdown(board(batchId)),
  };
}
