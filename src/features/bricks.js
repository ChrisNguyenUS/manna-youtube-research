// Use case: the brick library (spec 2026-11-16-brick-library-design.md). Videos are broken into bricks by the
// write model, one call per video; rows keep what the model saw so every brick can be traced. The owner's edits sit
// on top of the model's answer and survive a re-extract.
import { noop, splitList } from './shared.js';
import { rethrowIfCancelled } from '../core/cancel.js';
import { aiError } from '../core/ai/base.js';
import { LIMITS, EDITABLE, cleanEdit, applyEdits, emptyBricks } from '../core/bricks/schema.js';
import { prepareVideo, extractRequest, checkBricks } from '../core/bricks/extract.js';
import { bricksMarkdown, deepDiveMarkdown } from '../core/report/bricks.js';
import { deepDiveRequest, checkDeepDive, flaggedItems, rewriteRequest, applyRewrite } from '../core/bricks/deep-dive.js';
import { FATAL, modelOf, makeMeter, twice, pool } from './ai/run.js';
import { youtubeIdOf } from './video-analysis.js';
import { compareChannel, RULE } from '../core/bricks/compare.js';

const ANALYSIS_KINDS = ['tiktok_video_analysis', 'video_analysis'];
/** A TikTok link, or a bare video id. Shared with the idea board's posted links. */
export const TIKTOK_LINK = /^(https?:\/\/)?([a-z0-9-]+\.)*tiktok\.com\/|^\d{15,25}$/i;
const invalid = (message, field) => Object.assign(new Error(message), { code: 'invalid_input', field });
const notFound = (message) => Object.assign(new Error(message), { code: 'not_found' });
/** Stored bricks with every field present, so a row written by an older version or by hand never breaks a screen. @param {any} d */
function filled(d) {
  const e = emptyBricks();
  const x = d && typeof d === 'object' ? d : {};
  return { ...e, ...x, hook: { ...e.hook, ...x.hook }, story: { ...e.story, ...x.story }, audience: { ...e.audience, ...x.audience }, fit: { ...e.fit, ...x.fit }, visual: { ...e.visual, ...x.visual }, evidence: { ...e.evidence, ...x.evidence }, flags: { ...e.flags, ...x.flags } };
}

/** Where a video belongs and how it is shown in lists. @param {'tiktok'|'youtube'} platform @param {any} v */
function describe(platform, v) {
  const tiktok = platform === 'tiktok';
  return {
    channelRef: tiktok ? (v.author ? `tiktok:${String(v.author).toLowerCase()}` : '') : v.channelId ? `youtube:${v.channelId}` : '',
    meta: {
      title: String(v.caption || v.title || '').replace(/\s+/g, ' ').trim().slice(0, 200), url: v.url ?? '', cover: v.cover ?? v.thumb ?? null,
      channelTitle: tiktok ? (v.author ? `@${v.author}` : '') : v.channelTitle ?? '', views: (tiktok ? v.plays : v.views) ?? null, score: /** @type {number|null} */ (null), ageDays: /** @type {number|null} */ (null), durationSec: v.durationSec ?? null,
    },
  };
}

/**
 * @param {{repo: any, ws: string, llm: import('../ports/llm.js').LlmClient, settings: () => Record<string, any>, knowledge?: string, analyst?: string,
 *   profile: () => any, records: {get: (id: number) => any}, tiktok: import('../ports/tiktok-source.js').TikTokSource,
 *   source: import('../ports/youtube-source.js').YouTubeSource, commentsOf: (videoId: string) => any[], follows: {list: (ws: string) => any[]}}} deps
 *   analyst: the 8-step method file; knowledge: the concepts file; profile: the Soulprint profile (pillars, filter); commentsOf: collected TikTok comments of a video
 */
