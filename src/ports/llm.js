// Port: one call to a language model that must answer with JSON matching a schema.
// Adapters: src/llm/openrouter.js (real), src/llm/fake.js (tests). Errors carry a code (core/ai/base.js).

/**
 * @typedef {{task: string, model: string, system: string, user: string, schema: object, reasoning?: 'off'|'low'}} LlmRequest
 *   task: a short label of what the call is for (codebook, tag, summary); adapters only pass it through.
 * @typedef {{json: any, model: string, tokensIn: number, tokensOut: number, costUsd: number|null}} LlmResult
 * @typedef {{complete(req: LlmRequest): Promise<LlmResult>, ready(): boolean}} LlmClient
 *   ready(): false when no API key is set, so screens can say so before starting a job.
 */
export {};
