import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { upgradeRecord, LATEST } from '../../src/store/upgrades/index.js';
import { openDatabase } from '../../src/store/sqlite/db.js';
import { createSqliteStore } from '../../src/store/sqlite/index.js';

test('video_search v1 gets vph and viewSub', () => {
  const v1 = { videos: [{ id: 'a', views: 2400, age: 10, outlier: 3 }], summary: { outliers: 1 } };
  const { data, version } = upgradeRecord('video_search', 1, v1);
  assert.equal(version, LATEST.video_search);
  assert.equal(data.videos[0].vph, 10);
  assert.equal(data.videos[0].viewSub, 3);
  assert.equal('outlier' in data.videos[0], false);
});

test('research v1 videos are upgraded the same way', () => {
  const { data } = upgradeRecord('research', 1, { videos: [{ id: 'a', views: 24, age: 1, outlier: null }], topByOutlier: ['a'] });
  assert.equal(data.videos[0].viewSub, null);
  assert.equal(data.videos[0].vph, 1);
});

test('unknown kind passes through', () => {
  assert.deepEqual(upgradeRecord('keywords', 1, { x: 1 }), { data: { x: 1 }, version: 1 });
});

test('already latest is untouched', () => {
  const d = { videos: [] };
  assert.equal(upgradeRecord('video_search', LATEST.video_search, d).data, d);
});

test('repo returns upgraded data for old rows and stamps new rows with LATEST', () => {
  const s = createSqliteStore(openDatabase({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-')) }));
  const oldId = s.records.add('local', 'video_search', 'old', { data: { videos: [{ id: 'a', views: 48, age: 2, outlier: 1 }] }, schemaVersion: 1 });
  const r = s.records.get('local', oldId);
  assert.equal(r.schema_version, LATEST.video_search);
  assert.equal(r.data.videos[0].viewSub, 1);
  const newId = s.records.add('local', 'video_search', 'new', { data: { videos: [] } });
  assert.equal(s.records.get('local', newId).schema_version, LATEST.video_search);
});

test('research v1 derived view/sub fields are renamed', () => {
  const v1 = {
    videos: [{ id: 'a', views: 10, age: 1, outlier: 2 }],
    summary: { outliers: 1 },
    topByOutlier: ['a'],
    durations: [{ key: '4-10', medianOutlier: 2 }],
    phrases: [{ phrase: 'x', medianOutlier: 2 }],
    channels: [{ id: 'UC1', bestOutlier: 2, videos: [{ id: 'a', outlier: 2 }] }],
    smallWinners: [{ id: 'UC1', bestOutlier: 2, videos: [] }],
  };
  const { data } = upgradeRecord('research', 1, v1);
  assert.deepEqual(data.topByViewSub, ['a']);
  assert.equal('topByOutlier' in data, false);
  assert.equal(data.summary.viewSubOver1, 1);
  assert.equal(data.durations[0].medianViewSub, 2);
  assert.equal(data.phrases[0].medianViewSub, 2);
  assert.equal(data.channels[0].bestViewSub, 2);
  assert.equal(data.channels[0].videos[0].viewSub, 2);
  assert.equal(data.smallWinners[0].bestViewSub, 2);
});

test('saved video bookmarks expose viewSub', () => {
  const s = createSqliteStore(openDatabase({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-')) }));
  s.saved.put('local', 'video', 'abc', 'T', { id: 'abc', outlier: 4 });
  assert.equal(s.saved.list('local', 'video')[0].data.viewSub, 4);
});
