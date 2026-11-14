// Use case: "Phân tích kênh" for TikTok — a creator's numbers and which of their videos beat their own typical plays.
import { noop } from '../shared.js';
import { tiktokChannelReport } from '../../core/tiktok/channel.js';

/** @param {{tiktok: import('../../ports/tiktok-source.js').TikTokSource, records: any, now: () => number, settings: () => Record<string, any>}} deps */
export function makeTikTokChannelAnalysis({ tiktok, records, now, settings }) {
  /** @param {{input: string, max?: number}} p */
  return async function tiktokChannelAnalysis(p, progress = noop) {
    const max = Math.min(Math.max(Number(p.max) || 90, 20), 150);
    progress({ step: 'Tìm kênh và lấy video mới nhất', done: 0, total: max });
    const { profile, videos } = await tiktok.getProfile(p.input, { max }, (n) => progress({ step: n ? 'Tìm thêm video của kênh' : 'Lấy video mới nhất', done: Math.min(n, max), total: max }));
    const data = { analyzedAt: new Date(now()).toISOString(), ...tiktokChannelReport(profile, videos, { now: now(), outlierMultiple: Number(settings().outlierMultiple) || 3 }) };
    const id = records.add('tiktok_channel', `@${profile.username}${profile.nickname ? ` · ${profile.nickname}` : ''}`, { ref: profile.username.toLowerCase(), params: { input: p.input, max }, data });
    progress({ step: 'Xong', done: max, total: max });
    return { id };
  };
}
