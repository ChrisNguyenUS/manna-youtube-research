import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../src/store/sqlite/db.js';
import { createSqliteStore } from '../../src/store/sqlite/index.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-'));
const store = () => createSqliteStore(openDatabase({ dataDir: tmp() }));

test('records are scoped by workspace', () => {
  const s = store();
  const id = s.records.add('local', 'video_search', 'a', { params: {}, data: { videos: [] }, schemaVersion: 2 });
  assert.equal(s.records.get('local', id).schema_version, 2);
  assert.equal(s.records.get('other', id), undefined);
  assert.equal(s.records.list('other').length, 0);
});

test('saved and settings keep v0 behaviour under workspace local', () => {
  const s = store();
  s.saved.put('local', 'channel', 'UC1', 'Kênh', { id: 'UC1' });
  assert.deepEqual(s.saved.keys('local'), ['channel:UC1']);
  s.settings.set('local', { gl: 'VN' });
  assert.equal(s.settings.all('local').gl, 'VN');
  assert.equal(s.settings.all('local').concurrency, 4, 'defaults still applied');
});

test('v0 saved items and settings survive migration 002', () => {
  const dir = tmp();
  const v0 = new DatabaseSync(path.join(dir, 'research.db'));
  v0.exec(fs.readFileSync('test/fixtures/v0-schema.sql', 'utf8'));
  v0.exec("PRAGMA user_version = 1; INSERT INTO saved VALUES ('video','abc','T','note','{}',1); INSERT INTO settings VALUES ('gl','\"VN\"');");
  v0.close();
  const s = createSqliteStore(openDatabase({ dataDir: dir }));
  assert.equal(s.saved.list('local')[0].note, 'note');
  assert.equal(s.settings.all('local').gl, 'VN');
});

test('only one active job per idempotency key', () => {
  const s = store();
  const base = { workspace_id: 'local', kind: 'video_search', title: 't', params: '{}', idempotency_key: 'k', created_at: 1 };
  s.jobs.insert({ ...base, status: 'running' });
  assert.throws(() => s.jobs.insert({ ...base, status: 'queued' }), /UNIQUE/);
  s.jobs.update(s.jobs.findActiveByKey('k').id, { status: 'succeeded' });
  assert.doesNotThrow(() => s.jobs.insert({ ...base, status: 'queued' }));
});

test('markInterrupted flips running jobs', () => {
  const s = store();
  const id = s.jobs.insert({ workspace_id: 'local', kind: 'research', title: 't', params: '{}', idempotency_key: 'x', created_at: 1, status: 'running' });
  s.jobs.markInterrupted();
  assert.equal(s.jobs.get(id).status, 'interrupted');
});
