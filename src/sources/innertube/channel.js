import { call } from './client.js';
import { parseCount, parseDuration, parseRelativeAge, parseJoined, text, findAll, findFirst, classifyInput } from './parse.js';

const VIDEOS_TAB = 'EgZ2aWRlb3PyBgQKAjoA';
const SHORTS_TAB = 'EgZzaG9ydHPyBgUKA5oBAA%3D%3D';

/** @handle | channel URL | UC id | video URL -> channelId */
export async function resolveChannelId(input) {
  const c = classifyInput(input);
  if (!c) throw new Error('Thiếu kênh');
  if (c.type === 'channel') return c.id;
  if (c.type === 'video') {
    const p = await call('player', { videoId: c.id });
    const id = p?.videoDetails?.channelId;
    if (!id) throw new Error('Không tìm thấy kênh của video này');
    return id;
  }
  const r = await call('navigation/resolve_url', { url: c.url });
  const id = r?.endpoint?.browseEndpoint?.browseId;
  if (!id || !id.startsWith('UC')) throw new Error(`Không tìm thấy kênh: ${input}`);
  return id;
}

/** Header (subs, video count, avatar) + optional About panel (country, joined, total views). */
export async function getChannelInfo(channelId, { about = true } = {}) {
  const home = await call('browse', { browseId: channelId });
  const meta = home?.metadata?.channelMetadataRenderer || {};
  const header = findFirst(home, 'pageHeaderViewModel') || {};
  const rows = (findFirst(header, 'contentMetadataViewModel')?.metadataRows || []).flatMap((r) => (r.metadataParts || []).map((p) => text(p.text)));
  const subsText = rows.find((t) => /subscriber/i.test(t)) || '';
  const videosText = rows.find((t) => /video/i.test(t)) || '';
  const handle = rows.find((t) => t.startsWith('@')) || null;
  const avatarSources = findFirst(header, 'avatarViewModel')?.image?.sources || meta.avatar?.thumbnails || [];
  const info = {
    id: channelId,
    title: meta.title || text(findFirst(header, 'dynamicTextViewModel')?.text),
    handle,
    url: `https://www.youtube.com/channel/${channelId}`,
    avatar: avatarSources[avatarSources.length - 1]?.url || null,
    description: meta.description || '',
    keywords: meta.keywords || '',
    subs: parseCount(subsText),
    videoCount: parseCount(videosText),
    country: null,
    joined: null,
    totalViews: null,
  };
  if (about) {
    const preview = findFirst(header, 'descriptionPreviewViewModel') || findFirst(home, 'descriptionPreviewViewModel');
    const tok = JSON.stringify(preview || {}).match(/"continuationCommand":\{"token":"([^"]+)"/)?.[1];
    if (tok) {
      try {
        const ab = await call('browse', { continuation: tok });
        const a = findFirst(ab, 'aboutChannelViewModel');
        if (a) {
          info.country = a.country || null;
          info.joined = parseJoined(text(a.joinedDateText));
          info.totalViews = parseCount(a.viewCountText);
          info.subs = parseCount(a.subscriberCountText) ?? info.subs;
          info.videoCount = parseCount(a.videoCountText) ?? info.videoCount;
        }
      } catch {
        /* about panel is optional */
      }
    }
  }
  return info;
}

