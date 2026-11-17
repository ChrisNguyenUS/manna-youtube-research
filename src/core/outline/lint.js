// A code-only check of a script the owner wrote, against the countable parts of their "tính người" checklist and
// Kallaway's "jagged rhythm". It never judges whether a script has a soul; it finds what can be counted. Pure.
import { BANNED, CTA_WORDS } from './lint-words.js';

export const RULES = {
  banned: 'Từ nên tránh',
  symbol: 'Ký hiệu thay cho câu chữ',
  dash: 'Quá nhiều dấu gạch ngang dài',
  long: 'Câu dài không có chỗ ngắt',
  flat: 'Nhịp câu đều đều',
  cta: 'Chưa thấy lời kêu gọi hành động',
  pace: 'Quá nhiều chữ so với độ dài video',
};
const LIMITS = { chars: 20_000, longWords: 30, flatRun: 4, flatSpread: 3, dashes: 2, wordsPerSecond: 3 };
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrase = (w) => new RegExp(`(?<![\\p{L}\\p{N}])${escRe(w)}(?![\\p{L}\\p{N}])`, 'iu');
const BANNED_RE = BANNED.map((b) => ({ ...b, re: phrase(b.word) }));
const CTA_RE = CTA_WORDS.map(phrase);
const wordsOf = (s) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
const fold = (t) => String(t ?? '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();

/**
 * @param {string} input the script as pasted @param {{length: number, leadMagnet: string}} o length: seconds of the outline
 * @returns {{words: number, maxWords: number, sentences: number, cut: boolean, issues: {rule: string, label: string, sentence: string, word?: string, suggest?: string}[]}}
 */
export function lintScript(input, { length, leadMagnet }) {
  const all = String(input ?? '').replace(/\r\n?/g, '\n');
  const cut = all.length > LIMITS.chars;
  const textIn = all.slice(0, LIMITS.chars);
  const maxWords = length * LIMITS.wordsPerSecond;
  // A sentence ends at . ! ? … or at a line break, so a script typed without punctuation is read line by line.
  const sentences = textIn.split(/\n+|(?<=[.!?…])\s+/).map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));
  const words = sentences.reduce((n, s) => n + wordsOf(s), 0);
  if (!sentences.length) return { words: 0, maxWords, sentences: 0, cut, issues: [] };
  const issues = [];
  const add = (rule, sentence, extra = {}) => issues.push({ rule, label: RULES[rule], sentence, ...extra });
  for (const s of sentences) {
    for (const b of BANNED_RE) if (b.re.test(s)) add('banned', s, { word: b.word, suggest: b.suggest });
    for (const sym of ['→', '---']) if (s.includes(sym)) add('symbol', s, { word: sym, suggest: 'viết thành câu có từ nối' });
  }
  const dashes = (textIn.match(/—/g) ?? []).length;
  if (dashes > LIMITS.dashes) add('dash', '', { word: `${dashes} lần`, suggest: 'tối đa 1–2 lần, còn lại thay bằng dấu phẩy' });
  for (const s of sentences) if (wordsOf(s) > LIMITS.longWords && !s.includes(',')) add('long', s, { suggest: 'thêm dấu phẩy hoặc tách đôi' });
  // Kallaway: vary sentence length; four in a row of nearly the same length read like a rectangle.
  const lens = sentences.map(wordsOf);
  for (let i = 0; i + LIMITS.flatRun <= lens.length; ) {
    const run = lens.slice(i, i + LIMITS.flatRun);
    if (Math.max(...run) - Math.min(...run) < LIMITS.flatSpread) {
      add('flat', sentences[i], { suggest: 'xen một câu thật ngắn hoặc một câu dài hơn' });
      i += LIMITS.flatRun;
    } else i++;
  }
  const lead = fold(leadMagnet);
  const hasCta = sentences.some((s) => CTA_RE.some((re) => re.test(s))) || (lead && fold(textIn).includes(lead));
  if (!hasCta) add('cta', '', { suggest: 'mời người xem làm một việc, dẫn về lead magnet của thẻ' });
  if (words > maxWords) add('pace', '', { word: `${words} chữ`, suggest: `khoảng ${maxWords} chữ cho ${length} giây` });
  return { words, maxWords, sentences: sentences.length, cut, issues };
}
