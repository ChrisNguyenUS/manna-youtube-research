import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/app.js';
import { createFakeSource } from '../../src/sources/fake/index.js';

/** App wired to the fake source and a throwaway database. */
export function testApp(source = createFakeSource()) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-'));
  return createApp({ config: { dataDir, port: 0, host: '127.0.0.1', edition: 'dev', logLevel: 'error' }, source });
}
