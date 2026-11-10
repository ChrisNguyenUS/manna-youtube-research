import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../src/store/sqlite/db.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-'));
const version = (db) => /** @type {any} */ (db.prepare('PRAGMA user_version').get()).user_version;

test('fresh DB migrates to latest', () => {
  const db = openDatabase({ dataDir: tmp() });
  assert.ok(version(db) >= 1);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='records'").get());
});

test('existing v0 DB keeps its records and gets a backup (Review Focus #1)', () => {
  const dir = tmp();
  const v0 = new DatabaseSync(path.join(dir, 'research.db'));
  v0.exec(fs.readFileSync('test/fixtures/v0-schema.sql', 'utf8'));
  v0.prepare("INSERT INTO records (kind,title,params,data,created_at) VALUES ('video_search','kể chuyện','{}','{\"videos\":[]}',1)").run();
  v0.close();
  const db = openDatabase({ dataDir: dir });
  assert.equal(/** @type {any} */ (db.prepare('SELECT COUNT(*) n FROM records').get()).n, 1);
  assert.equal(fs.readdirSync(path.join(dir, 'backups')).length, 1);
});

test('running twice is a no-op (no second backup)', () => {
  const dir = tmp();
  openDatabase({ dataDir: dir }).close();
  const db = openDatabase({ dataDir: dir });
  assert.equal(fs.existsSync(path.join(dir, 'backups')) ? fs.readdirSync(path.join(dir, 'backups')).length : 0, 0);
  db.close();
});

test('a failing migration rolls back and reports its file', () => {
  const dir = tmp();
  const mig = tmp();
  fs.writeFileSync(path.join(mig, '001_ok.sql'), 'CREATE TABLE a (x INTEGER);');
  fs.writeFileSync(path.join(mig, '002_bad.sql'), 'CREATE TABLE b (y INTEGER); THIS IS NOT SQL;');
  assert.throws(() => openDatabase({ dataDir: dir, migrationsDir: mig }), /002_bad\.sql/);
  const db = new DatabaseSync(path.join(dir, 'research.db'));
  assert.equal(version(db), 1);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='b'").get(), undefined);
});
