// Scripted LlmClient for tests: no network, records every request.

/**
 * @param {any[] | ((req: import('../ports/llm.js').LlmRequest, index: number) => any)} script
 *   replies in call order, or a function of the request; a reply that is an Error is thrown
 * @param {{ready?: boolean}} [o]
 * @returns {import('../ports/llm.js').LlmClient & {calls: import('../ports/llm.js').LlmRequest[]}}
 */
export function createFakeLlm(script = [], { ready = true } = {}) {
  /** @type {import('../ports/llm.js').LlmRequest[]} */
  const calls = [];
  return {
    calls,
    ready: () => ready,
    async complete(req) {
      calls.push(req);
      const next = typeof script === 'function' ? script(req, calls.length - 1) : script.shift();
      if (next instanceof Error) throw next;
      if (next === undefined) throw new Error('fake llm: no reply left');
      return { json: structuredClone(next), model: req.model, tokensIn: 10, tokensOut: 5, costUsd: 0.25 };
    },
  };
}
