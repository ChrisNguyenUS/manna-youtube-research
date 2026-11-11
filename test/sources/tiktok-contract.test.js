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
const fetch = async (u) => ({ ok: true, status: 200, url: u, json: async () => (u.includes('/reply/') ? fx('reply-page') : { ...fx('comment-page'), has_more: 0 }) });

runTikTokContract('fake', () => createFakeTikTok());
runTikTokContract('tiktok adapter (fixtures)', () => createTikTokSource({ fetch, loadPlaywright: pw, hasPlaywright: () => true, sleep: async () => {} }));
