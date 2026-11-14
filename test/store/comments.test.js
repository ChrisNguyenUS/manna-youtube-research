import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/store/sqlite/db.js';
import { createSqliteStore } from '../../src/store/sqlite/index.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-'));
const c = (id, o = {}) => ({ id, parentId: null, isReply: false, text: `comment ${id}`, likes: 1, replies: 0, createdAt: '2026-11-01T00:00:00.000Z', pinned: false, ...o });

test('a report stores references; reading it gives back the same comments, report-only fields included', () => {
  const s = createSqliteStore(openDatabase({ dataDir: tmp() }));
  const comments = [c('1', { videoId: 'v1', videoRank: 2 }), c('2', { videoId: 'v1', parentId: '1', isReply: true, parentText: 'comment 1' })];
  const id = s.records.add('local', 'tiktok_insight', 'x', { data: { comments, insight: { questions: [{ ...comments[0], question: true, themes: ['other'] }] }, videos: [] } });
  const raw = JSON.parse(/** @type {any} */ (s.db.prepare('SELECT data FROM records WHERE id = ?').get(id)).data);
  assert.deepEqual(raw.comments[0], { $c: '1', videoRank: 2 }, 'shared fields leave the report');
  const got = s.records.get('local', id).data;
  assert.deepEqual(got.comments, comments);
  assert.deepEqual(got.insight.questions[0], { ...comments[0], question: true, themes: ['other'] });
  assert.deepEqual(s.db.prepare('SELECT COUNT(*) n FROM comments').get().n, 2);
});

test('the same comment from two reports is one row with the newest numbers; each report keeps its own fields', () => {
  const s = createSqliteStore(openDatabase({ dataDir: tmp() }));
  const a = s.records.add('local', 'tiktok_comments', 'a', { data: { video: { id: 'v1', url: 'u' }, comments: [c('1', { likes: 1 })], insight: {} } });
  const b = s.records.add('local', 'tiktok_video_analysis', 'b', { data: { videos: [{ video: { id: 'v1' }, comments: [c('1', { likes: 9, videoId: 'v1', note: 'b' })] }] } });
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM comments').get().n, 1);
  assert.equal(s.records.get('local', a).data.comments[0].likes, 9, 'older report shows the newest count');
  assert.equal(s.records.get('local', a).data.comments[0].videoId, 'v1', 'video known even when the report had it elsewhere');
  assert.equal(s.records.get('local', b).data.videos[0].comments[0].note, 'b');
  assert.deepEqual(s.comments.coverage('local', ['v1', 'v2']).map((r) => [r.videoId, r.parents, r.replies]), [['v1', 1, 0]]);
});

test('names tagged with @ are masked in the shared row; deleting a report keeps the comments but not its links', () => {
  const s = createSqliteStore(openDatabase({ dataDir: tmp() }));
  const id = s.records.add('local', 'tiktok_comments', 'a', { data: { video: { id: 'v1' }, comments: [c('1', { text: '@Loan thảo ơi cho hỏi' })], insight: {} } });
  assert.equal(s.records.get('local', id).data.comments[0].text, '@… thảo ơi cho hỏi');
  s.records.remove('local', id);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM comment_links').get().n, 0);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM comments').get().n, 1);
  assert.deepEqual(s.comments.coverage('local', ['v1']), [], 'not counted for the workspace once no report holds it');
});

test('reports written before the comments table are moved once when the store opens', () => {
  const dir = tmp();
  const s1 = createSqliteStore(openDatabase({ dataDir: dir }));
  s1.db.exec("DELETE FROM meta");
  s1.db.prepare("INSERT INTO records (workspace_id, kind, title, data, schema_version, created_at) VALUES ('local', 'tiktok_comments', 'old', ?, 1, 1)")
    .run(JSON.stringify({ video: { id: 'v9' }, comments: [c('9')], insight: { top: [c('9')] } }));
  const s2 = createSqliteStore(openDatabase({ dataDir: dir }));
  const raw = JSON.parse(/** @type {any} */ (s2.db.prepare("SELECT data FROM records WHERE title = 'old'").get()).data);
  assert.deepEqual(raw.comments, [{ $c: '9' }]);
  assert.equal(s2.records.get('local', /** @type {any} */ (s2.db.prepare("SELECT id FROM records WHERE title = 'old'").get()).id).data.insight.top[0].text, 'comment 9');
});

test('moved comments are dated by the report they came from', () => {
  const dir = tmp();
  const s1 = createSqliteStore(openDatabase({ dataDir: dir }));
  s1.db.exec("DELETE FROM meta");
  s1.db.prepare("INSERT INTO records (workspace_id, kind, title, data, schema_version, created_at) VALUES ('local', 'tiktok_comments', 'old', ?, 1, 1234)")
    .run(JSON.stringify({ video: { id: 'v8' }, comments: [c('8')], insight: {} }));
  const s2 = createSqliteStore(openDatabase({ dataDir: dir }));
  assert.equal(s2.comments.coverage('local', ['v8'])[0].lastSeen, 1234);
});
