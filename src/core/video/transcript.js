// src/core/video/transcript.js
// A video's spoken words: reading subtitle files and measuring the script. Pure; shared by TikTok and YouTube.

/** @typedef {{start: number, end: number|null, text: string}} Segment */
/** @typedef {{language: string|null, kind: 'auto'|'manual', segments: Segment[]}} Transcript */

export const HOOK_SECONDS = 5;
const HOOK_CHARS = 200;
const MIN_SPOKEN_SECONDS = 10;
const CLOCK = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/;

/** "1:02:03", "2:03", "00:00:00.040" → seconds; anything else → null. @param {string} s */
export function parseClock(s) {
  const m = String(s ?? '').trim().match(CLOCK);
  if (!m) return null;
  const ms = m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms;
}

/** WebVTT → segments. Cues without a readable start or without text are dropped; never throws. @param {string} text @returns {Segment[]} */
export function parseVtt(text) {
  /** @type {Segment[]} */
  const out = [];
  for (const block of String(text ?? '').replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const at = lines.findIndex((l) => l.includes('-->'));
    if (at < 0) continue;
    const [a, b] = lines[at].split('-->').map((x) => x.trim().split(/\s+/)[0]);
    const start = parseClock(a);
    const said = lines.slice(at + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (start == null || !said) continue;
    out.push({ start, end: parseClock(b), text: said });
  }
  return out;
}

/**
 * What the compare table shows about a script.
 * @param {{segments: Segment[]}|null|undefined} transcript @param {number|null} [durationSec] the video's length, used when segments have no end
 * @returns {{words: number, hook: string, wpm: number|null, segments: number}|null}
 */
export function scriptStats(transcript, durationSec = null) {
  const segs = transcript?.segments ?? [];
  if (!segs.length) return null;
  const words = segs.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);
  const early = segs.filter((s) => s.start < HOOK_SECONDS);
  const hook = (early.length ? early : segs.slice(0, 1)).map((s) => s.text).join(' ').slice(0, HOOK_CHARS);
  const last = segs[segs.length - 1];
  const endAt = last.end ?? (durationSec != null && durationSec > last.start ? durationSec : null);
  const spoken = endAt == null ? null : endAt - segs[0].start;
  return { words, hook, wpm: spoken != null && spoken >= MIN_SPOKEN_SECONDS ? Math.round(words / (spoken / 60)) : null, segments: segs.length };
}

/** 7.9 → "0:07", 3723 → "1:02:03". @param {number} sec */
export function clock(sec) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** The script as text to copy or export, one segment per line. @param {{segments: Segment[]}|null|undefined} transcript @param {{timestamps?: boolean}} [o] */
export function scriptText(transcript, { timestamps = true } = {}) {
  return (transcript?.segments ?? []).map((s) => (timestamps ? `[${clock(s.start)}] ${s.text}` : s.text)).join('\n');
}
