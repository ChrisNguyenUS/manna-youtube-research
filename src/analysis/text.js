import { median, round } from './metrics.js';

const STOP = new Set(
  `a an the of to in on for and or but is are was were be been it its this that these those with without from by at as
  i you he she we they me my your our their his her them us do does did not no yes so if then than too very can could will
  would should just about into over after before up down out more most how what why who when where which there here all any
  vs ft feat official video full part ep episode new 2024 2025 2026 2027
  và của là có cho với những các một này đó khi thì mà để được không đã đang sẽ rất cũng như từ trong ra vào lên xuống
  người ai gì nào sao bị bởi tại vì nên hay hoặc nếu thế này kia ấy ơi nhé nha ạ à ư lại còn chỉ mới đều cả hết quá luôn
  phần tập video full hd`.split(/\s+/),
);

export function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[#@]\S+/g, ' ')
    .split(/[^\p{L}\p{N}']+/u)
    .filter((w) => w && w.length > 1 && !/^\d+$/.test(w));
}

// Words that never start/end a useful multi-word phrase (pure function words).
const EDGE = new Set(`a an the of to in on for and or is are was be it its with from by at as my your our their this that
  và của là có cho với những các một này đó thì mà để được đã đang sẽ từ trong ra vào khi nếu hay hoặc nhé nha ạ à`.split(/\s+/));

function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    const g = tokens.slice(i, i + n);
    if (n === 1 ? STOP.has(g[0]) : EDGE.has(g[0]) || EDGE.has(g[n - 1]) || g.every((w) => STOP.has(w))) continue;
    if (n === 1 && g[0].length < 3) continue;
    out.push(g.join(' '));
  }
  return out;
}

/**
 * Phrases that appear in ≥ minCount titles, scored by the metric of the videos that use them.
 * Longer phrases absorb their shorter parts when they cover the same videos.
 */
export function titlePhrases(videos, { metric = 'views', minCount = 2, limit = 30 } = {}) {
  const map = new Map();
  for (const v of videos) {
    const toks = tokenize(v.title);
    const grams = new Set([...ngrams(toks, 1), ...ngrams(toks, 2), ...ngrams(toks, 3)]);
    for (const g of grams) {
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(v);
    }
  }
  let list = [...map.entries()]
    .filter(([, vs]) => vs.length >= minCount)
    .map(([phrase, vs]) => ({
      phrase,
      count: vs.length,
      medianViews: median(vs.map((v) => v.views)),
      medianOutlier: median(vs.map((v) => v.outlier)),
      medianViewsPerDay: median(vs.map((v) => v.viewsPerDay)),
      score: median(vs.map((v) => v[metric])),
      videoIds: vs.map((v) => v.id),
    }));
  // Drop a phrase if a longer phrase containing it covers the same set of videos.
  list = list.filter((p) => !list.some((q) => q !== p && q.phrase.length > p.phrase.length && q.phrase.includes(p.phrase) && q.count === p.count));
  return list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.count - a.count).slice(0, limit);
}

