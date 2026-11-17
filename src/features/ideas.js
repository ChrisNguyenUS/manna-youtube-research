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
import { GAMES, LEVELS, cleanPublished, addSnapshot, metricsOf, rankBatch, attributesOf, brickTable, proposalsOf, loserDiffs, cleanLearned } from '../core/ideas/review.js';
import { reviewMarkdown } from '../core/report/review.js';
import { TIKTOK_LINK } from './bricks.js';
import { youtubeIdOf } from './video-analysis.js';
import { noop } from './shared.js';
import { rethrowIfCancelled } from '../core/cancel.js';

const invalid = (message, field) => Object.assign(new Error(message), { code: 'invalid_input', field });
const notFound = (message) => Object.assign(new Error(message), { code: 'not_found' });
const FULL = `Lô đang mở đã đủ ${LIMITS.live} thẻ. Bỏ một thẻ, hoặc mở lô mới.`;

/**
 * @param {{repo: any, ws: string, settings: () => Record<string, any>, profile: () => any,
 *   library: {list: () => any[], get: (platform: string, videoId: string) => any}, fiveW: {report: (id: number) => any}, llm: import('../ports/llm.js').LlmClient,
 *   knowledge?: string, hookKnowledge?: string, profileText?: () => string,
 *   tiktok: import('../ports/tiktok-source.js').TikTokSource, source: import('../ports/youtube-source.js').YouTubeSource, now?: () => number}} deps
 *   library: the brick library (features.bricks), read for question 1 and for cards made from a video
 *   tiktok, source: read the numbers of posted videos
 */
