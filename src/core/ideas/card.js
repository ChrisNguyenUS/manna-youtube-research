// An idea card of the board: what it holds, how it is cleaned, and Kallaway's six idea questions computed from it.
// A question is answered by filling its field, never by a tick, so "có" always has something behind it. Pure.
import { conceptOf } from '../bricks/schema.js';

/** Kallaway's seven Lego bricks: [key, label]. */
export const LEGO = /** @type {const} */ ([['topic', 'Topic'], ['angle', 'Angle'], ['hookStructure', 'Hook Structure'], ['storyStructure', 'Story Structure'], ['visualFormat', 'Visual Format'], ['keyVisuals', 'Key Visuals'], ['audio', 'Audio']]);
export const STATUSES = /** @type {const} */ ([['draft', 'Nháp'], ['chosen', 'Chốt'], ['filmed', 'Đã quay'], ['posted', 'Đã đăng'], ['dropped', 'Bỏ']]);
export const FUNNEL = /** @type {const} */ ([['biet', 'Biết'], ['thich', 'Thích'], ['tin', 'Tin'], ['yeu', 'Yêu']]);
/** self: thought up by the owner; brick: from a video of the brick library; pain: a pain of Soulprint; 5w1h: a suggestion of a 5W1H report. */
export const ORIGINS = ['self', 'brick', 'pain', '5w1h'];
export const QUESTIONS = /** @type {const} */ ([
  ['q1', 'Đã có video tương tự thắng dạng vượt kênh ở kênh tương đương chưa?'],
  ['q2', 'Nỗi đau của avatar nói được trong một câu chưa?'],
  ['q3', 'Góc đi ngược nói được trong một dòng chưa?'],
  ['q4', 'Khoảng cách giữa điều người ta tin và thực tế ở đâu?'],
  ['q5', 'Giữ gạch nào, làm lại gạch nào?'],
  ['q6', 'Lead magnet nào khớp?'],
]);
export const LIMITS = { live: 10, text: 400, short: 150, evidence: 5 };
const PAIN_SOURCES = ['self', 'soulprint', '5w1h'];
const FILTER = ['yes', 'no', 'unknown'];

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const list = (v) => (Array.isArray(v) ? v : []);
const text = (v, max = LIMITS.text) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');

export function emptyCard() {
  return {
    origin: { kind: 'self', ref: /** @type {string|null} */ (null), snapshot: /** @type {any} */ (null) },
    keep: /** @type {string[]} */ ([]), remix: /** @type {string[]} */ ([]),
    topic: '', pillar: '', angle: '', concept: /** @type {string|null} */ (null), funnel: /** @type {string|null} */ (null),
    pain: { text: '', source: 'self', evidence: /** @type {{text: string, likes: number}[]} */ ([]) },
    belief: { common: '', reality: '' }, title: { d: '', i: '', c: '', k: '', text: '' }, leadMagnet: '',
    filterOk: 'unknown', notes: Object.fromEntries(QUESTIONS.map(([k]) => [k, ''])), publishDate: '',
  };
}

/** @param {any} v @returns {string} */
export const statusOf = (v) => (STATUSES.some(([k]) => k === v) ? v : 'draft');

