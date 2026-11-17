// Choices shared by the search screens (Chủ đề, Video, Kênh) on both platforms, and how a saved search's settings
// read in a history list. No DOM here.
import { fmt } from './lib.js';

export const DUR_CHIPS = [
  { v: '', label: 'Tất cả' },
  { v: '0-4', label: 'Ngắn < 4 phút' },
  { v: '4-20', label: '4–20 phút' },
  { v: '20-', label: 'Dài > 20 phút' },
  { v: '60-', label: '> 1 giờ' },
];
/** YouTube's own upload-date filter. */
export const UPLOAD_CHIPS = [
  { v: 'today', label: 'Hôm nay' },
  { v: 'week', label: '7 ngày' },
  { v: 'month', label: '30 ngày' },
  { v: 'year', label: '1 năm' },
  { v: 'any', label: 'Mọi lúc' },
];
/** TikTok has no date filter: videos older than this are dropped after the search (0 = keep all). Same labels as YouTube. */
export const TIKTOK_AGE_CHIPS = [
  { v: 7, label: '7 ngày' },
  { v: 30, label: '30 ngày' },
  { v: 90, label: '90 ngày' },
  { v: 365, label: '1 năm' },
  { v: 0, label: 'Mọi lúc' },
];
export const TIKTOK_PLAYS_CHIPS = [0, 10_000, 100_000, 1_000_000].map((v) => ({ v, label: v ? `≥ ${fmt(v)}` : 'Không lọc' }));

export const REGIONS = [
  ['', 'Theo Cài đặt'], ['GLOBAL', '🌐 Toàn cầu (nhiều nước)'], ['VN', 'Việt Nam'], ['US', 'Mỹ'], ['GB', 'Anh'], ['CA', 'Canada'], ['AU', 'Úc'], ['IN', 'Ấn Độ'], ['PH', 'Philippines'], ['ID', 'Indonesia'], ['JP', 'Nhật'], ['KR', 'Hàn'], ['DE', 'Đức'], ['FR', 'Pháp'], ['BR', 'Brazil'],
];
/**
 * TikTok cannot search another country (the scraper browses as a Vietnamese viewer). "Khu vực" there picks the country
 * the videos must be about: videos about another country's procedure are dropped. Same codes as YouTube's regions, so
 * the choice carries over when switching platform.
 */
export const TIKTOK_REGIONS = [['', 'Tự đoán từ từ khoá'], ['US', 'Mỹ'], ['CA', 'Canada'], ['AU', 'Úc'], ['JP', 'Nhật'], ['KR', 'Hàn'], ['TW', 'Đài Loan'], ['DE', 'Đức']];
/** Region code → the country id of the TikTok on-topic rule (src/core/tiktok/on-topic.js). */
export const TIKTOK_COUNTRY = { US: 'us', CA: 'canada', AU: 'australia', JP: 'japan', KR: 'korea', TW: 'taiwan', DE: 'germany' };
const COUNTRY_REGION = Object.fromEntries(Object.entries(TIKTOK_COUNTRY).map(([k, v]) => [v, k]));

/** A region code from another screen, if this list has it ('' otherwise). @param {string|undefined} gl @param {string[][]} list */
export const knownRegion = (gl, list) => (gl && list.some(([v]) => v === gl) ? gl : '');

/** Chip choice or "từ–đến" minutes → seconds for the server. @param {{dur?: string, minDur?: any, maxDur?: any}} st */
export function durToSeconds(st) {
  let min = st.minDur !== '' && st.minDur != null ? Number(st.minDur) : null;
  let max = st.maxDur !== '' && st.maxDur != null ? Number(st.maxDur) : null;
  if (st.dur) {
    const [a, b] = st.dur.split('-');
    min = a ? Number(a) : null;
    max = b ? Number(b) : null;
  }
  return { minDur: min != null ? min * 60 : undefined, maxDur: max != null ? max * 60 : undefined };
}

// ---- a saved search's settings, as one line for history lists ----
const label = (list, v) => list.find((o) => String(o.v) === String(v))?.label ?? '';
const regionName = (gl) => (gl ? ([...REGIONS, ...TIKTOK_REGIONS].find(([v]) => v === gl)?.[1] ?? gl) : '');

/** "4–20 phút" from seconds. @param {any} minDur @param {any} maxDur */
export function durText(minDur, maxDur) {
  const a = minDur ? Math.round(Number(minDur) / 60) : null;
  const b = maxDur ? Math.round(Number(maxDur) / 60) : null;
  if (a == null && b == null) return '';
  const chip = DUR_CHIPS.find((o) => o.v === `${a ?? (b != null ? 0 : '')}-${b ?? ''}`);
  if (chip) return chip.label;
  return a != null && b != null ? `${a}–${b} phút` : a != null ? `> ${a} phút` : `< ${b} phút`;
}

/** YouTube search (video_search, research, channel_search). @param {Record<string, any>|null} p */
export function youtubeCriteria(p) {
  if (!p) return '';
  return [p.upload ? `đăng trong ${label(UPLOAD_CHIPS, p.upload).toLowerCase()}` : '', durText(p.minDur, p.maxDur), regionName(p.gl)]
    .filter(Boolean).join(' · ').replace('đăng trong mọi lúc', 'mọi lúc').replace('đăng trong hôm nay', 'hôm nay');
}

/** The "Khu vực" of a TikTok search, if one was picked. @param {Record<string, any>|null} p */
export const tiktokRegion = (p) => (p?.country ? `về ${regionName(COUNTRY_REGION[p.country]) || p.country}` : '');
