// Shared contract every YouTubeSource adapter must satisfy (docs/ARCHITECTURE.md §8).
import { test } from 'node:test';
import assert from 'node:assert/strict';

/** @param {string} name @param {() => import('../../src/ports/youtube-source.js').YouTubeSource} make */
export function runSourceContract(name, make) {
  test(`${name}: searchVideos returns normalized videos`, async () => {
    const list = await make().searchVideos('kể chuyện', { max: 5, regions: [null] });
    assert.ok(list.length > 0);
    for (const v of list) {
      assert.match(v.id, /^[\w-]{11}$/);
      assert.equal(typeof v.title, 'string');
      assert.ok(v.views === null || Number.isFinite(v.views));
      assert.ok(Array.isArray(v.regions));
    }
  });
  test(`${name}: getChannelVideos carries ages for baselines`, async () => {
    const s = make();
    const id = await s.resolveChannelId('@nho');
    const vids = await s.getChannelVideos(id, { max: 10 });
    assert.ok(vids.length > 0);
    for (const v of vids) assert.ok(v.ageDays === null || Number.isFinite(v.ageDays));
  });
  test(`${name}: getComments shape`, async () => {
    const r = await make().getComments('NcZSPhEvIjk', { max: 3 });
    assert.equal(typeof r.disabled, 'boolean');
    for (const c of r.comments) assert.equal(typeof c.text, 'string');
  });
  test(`${name}: capabilities is declared`, () => {
    const c = make().capabilities();
    for (const k of ['captionsFilter', 'ccFilter', 'globalSearch']) assert.equal(typeof c[k], 'boolean');
  });
}