/** Whatever the screen, a source or a model sends → a card with every key, right types and sizes. @param {any} input */
export function cleanCard(input) {
  const s = obj(input);
  const c = emptyCard();
  const o = obj(s.origin);
  const kind = ORIGINS.includes(o.kind) ? o.kind : 'self';
  c.origin = kind === 'self' ? { kind, ref: null, snapshot: null } : { kind, ref: text(o.ref, 200) || null, snapshot: o.snapshot && typeof o.snapshot === 'object' ? o.snapshot : null };
  const legoKeys = LEGO.map(([k]) => k);
  const keys = (v) => [...new Set(list(v).filter((k) => legoKeys.includes(k)))];
  c.keep = keys(s.keep);
  c.remix = keys(s.remix).filter((k) => !c.keep.includes(k)); // a brick is either kept or remade, the first answer wins
  c.topic = text(s.topic);
  c.pillar = text(s.pillar, 100);
  c.angle = text(s.angle);
  c.concept = conceptOf(s.concept);
  c.funnel = FUNNEL.some(([k]) => k === s.funnel) ? s.funnel : null;
  const p = obj(s.pain);
  c.pain = { text: text(p.text), source: PAIN_SOURCES.includes(p.source) ? p.source : 'self', evidence: list(p.evidence).map((x) => ({ text: text(obj(x).text), likes: Number(obj(x).likes) || 0 })).filter((x) => x.text).slice(0, LIMITS.evidence) };
  const b = obj(s.belief);
  c.belief = { common: text(b.common), reality: text(b.reality) };
  const t = obj(s.title);
  c.title = { d: text(t.d, LIMITS.short), i: text(t.i, LIMITS.short), c: text(t.c, LIMITS.short), k: text(t.k, LIMITS.short), text: text(t.text) };
  c.leadMagnet = text(s.leadMagnet);
  c.filterOk = FILTER.includes(s.filterOk) ? s.filterOk : 'unknown';
  const n = obj(s.notes);
  c.notes = Object.fromEntries(QUESTIONS.map(([k]) => [k, text(n[k])]));
  c.publishDate = /^\d{4}-\d{2}-\d{2}$/.test(String(s.publishDate ?? '')) ? s.publishDate : '';
  return c;
}

/**
 * The six questions of a card. q1 comes from the precedent search; the others are "có" when their field is filled.
 * @param {ReturnType<typeof emptyCard>} c @param {{ok: string, note: string, matches?: any[]}} precedent
 * @param {{hasFilter: boolean}} o hasFilter: Soulprint has a filter question, so its answer is needed to be ready
 */
export function checksOf(c, precedent, { hasFilter }) {
  const filled = (v) => (v ? 'yes' : 'no');
  const okOf = {
    q1: precedent.ok,
    q2: filled(c.pain.text),
    q3: filled(c.angle),
    q4: filled(c.belief.common && c.belief.reality),
    q5: c.origin.kind === 'self' ? 'skip' : filled(c.keep.length + c.remix.length),
    q6: filled(c.leadMagnet),
  };
  const checks = QUESTIONS.map(([key, question]) => ({ key, question, ok: okOf[key], note: key === 'q1' ? [precedent.note, c.notes.q1].filter(Boolean).join('. ') : c.notes[key], by: 'code' }));
  const missing = checks.filter((x) => ['q1', 'q2', 'q3', 'q4', 'q6'].includes(x.key) && x.ok !== 'yes').map((x) => `Câu ${x.key.slice(1)}`);
  if (hasFilter && c.filterOk !== 'yes') missing.push('Câu lọc');
  return { checks, ready: !missing.length, missing };
}

/**
 * A card mined from a video that beat its channel. The brick library also holds weak videos (added for contrast), so
 * a library video counts only when its score, at the time the card was made, reaches the library threshold.
 * @param {ReturnType<typeof emptyCard>} card @param {number} min the library threshold (setting bricksMinScore)
 */
export const isFromWinner = (card, min) => card.origin.kind === 'brick' && card.origin.snapshot?.score != null && card.origin.snapshot.score >= min;

/** @param {{status: string, card: ReturnType<typeof emptyCard>, ready: boolean, fromWinner: boolean}[]} cards */
export function batchCounts(cards) {
  const live = cards.filter((x) => x.status !== 'dropped');
  const outlier = live.filter((x) => x.fromWinner).length;
  return { live: live.length, outlier, other: live.length - outlier, dropped: cards.length - live.length, ready: live.filter((x) => x.ready).length, chosen: live.filter((x) => x.status === 'chosen').length };
}

/** Kallaway: about 7–8 ideas mined from videos that won, 2–3 tried from scratch. Says something only when the batch drifts. @param {ReturnType<typeof batchCounts>} n */
export function batchNudge(n) {
  if (n.live < 4) return null;
  if (n.other / n.live > 0.3) return 'Lô này nhiều ý không đến từ video đã thắng. Kallaway khuyên khoảng 7–8 ý đào từ video vượt kênh, 2–3 ý thử mới.';
  if (n.live >= 8 && !n.other) return 'Chưa có ý nào ngoài video đã thắng. Nên thử 2–3 ý mới trong lô để tìm hướng riêng.';
  return null;
}
