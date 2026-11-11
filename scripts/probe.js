// Live check that YouTube still answers in the shapes our parsers expect (docs/ARCHITECTURE.md §8).
// Not part of `npm test` (needs network). Exit code 1 = something changed: fix sources/innertube.
import { createInnertubeSource } from '../src/sources/innertube/index.js';
import { createTikTokSource } from '../src/sources/tiktok/index.js';

const src = createInnertubeSource({ gl: 'US', concurrency: 2, delayMs: 300 });
const tt = createTikTokSource();
const checks = [
  ['tiktok-comments', async () => (await tt.getComments('7376610463154572560', { max: 5, replies: false })).comments.length > 0],
  ['tiktok-search', async () => (tt.capabilities().searchReady ? (await tt.searchVideos('quốc tịch mỹ', { max: 5 })).length > 0 : (console.log('  (bỏ qua: chưa cài Playwright)'), true))],
  ['search', async () => (await src.searchVideos('storytelling', { max: 5, upload: 'year' })).every((v) => v.id && v.views != null && v.durationSec != null)],
  ['channel', async () => { const c = await src.getChannel(await src.resolveChannelId('@BlackJournals'), { about: true }); return c.subs > 0 && !!c.joined; }],
  ['channelVideos', async () => (await src.getChannelVideos('UCWCreFX8bTVLJ6Y9lh6eZ5A', { max: 30 })).length >= 20],
  ['video', async () => !!(await src.getVideo('NcZSPhEvIjk')).publishedAt],
  ['comments', async () => (await src.getComments('NcZSPhEvIjk', { max: 5 })).comments.length > 0],
  ['suggest', async () => (await src.suggest('kể chuyện', { gl: 'VN', hl: 'vi' })).length > 0],
];
let failed = 0;
for (const [name, fn] of checks) {
  let ok = false;
  try {
    ok = await fn();
  } catch (e) {
    console.error(name, e.message);
  }
  console.log(`${ok ? '✔' : '✖'} ${name}`);
  if (!ok) failed++;
}
await tt.close();
process.exit(failed ? 1 : 0);
