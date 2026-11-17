// Use case: 5W1H report over collected TikTok comments, written with a language model (spec 2026-11-16).
// Three steps: groups from a sample, every comment assigned in batches, then counting in code and one call for
// notes and content ideas. A failed batch leaves its comments "chưa phân loại"; a failed summary still saves the counts.
import { noop } from '../shared.js';
import { rethrowIfCancelled } from '../../core/cancel.js';
import { aiError, DEFAULT_MODEL } from '../../core/ai/base.js';
import { LIMITS, prepare, estimateOf, codebookRequest, checkCodebook, tagRequest, checkTags, expandTags, tally, summaryRequest, checkSummary } from '../../core/ai/five-w.js';

const KIND = 'comment_5w1h';
const PARALLEL = 3;
/** Errors no retry can fix: stop the whole job. */
const FATAL = new Set(['llm_auth', 'llm_no_key']);
const invalid = (message, field) => Object.assign(new Error(message), { code: 'invalid_input', field });
const idsOf = (videos) => [...new Set(String(videos || '').split(/[\s,]+/).filter((x) => /^\d{15,25}$/.test(x)))].slice(0, 200);
const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const modelOf = (v) => String(v || '').trim() || DEFAULT_MODEL;
const addCost = (a, b) => (a == null || b == null ? null : a + b);

/** Run fn over the list, `size` at a time. An error from fn stops everything. */
async function pool(list, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, async () => {
    while (next < list.length) await fn(list[next++]);
  }));
}

/**
 * @param {{llm: import('../../ports/llm.js').LlmClient, readComments: (ids: string[]) => {videos: any[], comments: any[]},
 *   records: {add: Function, get: Function, update: Function}, settings: () => Record<string, any>, knowledge?: string, profileText?: () => string, batchSize?: number}} deps
 *   knowledge: the course notes given to the summary step ('' when the files are missing)
 */