function parseLockup(l, channel) {
  if (l?.contentType && l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
  const md = l.metadata?.lockupMetadataViewModel;
  const parts = (md?.metadata?.contentMetadataViewModel?.metadataRows || []).flatMap((r) => (r.metadataParts || []).map((p) => text(p.text)));
  const viewsText = parts.find((t) => /view|watching/i.test(t)) || '';
  const ageText = parts.find((t) => /ago/i.test(t)) || null;
  const badges = findAll(l.contentImage, 'thumbnailBadgeViewModel').map((b) => b.text);
  const dur = badges.map(parseDuration).find((x) => x != null) ?? null;
  return {
    id: l.contentId,
    title: text(md?.title),
    url: `https://www.youtube.com/watch?v=${l.contentId}`,
    thumb: `https://i.ytimg.com/vi/${l.contentId}/mqdefault.jpg`,
    channelId: channel?.id || null,
    channelTitle: channel?.title || '',
    views: parseCount(viewsText),
    durationSec: dur,
    published: ageText,
    ageDays: parseRelativeAge(ageText),
    isLive: /watching/i.test(viewsText) || badges.some((b) => /live/i.test(b || '')),
  };
}

function parseShort(s) {
  const id = s.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId || s.entityId?.replace(/^shorts-shelf-item-/, '');
  if (!id) return null;
  return { id, title: s.overlayMetadata?.primaryText?.content || '', views: parseCount(s.overlayMetadata?.secondaryText?.content), url: `https://www.youtube.com/shorts/${id}` };
}

function nextToken(json) {
  for (const c of findAll(json, 'continuationItemRenderer')) {
    const t = c?.continuationEndpoint?.continuationCommand?.token;
    if (t) return t;
  }
  return null;
}

/** Latest long videos of a channel (30 per page). */
/** @param {string} channelId @param {{max?: number, channel?: any}} [o] @param {(n: number) => void} [onPage] */
export async function getChannelVideos(channelId, { max = 120, channel } = {}, onPage) {
  let json = await call('browse', { browseId: channelId, params: VIDEOS_TAB });
  const out = [];
  const seen = new Set();
  for (let page = 0; page < 20; page++) {
    for (const l of findAll(json, 'lockupViewModel')) {
      const v = parseLockup(l, channel || { id: channelId });
      if (!v || !v.id || seen.has(v.id)) continue;
      seen.add(v.id);
      out.push(v);
    }
    onPage?.(out.length);
    const tok = nextToken(json);
    if (out.length >= max || !tok) break;
    json = await call('browse', { continuation: tok });
  }
  return out.slice(0, max);
}

export async function getChannelShorts(channelId, { max = 60 } = {}) {
  let json = await call('browse', { browseId: channelId, params: decodeURIComponent(SHORTS_TAB) });
  const out = [];
  const seen = new Set();
  for (let page = 0; page < 5; page++) {
    for (const s of findAll(json, 'shortsLockupViewModel')) {
      const v = parseShort(s);
      if (!v || seen.has(v.id)) continue;
      seen.add(v.id);
      out.push(v);
    }
    const tok = nextToken(json);
    if (out.length >= max || !tok) break;
    json = await call('browse', { continuation: tok });
  }
  return out.slice(0, max);
}

/** Exact publish date, length, category, keywords via the player endpoint. Likes via next (optional). */
export async function getVideoDetails(videoId, { likes = false } = {}) {
  const p = await call('player', { videoId });
  const m = p?.microformat?.playerMicroformatRenderer || {};
  const d = p?.videoDetails || {};
  const out = {
    id: videoId,
    title: d.title || text(m.title),
    channelId: d.channelId || m.externalChannelId || null,
    channelTitle: d.author || m.ownerChannelName || '',
    views: d.viewCount != null ? Number(d.viewCount) : null,
    durationSec: d.lengthSeconds != null ? Number(d.lengthSeconds) : null,
    publishedAt: m.publishDate || m.uploadDate || null,
    category: m.category || null,
    tags: d.keywords || [],
    description: d.shortDescription || '',
    isShort: d.lengthSeconds != null && Number(d.lengthSeconds) <= 180 && !!m.isShortsEligible,
    likes: null,
  };
  if (likes) {
    try {
      const n = await call('next', { videoId });
      const lb = findFirst(n, 'likeButtonViewModel');
      const a11y = JSON.stringify(lb || {}).match(/along with ([\d,]+) other/);
      if (a11y) out.likes = Number(a11y[1].replace(/,/g, '')) + 1;
      else out.likes = parseCount(JSON.stringify(lb || {}).match(/"title":"([\d.,KMB]+)"/)?.[1]);
    } catch {
      /* likes optional */
    }
  }
  return out;
}
