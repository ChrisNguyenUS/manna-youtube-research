// Home's one box: whatever is pasted or typed goes to the screen made for it. Pure, so it is tested in Node.
//   video links (TikTok or YouTube, one or many) → Video Analysis · a channel link or @name → Channel Analysis
//   anything else is a topic → Topic Research on the platform picked above the box.

const TIKTOK_VIDEO = /tiktok\.com\/@[^/\s]+\/(video|photo)\/\d+|(^|\/\/)(vm|vt)\.tiktok\.com\/\w+/i;
const TIKTOK_PROFILE = /^(https?:\/\/)?(www\.)?tiktok\.com\/@([\w.-]+)\/?(\?.*)?$/i;
const YOUTUBE_VIDEO = /(youtube\.com\/(watch\?[^\s]*v=|shorts\/|live\/)|youtu\.be\/)[\w-]{11}/i;
const YOUTUBE_CHANNEL = /^(https?:\/\/)?(www\.|m\.)?youtube\.com\/(@[\w.-]+|channel\/UC[\w-]{22}|c\/[^/\s]+|user\/[^/\s]+)\/?([/?].*)?$/i;
const HANDLE = /^@[\w.-]{2,}$/;

/**
 * @param {string} text what was typed or pasted
 * @param {'tiktok'|'youtube'} platform the platform picked above the box (for a topic or a bare @name)
 * @returns {{kind: 'videos'|'channel'|'topic'|'empty', path: string, params: Record<string, string>, label: string}}
 */
export function routeInput(text, platform) {
  const t = String(text ?? '').trim();
  if (!t) return { kind: 'empty', path: '', params: {}, label: '' };
  const parts = t.split(/[\s,]+/).filter(Boolean);
  if (parts.length && parts.every((p) => TIKTOK_VIDEO.test(p) || YOUTUBE_VIDEO.test(p))) {
    const n = parts.length;
    return { kind: 'videos', path: '/video', params: { videos: parts.join('\n'), run: '1' }, label: n > 1 ? `${n} link video → Video Analysis` : 'Link video → Video Analysis' };
  }
  if (parts.length === 1) {
    if (TIKTOK_PROFILE.test(t)) return { kind: 'channel', path: '/tiktok/channel', params: { input: t, run: '1' }, label: 'Kênh TikTok → Channel Analysis' };
    if (YOUTUBE_CHANNEL.test(t)) return { kind: 'channel', path: '/channel', params: { input: t }, label: 'Kênh YouTube → Channel Analysis' };
    if (HANDLE.test(t)) {
      return platform === 'youtube'
        ? { kind: 'channel', path: '/channel', params: { input: t }, label: 'Kênh YouTube → Channel Analysis' }
        : { kind: 'channel', path: '/tiktok/channel', params: { input: t, run: '1' }, label: 'Kênh TikTok → Channel Analysis' };
    }
  }
  return platform === 'youtube'
    ? { kind: 'topic', path: '/research', params: { q: t }, label: 'Chủ đề → Topic Research (YouTube)' }
    : { kind: 'topic', path: '/tiktok/topic', params: { q: t, run: '1' }, label: 'Chủ đề → Topic Research (TikTok)' };
}