export function makeComment5w1h({ llm, readComments, records, settings, knowledge = '', profileText = () => '', batchSize = LIMITS.batch }) {
  /** Counts calls, tokens and money of one job. */
  function meter() {
    const usage = { calls: 0, tokensIn: 0, tokensOut: 0, costUsd: /** @type {number|null} */ (0) };
    return {
      usage,
      async ask(req, model) {
        usage.calls++; // counted before the call: a failed call was still made
        const r = await llm.complete({ ...req, model });
        usage.tokensIn += r.tokensIn;
        usage.tokensOut += r.tokensOut;
        usage.costUsd = addCost(usage.costUsd, r.costUsd);
        return r.json;
      },
    };
  }

  /** One retry for anything a second try can fix (bad output, a busy provider). */
  async function twice(fn) {
    try {
      return await fn();
    } catch (e) {
      rethrowIfCancelled(e);
      if (FATAL.has(e?.code)) throw e;
      return fn();
    }
  }

  async function write(m, codebook, tags, comments, model) {
    const { request, refs } = summaryRequest(tally(codebook, tags, comments), comments, knowledge, profileText());
    return checkSummary(await m.ask(request, model), codebook, refs);
  }

  async function rewrite(id, progress) {
    const rec = records.get(id);
    if (!rec || rec.kind !== KIND) throw Object.assign(new Error('Không thấy báo cáo 5W1H'), { code: 'not_found' });
    const d = rec.data;
    const model = modelOf(settings().aiWriteModel);
    const m = meter();
    progress({ step: 'Tổng hợp', done: 0, total: 1 });
    const sum = await twice(() => write(m, d.codebook, d.tags, readComments(d.videoIds).comments, model));
    records.update(id, {
      ...d, notes: sum.notes, ideas: sum.ideas, summaryError: null, hasKnowledge: !!knowledge, hasProfile: !!profileText(), counts: { ...d.counts, badRefs: sum.bad },
      usage: { ...d.usage, writeModel: model, calls: d.usage.calls + m.usage.calls, tokensIn: d.usage.tokensIn + m.usage.tokensIn, tokensOut: d.usage.tokensOut + m.usage.tokensOut, costUsd: addCost(d.usage.costUsd, m.usage.costUsd) },
    });
    return { id };
  }

  /** @param {{videos?: string, onlyStep3?: number}} params @param {(p: any) => void} [progress] progress throws once the job is cancelled */
  async function run(params, progress = noop) {
    if (!llm.ready()) throw aiError('llm_no_key', 'Chưa nhập API key OpenRouter. Vào Cài đặt để nhập.');
    if (params.onlyStep3) return rewrite(Number(params.onlyStep3), progress);
    const videoIds = idsOf(params.videos);
    if (!videoIds.length) throw invalid('Chọn ít nhất một video', 'videos');
    const { comments } = readComments(videoIds);
    const prep = prepare(comments);
    if (!prep.items.length) throw invalid('Không có comment nào có chữ', 'videos');
    const s = settings();
    const [tagModel, writeModel] = [modelOf(s.aiTagModel), modelOf(s.aiWriteModel)];
    const m = meter();

    progress({ step: 'Lập bảng mã', done: 0, total: 1 });
    const codebook = await twice(async () => checkCodebook(await m.ask(codebookRequest(prep.items.slice(0, LIMITS.sample)), tagModel)));

    const batches = chunk(prep.items, batchSize);
    const byN = new Map();
    let done = 0;
    let failedBatches = 0;
    let badTags = 0;
    progress({ step: 'Gắn mã', done: 0, total: batches.length });
    await pool(batches, PARALLEL, async (batch) => {
      try {
        const r = await twice(async () => checkTags(await m.ask(tagRequest(codebook, batch), tagModel), codebook, batch));
        for (const [n, t] of r.byN) byN.set(n, t);
        badTags += r.bad;
      } catch (e) {
        rethrowIfCancelled(e);
        if (FATAL.has(e?.code)) throw e;
        failedBatches++;
      }
      progress({ step: 'Gắn mã', done: ++done, total: batches.length });
    });
    const tags = expandTags(prep.items, byN);
    const tagged = Object.keys(tags).length;
    if (!tagged) throw aiError('llm_unavailable', 'AI không gắn được nhóm cho lô bình luận nào. Thử lại, hoặc đổi model trong Cài đặt.');

    progress({ step: 'Tổng hợp', done: 0, total: 1 });
    /** @type {{notes: any, ideas: any, summaryError: string|null, bad: number}} */
    let sum;
    try {
      sum = { ...(await twice(() => write(m, codebook, tags, comments, writeModel))), summaryError: null };
    } catch (e) {
      rethrowIfCancelled(e);
      sum = { notes: null, ideas: null, summaryError: String(e?.message || e), bad: 0 }; // the counts are still worth keeping
    }
    const data = {
      videoIds, counts: { sent: prep.sent, tagged, untagged: prep.sent - tagged, dropped: prep.dropped, failedBatches, badTags, badRefs: sum.bad },
      codebook, tags, notes: sum.notes, ideas: sum.ideas, summaryError: sum.summaryError, hasKnowledge: !!knowledge, hasProfile: !!profileText(),
      usage: { tagModel, writeModel, ...m.usage },
    };
    return { id: records.add(KIND, `${videoIds.length} video · ${prep.sent} comment`, { params, data }) };
  }

  /** How much a run on these videos would send. @param {string} videos */
  function estimate(videos) {
    const ids = idsOf(videos);
    return { ...estimateOf(prepare(ids.length ? readComments(ids).comments : [])), ready: llm.ready() };
  }

  /** A saved report with today's comments of its videos: the counted table, and each comment with its tags (w). @param {number} id */
  function report(id) {
    const rec = records.get(id);
    if (!rec || rec.kind !== KIND) throw Object.assign(new Error('Không thấy báo cáo 5W1H'), { code: 'not_found' });
    const { videos, comments } = readComments(rec.data.videoIds);
    return {
      id: rec.id, title: rec.title, createdAt: rec.created_at, data: rec.data, videos,
      table: tally(rec.data.codebook, rec.data.tags, comments),
      comments: comments.map((c) => ({ ...c, w: rec.data.tags[String(c.id)] ?? null })),
    };
  }

  return { run, estimate, report };
}
