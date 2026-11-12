// Final-review findings 1–3: shutdown vs cancel, second instance, cancel saves nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../src/store/sqlite/db.js';
import { createSqliteStore } from '../../src/store/sqlite/index.js';
import { createRunner } from '../../src/jobs/runner.js';
import { createFakeSource } from '../../src/sources/fake/index.js';
import { testApp } from '../features/helpers.js';
import { call } from '../../src/sources/innertube/client.js';
import { runWithSignal, CancelledError } from '../../src/core/cancel.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-'));
const until = (fn, ms = 5000) =>
  new Promise((res, rej) => {
    const s = Date.now();
    const t = setInterval(() => {
      if (fn()) (clearInterval(t), res(undefined));
      else if (Date.now() - s > ms) (clearInterval(t), rej(new Error('timeout')));
    }, 10);
  });

test('stopping the app mid-job marks it interrupted, not cancelled', async () => {
  const store = createSqliteStore(openDatabase({ dataDir: tmp() }));
  const r = createRunner({
    jobsRepo: store.jobs,
    handlers: { research: async (p, ctx) => { for (;;) { ctx.progress({ step: 'x' }); await new Promise((x) => setTimeout(x, 5)); } } },
  });
  r.start();
  const { id } = r.enqueue('local', 'research', { topic: 'a' }, 'a');
  await until(() => r.get(id).status === 'running');
  r.stop();
  await until(() => r.get(id).status !== 'running');
  assert.equal(r.get(id).status, 'interrupted');
});

test('cancelled comments job leaves no records behind', async () => {
  const slow = createFakeSource();
  const base = slow.getComments;
  slow.getComments = async (...a) => (await new Promise((x) => setTimeout(x, 80)), base(...a));
  const app = testApp(slow);
  app.runner.start();
  const { id } = app.runner.enqueue('local', 'comments', { videos: 'aaaaaaaaaaa,bbbbbbbbbbb', max: 5 }, 'x');
  await until(() => app.store.records.list('local', 'comments').length === 1); // first video saved
  app.runner.cancel(id);
  await until(() => app.runner.get(id).status === 'cancelled');
  await new Promise((x) => setTimeout(x, 150));
  assert.equal(app.store.records.list('local', 'comments').length, 0);
  app.runner.stop();
});

test('cancelled research_comments does not update the report', async () => {
  const slow = createFakeSource();
  const base = slow.getComments;
  slow.getComments = async (...a) => (await new Promise((x) => setTimeout(x, 80)), base(...a));
  const app = testApp(slow);
  const rec = await app.features.research({ topic: 'lịch sử', keywords: 'lịch sử' }, () => {});
  app.runner.start();
  const { id } = app.runner.enqueue('local', 'research_comments', { recordId: rec.id, top: 2, max: 5 }, 'x');
  await until(() => app.runner.get(id).status === 'running');
  await new Promise((x) => setTimeout(x, 40));
  app.runner.cancel(id);
  await until(() => app.runner.get(id).status === 'cancelled');
  await new Promise((x) => setTimeout(x, 200));
  assert.equal(app.store.records.get('local', rec.id).data.comments, null);
  app.runner.stop();
});

test('YouTube calls made inside a cancelled job stop before hitting the network', async () => {
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(() => runWithSignal(ac.signal, 1, () => call('search', { query: 'x' })), CancelledError);
});

async function freePort() {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', () => r(undefined)));
  const p = /** @type {any} */ (s.address()).port;
  await new Promise((r) => s.close(() => r(undefined)));
  return p;
}

test('a second server on the same port exits without touching the first one\'s jobs', async () => {
  const dataDir = tmp();
  const port = await freePort();
  const env = { ...process.env, YTR_DATA_DIR: dataDir, PORT: String(port) };
  const a = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/main.js'], { env });
  let outA = '';
  a.stdout.on('data', (d) => (outA += d));
  await until(() => outA.includes('Content Research'), 8000);
  const db = new DatabaseSync(path.join(dataDir, 'research.db'));
  db.prepare("INSERT INTO jobs (workspace_id, kind, title, status, params, idempotency_key, created_at) VALUES ('local','research','live','running','{}','k',1)").run();
  const b = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/main.js'], { env });
  const code = await new Promise((r) => b.on('exit', r));
  const status = /** @type {any} */ (db.prepare("SELECT status FROM jobs WHERE title = 'live'").get()).status;
  a.kill();
  assert.notEqual(code, 0, 'second instance should exit with an error');
  assert.equal(status, 'running', 'first instance job must not be marked interrupted');
});
