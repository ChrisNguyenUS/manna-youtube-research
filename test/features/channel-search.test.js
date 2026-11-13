// Channel search had no test, and its `source` option (where channels come from) once shadowed the YouTube adapter:
// every run failed with "source.searchChannels is not a function".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testApp } from './helpers.js';

for (const from of ['both', 'channels', 'videos', undefined]) {
  test(`channel search runs with source=${from} and saves a record`, async () => {
    const a = testApp();
    const r = await a.features.channelSearch({ keywords: 'lịch sử', source: from, perKeyword: 10 }, () => {});
    assert.ok(r.channels.length > 0, 'finds channels');
    assert.ok(r.channels.every((c) => c.id && c.title), 'each channel is filled in');
    const rec = a.store.records.get('local', r.id);
    assert.equal(rec.kind, 'channel_search');
    assert.equal(rec.data.source, from ?? 'both', 'the record keeps where the channels came from, as text');
  });
}

test('channel search through the job API (the path the screen uses)', async () => {
  const a = testApp();
  a.runner.start();
  const { id } = a.runner.enqueue('local', 'channel_search', { keywords: 'lịch sử', source: 'both' }, 'lịch sử');
  let job;
  for (let i = 0; i < 100 && !['succeeded', 'failed'].includes((job = a.runner.get(id)).status); i++) await new Promise((r) => setTimeout(r, 20));
  a.runner.stop();
  assert.equal(job.status, 'succeeded', job.error || '');
  assert.ok(job.record_id);
});

test('empty keywords are rejected', async () => {
  await assert.rejects(() => testApp().features.channelSearch({ keywords: ' , ' }, () => {}), /từ khoá/);
});
