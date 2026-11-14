// "Phân tích video": the batch loop both platforms share. One record for the whole batch, written after every video,
// so the screen shows rows as they finish. A video that cannot be analyzed becomes a row with its reason.
// Imports no YouTube use case, so features/tiktok/ may use it (docs/ARCHITECTURE.md §4).
import { noop, splitList } from './shared.js';
import { rethrowIfCancelled } from '../core/cancel.js';
import { scriptStats } from '../core/video/transcript.js';
import { videoRow } from '../core/video/metrics.js';
import { voiceTopics } from '../core/analysis/customer-voice.js';

export const MAX_VIDEOS = 10;
const COMMENT_CHOICES = [0, 100, 300];

/** Pasted text → distinct links, in order, without the tracking parameters share buttons add. @param {string|string[]|undefined} videos */
export const linksOf = (videos) => [...new Set(splitList(String(videos ?? '').replace(/\s+/g, '\n')).map((l) => l.replace(/[?#].*$/, '')))];

const invalid = (message) => Object.assign(new Error(message), { code: 'invalid_input', field: 'videos' });

/**
 * @param {{
 *   kind: string, platform: 'tiktok'|'youtube', records: any, now: () => number,
 *   fetchVideo: (link: string, o: {script: boolean}) => Promise<{video: any, transcript: any|null, transcriptNote?: string|null}>,
 *   fetchComments: (video: any, o: {max: number, replies: boolean}, onProgress: (n: number) => void) => Promise<any[]>,
 *   titleOf: (video: any) => string,
 * }} o  fetchVideo throws (with a code) when the video cannot be analyzed; transcriptNote says why there is no script ('none' by default)
 */
export function makeVideoAnalysisRunner({ kind, platform, records, now, fetchVideo, fetchComments, titleOf }) {
  /** @param {Record<string, any>} params {videos, script?, comments?, replies?} */
  return async function videoAnalysis(params, progress = noop) {
    const links = linksOf(params.videos);
    if (!links.length) throw invalid('Dán ít nhất một link video');
    if (links.length > MAX_VIDEOS) throw invalid(`Tối đa ${MAX_VIDEOS} video mỗi lần (đang có ${links.length})`);
    const script = params.script !== false;
    const max = COMMENT_CHOICES.includes(Number(params.comments)) ? Number(params.comments) : 100;
    const replies = params.replies !== false;
    const clean = { videos: links.join('\n'), script, comments: max, replies };
    const data = { platform, params: clean, analyzedAt: new Date(now()).toISOString(), videos: /** @type {any[]} */ ([]) };
    /** @type {number|null} */
    let id = null;
    const at = (i, step) => progress({ step, done: i, total: links.length, ...(id != null ? { recordId: id } : {}) });

    for (const [i, link] of links.entries()) {
      const label = `Video ${i + 1}/${links.length}`;
      at(i, `${label}: thông số${script ? ' và script' : ''}`);
      const entry = { link, video: null, row: null, transcript: null, transcriptNote: script ? null : 'off', script: null, comments: [], commentsNote: null, groups: voiceTopics([]), error: null };
      try {
        const got = await fetchVideo(link, { script });
        entry.video = got.video;
        entry.row = videoRow(got.video, platform, now());
        if (script) {
          entry.transcript = got.transcript ?? null;
          entry.transcriptNote = entry.transcript ? null : got.transcriptNote ?? 'none';
          entry.script = scriptStats(entry.transcript, got.video.durationSec ?? null);
        }
        if (max > 0) {
          try {
            const list = await fetchComments(got.video, { max, replies }, (n) => at(i, `${label}: comment ${n}/${max}`));
            entry.comments = list.map((c) => ({ ...c, videoId: got.video.id }));
            entry.groups = voiceTopics(entry.comments);
          } catch (e) {
            rethrowIfCancelled(e);
            entry.commentsNote = String(e?.message || e); // numbers and script are still worth keeping
          }
        }
      } catch (e) {
        rethrowIfCancelled(e);
        entry.error = { code: typeof e?.code === 'string' ? e.code : 'failed', message: String(e?.message || e) };
      }
      data.videos.push(entry);
      const first = data.videos.find((v) => !v.error);
      if (!first) continue; // nothing worth a record yet
      if (id == null) id = records.add(kind, titleOf(first.video) + (links.length > 1 ? ` (+${links.length - 1})` : ''), { params: clean, data });
      else records.update(id, data);
    }
    if (id == null) {
      const why = data.videos[0]?.error;
      throw Object.assign(new Error(why?.message || 'Không phân tích được video nào'), { code: why?.code });
    }
    at(links.length, 'Xong');
    return { id };
  };
}
