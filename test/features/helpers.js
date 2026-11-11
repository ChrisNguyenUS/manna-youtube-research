import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/app.js';
import { createFakeSource } from '../../src/sources/fake/index.js';
import { createFakeTikTok } from '../../src/sources/fake/tiktok.js';

/** App wired to fake YouTube + TikTok sources and a throwaway database. */
export function testApp(source = createFakeSource(), tiktok = createFakeTikTok()) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-'));
  return createApp({ config: { dataDir, port: 0, host: '127.0.0.1', edition: 'dev', logLevel: 'error' }, source, tiktok });
}
