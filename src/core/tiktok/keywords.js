// Related TikTok keywords for a topic, without an AI model: TikTok's own autocomplete and "others searched for"
// lists, de-duplicated, cleaned of other countries, and grouped by what the viewer wants (time, cost, how-to…).
import { foldForMatch } from '../analysis/topic.js';

/** Accents off, lower case, single spaces: "Bảo lãnh  VỢ chồng" → "bao lanh vo chong". */
export const foldWords = (s) =>
  String(s || '').replace(/đ/gi, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Suffixes that only date or freshen a search ("… 2026", "… mới nhất"): same topic as the keyword without them.
const NOISE_TAIL = /(\s+(19|20)\d\d|\s+moi nhat|\s+moi|\s+hien nay|\s+nam nay)+$/;
const coreOf = (s) => foldWords(s).replace(NOISE_TAIL, '').trim();

/** Countries whose immigration/visa topics are a different market; dropped unless the topic names them. */
export const OTHER_COUNTRIES = [
  'nhat', 'nhat ban', 'han', 'han quoc', 'uc', 'canada', 'dai loan', 'duc', 'phap', 'anh quoc', 'singapore', 'trung quoc', 'chau au',
  'new zealand', 'hungary', 'ba lan', 'sec', 'romania', 'trung dong', 'japan', 'korea', 'australia', 'taiwan', 'germany', 'uk',
];
const COUNTRY_RE = new RegExp(`(^| )(${OTHER_COUNTRIES.join('|')})( |$)`);

/** @typedef {'time'|'cost'|'howto'|'interview'|'condition'|'experience'|'related'} Intent */
export const INTENTS = /** @type {const} */ ([
  // Folded words collide ("giá"/"gia đình", "chờ"/"cho", "đậu"/"đâu"), so only phrases that stay unambiguous.
  ['time', 'Thời gian', ['bao lau', 'mat bao lau', 'khi nao', 'bao gio', 'may thang', 'may nam', 'thoi gian', 'lich cho', 'visa bulletin', 'cho doi', 'ngay uu tien']],
  ['cost', 'Chi phí', ['bao nhieu tien', 'het bao nhieu', 'ton bao nhieu', 'chi phi', 'le phi', 'phi', 'gia bao nhieu', 'bang gia', 'usd', 'nghin usd', 'do la', 'tai chinh', 'thu nhap', 'bao tro']],
  ['interview', 'Phỏng vấn', ['phong van', 'cau hoi', 'hoi gi', 'tra loi', 'pv']],
  ['howto', 'Cách làm, giấy tờ', ['cach', 'huong dan', 'thu tuc', 'quy trinh', 'ho so', 'giay to', 'timeline', 'cac buoc', 'buoc', 'dien don', 'form', 'nop don', 'bang chung']],
  ['condition', 'Điều kiện', ['dieu kien', 'duoc khong', 'co duoc', 'ai duoc', 'co can', 'yeu cau']],
  ['experience', 'Kinh nghiệm, câu chuyện', ['kinh nghiem', 'chia se', 'da dau', 'dau visa', 'bi rot', 'rot', 'truot', 'review', 'cau chuyen', 'thanh cong', 'that bai', 'vlog']],
]);
export const INTENT_LABELS = Object.fromEntries([...INTENTS.map(([k, l]) => [k, l]), ['related', 'Chủ đề liên quan']]);

/** @param {string} keyword @returns {Intent} */
export function intentOf(keyword) {
  const t = ` ${foldWords(keyword)} `;
  for (const [key, , words] of INTENTS) if (words.some((w) => t.includes(` ${w} `))) return /** @type {Intent} */ (key);
  return 'related';
}

/**
 * @typedef {{keyword: string, intent: Intent, sources: string[], selected: boolean, dropped?: string}} TopicKeyword
 * @param {string} topic
 * @param {{suggestions?: string[], related?: string[]}} found TikTok's lists for the topic
 * @param {{limit?: number}} [o] how many keywords to pre-select (the topic itself always first)
 * @returns {TopicKeyword[]}
 */
export function expandKeywords(topic, found, { limit = 10 } = {}) {
  const topicFold = foldWords(topic);
  const topicHasCountry = COUNTRY_RE.test(topicFold);
  const aboutUs = / (my|hoa ky|usa|us) /.test(` ${topicFold} `);
  /** @type {Map<string, TopicKeyword>} */
  const byCore = new Map();
  const add = (word, source) => {
    const keyword = String(word || '').replace(/\s+/g, ' ').trim();
    if (!keyword) return;
    const key = coreOf(keyword) || foldWords(keyword);
    if (!key) return;
    const cur = byCore.get(key);
    if (cur) return void (cur.sources.includes(source) || cur.sources.push(source));
    const fold = foldWords(keyword);
    // A topic about the US ("… mỹ") also drops the same procedure in Vietnam ("thi quốc tịch việt nam").
    const otherCountry = (!topicHasCountry && COUNTRY_RE.test(fold)) || (aboutUs && / viet nam /.test(` ${fold} `) && !/ viet nam /.test(` ${topicFold} `));
    const dropped = otherCountry ? 'nước khác' : undefined;
    byCore.set(key, { keyword: key === coreOf(topic) ? topic.trim() : keyword, intent: intentOf(keyword), sources: [source], selected: false, ...(dropped ? { dropped } : {}) });
  };
  add(topic, 'topic');
  // "Others searched for" first: TikTok groups those by meaning, autocomplete only extends the words.
  const sug = found.suggestions ?? [];
  const rel = found.related ?? [];
  for (let i = 0; i < Math.max(sug.length, rel.length); i++) {
    if (rel[i]) add(rel[i], 'related');
    if (sug[i]) add(sug[i], 'suggest');
  }
  const list = [...byCore.values()];
  // Keyword the same as the topic once spaces are ignored ("bảo lãnh vợchồng") adds nothing.
  for (const k of list.slice(1)) if (!k.dropped && foldForMatch(k.keyword) === foldForMatch(topicFold)) k.dropped = 'trùng chủ đề';
  let picked = 0;
  for (const k of list) {
    if (k.dropped || picked >= limit) continue;
    k.selected = true;
    picked++;
  }
  return list;
}

/** Most used hashtags on a set of videos, weighted by how often they appear. @param {{hashtags?: string[]}[]} videos */
export function topHashtags(videos, limit = 15) {
  const count = new Map();
  for (const v of videos) for (const h of new Set((v.hashtags ?? []).map((x) => x.toLowerCase()))) count.set(h, (count.get(h) ?? 0) + 1);
  return [...count].filter(([h]) => !['fyp', 'foryou', 'foryoupage', 'xuhuong', 'trending', 'viral', 'tiktok', 'capcut'].includes(h)).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([tag, n]) => ({ tag, videos: n }));
}