export const TITLE_PATTERNS = [
  { key: 'number', label: 'Con số / danh sách', test: (t) => /(^|\s)\d+\s+\p{L}/u.test(t) || /^\d+/.test(t), hint: '"7 sự thật…", "Top 10…"' },
  { key: 'question', label: 'Câu hỏi', test: (t) => /\?|^(tại sao|vì sao|làm sao|làm thế nào|có nên|what|why|how|who|is|are|can|did|does|should)(?![\p{L}\p{N}])/iu.test(t), hint: 'Đặt câu hỏi người xem muốn biết đáp án' },
  { key: 'secret', label: 'Bí mật / sự thật bị giấu', test: (t) => /(bí mật|sự thật|không ai|ít ai|bị cấm|bị xoá|bị giấu|che giấu|secret|truth|hidden|forbidden|banned|erased|they don't|nobody|untold|never told|deleted?)/iu.test(t), hint: 'Hứa tiết lộ điều người khác không nói' },
  { key: 'warning', label: 'Cảnh báo / khẩn cấp', test: (t) => /(cảnh báo|đừng|ngay lập tức|trước khi|kẻo|nguy hiểm|warning|stop|before|don't|never|avoid|urgent|now)/iu.test(t), hint: 'Tạo cảm giác phải xem ngay' },
  { key: 'story', label: 'Câu chuyện / nhân vật', test: (t) => /(câu chuyện|chuyện|cuộc đời|hành trình|kể về|story|life of|journey|how .* became|the man who|the woman who)/iu.test(t), hint: 'Kể về một người, một hành trình' },
  { key: 'contrast', label: 'Đối lập / so sánh', test: (t) => /(\bvs\.?\b|so với|đối đầu|từ .* đến|from .* to|versus|but|nhưng)/iu.test(t), hint: 'Hai thứ trái ngược trong một tiêu đề' },
  { key: 'caps', label: 'VIẾT HOA nhấn mạnh', test: (t) => (t.match(/(?<!\p{L})\p{Lu}{3,}(?!\p{L})/gu) || []).length >= 1 && t !== t.toUpperCase(), hint: 'Viết hoa 1–2 từ khoá cảm xúc' },
  { key: 'divider', label: 'Có dấu | hoặc : tách ý', test: (t) => /[|:–—]/.test(t), hint: 'Tiêu đề chính + phần bổ sung từ khoá' },
  { key: 'emotion', label: 'Từ cảm xúc mạnh', test: (t) => /(sốc|kinh hoàng|đáng sợ|rùng mình|bất ngờ|không thể tin|ám ảnh|đau lòng|xúc động|shocking|insane|terrifying|horrifying|evil|disturbing|unbelievable|crazy|incredible|heartbreaking)/iu.test(t), hint: 'Đẩy cảm xúc ngay trong tiêu đề' },
];

export function titlePatterns(videos, { metric = 'outlier' } = {}) {
  const all = median(videos.map((v) => v[metric]));
  return TITLE_PATTERNS.map((p) => {
    const hit = videos.filter((v) => p.test(v.title || ''));
    const best = [...hit].sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1))[0];
    const med = median(hit.map((v) => v[metric]));
    return {
      key: p.key,
      label: p.label,
      hint: p.hint,
      count: hit.length,
      share: videos.length ? round(hit.length / videos.length, 2) : 0,
      median: med,
      lift: med != null && all ? round(med / all, 2) : null,
      example: best ? { id: best.id, title: best.title, value: best[metric], views: best.views } : null,
    };
  })
    .filter((p) => p.count > 0)
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0));
}

export function titleShape(videos) {
  const lens = videos.map((v) => (v.title || '').length);
  const words = videos.map((v) => tokenize(v.title).length);
  return { medianChars: median(lens), medianWords: median(words) };
}

// ---------- comments ----------
const QUESTION_RE = /\?|(^|\s)(tại sao|vì sao|làm sao|làm thế nào|như thế nào|ở đâu|bao nhiêu|bao giờ|khi nào|có ai|ai biết|có phải|được không|có nên|nên làm gì|là gì|why|how|what|where|when|which|who|is there|does anyone|can someone|can you|anyone know)(?![\p{L}\p{N}])/iu;
const COMPLAINT_RE = /(tiếc|chán|dở|tệ|sai rồi|không đúng|thất vọng|quá dài|dài dòng|nhiều quảng cáo|giật tít|câu view|lừa|ghét|khó nghe|nhạc to|giọng ai|ai voice|wrong|boring|hate|clickbait|misleading|too long|annoying|disappoint|ai generated|ai voice|fake|inaccurate|not true)/iu;
const REQUEST_RE = /(làm video về|làm thêm|làm tiếp|phần 2|phần tiếp|tập tiếp|ra tiếp|mong ad|mong kênh|xin ad|ad ơi làm|nói về|please make|make a video|do a video|part 2|next video|more about|cover|can you do|talk about|would love to see|waiting for)/iu;

export function classifyComment(text) {
  const t = String(text || '');
  return { question: QUESTION_RE.test(t), complaint: COMPLAINT_RE.test(t), request: REQUEST_RE.test(t) };
}

export function commentInsights(comments, { limit = 25 } = {}) {
  const tagged = comments.map((c) => ({ ...c, ...classifyComment(c.text) }));
  const byLikes = (a, b) => b.likes - a.likes || b.replies - a.replies;
  const pick = (f) => tagged.filter(f).sort(byLikes).slice(0, limit);
  const phrases = titlePhrases(
    tagged.map((c) => ({ id: c.id, title: c.text, views: c.likes + 1 })),
    { metric: 'views', minCount: 3, limit: 40 },
  )
    .sort((a, b) => b.count - a.count)
    .slice(0, 30)
    .map(({ phrase, count }) => ({ phrase, count }));
  return {
    total: comments.length,
    questions: pick((c) => c.question),
    complaints: pick((c) => c.complaint),
    requests: pick((c) => c.request),
    top: [...tagged].sort(byLikes).slice(0, limit),
    phrases,
    counts: {
      questions: tagged.filter((c) => c.question).length,
      complaints: tagged.filter((c) => c.complaint).length,
      requests: tagged.filter((c) => c.request).length,
    },
  };
}
