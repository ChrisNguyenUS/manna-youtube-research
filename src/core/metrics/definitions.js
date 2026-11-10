// Single source of truth for metric names and formulas (docs/ARCHITECTURE.md §6).
// UI tooltips, CSV headers and Markdown labels read from here. Changing a formula: bump `version`.

/** @typedef {{label: {vi: string, en: string}, unit: 'x'|'count'|'per_hour'|'per_day'|'days', formula: string, version: number}} MetricDef */

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
};

/** @param {string} id @param {'vi'|'en'} [lang] */
export const metricLabel = (id, lang = 'vi') => METRICS[id]?.label[lang] ?? id;
