// OpenRouter adapter of the LlmClient port. One request per call, JSON answers only.
import { aiError } from '../core/ai/base.js';
import { sleep, throwIfCancelled, rethrowIfCancelled } from '../core/cancel.js';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * @param {{getKey: () => string, fetch?: typeof globalThis.fetch, timeoutMs?: number, retries?: number, wait?: (ms: number) => Promise<any>}} o
 * @returns {import('../ports/llm.js').LlmClient}
 */
export function createOpenRouter({ getKey, fetch = globalThis.fetch, timeoutMs = 120_000, retries = 2, wait = sleep }) {
  return {
    ready: () => !!getKey(),
    async complete({ model, system, user, schema, reasoning = 'off' }) {
      const key = getKey();
      if (!key) throw aiError('llm_no_key', 'Chưa nhập API key OpenRouter. Vào Cài đặt để nhập.');
      const body = JSON.stringify({
        model,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema } },
        // Reasoning tokens are billed as output: off for bulk tagging, low where the model has to write.
        reasoning: reasoning === 'low' ? { effort: 'low' } : { enabled: false },
        usage: { include: true },
      });
      for (let attempt = 0; ; attempt++) {
        throwIfCancelled();
        const last = attempt >= retries;
        let res;
        try {
          res = await fetch(URL, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(timeoutMs) });
        } catch (e) {
          rethrowIfCancelled(e);
          if (last) throw aiError('llm_unavailable', `Không gọi được OpenRouter: ${e?.message || e}`);
          await wait(1000 * 2 ** attempt);
          continue;
        }
        if (res.status === 401 || res.status === 403) throw aiError('llm_auth', 'API key OpenRouter không đúng. Kiểm tra lại trong Cài đặt.');
        if (res.status === 429 || res.status >= 500) {
          if (last) throw aiError('llm_unavailable', `OpenRouter đang lỗi (HTTP ${res.status}). Thử lại sau.`);
          await wait(1000 * 2 ** attempt);
          continue;
        }
        if (!res.ok) throw aiError('llm_unavailable', `OpenRouter từ chối yêu cầu (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
        const data = /** @type {any} */ (await res.json());
        let json;
        try {
          json = JSON.parse(data.choices?.[0]?.message?.content ?? '');
        } catch {
          throw aiError('llm_bad_output', 'AI trả lời không đúng định dạng JSON');
        }
        const u = data.usage ?? {};
        return { json, model: data.model ?? model, tokensIn: u.prompt_tokens ?? 0, tokensOut: u.completion_tokens ?? 0, costUsd: typeof u.cost === 'number' ? u.cost : null };
      }
    },
  };
}
