// What every AI job needs around its model calls: counting calls and money, one retry, bounded parallelism.
import { rethrowIfCancelled } from '../../core/cancel.js';
import { DEFAULT_MODEL } from '../../core/ai/base.js';

/** Errors no retry can fix: stop the whole job. */
export const FATAL = new Set(['llm_auth', 'llm_no_key']);
export const modelOf = (v) => String(v || '').trim() || DEFAULT_MODEL;
export const addCost = (a, b) => (a == null || b == null ? null : a + b);

/** Counts calls, tokens and money of one job. @param {import('../../ports/llm.js').LlmClient} llm */
export function makeMeter(llm) {
  const usage = { calls: 0, tokensIn: 0, tokensOut: 0, costUsd: /** @type {number|null} */ (0) };
  return {
    usage,
    /** @param {Omit<import('../../ports/llm.js').LlmRequest, 'model'>} req @param {string} model @returns {Promise<any>} the answer's JSON */
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

/** One retry for anything a second try can fix (bad output, a busy provider). @template T @param {() => Promise<T>} fn @returns {Promise<T>} */
export async function twice(fn) {
  try {
    return await fn();
  } catch (e) {
    rethrowIfCancelled(e);
    if (FATAL.has(e?.code)) throw e;
    return fn();
  }
}

/** Run fn over the list, `size` at a time. An error from fn stops everything. @template T @param {T[]} list @param {number} size @param {(x: T) => Promise<any>} fn */
export async function pool(list, size, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, async () => {
    while (next < list.length) await fn(list[next++]);
  }));
}
