import { cacheRepo } from './repos/cache.js';
import { recordsRepo } from './repos/records.js';
import { savedRepo } from './repos/saved.js';
import { settingsRepo, DEFAULT_SETTINGS } from './repos/settings.js';
import { jobsRepo } from './repos/jobs.js';

export { DEFAULT_SETTINGS };

/** @param {import('node:sqlite').DatabaseSync} db */
export function createSqliteStore(db) {
  return { db, cache: cacheRepo(db), records: recordsRepo(db), saved: savedRepo(db), settings: settingsRepo(db), jobs: jobsRepo(db) };
}
/** @typedef {ReturnType<typeof createSqliteStore>} Store */
