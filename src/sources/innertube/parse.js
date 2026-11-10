// Pure parsers for YouTube's display strings. Requests always use hl=en so the
// formats here stay stable no matter which region (gl) is searched.

/** "11,093,866 views" | "1.2M views" | "783K subscribers" | "No views" -> number|null */
export function parseCount(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  if (/^no\b/i.test(s)) return 0;
  const m = s.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([KMB])?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
  return Math.round(n * mult);
}

const UNIT_DAYS = { second: 1 / 86400, minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30.44, year: 365.25 };

/** "9 months ago" | "Streamed 2 weeks ago" | "1 day ago" -> approx age in days (number|null) */
export function parseRelativeAge(input) {
  if (!input) return null;
  const m = String(input).match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!m) return null;
  return Number(m[1]) * UNIT_DAYS[m[2].toLowerCase()];
}

/** "19:53" | "1:07:32" -> seconds; "SHORTS"/"LIVE"/null -> null */
export function parseDuration(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (!/^\d+(:\d{1,2}){1,2}$/.test(s)) return null;
  return s.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
}

/** "Joined Mar 22, 2023" -> ISO date string */
export function parseJoined(input) {
  if (!input) return null;
  const s = String(input).replace(/^Joined\s+/i, '').trim();
  const d = new Date(s + ' UTC');
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Text from {simpleText} | {runs:[{text}]} | {content} | string */
export function text(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (node.simpleText != null) return node.simpleText;
  if (Array.isArray(node.runs)) return node.runs.map((r) => r.text).join('');
  if (node.content != null) return node.content;
  return '';
}

/** Depth-first search: call fn on every object that has `key`; returns list of values. */
export function findAll(root, key, limit = Infinity) {
  const out = [];
  const stack = [root];
  while (stack.length && out.length < limit) {
    const o = stack.pop();
    if (!o || typeof o !== 'object') continue;
    if (Object.prototype.hasOwnProperty.call(o, key)) out.push(o[key]);
    const vals = Array.isArray(o) ? o : Object.values(o);
    for (let i = vals.length - 1; i >= 0; i--) {
      const v = vals[i];
      if (v && typeof v === 'object') stack.push(v);
    }
  }
  return out;
}

export function findFirst(root, key) {
  return findAll(root, key, 1)[0];
}

/** Accept @handle, channel URL, UC id, or a video URL / id. */
export function classifyInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const vid = s.match(/(?:v=|youtu\.be\/|\/shorts\/|\/live\/)([\w-]{11})/);
  if (vid) return { type: 'video', id: vid[1] };
  const uc = s.match(/(UC[\w-]{22})/);
  if (uc) return { type: 'channel', id: uc[1] };
  const handle = s.match(/@([\w.\-À-ỹ]+)/);
  if (handle) return { type: 'handle', url: `https://www.youtube.com/@${handle[1]}` };
  if (/^https?:\/\//.test(s)) return { type: 'url', url: s };
  if (/^[\w-]{11}$/.test(s)) return { type: 'video', id: s };
  return { type: 'handle', url: `https://www.youtube.com/@${s.replace(/\s+/g, '')}` };
}
