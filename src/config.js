// The only module that reads process.env. Everything else receives config values.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDITIONS = ['dev', 'desktop', 'server'];

/**
 * @param {Record<string, string|undefined>} [env]
 * @returns {{dataDir: string, port: number, host: string, edition: 'dev'|'desktop'|'server', logLevel: string}}
 */
export function loadConfig(env = process.env) {
  const edition = /** @type {any} */ (env.YTR_EDITION || 'dev');
  if (!EDITIONS.includes(edition)) throw new Error(`Unknown edition "${edition}" (dev|desktop|server)`);
  return {
    edition,
    dataDir: env.YTR_DATA_DIR || path.join(ROOT, 'data'),
    port: env.PORT != null && env.PORT !== '' ? Number(env.PORT) : 5178,
    host: env.HOST || '127.0.0.1',
    logLevel: env.LOG_LEVEL || 'info',
  };
}
