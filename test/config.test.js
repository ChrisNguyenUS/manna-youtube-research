import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

test('dev defaults', () => {
  const c = loadConfig({});
  assert.equal(c.edition, 'dev');
  assert.equal(c.port, 5178);
  assert.equal(c.host, '127.0.0.1');
  assert.ok(c.dataDir.endsWith(path.join('youtube-research', 'data')));
});
test('env overrides and legacy YTR_DATA_DIR', () => {
  const c = loadConfig({ YTR_DATA_DIR: '/tmp/x', PORT: '0', YTR_EDITION: 'desktop' });
  assert.equal(c.dataDir, '/tmp/x');
  assert.equal(c.port, 0);
  assert.equal(c.edition, 'desktop');
});
test('rejects unknown edition', () => {
  assert.throws(() => loadConfig({ YTR_EDITION: 'cloud' }), /edition/);
});
