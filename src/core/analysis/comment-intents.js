// One taxonomy of comment intent for every comment screen (Thu thập bình luận, Phân tích video, Insight).
// Keyword rules only, no AI. A comment can have several intents; "other" means none matched.
// Intent is separate from type (comment or reply) and from sorting (likes, replies, newest).
import { classifyComment, hasWords, titlePhrases } from './text.js';
import { classifyVoice, isSeller } from './customer-voice.js';

/** Key → Vietnamese label, in display order. */
export const INTENTS = /** @type {const} */ ([
  ['question', 'Câu hỏi'],
  ['buying', 'Ý định mua'],
  ['concern', 'Lo ngại / Rào cản'],
  ['complaint', 'Phàn nàn'],
  ['request', 'Yêu cầu / Muốn xem thêm'],
  ['positive', 'Tích cực / Đồng tình'],
  ['other', 'Khác'],
]);
export const INTENT_LABELS = Object.fromEntries(INTENTS);
/** Old group names stored in reports → intent (the old "Like nhiều nhất" was a sort, not a group). */
export const LEGACY_GROUPS = { questions: 'question', fears: 'concern', buying: 'buying', complaints: 'complaint', requests: 'request' };

const START = '(?<![\\p{L}\\p{N}])';
const END = '(?![\\p{L}\\p{N}])';
// Thanks, praise, agreement. "không hay" / "chưa hay" are not praise; "chuẩn bị" (prepare) is not "chuẩn".
const POSITIVE_RE = new RegExp(`${START}(cảm ơn|cám ơn|cám ơn|thank|thanks|(?<!không |chưa |ko )hay quá|(?<!không |chưa |ko )hay lắm|(?<!không |chưa |ko )hay ghê|rất hay|quá hay|bổ ích|hữu ích|đúng rồi|đúng vậy|chuẩn quá|chuẩn luôn|quá chuẩn|rất chuẩn|chuẩn rồi|đồng ý|tuyệt vời|xuất sắc|giỏi quá|ủng hộ|yêu chị|yêu anh|thương chị|thương anh|love it|great|amazing|helpful|well said|so true)${END}`, 'iu');

/**
 * @param {string} text
 * @returns {{intents: string[], seller: boolean}} seller: written by someone selling the service, not a customer
 */
export function commentIntents(text) {
  const t = String(text || '');
  if (!hasWords(t)) return { intents: ['other'], seller: false };
  const a = classifyComment(t);
  const v = classifyVoice(t);
  const found = [
    a.question && 'question',
    v.buying && 'buying',
    v.fear && 'concern',
    a.complaint && 'complaint',
    a.request && 'request',
    POSITIVE_RE.test(t) && 'positive',
  ].filter(Boolean);
  return { intents: /** @type {string[]} */ (found.length ? found : ['other']), seller: isSeller(t) };
}

/** Adds `intents` and `seller` to each comment (new objects). @template {{text: string}} C @param {C[]} list */
export const tagComments = (list) => (list || []).map((c) => ({ ...c, ...commentIntents(c.text) }));

/** How many comments have each intent. @param {{intents: string[]}[]} tagged */
export function intentCounts(tagged) {
  const out = Object.fromEntries(INTENTS.map(([k]) => [k, 0]));
  for (const c of tagged) for (const k of c.intents) out[k]++;
  return out;
}

/**
 * Group summary stored with a "Thu thập bình luận" report (same shape as before, groups now by intent).
 * @param {any[]} comments @param {{limit?: number}} [o]
 */
export function intentInsights(comments, { limit = 50 } = {}) {
  const tagged = tagComments(comments);
  const byLikes = (a, b) => (b.likes ?? 0) - (a.likes ?? 0) || (b.replies ?? 0) - (a.replies ?? 0);
  const pick = (k) => tagged.filter((c) => c.intents.includes(k)).sort(byLikes).slice(0, limit);
  const counts = intentCounts(tagged);
  const phrases = titlePhrases(tagged.map((c) => ({ id: c.id, title: c.text, views: (c.likes ?? 0) + 1 })), { metric: 'views', minCount: 3, limit: 40 })
    .sort((a, b) => b.count - a.count).slice(0, 30).map(({ phrase, count }) => ({ phrase, count }));
  return {
    total: comments.length,
    questions: pick('question'), fears: pick('concern'), buying: pick('buying'), complaints: pick('complaint'), requests: pick('request'), positive: pick('positive'),
    top: [...tagged].sort(byLikes).slice(0, limit),
    phrases,
    counts: { questions: counts.question, fears: counts.concern, buying: counts.buying, complaints: counts.complaint, requests: counts.request, positive: counts.positive },
    intentCounts: counts,
  };
}
