// Question 1 of a card: has something like this already beaten its channel? Answered from the brick library:
// winners with the same pillar and concept, or sharing at least two topic keywords. Pure.

/** Words too common to say two topics are alike (accents removed). */
const STOP = new Set(['la', 'co', 'cua', 'va', 'cho', 'voi', 'nhung', 'cac', 'mot', 'nhu', 'nay', 'thi', 'ma', 'duoc', 'khi', 'trong', 've', 'tu', 'ra', 'vao', 'di', 'den', 'ban', 'minh', 'toi', 'gi', 'ai', 'sao', 'nao', 'de', 'o', 'nay', 'do', 'cung', 'roi', 'se', 'da', 'dang', 'khong']);
const MIN_SHARED = 2;
const MAX_MATCHES = 5;

/** Topic → distinct keywords, accents and case ignored, common words left out. @param {string} t */
export function keywords(t) {
  const words = String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w));
  return [...new Set(words)];
}

/**
 * @param {any} card a cleaned card @param {{platform: string, videoId: string, meta: {title: string, score: number|null}, bricks: any}[]} rows the library (owner's edits applied)
 * @param {{min: number}} o min: the library threshold (setting bricksMinScore)
 * @returns {{ok: 'yes'|'no'|'unknown', note: string, matches: {platform: string, videoId: string, title: string, score: number}[]}}
 */
export function precedentOf(card, rows, { min }) {
  if (card.origin.kind === 'self') return { ok: 'no', note: 'Ý tưởng tự nghĩ: thử nghiệm gốc, chưa có tiền lệ', matches: [] };
  if (!rows.length) return { ok: 'unknown', note: 'Thư viện gạch chưa có video nào', matches: [] };
  const winners = rows.filter((r) => r.meta?.score != null && r.meta.score >= min);
  if (!winners.length) return { ok: 'unknown', note: `Thư viện gạch chưa có video nào vượt kênh từ ${min}×`, matches: [] };
  const own = card.origin.kind === 'brick' ? card.origin.ref : null;
  const mine = new Set(keywords(card.topic));
  const matches = winners.filter((r) => `${r.platform}:${r.videoId}` === own
    || (card.pillar && card.concept && r.bricks.pillar === card.pillar && r.bricks.concept === card.concept)
    || keywords(r.bricks.topic).filter((w) => mine.has(w)).length >= MIN_SHARED)
    .sort((a, b) => b.meta.score - a.meta.score)
    .slice(0, MAX_MATCHES)
    .map((r) => ({ platform: r.platform, videoId: r.videoId, title: r.meta.title, score: r.meta.score }));
  return matches.length
    ? { ok: 'yes', note: `${matches.length} video vượt kênh tương tự trong thư viện`, matches }
    : { ok: 'no', note: 'Chưa thấy video vượt kênh nào cùng pillar và concept, hoặc cùng chủ đề', matches: [] };
}
