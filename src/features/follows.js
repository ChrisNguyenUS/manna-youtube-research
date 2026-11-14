// Use case: "Theo dõi" — follow YouTube and TikTok channels, and check them for new videos and outliers on demand.
import { noop } from './shared.js';
import { rethrowIfCancelled } from '../core/cancel.js';
import { addVideoMetrics, channelBaseline, outlierScore } from '../core/metrics/index.js';
import { tiktokChannelReport } from '../core/tiktok/channel.js';
import { followScan } from '../core/follows.js';

export const PLATFORMS = ['youtube', 'tiktok'];

/**
 * @param {import('./shared.js').Deps & {tiktok: import('../ports/tiktok-source.js').TikTokSource}} deps
 */
export function makeFollows({ source, tiktok, store, ws, settings, now }) {
  const mult = () => Number(settings().outlierMultiple) || 3;

  /** @param {string} id YouTube channel id */
  async function scanYouTube(id) {
    const info = await source.getChannel(id);
    const vids = await source.getChannelVideos(id, { max: 30, channel: info });
    const list = addVideoMetrics(vids.filter((v) => !v.isLive), { minSubs: 0, now: now() }).map((v) => ({ ...v, ageDays: v.age }));
    const base = channelBaseline(list);
    /** @type {import('../core/follows.js').FollowVideo[]} */
    const videos = list.map((v) => {
      const { outlierScore: score } = outlierScore(v, base);
      return { id: String(v.id), title: v.title, url: `https://www.youtube.com/watch?v=${v.id}`, thumb: null, views: v.views ?? null, score, ageDays: v.age ?? null, standout: score != null && score >= mult() };
    });
    return {
      title: info.title,
      data: { title: info.title, handle: info.handle || '', avatar: info.avatar || null, followers: info.subs ?? null, medianViews: base.medianViews, url: info.handle ? `https://www.youtube.com/${info.handle}` : `https://www.youtube.com/channel/${id}` },
      videos,
    };
  }

  /** @param {string} username */
  async function scanTikTok(username) {
    const { profile, videos: raw } = await tiktok.getProfile(username, { max: 35, search: 'fallback' });
    const r = tiktokChannelReport(profile, raw, { now: now(), outlierMultiple: mult() });
    return {
      title: profile.nickname || `@${profile.username}`,
      data: { title: profile.nickname, handle: `@${profile.username}`, avatar: profile.avatar, followers: profile.followers, medianViews: r.stats.medianPlays, url: profile.url },
      videos: r.videos.map((v) => ({ id: String(v.id), title: v.caption, url: v.url, thumb: v.cover, views: v.plays, score: v.outlierScore, ageDays: v.ageDays, standout: v.standout, pinned: !!v.pinned })),
    };
  }

  /**
   * Check followed channels one by one; a channel that fails keeps its last result and records why.
   * @param {{platform?: string, ref?: string}} p  none: every followed channel
   */
  async function refresh(p = {}, progress = noop) {
    const list = store.follows.list(ws, p.platform || undefined).filter((f) => !p.ref || f.ref === p.ref);
    let failed = 0;
    let fresh = 0;
    for (const [i, f] of list.entries()) {
      progress({ step: `Kiểm tra ${f.title || f.ref} (${i + 1}/${list.length})`, done: i, total: list.length });
      const at = new Date(now()).toISOString();
      try {
        const got = f.platform === 'tiktok' ? await scanTikTok(f.ref) : await scanYouTube(f.ref);
        const scan = followScan(got.videos, f.seen, { at });
        fresh += scan.lastScan.newIds.length;
        store.follows.saveScan(ws, f.platform, f.ref, { title: got.title, data: { ...f.data, ...got.data }, seen: scan.seen, lastScan: scan.lastScan });
      } catch (e) {
        rethrowIfCancelled(e);
        failed++;
        const error = { code: typeof e?.code === 'string' ? e.code : 'failed', message: String(e?.message || e) };
        store.follows.saveScan(ws, f.platform, f.ref, { lastScan: { ...(f.lastScan || { videos: [], newIds: [], outlierIds: [] }), at, error } });
      }
    }
    progress({ step: 'Xong', done: list.length, total: list.length });
    return { inline: true, checked: list.length, failed, newVideos: fresh };
  }

  /**
   * Follow from what the user typed: a YouTube @handle/link/id, or a TikTok @name/link. Returns the followed key.
   * @param {'youtube'|'tiktok'} platform @param {string} input
   */
  async function followInput(platform, input) {
    const text = String(input || '').trim();
    if (platform === 'tiktok') {
      const name = (text.match(/tiktok\.com\/@([\w.]+)/i)?.[1] ?? text.replace(/^@/, '')).toLowerCase();
      if (!/^[\w.]{2,24}$/.test(name)) throw Object.assign(new Error(`Không nhận ra kênh TikTok: ${text}`), { code: 'invalid_input', field: 'input' });
      if (!store.follows.get(ws, 'tiktok', name)) store.follows.put(ws, 'tiktok', name, `@${name}`, { handle: `@${name}`, url: `https://www.tiktok.com/@${name}` });
      return { platform, ref: name };
    }
    const id = await source.resolveChannelId(text);
    const info = await source.getChannel(id);
    store.follows.put(ws, 'youtube', id, info.title, { title: info.title, handle: info.handle || '', avatar: info.avatar || null, followers: info.subs ?? null, url: info.handle ? `https://www.youtube.com/${info.handle}` : `https://www.youtube.com/channel/${id}` });
    return { platform, ref: id };
  }

  return {
    refresh,
    followInput,
    list: (platform) => store.follows.list(ws, platform),
    keys: () => store.follows.keys(ws),
    /** @param {{platform: string, ref: string, title?: string, data?: any}} f */
    follow: (f) => store.follows.put(ws, f.platform, f.platform === 'tiktok' ? f.ref.replace(/^@/, '').toLowerCase() : f.ref, f.title || '', f.data || {}),
    unfollow: (platform, ref) => store.follows.remove(ws, platform, ref),
    note: (platform, ref, note) => store.follows.note(ws, platform, ref, note),
  };
}
