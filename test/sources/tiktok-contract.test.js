import fs from 'node:fs';
import { runTikTokContract } from './tiktok-contract.js';
import { createFakeTikTok } from '../../src/sources/fake/tiktok.js';
import { createTikTokSource } from '../../src/sources/tiktok/index.js';

const fx = (n) => JSON.parse(fs.readFileSync(`src/sources/tiktok/fixtures/${n}.json`, 'utf8'));
const pw = async () => ({
  chromium: { launch: async () => ({
    newContext: async () => ({ newPage: async () => ({ goto: async () => {}, waitForLoadState: async () => {}, evaluate: async () => ({ status: 200, body: { ...fx('search-page'), has_more: 0 } }) }), close: async () => {} }),
    close: async () => {},
  }) },
});
const text = (n) => fs.readFileSync(`src/sources/tiktok/fixtures/${n}`, 'utf8');
const fetch = async (u) => {
  if (u.includes('/video/')) return { ok: true, status: 200, url: u, text: async () => text('video-page.html'), json: async () => null };
  if (u.endsWith('.vtt')) return { ok: true, status: 200, url: u, text: async () => text('subtitle.vtt'), json: async () => null };
  return { ok: true, status: 200, url: u, text: async () => '', json: async () => (u.includes('/reply/') ? fx('reply-page') : { ...fx('comment-page'), has_more: 0 }) };
};

runTikTokContract('fake', () => createFakeTikTok(), { videoLink: 'https://www.tiktok.com/@creator/video/7000000000000000001' });
runTikTokContract('tiktok adapter (fixtures)', () => createTikTokSource({ fetch, loadPlaywright: pw, hasPlaywright: () => true, sleep: async () => {} }), { videoLink: 'https://www.tiktok.com/@creator1/video/7662369308550401287' });
