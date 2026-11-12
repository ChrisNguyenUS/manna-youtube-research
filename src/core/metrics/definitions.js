// Single source of truth for metric names and formulas (docs/ARCHITECTURE.md §6).
// UI tooltips, CSV headers and Markdown labels read from here. Changing a formula: bump `version`.

/** @typedef {{label: {vi: string, en: string}, unit: 'x'|'count'|'per_hour'|'per_day'|'days'|'score', formula: string, version: number}} MetricDef */

/** @type {Record<string, MetricDef>} */
export const METRICS = {
  outlierScore: {
    label: { vi: 'Outlier (× kênh)', en: 'Outlier (× channel)' },
    unit: 'x',
    version: 1,
    formula: 'view ÷ trung vị view các video ≥ 7 ngày tuổi trong 30 video mới nhất của kênh; video < 7 ngày so VPH; không tính Shorts',
  },
  viewSub: {
    label: { vi: 'View/sub', en: 'Views/sub' },
    unit: 'x',
    version: 1,
    formula: 'view ÷ số sub của kênh; bỏ kênh dưới ngưỡng sub trong Cài đặt (mặc định 500)',
  },
  vph: { label: { vi: 'VPH', en: 'VPH' }, unit: 'per_hour', version: 1, formula: 'view ÷ số giờ kể từ lúc đăng (tối thiểu 1 giờ)' },
  viewsPerDay: { label: { vi: 'View/ngày', en: 'Views/day' }, unit: 'per_day', version: 1, formula: 'view ÷ số ngày kể từ lúc đăng (tối thiểu 1 ngày)' },
  channelMedianViews: {
    label: { vi: 'View trung vị kênh', en: 'Channel median views' },
    unit: 'count',
    version: 1,
    formula: 'trung vị view các video ≥ 7 ngày tuổi trong 30 video mới nhất của kênh',
  },
  vsMedian: {
    label: { vi: '× trung vị kênh', en: '× channel median' },
    unit: 'x',
    version: 1,
    formula: 'view ÷ trung vị view 120 video dài gần nhất của kênh (trang Phân tích kênh)',
  },
  hotScore: { label: { vi: 'Hot score', en: 'Hot score' }, unit: 'per_day', version: 1, formula: '(like + comment + share + save) ÷ (số ngày từ lúc đăng + 2)' },
  engagementRate: { label: { vi: 'Tỉ lệ tương tác', en: 'Engagement rate' }, unit: 'x', version: 1, formula: '(like + comment + share + save) ÷ lượt xem' },
  attentionPerDay: { label: { vi: 'Attention/ngày', en: 'Attention/day' }, unit: 'per_day', version: 1, formula: '(like + trả lời của comment) ÷ (số ngày từ lúc comment + 2)' },
  playsPerDay: { label: { vi: 'View/ngày (TikTok)', en: 'Plays/day (TikTok)' }, unit: 'per_day', version: 1, formula: 'lượt xem TikTok ÷ (số ngày từ lúc đăng + 2), cùng mẫu số với Hot score' },
  trendingScore: { label: { vi: 'Điểm trending', en: 'Trending score' }, unit: 'score', version: 1, formula: 'bách phân vị của View/ngày (TikTok) trong cùng lượt tìm, 0–100' },
  engagementScore: { label: { vi: 'Điểm tương tác', en: 'Engagement score' }, unit: 'score', version: 1, formula: 'trung bình bách phân vị của tổng tương tác và tỉ lệ tương tác trong cùng lượt tìm, 0–100' },
  freshnessScore: { label: { vi: 'Điểm hợp thời', en: 'Freshness score' }, unit: 'score', version: 1, formula: '100 × 0,5^(số ngày tuổi ÷ 14): đăng hôm nay 100, 14 ngày 50, 28 ngày 25' },
  tiktokScore: { label: { vi: 'Điểm tổng', en: 'Overall score' }, unit: 'score', version: 1, formula: '0,5 × trending + 0,3 × tương tác + 0,2 × hợp thời' },
};

/** @param {string} id @param {'vi'|'en'} [lang] */
export const metricLabel = (id, lang = 'vi') => METRICS[id]?.label[lang] ?? id;
