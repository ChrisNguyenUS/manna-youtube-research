import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findAll } from '../../src/sources/innertube/parse.js';
import { parseVideoRenderer } from '../../src/sources/innertube/search.js';
import { createInnertubeSource } from '../../src/sources/innertube/index.js';

test('search fixture parses into normalized videos', () => {
  const json = JSON.parse(fs.readFileSync('src/sources/innertube/fixtures/search-video.json', 'utf8'));
  const vids = findAll(json, 'videoRenderer').map((v) => parseVideoRenderer(v, 'storytelling'));
  assert.equal(vids.length, 3);
  for (const v of vids) {
    assert.match(v.id, /^[\w-]{11}$/);
    assert.ok(v.views > 0);
    assert.ok(v.durationSec > 0);
    assert.ok(v.channelId.startsWith('UC'));
  }
});

test('innertube adapter declares capabilities without network', () => {
  const s = createInnertubeSource({ gl: 'US' });
  assert.deepEqual(s.capabilities(), { captionsFilter: true, ccFilter: true, globalSearch: true });
  assert.equal(typeof s.stats().requests, 'number');
});
