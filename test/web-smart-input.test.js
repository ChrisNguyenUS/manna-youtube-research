import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeInput } from '../web/smart-input.js';

test('video links, one or many, open Video Analysis and start it', () => {
  const one = routeInput('https://www.tiktok.com/@a.b/video/7674941877212302599?lang=vi', 'youtube');
  assert.deepEqual([one.kind, one.path, one.params.run], ['videos', '/video', '1']);
  const many = routeInput('https://youtu.be/tgg58EbifsI\nhttps://vm.tiktok.com/ZMabc12/ https://www.youtube.com/shorts/bbbbbbbbbbb', 'tiktok');
  assert.deepEqual([many.kind, many.params.videos.split('\n').length, many.label], ['videos', 3, '3 link video → Video Analysis']);
});

test('a channel link or an @name opens Channel Analysis on the right platform', () => {
  assert.equal(routeInput('https://www.tiktok.com/@naonailmasterpath', 'youtube').path, '/tiktok/channel');
  assert.equal(routeInput('youtube.com/@BlackJournals', 'tiktok').path, '/channel');
  assert.equal(routeInput('https://www.youtube.com/channel/UCCreFX8bTVLJ6Y9lh6eZ5AA', 'tiktok').path, '/channel');
  assert.deepEqual([routeInput('@abc', 'tiktok').path, routeInput('@abc', 'youtube').path], ['/tiktok/channel', '/channel']);
});

test('anything else is a topic for the picked platform; a link mixed with words is a topic too', () => {
  assert.deepEqual([routeInput('di trú mỹ', 'tiktok').path, routeInput('di trú mỹ', 'tiktok').params.q], ['/tiktok/topic', 'di trú mỹ']);
  assert.equal(routeInput('kể chuyện đêm khuya', 'youtube').path, '/research');
  assert.equal(routeInput('xem https://youtu.be/tgg58EbifsI', 'tiktok').kind, 'topic');
  assert.equal(routeInput('   ', 'tiktok').kind, 'empty');
});
