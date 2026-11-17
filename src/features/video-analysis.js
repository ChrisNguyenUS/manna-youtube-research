// Use case: "Phân tích video" for YouTube links — numbers and comments of each video, one record per batch.
// The batch loop is the one TikTok uses (shared-video-analysis.js). The script comes from source.getTranscript when
// the source has it; until then every video is saved with the note "unsupported".
import { makeVideoAnalysisRunner } from './shared-video-analysis.js';
import { splitList } from './shared.js';

const ID = '[A-Za-z0-9_-]{11}';
const IN_LINK = new RegExp(`(?:[?&]v=|youtu\\.be/|/shorts/|/embed/|/live/)(${ID})(?![A-Za-z0-9_-])`);
const BARE = new RegExp(`^${ID}$`);

/** The video id inside a YouTube link (watch, youtu.be, shorts, embed, live) or a bare id; null for anything else. @param {string} link */
export function youtubeIdOf(link) {
  const s = String(link ?? '').trim();
  if (BARE.test(s)) return s;
  return /(^|\/\/)([\w-]+\.)*(youtube\.com|youtu\.be)\//i.test(s) ? s.match(IN_LINK)?.[1] ?? null : null;
}

const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

/**
 * Pasted text → distinct watch links, in order (one link per line or comma). A line without a video id is kept as
 * written, so it shows up as a failed row. @param {any} videos
 */
export function youtubeLinksOf(videos) {
  const lines = splitList(videos).map((l) => (youtubeIdOf(l) ? watchUrl(/** @type {string} */ (youtubeIdOf(l))) : l));
  return [...new Set(lines)];
}

/** @param {{source: import('../ports/youtube-source.js').YouTubeSource, records: any, now: () => number}} deps */
export function makeYouTubeVideoAnalysis({ source, records, now }) {
  return makeVideoAnalysisRunner({
    kind: 'video_analysis', platform: 'youtube', records, now, parseLinks: youtubeLinksOf,
    fetchVideo: async (link) => {
      const id = youtubeIdOf(link);
      if (!id) throw Object.assign(new Error('Không phải link video YouTube'), { code: 'invalid_input' });
      const v = await source.getVideo(id, { likes: true });
      return { video: { ...v, id, url: watchUrl(id), cover: v.thumb ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }, transcript: null, transcriptNote: 'unsupported' };
    },
    fetchComments: async (video, o, onProgress) => {
      const r = await source.getComments(video.id, { max: o.max, sort: 'top', replies: o.replies }, onProgress);
      if (r.disabled) throw new Error('Video này tắt bình luận');
      return r.comments;
    },
    titleOf: (v) => String(v.title || v.url).replace(/\s+/g, ' ').trim().slice(0, 80),
  });
}
