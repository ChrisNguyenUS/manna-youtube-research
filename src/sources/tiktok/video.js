// One TikTok video from its link, over plain HTTP (no login, no browser): its numbers and, when it has one, its subtitle file.
import { parseVideoPage, pickSubtitle } from './parse.js';
import { parseVtt } from '../../core/video/transcript.js';
import { rethrowIfCancelled } from '../../core/cancel.js';

const FAIL = {
  unavailable: ['video_unavailable', 'Video không còn hoặc đang để riêng tư'],
  blocked: ['tiktok_blocked', 'TikTok chặn trang video này, thử lại sau ít phút'],
};

/**
 * @param {ReturnType<typeof import('./http.js').createTikTokHttp>} http
 * @param {(urlOrId: string) => Promise<{id: string, url: string}>} resolveVideo
 */
export function makeVideo(http, resolveVideo) {
  /** @param {string} urlOrId */
  return async function getVideo(urlOrId) {
    const ref = await resolveVideo(urlOrId);
    const page = parseVideoPage(await http.getText(ref.url));
    if (!page.ok) {
      const [code, message] = FAIL[/** @type {{reason: 'blocked'|'unavailable'}} */ (page).reason];
      throw Object.assign(new Error(message), { code });
    }
    const sub = pickSubtitle(page.subtitles);
    /** @type {import('../../ports/tiktok-source.js').Transcript|null} */
    let transcript = null;
    if (sub) {
      try {
        const segments = parseVtt(await http.getText(sub.url));
        if (segments.length) transcript = { language: sub.language || null, kind: sub.source === 'ASR' ? 'auto' : 'manual', segments };
      } catch (e) {
        rethrowIfCancelled(e); // a subtitle file that cannot be read is "no script", never a failed video
      }
    }
    return { video: page.video, transcript };
  };
}