export function makeIdeas({ repo, ws, settings, profile, library, fiveW, llm, knowledge = '', hookKnowledge = '', profileText = () => '', tiktok, source, now = Date.now }) {
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

  /** redo:CARDID — remake a posted video of an earlier batch: same idea, every brick kept; the owner changes one. */
  sources.redo = ([cardId]) => {
    const row = repo.getCard(ws, Number(cardId));
    if (!row || !row.published?.url) throw notFound('Không thấy video đã đăng của thẻ này');
    if (row.batchId === openBatchId()) throw invalid('Thẻ này còn trong lô đang mở. Đóng lô ở màn Chấm lô trước, rồi làm lại video trong lô sau.', 'from');
    const c = cleanCard(row.data);
    const p = cleanPublished(row.published);
    const m = metricsOf(p, now());
    return {
      origin: { kind: 'redo', ref: String(row.id), snapshot: { title: titleOf(row), url: p.url, platform: p.platform, videoId: p.videoId, views: m.views, leads: m.leads, batchId: row.batchId } },
      topic: c.topic, pillar: c.pillar, angle: c.angle, concept: c.concept, funnel: c.funnel, pain: c.pain, belief: c.belief, leadMagnet: c.leadMagnet,
      keep: LEGO.map(([k]) => k),
    };
  };
  /** How a card is named in messages and lists. @param {any} row */
  function titleOf(row) {
    const c = cleanCard(row.data);
    return c.title.text || c.topic || `Thẻ ${row.id}`;
  }

  function openBatchId() {
    const open = repo.openBatch(ws);
    return open ? open.id : repo.addBatch(ws, `Lô ${repo.listBatches(ws).length + 1}`);
  }
  const liveIn = (batchId) => repo.cards(ws, batchId).filter((x) => x.status !== 'dropped').length;

  /** A stored card with its checks, read against today's library and Soulprint. */
  function view(row, ctx) {
    const card = cleanCard(row.data);
    const outline = cleanOutline(row.outline);
    const published = row.published ? cleanPublished(row.published) : null;
    const precedent = precedentOf(card, ctx.rows, { min: ctx.min });
    const { checks, ready, missing } = checksOf(card, precedent, { hasFilter: ctx.hasFilter });
    return { id: row.id, batchId: row.batchId, status: row.status, card, checks, ready, missing, trial: card.origin.kind === 'self', fromWinner: isFromWinner(card, ctx.min), matches: precedent.matches, outline, script: row.script ?? '', timeline: timelineOf(outline), gaps: outlineGaps(outline, card), published, result: published && metricsOf(published, now()), createdAt: row.createdAt, updatedAt: row.updatedAt };
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
      learnedFrom: learnedBefore(id),
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

  /** What the newest earlier batch left for this one, when it left anything. @param {number} id */
  function learnedBefore(id) {
    const prev = repo.lastLearned(ws, id);
    return prev && (prev.learned.keep?.length || prev.learned.review?.length) ? { id: prev.id, title: prev.title, learned: prev.learned } : null;
  }

  /** A pasted link → its platform and id; null when it is neither. A short TikTok link shows its id only once loaded. @param {string} url */
  function linkOf(url) {
    if (TIKTOK_LINK.test(url)) return { platform: /** @type {const} */ ('tiktok'), videoId: url.match(/(\d{15,25})/)?.[1] ?? null };
    const yt = youtubeIdOf(url);
    return yt ? { platform: /** @type {const} */ ('youtube'), videoId: yt } : null;
  }
  /** The numbers of one posted video, from its platform. @param {'tiktok'|'youtube'} platform @param {string} url @param {string|null} videoId */
  async function fetchNumbers(platform, url, videoId) {
    if (platform === 'tiktok') {
      const { video: v } = await tiktok.getVideo(url);
      return { videoId: String(v.id), postedAt: v.createdAt ?? null, numbers: { views: v.plays, likes: v.likes, comments: v.comments, shares: v.shares, saves: v.saves } };
    }
    const v = await source.getVideo(/** @type {string} */ (videoId), { likes: true });
    return { videoId: /** @type {string} */ (videoId), postedAt: v.publishedAt ?? null, numbers: { views: v.views, likes: v.likes, comments: v.comments, shares: null, saves: null } };
  }
  /** Throws when another card already holds this video. @param {number} id @param {string} url @param {{platform: string, videoId: string|null}} link */
  function notTaken(id, url, { platform, videoId }) {
    const other = repo.publishedCards(ws).find((r) => r.id !== id && (r.published.url === url || (videoId && r.published.platform === platform && r.published.videoId === videoId)));
    if (other) throw invalid(`Video này đã gắn vào thẻ "${titleOf(other)}"`, 'url');
  }

  /**
   * Attaches the posted video to a card and reads its numbers. A link the app cannot read is kept with the reason, and
   * the owner can type the views. The card becomes "Đã đăng". @param {number|string} id @param {string} url
   */
  async function attachVideo(id, url) {
    const row = one(id);
    if (row.status === 'dropped') throw invalid('Thẻ đang bị bỏ. Đưa thẻ lại vào lô trước khi gắn video.', 'status');
    const clean = String(url ?? '').trim().slice(0, 500);
    const link = linkOf(clean);
    if (!link) throw invalid('Không nhận ra link video TikTok hoặc YouTube', 'url');
    notTaken(row.id, clean, link);
    const before = cleanPublished(row.published);
    // A new link starts its numbers over; the owner's own counts stay.
    let p = cleanPublished({ ...before, url: clean, platform: link.platform, videoId: link.videoId, ...(before.url === clean ? {} : { snapshots: [], postedAt: null }) });
    try {
      const got = await fetchNumbers(link.platform, clean, link.videoId);
      notTaken(row.id, clean, { platform: link.platform, videoId: got.videoId });
      p = addSnapshot(cleanPublished({ ...p, videoId: got.videoId, postedAt: got.postedAt ?? p.postedAt }), got.numbers, new Date(now()).toISOString());
    } catch (e) {
      if (/** @type {any} */ (e)?.code === 'invalid_input') throw e;
      p = cleanPublished({ ...p, error: `Không lấy được số liệu: ${String(/** @type {any} */ (e)?.message || e)}. Có thể nhập view bằng tay.` });
    }
    repo.savePublished(ws, row.id, p);
    if (row.status !== 'posted') repo.saveCard(ws, row.id, 'posted', cleanCard(row.data));
    return view(repo.getCard(ws, row.id), context());
  }
  /** Removes the link and its numbers; a posted card goes back to "Đã quay". @param {number|string} id */
  function clearVideo(id) {
    const row = one(id);
    repo.savePublished(ws, row.id, null);
    if (row.status === 'posted') repo.saveCard(ws, row.id, 'filmed', cleanCard(row.data));
    return view(repo.getCard(ws, row.id), context());
  }
  /**
   * The owner's own counts: leads, followers gained, and views when the link could not be read. A key left out stays
   * as it was; empty means "not known". @param {number|string} id @param {{leads?: any, followers?: any, views?: any}} input
   */
  function saveResult(id, input) {
    const row = one(id);
    if (!row.published?.url) throw invalid('Gắn link video đã đăng trước khi nhập số', 'url');
    const s = input && typeof input === 'object' ? input : {};
    const before = cleanPublished(row.published);
    const num = (k, label) => {
      const v = s[k];
      if (v === undefined) return before[k];
      if (v === null || v === '') return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) throw invalid(`${label} phải là số nguyên từ 0 trở lên, hoặc để trống nếu chưa biết`, k);
      return n;
    };
    repo.savePublished(ws, row.id, cleanPublished({ ...before, leads: num('leads', 'Số khách'), followers: num('followers', 'Số follower tăng'), views: num('views', 'Số view') }));
    return view(repo.getCard(ws, row.id), context());
  }

  /** Job batch_refresh: new numbers for every card of a batch with a link. A failed video keeps its old numbers and says why. */
  async function refresh(p = /** @type {any} */ ({}), progress = noop) {
    const batch = repo.getBatch(ws, Number(p.batchId));
    if (!batch) throw notFound('Không thấy lô này');
    const list = repo.cards(ws, batch.id).filter((r) => r.status !== 'dropped' && r.published?.url && r.published.platform);
    let failed = 0;
    for (const [i, r] of list.entries()) {
      progress({ step: `Cập nhật ${titleOf(r)} (${i + 1}/${list.length})`, done: i, total: list.length });
      const pub = cleanPublished(r.published);
      try {
        const got = await fetchNumbers(/** @type {'tiktok'|'youtube'} */ (pub.platform), pub.url, pub.videoId);
        repo.savePublished(ws, r.id, addSnapshot(cleanPublished({ ...pub, videoId: got.videoId, postedAt: pub.postedAt ?? got.postedAt }), got.numbers, new Date(now()).toISOString()));
      } catch (e) {
        rethrowIfCancelled(e);
        failed++;
        repo.savePublished(ws, r.id, cleanPublished({ ...pub, error: `Không lấy được số liệu: ${String(/** @type {any} */ (e)?.message || e)}` }));
      }
    }
    progress({ step: 'Xong', done: list.length, total: list.length });
    return { inline: true, checked: list.length, failed };
  }

  /** A batch ranked by Soulprint's game, the bricks of its halves, the bottom half's differences. @param {number|string} batchId */
  function review(batchId) {
    const batch = repo.getBatch(ws, Number(batchId));
    if (!batch) throw notFound('Không thấy lô này');
    const game = profile()?.game ?? null;
    const live = repo.cards(ws, batch.id).filter((r) => r.status !== 'dropped');
    const posted = live.filter((r) => r.published?.url);
    const ranked = rankBatch(posted.map((r) => ({ id: r.id, title: titleOf(r), published: cleanPublished(r.published) })), game, now());
    const attrs = new Map(posted.map((r) => [r.id, attributesOf(cleanCard(r.data), r.outline ? cleanOutline(r.outline) : null)]));
    // Only videos with the numbers their game ranks by, posted three days ago or more, say anything about bricks.
    const eligible = ranked.rows.filter((r) => !r.missing && !r.metrics.fresh);
    const table = brickTable(eligible, attrs);
    const winner = eligible[0] ?? null;
    return {
      batch, game, gameLabel: game ? GAMES[game] : null, note: ranked.note, rows: ranked.rows, table,
      losers: loserDiffs(table, attrs, new Map(ranked.rows.map((r) => [r.id, r.title]))), proposals: proposalsOf(table), levels: LEVELS,
      winner: winner && { id: winner.id, title: winner.title }, posted: posted.length, live: live.length,
    };
  }
  /**
   * Keeps what the owner takes from a batch. An open batch is closed and a new one opened; a closed one only gets its
   * lines replaced. Numbers stay editable after. @param {number|string} batchId @param {any} learned {keep: string[], review: string[]}
   */
  function close(batchId, learned) {
    const batch = repo.getBatch(ws, Number(batchId));
    if (!batch) throw notFound('Không thấy lô này');
    const l = cleanLearned(learned, { game: profile()?.game ?? null, at: new Date(now()).toISOString() });
    if (batch.status === 'open') {
      repo.closeBatch(ws, batch.id, l);
      repo.addBatch(ws, `Lô ${repo.listBatches(ws).length + 1}`);
    } else repo.saveLearned(ws, batch.id, l);
    return review(batch.id);
  }

  return {
    attachVideo, clearVideo, saveResult, refresh, review, close, reviewMarkdown: (batchId) => reviewMarkdown(review(batchId)),
    outlineAssist, saveOutline, saveScript, outlineMarkdown: outlineMd, lint: (text, o) => lintScript(text, { length: LENGTHS.includes(Number(o?.length)) ? Number(o.length) : 45, leadMagnet: String(o?.leadMagnet ?? '') }),
    sources, assist, board, create, update, newBatch,
    get: (id) => view(one(id), context()),
    remove: (id) => void repo.removeCard(ws, one(id).id),
    /** @param {number} [batchId] */
    markdown: (batchId) => ideasMarkdown(board(batchId)),
  };
}
