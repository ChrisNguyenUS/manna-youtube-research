import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeLlm } from '../../src/llm/fake.js';

const REQ = { task: 't', model: 'm', system: '', user: '', schema: {} };

test('array script: replies in order, errors are thrown, calls are recorded', async () => {
  const llm = createFakeLlm([{ a: 1 }, Object.assign(new Error('x'), { code: 'llm_unavailable' })]);
  assert.deepEqual((await llm.complete(REQ)).json, { a: 1 });
  await assert.rejects(llm.complete(REQ), (/** @type {any} */ e) => e.code === 'llm_unavailable');
  await assert.rejects(llm.complete(REQ), /no reply left/);
  assert.equal(llm.calls.length, 3);
});

test('function script sees the request; ready can be turned off', async () => {
  const llm = createFakeLlm((req) => ({ task: req.task }), { ready: false });
  assert.equal(llm.ready(), false);
  assert.deepEqual(await llm.complete(REQ), { json: { task: 't' }, model: 'm', tokensIn: 10, tokensOut: 5, costUsd: 0.25 });
});
