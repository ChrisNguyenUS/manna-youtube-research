// Stage 1 (code only): turn chosen videos/posts and their comments into the frozen dataset of a run.
// Stable refs (V1…, C1…), replies linked to their parent, duplicates marked, authors hashed, missing numbers kept null.
import { createHash } from 'node:crypto';
import { maskMentions, hasWords } from '../analysis/text.js';

export const PLATFORMS = ['tiktok', 'youtube', 'facebook', 'instagram', 'other'];
const sha = (s) => createHash('sha256').update(String(s)).digest('hex');
const fold = (t) => String(t ?? '').normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
const numOrNull = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Math.max(0, Math.round(Number(v))));
const dateOrNull = (v) => {
  if (v == null || v === '') return null;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/**
 * @typedef {{platform: string, video: any, comments: any[]}} SourceInput
 *   video: {id?, title?|caption?, url?, author?, plays?|views?, likes?, comments?, publishedAt?|createdAt?}
 *   comments: [{id?, text, likes?, replies?, parentId?, isReply?, createdAt?, author?}]
 * @param {SourceInput[]} inputs
 * @param {{maxComments?: number, includeReplies?: boolean, minLikes?: number, salt?: string}} [o]
 */
export function normalizeSources(inputs, { maxComments = 3000, includeReplies = true, minLikes = 0, salt = 'ci' } = {}) {
  const sources = [];
  const comments = [];
  const byExternal = new Map(); // platform:id → ref
  const byFingerprint = new Map();
  let skipped = { empty: 0, replies: 0, lowLikes: 0, overLimit: 0, duplicates: 0 };
  for (const input of inputs) {
    const platform = PLATFORMS.includes(input.platform) ? input.platform : 'other';
    const v = input.video ?? {};
    const sref = `V${sources.length + 1}`;
    sources.push({
      ref: sref, platform, externalId: v.id != null ? String(v.id) : null, title: String(v.title ?? v.caption ?? '').slice(0, 300), url: v.url ?? null,
      author: v.author ?? v.channelTitle ?? null, publishedAt: dateOrNull(v.publishedAt ?? v.createdAt),
      metrics: { views: numOrNull(v.plays ?? v.views), likes: numOrNull(v.likes), comments: numOrNull(v.comments), shares: numOrNull(v.shares) },
    });
    // Parents first so a reply can point at its parent's ref.
    const list = [...(input.comments ?? [])].sort((a, b) => Number(Boolean(a.parentId || a.isReply)) - Number(Boolean(b.parentId || b.isReply)));
    for (const c of list) {
      const text = maskMentions(String(c?.text ?? '')).trim();
      if (!hasWords(text)) {
        skipped.empty++;
        continue;
      }
      const isReply = Boolean(c.parentId || c.isReply);
      if (isReply && !includeReplies) {
        skipped.replies++;
        continue;
      }
      const likes = numOrNull(c.likes);
      if (minLikes > 0 && (likes ?? 0) < minLikes) {
        skipped.lowLikes++;
        continue;
      }
      if (comments.length >= maxComments) {
        skipped.overLimit++;
        continue;
      }
      const externalId = c.id != null && c.id !== '' ? String(c.id) : null;
      if (externalId && byExternal.has(`${platform}:${externalId}`)) {
        skipped.duplicates++;
        continue; // the same platform comment twice: kept once
      }
      const fingerprint = sha(`${platform}|${sref}|${fold(text)}`).slice(0, 24);
      const ref = `C${comments.length + 1}`;
      const parentRef = c.parentId != null ? byExternal.get(`${platform}:${String(c.parentId)}`) ?? null : null;
      comments.push({
        ref, sourceRef: sref, platform, externalId, parentRef, text: text.slice(0, 2000), likes, replies: numOrNull(c.replies), createdAt: dateOrNull(c.createdAt),
        authorHash: c.author ? sha(`${salt}|${platform}|${String(c.author).trim().toLowerCase()}`).slice(0, 16) : null,
        fingerprint, duplicateOf: !externalId ? byFingerprint.get(fingerprint) ?? null : null,
      });
      if (externalId) byExternal.set(`${platform}:${externalId}`, ref);
      if (!byFingerprint.has(fingerprint)) byFingerprint.set(fingerprint, ref);
    }
  }
  return { sources, comments, skipped };
}

/** Comments the AI stages read: not a probable duplicate. @param {any[]} comments */
export const analysable = (comments) => comments.filter((c) => !c.duplicateOf);

// ---------- manual import (CSV or JSON) ----------

/** RFC-4180-ish CSV: quotes, doubled quotes, commas/semicolons/tabs, CRLF. @param {string} text */
export function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => Number(b[1]) - Number(a[1]))[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') (cell += '"', i++);
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) (row.push(cell), (cell = ''));
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) (row.push(cell), rows.push(row));
  const [head = [], ...body] = rows.filter((r) => r.some((x) => String(x).trim() !== ''));
  const keys = head.map((h) => String(h).trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

const pick = (o, names) => {
  for (const n of names) if (o[n] != null && o[n] !== '') return o[n];
  return null;
};

/**
 * Pasted CSV or JSON → sources grouped by post (column source/url/post/video; one "Dữ liệu nhập tay" post when absent).
 * @param {string} text @param {string} platform default platform for rows that do not say
 * @returns {{inputs: SourceInput[], rows: number, errors: string[]}}
 */
export function parseManualImport(text, platform = 'other') {
  const t = String(text ?? '').trim();
  const errors = [];
  let rows = [];
  if (!t) return { inputs: [], rows: 0, errors: ['Chưa dán dữ liệu'] };
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      rows = Array.isArray(j) ? j : Array.isArray(j.comments) ? j.comments : [];
    } catch (e) {
      return { inputs: [], rows: 0, errors: [`JSON không đọc được: ${e.message}`] };
    }
  } else rows = parseCsv(t);
  const groups = new Map();
  let n = 0;
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const low = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v]));
    const text = pick(low, ['text', 'comment', 'content', 'message', 'body', 'binh_luan', 'bình luận']);
    if (!text) continue;
    n++;
    const key = String(pick(low, ['source', 'post', 'post_url', 'video', 'video_url', 'url', 'source_url']) ?? 'manual');
    const plat = String(pick(low, ['platform', 'nen_tang']) ?? platform).toLowerCase();
    const gk = `${plat}|${key}`;
    if (!groups.has(gk)) groups.set(gk, { platform: PLATFORMS.includes(plat) ? plat : 'other', video: { id: key === 'manual' ? null : key, title: String(pick(low, ['source_title', 'post_title', 'title']) ?? (key === 'manual' ? 'Dữ liệu nhập tay' : key)), url: /^https?:\/\//.test(key) ? key : null }, comments: [] });
    groups.get(gk).comments.push({
      id: pick(low, ['id', 'comment_id']), text: String(text), likes: pick(low, ['likes', 'like', 'reactions']), replies: pick(low, ['replies', 'reply_count']),
      parentId: pick(low, ['parent_id', 'reply_to']), createdAt: pick(low, ['created_at', 'date', 'time', 'timestamp']), author: pick(low, ['author', 'user', 'username', 'name']),
    });
  }
  if (!n) errors.push('Không thấy cột text/comment/content trong dữ liệu');
  return { inputs: [...groups.values()], rows: n, errors };
}

/** Deterministic hash for cache keys and input hashes. @param {any} v */
export const hashOf = (v) => sha(typeof v === 'string' ? v : JSON.stringify(v));