export function makeBricks({ repo, ws, llm, settings, knowledge = '', analyst = '', profile, records, tiktok, source, commentsOf, follows }) {
  /** Score and age of a video, when a followed channel's last check saw it. */
  function scanned() {
    const byId = new Map();
    for (const f of follows.list(ws)) for (const v of f.lastScan?.videos ?? []) byId.set(`${f.platform}:${v.id}`, { score: v.score ?? null, ageDays: v.ageDays ?? null, channelRef: `${f.platform}:${f.ref}`, channelTitle: f.title });
    return byId;
  }

  /** Videos of a saved "Phân tích video" report, with the transcript and comments it already holds. */
  function fromRecord(recordId) {
    const rec = records.get(Number(recordId));
    if (!rec || !ANALYSIS_KINDS.includes(rec.kind)) throw notFound('Không thấy báo cáo Phân tích video');
    const platform = rec.data.platform === 'youtube' ? 'youtube' : 'tiktok';
    return (rec.data.videos || []).filter((e) => e.video && !e.error).map((e) => ({ platform, id: String(e.video.id), title: String(e.video.caption || e.video.title || e.link), load: async () => ({ video: e.video, transcript: e.transcript ?? null, comments: e.comments ?? [] }) }));
  }

  /** Pasted links: each is fetched from its platform when its turn comes. */
  function fromLinks(links) {
    const out = [];
    for (const raw of splitList(links)) {
      const link = raw.replace(/\s+/g, '');
      if (TIKTOK_LINK.test(link)) {
        const id = link.match(/(\d{15,25})/)?.[1] ?? link;
        out.push({ platform: 'tiktok', id, title: link, load: async () => {
          const got = await tiktok.getVideo(link);
          return { video: got.video, transcript: got.transcript ?? null, comments: commentsOf(String(got.video.id)) };
        } });
      } else if (youtubeIdOf(link)) {
        const id = /** @type {string} */ (youtubeIdOf(link));
        out.push({ platform: 'youtube', id, title: link, load: async () => {
          const v = await source.getVideo(id, { likes: true });
          // A missing transcript is not a reason to skip the video: it is extracted from title and description.
          const transcript = source.getTranscript ? await source.getTranscript(id).catch((e) => (rethrowIfCancelled(e), null)) : null;
          return { video: { ...v, id, url: `https://www.youtube.com/watch?v=${id}`, cover: v.thumb ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }, transcript, comments: [] };
        } });
      }
    }
    return out;
  }

  /** Extra targets for later tasks (followed channels) plug in here. @type {((params: any) => any[])[]} */
  const moreTargets = [];

  const minScore = () => Number(settings().bricksMinScore) || 3;
  const followed = () => follows.list(ws).filter((f) => f.lastScan?.videos?.length);
  /** Videos of a channel's last check worth extracting: those beating the channel, and (for contrast) its weakest old-enough ones. */
  function picks(f, withContrast) {
    const vids = f.lastScan.videos.filter((v) => v.score != null);
    const hot = vids.filter((v) => v.score >= minScore());
    // A video a few days old has not had its views yet: it is not evidence of a weak idea.
    const weak = vids.filter((v) => v.score < RULE.loserBelow && (v.ageDays ?? 0) >= 3).sort((a, b) => a.score - b.score).slice(0, 5);
    return { hot, weak: withContrast ? weak : [], weakCount: weak.length };
  }
  /** Targets from followed channels: `follows` is "all" or "platform:ref,…". */
  moreTargets.push((params) => {
    if (!params.follows) return [];
    const want = params.follows === 'all' ? null : new Set(String(params.follows).split(',').map((x) => x.trim()).filter(Boolean));
    const chosen = followed().filter((f) => !want || want.has(`${f.platform}:${f.ref}`));
    if (want && chosen.length < want.size) throw invalid('Có kênh không còn trong danh sách theo dõi, hoặc chưa được Cập nhật lần nào', 'follows');
    return chosen.flatMap((f) => {
      const { hot, weak } = picks(f, params.contrast === true);
      return [...hot, ...weak].map((v) => fromLinks(v.url)[0]).filter(Boolean);
    });
  });

  /** Per followed channel: how many videos beat it, how many of those are not in the library yet, how many weak ones could be added for contrast. */
  function candidates() {
    const have = new Set(repo.list(ws).map((r) => `${r.platform}:${r.videoId}`));
    return { min: minScore(), channels: followed().map((f) => {
      const { hot, weakCount } = picks(f, false);
      return { platform: f.platform, ref: f.ref, title: f.title || f.ref, standouts: hot.length, fresh: hot.filter((v) => !have.has(`${f.platform}:${v.id}`)).length, contrast: weakCount };
    }) };
  }
  /** Channels that have rows in the library. */
  function channels() {
    const by = new Map();
    for (const r of repo.list(ws)) {
      if (!r.channelRef) continue;
      const c = by.get(r.channelRef) ?? { channelRef: r.channelRef, title: r.meta.channelTitle || r.channelRef, videos: 0 };
      c.videos++;
      by.set(r.channelRef, c);
    }
    return [...by.values()].sort((a, b) => b.videos - a.videos);
  }
  /** @param {string} channelRef */
  function compare(channelRef) {
    const rows = repo.list(ws).filter((r) => r.channelRef === channelRef).map((r) => view(r));
    return { channelRef, title: rows[0]?.meta.channelTitle || channelRef, min: minScore(), ...compareChannel(rows, { min: minScore() }) };
  }

  /** The 8-step deep dive of one library video: one call, then one rewrite of conclusion texts that are not in plain words. */
  async function deepDive(params, progress = noop) {
    if (!params.platform) throw invalid('Thiếu nền tảng', 'platform');
    if (!llm.ready()) throw aiError('llm_no_key', 'Chưa nhập API key OpenRouter. Vào Cài đặt để nhập.');
    const r = one(params.platform, params.videoId);
    const row = view(r, true);
    const model = modelOf(settings().aiWriteModel);
    const m = makeMeter(llm);
    progress({ step: 'Đào sâu 8 bước', done: 0, total: 2 });
    let d = await twice(async () => checkDeepDive(await m.ask(deepDiveRequest(row, { compare: r.channelRef ? compare(r.channelRef) : null, knowledge: analyst }), model)));
    const items = flaggedItems(d);
    if (items.length) {
      progress({ step: 'Viết lại các câu chưa đủ đời thường', done: 1, total: 2 });
      try {
        d = applyRewrite(d, items, await m.ask(rewriteRequest(items), model));
      } catch (e) {
        rethrowIfCancelled(e);
        if (FATAL.has(e?.code)) throw e;
        d = { ...d, flagged: items.map((x) => x.path) }; // the first answer stands, marked
      }
    }
    repo.setDeepDive(ws, r.platform, r.videoId, { ...d, model, at: Date.now() });
    return { inline: true, platform: r.platform, videoId: r.videoId, usage: { model, ...m.usage } };
  }

  /** @param {{recordId?: number, links?: string, redo?: boolean} & Record<string, any>} params */
  async function extract(params, progress = noop) {
    if (!llm.ready()) throw aiError('llm_no_key', 'Chưa nhập API key OpenRouter. Vào Cài đặt để nhập.');
    const all = [...(params.recordId ? fromRecord(params.recordId) : []), ...(params.links ? fromLinks(params.links) : []), ...moreTargets.flatMap((fn) => fn(params))];
    const seen = new Set();
    const targets = all.filter((t) => !seen.has(`${t.platform}:${t.id}`) && seen.add(`${t.platform}:${t.id}`));
    if (!targets.length) throw invalid('Không có video nào để bóc gạch', 'links');
    if (targets.length > LIMITS.videos) throw invalid(`Tối đa ${LIMITS.videos} video mỗi lần (đang có ${targets.length})`, 'links');

    const p = profile();
    const opts = { pillars: (p?.pillars ?? []).map((x) => x.name).filter(Boolean), filter: String(p?.filter ?? ''), knowledge };
    const model = modelOf(settings().aiWriteModel);
    const m = makeMeter(llm);
    const scans = scanned();
    const failed = [];
    let done = 0;
    let skipped = 0;
    let finished = 0;
    progress({ step: `Bóc gạch 0/${targets.length}`, done: 0, total: targets.length });
    // Every target counts towards the progress, whichever way it ends.
    const step = () => progress({ step: `Bóc gạch ${++finished}/${targets.length}`, done: finished, total: targets.length });
    await pool(targets, LIMITS.parallel, async (t) => {
      const known = repo.get(ws, t.platform, t.id);
      if (known && !params.redo) skipped++;
      else {
        try {
          const got = await t.load();
          // A short link (vm.tiktok.com/…) only shows its real video id once loaded: check the library again before
          // paying for a model call.
          const videoId = String(got.video.id ?? t.id);
          const before = videoId === t.id ? known : repo.get(ws, t.platform, videoId);
          if (before && !params.redo) {
            skipped++;
            return void step();
          }
          const prep = prepareVideo({ platform: t.platform, video: got.video, transcript: got.transcript, comments: got.comments });
          const data = await twice(async () => checkBricks(await m.ask(extractRequest(prep, opts), model), prep, opts));
          const d = describe(/** @type {any} */ (t.platform), got.video);
          // Score, age and channel come from a followed channel's last check. That check only lists the channel's latest
          // videos, so when it no longer has this one, what an earlier extract recorded is kept.
          const scan = scans.get(`${t.platform}:${videoId}`) ?? null;
          const was = before?.meta ?? {};
          repo.put(ws, {
            platform: t.platform, videoId, channelRef: scan?.channelRef || before?.channelRef || d.channelRef,
            meta: { ...d.meta, channelTitle: scan?.channelTitle || was.channelTitle || d.meta.channelTitle, score: scan?.score ?? was.score ?? null, ageDays: scan?.ageDays ?? was.ageDays ?? null },
            source: { segments: prep.segments, comments: prep.comments, truncated: prep.truncated }, data, model,
          });
          done++;
        } catch (e) {
          rethrowIfCancelled(e);
          if (FATAL.has(e?.code)) throw e;
          failed.push({ title: t.title, reason: String(e?.message || e) });
        }
      }
      step();
    });
    return { inline: true, done, skipped, failed, usage: { model, ...m.usage } };
  }

  const view = (r, full = false) => ({
    platform: r.platform, videoId: r.videoId, channelRef: r.channelRef, meta: r.meta, bricks: applyEdits(filled(r.data), r.edited), editedPaths: Object.keys(r.edited).filter((k) => EDITABLE.includes(k)),
    hasDeepDive: !!r.deepDive, analyzedAt: r.analyzedAt, model: r.model, ...(full ? { source: r.source, deepDive: r.deepDive } : {}),
  });
  function one(platform, videoId) {
    const r = repo.get(ws, platform, videoId);
    if (!r) throw notFound('Video này chưa có trong thư viện gạch');
    return r;
  }

  /** @param {string} platform @param {string} videoId @param {Record<string, any>} edits path → value; unknown paths and unacceptable values are ignored */
  function update(platform, videoId, edits) {
    const r = one(platform, videoId);
    const edited = { ...r.edited };
    for (const [path, value] of Object.entries(edits || {})) {
      const clean = cleanEdit(path, value);
      if (clean !== undefined) edited[path] = clean;
    }
    repo.setEdited(ws, platform, videoId, edited);
    return view({ ...r, edited }, true);
  }

  return {
    extract, moreTargets, candidates, channels, compare, deepDive, deepDiveMarkdown: (platform, videoId) => deepDiveMarkdown(view(one(platform, videoId), true)),
    list: () => repo.list(ws).map((r) => view(r)),
    get: (platform, videoId) => view(one(platform, videoId), true),
    update,
    remove: (platform, videoId) => void (one(platform, videoId), repo.remove(ws, platform, videoId)),
    /** @param {string[]} keys "platform:videoId"; none: the whole library */
    markdown: (keys) => bricksMarkdown(repo.list(ws).filter((r) => !keys.length || keys.includes(`${r.platform}:${r.videoId}`)).map((r) => view(r))),
  };
}
