import { test } from 'node:test';
import assert from 'node:assert/strict';

/** @param {string} name @param {() => import('../../src/ports/tiktok-source.js').TikTokSource} make */
export function runTikTokContract(name, make) {
  test(`${name}: searchVideos returns normalized videos`, async () => {
    const vids = await make().searchVideos('thi quốc tịch mỹ', { max: 5 });
    assert.ok(vids.length > 0);
    for (const v of vids) {
      assert.match(v.id, /^\d{15,25}$/);
      for (const k of ['plays', 'likes', 'comments', 'shares', 'saves', 'durationSec']) assert.ok(Number.isFinite(v[k]), k);
      assert.ok(Array.isArray(v.hashtags));
      assert.equal(typeof v.query, 'string');
    }
  });
  test(`${name}: getComments carries no commenter identity`, async () => {
    const r = await make().getComments('7376610463154572560', { max: 5 });
    assert.ok(r.comments.length > 0);
    for (const c of r.comments) {
      assert.deepEqual(Object.keys(c).sort(), ['createdAt', 'id', 'isReply', 'likes', 'parentId', 'pinned', 'replies', 'text']);
    }
  });
  test(`${name}: capabilities + close`, async () => {
    const s = make();
    assert.equal(typeof s.capabilities().searchReady, 'boolean');
    await s.close();
  });
}
