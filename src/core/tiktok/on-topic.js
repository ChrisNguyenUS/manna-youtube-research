// "Is this TikTok video about the topic?" — one rule for every TikTok screen and the scrape API.
// Measured on 145 hand-labelled videos (test/fixtures/tiktok-on-topic.json): keeps 95–98% of on-topic videos,
// lets almost no off-topic one through. The old rule (exact phrase in caption/hashtags) kept 54–75%.
//
// 1. The keyword without its country and freshness words ("di trú mỹ 2026" → "di trú") must appear in the caption
//    or hashtags as one block ("#suthatditru"), or every word of it must be in the caption ("bảo lãnh diện vợ chồng").
// 2. Or the video shares ≥ 2 of the topic's own hashtags, learned from the videos that pass step 1 (no AI): for
//    "di trú mỹ" that is #dinhcumy #thexanhmy #visamy #uscis… A long topic hashtag written in the caption counts too.
// 3. Either way, a video about another country's procedure (Canada, "sang Úc", #dinhcuduc…) is out.

const DEFAULT_COUNTRY = 'us';

/** Accents off, lower case, words kept apart. */
const foldWords = (s) => String(s || '').replace(/đ/gi, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const fold = (s) => foldWords(s).replace(/ /g, '');

// Hashtags that say nothing about a topic.
const GENERIC = new Set(['fyp', 'foryou', 'foryoupage', 'xuhuong', 'trending', 'viral', 'tiktok', 'capcut', 'xuhuongtiktok', 'trend', 'viralvideo',
  'learnontiktok', 'tiktokvietnam', 'creatorsearchinsights', 'shorts', 'usa', 'america', 'share', 'xh', 'dailyvlog', 'tip', 'tips', 'xuhuong2024', 'xuhuong2025', 'xuhuong2026']);

const PREP = '(?:sang|đi|ở|tại|định cư|du học|lao động|xuất khẩu lao động|visa|qua)';
const tagPrefix = '(?:^|dinhcu|visa|duhoc|songo|lamviec|baolanh|laodong|xkld|xuatkhaulaodong|congdan|nguoiviet)';
/** Countries other than the topic's: caption text (accents kept: "nhất"/"cập nhật" are not Japan) and hashtag shapes. */
const COUNTRIES = {
  us: { text: /(?<!\p{L})(mỹ|hoa kỳ)(?!\p{L})/iu, tag: /^$/ },
  canada: { text: /canada|ircc/i, tag: /canada/ },
  japan: { text: new RegExp(`nhật bản|${PREP} nhật(?!\\p{L})`, 'iu'), tag: new RegExp(`nhatban|japan|${tagPrefix}nhat(?:\\d|$)`) },
  korea: { text: new RegExp(`hàn quốc|${PREP} hàn(?!\\p{L})`, 'iu'), tag: new RegExp(`hanquoc|korea|${tagPrefix}han(?:\\d|$)`) },
  australia: { text: new RegExp(`australia|${PREP} úc(?!\\p{L})`, 'iu'), tag: new RegExp(`australia|${tagPrefix}uc(?:\\d|$)`) },
  germany: { text: new RegExp(`germany|${PREP} đức(?!\\p{L})`, 'iu'), tag: new RegExp(`germany|${tagPrefix}duc(?:\\d|$)`) },
  taiwan: { text: /đài loan|taiwan/iu, tag: /dailoan|taiwan/ },
};
// Folded country words dropped from a keyword before matching ("di trú mỹ" is matched as "di trú").
const COUNTRY_WORDS = /(?:^| )(my|usa|us|hoa ky|nhat ban|han quoc|dai loan|canada|uc|duc)(?= |$)/g;
const FRESH_TAIL = /(?: (?:19|20)\d\d| moi nhat| moi| hien nay| nam nay)+$/;

/** Which country a topic is about ("du học nhật" → japan); topics that name none are about the US. @param {string} topic */
export function topicCountry(topic) {
  const t = ` ${foldWords(topic).replace(FRESH_TAIL, '')} `;
  // "nhật"/"hàn" alone fold like "nhất"/"hạn", so only after a word that leads to a country ("du học nhật").
  const lead = '(?:hoc|sang|di|o|tai|cu|dong|visa|xkld|qua)';
  if (/ canada /.test(t)) return 'canada';
  if (new RegExp(` nhat ban | ${lead} nhat `).test(t)) return 'japan';
  if (new RegExp(` han quoc | ${lead} han `).test(t)) return 'korea';
  if (/ uc | australia /.test(t)) return 'australia';
  if (/ duc | germany /.test(t)) return 'germany';
  if (/ dai loan | taiwan /.test(t)) return 'taiwan';
  return DEFAULT_COUNTRY;
}

/** Words of a keyword that must show up: country and freshness words dropped. @param {string} keyword */
export function keywordCore(keyword) {
  const f = foldWords(keyword).replace(FRESH_TAIL, '');
  const words = f.replace(COUNTRY_WORDS, ' ').replace(/ (hoc|sang|di|o|tai|cu|dong|visa|xkld|qua) (nhat|han)$/, ' $1').split(' ').filter(Boolean);
  return words.length ? words : f.split(' ').filter(Boolean);
}

/** @typedef {{caption: string, hashtags: string[]}} TopicVideo */
/** @typedef {{onTopic: boolean, via: 'keyword'|'hashtags'|null, reason: 'other-country'|'no-match'|null}} TopicVerdict */

/**
 * @param {TopicVideo[]} videos all videos of one search/scan (the topic's hashtags are learned from them)
 * @param {string[]} keywords the topic and/or the keywords searched; matching any one is enough
 * @param {{country?: string}} [o] the country the topic is about (default: from the first keyword, else the US)
 * @returns {TopicVerdict[]} one verdict per video, same order
 */
export function classifyOnTopic(videos, keywords, { country } = {}) {
  const home = country ?? topicCountry(keywords[0] ?? '');
  const cores = keywords.map(keywordCore).filter((w) => w.length);
  const others = Object.entries(COUNTRIES).filter(([id]) => id !== home && id !== 'us').map(([, c]) => c);
  const rows = videos.map((v) => {
    const caption = String(v.caption || '');
    const tags = new Set((v.hashtags || []).map(fold).filter(Boolean));
    const capWords = new Set(foldWords(caption).split(' '));
    const capJoined = fold(caption);
    const blob = capJoined + [...tags].join('');
    const keyword = cores.some((w) => blob.includes(w.join('')) || w.every((x) => capWords.has(x)));
    const foreign = others.some((c) => c.text.test(caption) || [...tags].some((t) => c.tag.test(t)));
    return { tags, capJoined, keyword, foreign };
  });
  // The topic's own hashtags: used by ≥ 2 videos that match the keyword (and are about the right country).
  const count = new Map();
  for (const r of rows) if (r.keyword && !r.foreign) for (const t of r.tags) if (!GENERIC.has(t)) count.set(t, (count.get(t) ?? 0) + 1);
  const vocab = new Set([...count].filter(([, n]) => n >= 2).map(([t]) => t));
  const longVocab = [...vocab].filter((t) => t.length >= 7);
  return rows.map((r) => {
    const shared = [...r.tags].filter((t) => vocab.has(t)).length + longVocab.filter((t) => !r.tags.has(t) && r.capJoined.includes(t)).length;
    const via = r.keyword ? 'keyword' : shared >= 2 ? 'hashtags' : null;
    if (r.foreign) return { onTopic: false, via, reason: 'other-country' };
    return via ? { onTopic: true, via, reason: null } : { onTopic: false, via: null, reason: 'no-match' };
  });
}

export const OFF_TOPIC_REASONS = { 'other-country': 'nước khác', 'no-match': 'không khớp chủ đề' };
