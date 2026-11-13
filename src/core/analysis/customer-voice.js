// Customer voice in TikTok comments for a service business (immigration paperwork first): what people ask,
// grouped by theme; what they fear; who is about to pay; and their own words. Comments that draw replies count
// as much as liked ones: a question with 12 replies is one many people share.
import { hasWords, classifyComment } from './text.js';
import { foldWords } from '../tiktok/keywords.js';

/** Likes + replies: how much attention a comment got from other viewers. */
export const voiceScore = (c) => (c.likes ?? 0) + (c.replies ?? 0);
const byScore = (a, b) => voiceScore(b) - voiceScore(a) || (b.likes ?? 0) - (a.likes ?? 0);

/** Theme → folded phrases (accents dropped, so "bao lau" also matches "bao lâu"). Order matters only for display. */
export const QUESTION_THEMES = /** @type {const} */ ([
  ['time', 'Mất bao lâu, khi nào tới lượt', ['bao lau', 'khi nao', 'bao gio', 'may thang', 'may nam', 'may ngay', 'thoi gian', 'ngay uu tien', 'visa bulletin', 'lich phong van', 'toi luot', 'cho bao lau', 'pd']],
  ['cost', 'Hết bao nhiêu tiền', ['bao nhieu tien', 'het bao nhieu', 'ton bao nhieu', 'mat bao nhieu', 'chi phi', 'le phi', 'phi', 'gia bao nhieu', 'bao nhieu do', 'usd']],
  ['money', 'Tài chính, bảo trợ đủ chưa', ['thu nhap', 'tai chinh', 'bao tro', 'i 864', 'dong bao tro', 'chung minh tai chinh', 'tax', 'thue nam']],
  ['papers', 'Giấy tờ, hồ sơ, bằng chứng', ['giay to', 'ho so', 'bang chung', 'chung minh', 'timeline', 'form', 'mau don', 'dien don', 'nop don', 'i 130', 'i 485', 'ds 260', 'nvc', '6 buoc', 'giay khai sinh', 'ly lich', 'ban dich']],
  // "bao lâu được phỏng vấn" is about time, so only phrases about the interview itself.
  ['interview', 'Phỏng vấn hỏi gì, trả lời sao', ['hoi gi', 'hoi nhung gi', 'tra loi sao', 'tra loi the nao', 'tra loi ra sao', 'cau hoi phong van', 'bi hoi', 'phong van hoi', 'phong van co kho', 'phong van kho', 'luc phong van', 'khi phong van', 'di phong van', 'pv hoi', 'pv co kho']],
  ['condition', 'Trường hợp của tôi có được không', ['duoc khong', 'co duoc', 'dieu kien', 'du dieu kien', 'ai duoc', 'co can', 'can gi', 'co phai', 'truong hop', 'con rieng', 'ly hon', 'qua tuoi']],
  ['service', 'Tự làm hay thuê dịch vụ', ['dich vu', 'tu lam', 'thue luat su', 'thue dich vu', 'luat su', 'van phong', 'cong ty']],
]);
export const THEME_LABELS = Object.fromEntries([...QUESTION_THEMES.map(([k, l]) => [k, l]), ['other', 'Câu hỏi khác']]);

// Fears: unambiguous folded phrases, plus accented words whose folded form means something else ("sợ" → "so" = "số").
const FEAR_FOLDED = ['giay xanh', 'bo sung', 'tu choi', 'bi tu choi', 'danh rot', 'bi rot', 'rot visa', 'truot', 'cho lau', 'cho mai', 'cho hoai', 'ket hon gia', 'bi nghi', 'dieu tra', 'truc xuat', 'mat ho so', 'sai giay to', 'lua dao', 'bi lua', 'mat tien', 'lo lang', 'ap luc', 'cang thang', 'rui ro', 'khong dam', 'huy visa', '221g', 'bi giu', 'bi tra ve', 'bi danh truot', 'that bai'];
const FEAR_ACCENTED = /(?<![\p{L}\p{N}])(sợ|lo quá|lo lắm|lo ghê|hoang mang|nản|mệt mỏi|khóc)(?![\p{L}\p{N}])/iu;
// About to pay: asking a service for price or contact, or weighing doing it yourself.
const BUYING_FOLDED = ['dich vu', 'tu lam hay', 'thue luat su', 'thue dich vu', 'phi dich vu', 'bao nhieu tien', 'gia bao nhieu', 'xin gia', 'bao gia', 'inbox', 'ib', 'nhan tin', 'lien he', 'sdt', 'so dien thoai', 'zalo', 'tu van', 'nhan lam', 'xin info', 'xin thong tin', 'lam o dau', 'van phong o dau'];

