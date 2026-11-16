import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenRouter } from '../../src/llm/openrouter.js';

const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) });
const ok = (content, usage = /** @type {any} */ ({ prompt_tokens: 12, completion_tokens: 3, cost: 0.0004 })) => res(200, { model: 'm/x', choices: [{ message: { content } }], usage });
const REQ = { task: 'tag', model: 'm/x', system: 'S', user: 'U', schema: { type: 'object' }, reasoning: /** @type {const} */ ('off') };
const make = (replies, key = 'sk-or-1') => {
  const calls = [];
  const fetch = async (url, init) => (calls.push({ url, init }), replies.shift());
  return { calls, llm: createOpenRouter({ getKey: () => key, fetch: /** @type {any} */ (fetch), wait: async () => {} }) };
};

test('sends model, messages, JSON schema and key; returns parsed JSON with usage', async () => {
  const { llm, calls } = make([ok('{"a":1}')]);
  const r = await llm.complete(REQ);
  assert.deepEqual(r, { json: { a: 1 }, model: 'm/x', tokensIn: 12, tokensOut: 3, costUsd: 0.0004 });
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(calls[0].init.headers.authorization, 'Bearer sk-or-1');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'm/x');
  assert.deepEqual(body.messages, [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
  assert.equal(body.response_format.type, 'json_schema');
  assert.deepEqual(body.response_format.json_schema.schema, { type: 'object' });
  assert.deepEqual(body.reasoning, { enabled: false });
  assert.deepEqual(body.usage, { include: true });
});

test('reasoning "low" asks for low effort', async () => {
  const { llm, calls } = make([ok('{}')]);
  await llm.complete({ ...REQ, reasoning: 'low' });
  assert.deepEqual(JSON.parse(calls[0].init.body).reasoning, { effort: 'low' });
});

test('429 and 500 are retried, then the answer is used', async () => {
  const { llm, calls } = make([res(429, {}), res(500, {}), ok('{"a":2}')]);
  assert.deepEqual((await llm.complete(REQ)).json, { a: 2 });
  assert.equal(calls.length, 3);
});

test('still failing after 2 retries is llm_unavailable; a thrown fetch counts as a failure', async () => {
  const { llm } = make([res(503, {}), res(503, {}), res(503, {})]);
  await assert.rejects(llm.complete(REQ), (/** @type {any} */ e) => e.code === 'llm_unavailable');
  const down = createOpenRouter({ getKey: () => 'k', fetch: /** @type {any} */ (async () => { throw new Error('ECONNRESET'); }), wait: async () => {} });
  await assert.rejects(down.complete(REQ), (/** @type {any} */ e) => e.code === 'llm_unavailable');
});

test('401 is llm_auth and is not retried', async () => {
  const { llm, calls } = make([res(401, {})]);
  await assert.rejects(llm.complete(REQ), (/** @type {any} */ e) => e.code === 'llm_auth' && /API key/.test(e.message));
  assert.equal(calls.length, 1);
});

test('content that is not JSON is llm_bad_output; missing cost is null', async () => {
  const bad = make([ok('not json')]);
  await assert.rejects(bad.llm.complete(REQ), (/** @type {any} */ e) => e.code === 'llm_bad_output');
  const noCost = make([ok('{}', { prompt_tokens: 1, completion_tokens: 1 })]);
  assert.equal((await noCost.llm.complete(REQ)).costUsd, null);
});

test('no key: ready() is false and complete throws llm_no_key without calling fetch', async () => {
  const { llm, calls } = make([], '');
  assert.equal(llm.ready(), false);
  await assert.rejects(llm.complete(REQ), (/** @type {any} */ e) => e.code === 'llm_no_key');
  assert.equal(calls.length, 0);
});
