import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/store/sqlite/db.js';
import { createSqliteStore } from '../../src/store/sqlite/index.js';
import { createRunner, idempotencyKey } from '../../src/jobs/runner.js';

const mkStore = () => createSqliteStore(openDatabase({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-')) }));
const wait = (fn) =>
  new Promise((res, rej) => {
    const start = Date.now();
    const t = setInterval(() => {
      if (fn()) {
        clearInterval(t);
        res();
      } else if (Date.now() - start > 3000) {
        clearInterval(t);
        rej(new Error('timeout'));
      }
    }, 5);
  });

test('key ignores param order, case and whitespace', () => {
  assert.equal(idempotencyKey('local', 'video_search', { keywords: ' Kể Chuyện ', gl: 'VN' }), idempotencyKey('local', 'video_search', { gl: 'VN', keywords: 'kể chuyện' }));
  assert.notEqual(idempotencyKey('local', 'video_search', { keywords: 'a' }), idempotencyKey('local', 'comments', { keywords: 'a' }));
});

test('double submit reuses the running job (Review Focus #4)', async () => {
  const store = mkStore();
  let calls = 0;
  /** @type {any} */
  let release;
  const r = createRunner({
    jobsRepo: store.jobs,
    handlers: {
      video_search: async () => {
        calls++;
        await new Promise((x) => (release = x));
        return { id: 7 };
      },
    },
  });
  r.start();
  const a = r.enqueue('local', 'video_search', { keywords: 'a' }, 'a');
  const b = r.enqueue('local', 'video_search', { keywords: 'a' }, 'a');
  assert.equal(a.id, b.id);
  assert.equal(b.reused, true);
  await wait(() => release);
  release();
  await wait(() => r.get(a.id).status === 'succeeded');
  assert.equal(calls, 1);
  assert.equal(r.get(a.id).record_id, 7);
  r.stop();
});

test('jobs left running by a previous process become interrupted (Review Focus #3)', () => {
  const store = mkStore();
  const id = store.jobs.insert({ workspace_id: 'local', kind: 'research', title: 't', params: '{}', idempotency_key: 'z', created_at: 1, status: 'running' });
  const r = createRunner({ jobsRepo: store.jobs, handlers: {} });
  r.start();
  assert.equal(r.get(id).status, 'interrupted');
  r.stop();
});

test('cancel aborts between steps and saves nothing', async () => {
  const store = mkStore();
  const r = createRunner({
    jobsRepo: store.jobs,
    handlers: {
      comments: async (p, ctx) => {
        for (let i = 0; i < 200; i++) {
          if (ctx.signal.aborted) throw new Error('cancelled');
          await new Promise((x) => setTimeout(x, 5));
        }
        return { id: 1 };
      },
    },
  });
  r.start();
  const { id } = r.enqueue('local', 'comments', { videos: 'x' }, 'x');
  await wait(() => r.get(id).status === 'running');
  r.cancel(id);
  await wait(() => r.get(id).status === 'cancelled');
  assert.equal(r.get(id).record_id, null);
  r.stop();
});

test('handler error marks job failed with message', async () => {
  const store = mkStore();
  const r = createRunner({ jobsRepo: store.jobs, handlers: { idea_check: async () => { throw new Error('YouTube trả về 429'); } } });
  r.start();
  const { id } = r.enqueue('local', 'idea_check', { keywords: 'x' }, 'x');
  await wait(() => r.get(id).status === 'failed');
  assert.match(r.get(id).error, /429/);
  r.stop();
});

test('progress updates are stored and inline results returned', async () => {
  const store = mkStore();
  const r = createRunner({
    jobsRepo: store.jobs,
    handlers: { keyword_score: async (p, ctx) => { ctx.progress({ step: 'a', done: 1, total: 2 }); return { inline: true, results: [1] }; } },
  });
  r.start();
  const { id } = r.enqueue('local', 'keyword_score', { keywords: 'x', lite: true }, 'x');
  await wait(() => r.get(id).status === 'succeeded');
  assert.deepEqual(r.get(id).progress, { step: 'a', done: 1, total: 2 });
  assert.deepEqual(r.get(id).result, { inline: true, results: [1] });
  r.stop();
});

test('unknown kind is rejected with invalid_input', () => {
  const r = createRunner({ jobsRepo: mkStore().jobs, handlers: {} });
  assert.throws(() => r.enqueue('local', 'nope', {}, 't'), (/** @type {any} */ e) => e.code === 'invalid_input');
});

test('cancel stops a handler that only reports progress (no signal checks)', async () => {
  const store = mkStore();
  let saved = false;
  const r = createRunner({
    jobsRepo: store.jobs,
    handlers: {
      research: async (p, ctx) => {
        for (let i = 0; i < 200; i++) {
          ctx.progress({ step: 'tìm', done: i, total: 200 });
          await new Promise((x) => setTimeout(x, 5));
        }
        saved = true; // a record would be written here
        return { id: 1 };
      },
    },
  });
  r.start();
  const { id } = r.enqueue('local', 'research', { topic: 'x' }, 'x');
  await wait(() => r.get(id).status === 'running');
  r.cancel(id);
  await wait(() => r.get(id).status === 'cancelled');
  await new Promise((x) => setTimeout(x, 30));
  assert.equal(saved, false, 'handler must stop at the next progress call');
  r.stop();
});
