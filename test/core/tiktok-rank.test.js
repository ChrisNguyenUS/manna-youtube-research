import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankVideos, playsPerDay } from '../../src/core/tiktok/rank.js';
import { METRICS } from '../../src/core/metrics/definitions.js';

/** @param {string} id @param {number} plays @param {number|null} ageDays @param {number} interactions */
const v = (id, plays, ageDays, interactions) => ({
  id, plays, ageDays, interactions,
  engagementRate: plays ? interactions / plays : null,
  hotScore: ageDays == null ? null : Math.round((interactions / (ageDays + 2)) * 10) / 10,
});
// OLD: viral two months ago · MID: strong this week · NEW: posted yesterday, best ratio, few interactions.
const OLD = v('OLD', 2_000_000, 60, 200_000);
const MID = v('MID', 200_000, 5, 8_000);
const NEW = v('NEW', 30_000, 1, 4_500);
const ids = (list) => list.map((x) => x.id).join(' ');

test('plays per day uses the same +2 days as Hot score', () => {
  assert.equal(playsPerDay({ plays: 30_000, ageDays: 1 }), 10_000);
  assert.equal(playsPerDay({ plays: 5, ageDays: null }), null);
});

test('each sort orders by its own criterion', () => {
  const all = [NEW, MID, OLD];
  assert.equal(ids(rankVideos(all, { sort: 'trending' })), 'OLD MID NEW', 'views/day');
  assert.equal(ids(rankVideos(all, { sort: 'engagement' })), 'OLD NEW MID', 'interactions + ratio');
  assert.equal(ids(rankVideos(all, { sort: 'fresh' })), 'NEW MID OLD', 'newest first');
  assert.equal(ids(rankVideos(all, { sort: 'hot' })), 'OLD NEW MID', 'old Hot score order still available');
  assert.equal(ids(rankVideos(all)), 'OLD MID NEW', 'default: combined score');
});

test('scores: percentiles within the set, freshness halves every 14 days, combined 50/30/20', () => {
  const r = Object.fromEntries(rankVideos([OLD, MID, NEW]).map((x) => [x.id, x]));
  assert.deepEqual([r.OLD.trendingScore, r.MID.trendingScore, r.NEW.trendingScore], [100, 50, 0]);
  // interactions percentile OLD 1, MID .5, NEW 0 · ratio percentile NEW 1, OLD .5, MID 0
  assert.deepEqual([r.OLD.engagementScore, r.MID.engagementScore, r.NEW.engagementScore], [75, 25, 50]);
  assert.equal(rankVideos([v('x', 10, 14, 1)])[0].freshnessScore, 50);
  assert.equal(rankVideos([v('x', 10, 0, 1)])[0].freshnessScore, 100);
  assert.equal(r.MID.score, Math.round((0.5 * 50 + 0.3 * 25 + 0.2 * r.MID.freshnessScore) * 10) / 10);
  assert.deepEqual(rankVideos([OLD, MID, NEW]).map((x) => x.rank), [1, 2, 3]);
});

test('unknown date: no trending or freshness, ranked last on every sort; ties keep the priority order', () => {
  const noDate = v('ND', 50_000, null, 5_000);
  for (const sort of /** @type {const} */ (['score', 'trending', 'fresh', 'hot'])) assert.equal(rankVideos([noDate, NEW, MID], { sort }).at(-1).id, 'ND', sort);
  const [nd] = rankVideos([noDate]);
  assert.deepEqual([nd.playsPerDay, nd.trendingScore, nd.freshnessScore], [null, 0, 0]);
  // Same freshness (same age) → the one trending harder wins.
  const a = v('a', 1000, 3, 10);
  const b = v('b', 9000, 3, 10);
  assert.equal(ids(rankVideos([a, b], { sort: 'fresh' })), 'b a');
  assert.deepEqual(rankVideos([]), []);
});

test('registry explains every new score', () => {
  for (const id of ['playsPerDay', 'trendingScore', 'engagementScore', 'freshnessScore', 'tiktokScore']) assert.ok(METRICS[id]?.formula, id);
});