// Service sellers answering in the comments ("để lại số điện thoại, chuyên viên liên hệ…") are not customers.
const SELLER_FOLDED = ['de lai so dien thoai', 'de lai sdt', 'chuyen vien', 'nhan qua ben em', 'nhan tin qua ben em', 'nhan tin cho ben em', 'inbox ben em', 'ib ben em', 'ib em nhe', 'inbox em nhe', 'lien he ben em', 'ben em ho tro', 'ben minh ho tro', 'hotline', 'tong dai'];

const has = (folded, list) => list.some((w) => folded.includes(` ${w} `));
/** True for a comment written by someone selling the service, not by a customer. @param {string} text */
export const isSeller = (text) => has(` ${foldWords(text)} `, SELLER_FOLDED);

/** @param {string} text */
export function classifyVoice(text) {
  const t = String(text || '');
  const f = ` ${foldWords(t)} `;
  const question = classifyComment(t).question;
  const themes = question ? QUESTION_THEMES.filter(([, , words]) => has(f, words)).map(([k]) => k) : [];
  return {
    question,
    themes: question && !themes.length ? ['other'] : themes,
    fear: has(f, FEAR_FOLDED) || FEAR_ACCENTED.test(t),
    buying: has(f, BUYING_FOLDED),
  };
}

/**
 * @param {{id: string, text: string, likes: number, replies?: number}[]} comments readable comments (emoji-only already dropped is fine)
 * @param {{limit?: number, examples?: number, lines?: number}} [o]
 */
export function customerVoice(comments, { limit = 50, examples = 3, lines = 15 } = {}) {
  const tagged = comments.filter((c) => hasWords(c.text) && !isSeller(c.text)).map((c) => ({ ...c, ...classifyVoice(c.text) })).sort(byScore);
  const questions = tagged.filter((c) => c.question);
  const themes = [...QUESTION_THEMES.map(([k]) => k), 'other']
    .map((key) => {
      const list = questions.filter((c) => c.themes.includes(key));
      return {
        key, label: THEME_LABELS[key], count: list.length,
        likes: list.reduce((s, c) => s + (c.likes ?? 0), 0), replies: list.reduce((s, c) => s + (c.replies ?? 0), 0),
        examples: list.slice(0, examples),
        // Every comment of the theme, most attention first: what the topic explorer lists.
        ids: list.map((c) => c.id),
      };
    })
    .filter((t) => t.count > 0)
    // "Other" always last: it is what the themes did not catch, not a theme of its own.
    .sort((a, b) => Number(a.key === 'other') - Number(b.key === 'other') || b.likes + b.replies + b.count - (a.likes + a.replies + a.count));
  const fears = tagged.filter((c) => c.fear);
  const buying = tagged.filter((c) => c.buying);
  // Their own words: short lines (not a wall of text, not one word) that others reacted to, each said once.
  const seen = new Set();
  const voiceLines = [];
  for (const c of tagged) {
    const text = c.text.replace(/\s+/g, ' ').trim();
    const len = foldWords(text).length;
    if (len < 10 || len > 140 || voiceScore(c) === 0) continue;
    const key = foldWords(text);
    if (seen.has(key)) continue;
    seen.add(key);
    voiceLines.push({ text, likes: c.likes, replies: c.replies ?? 0 });
    if (voiceLines.length >= lines) break;
  }
  return {
    total: tagged.length,
    questions: questions.slice(0, limit),
    themes,
    fears: fears.slice(0, limit),
    buying: buying.slice(0, limit),
    voiceLines,
    counts: { questions: questions.length, fears: fears.length, buying: buying.length },
    fearIds: fears.map((c) => c.id),
    buyingIds: buying.map((c) => c.id),
  };
}

/**
 * The groups of customerVoice() with the ids of the comments in each, for browsing them one by one.
 * Same rule, same counts: question themes first, then fears and "about to pay".
 * @param {{id: string, text: string, likes: number, replies?: number}[]} comments
 */
export function voiceTopics(comments) {
  const v = customerVoice(comments);
  return {
    total: v.total,
    questions: v.counts.questions,
    topics: [
      ...v.themes.map((t) => ({ key: t.key, kind: 'question', label: t.label, count: t.count, ids: t.ids })),
      { key: 'fear', kind: 'feeling', label: 'Lo sợ, rào cản', count: v.fearIds.length, ids: v.fearIds },
      { key: 'buying', kind: 'feeling', label: 'Cân nhắc thuê dịch vụ', count: v.buyingIds.length, ids: v.buyingIds },
    ].filter((t) => t.count > 0),
  };
}
