import { cacheRepo } from './repos/cache.js';
import { recordsRepo } from './repos/records.js';
import { savedRepo } from './repos/saved.js';
import { settingsRepo, DEFAULT_SETTINGS } from './repos/settings.js';
import { jobsRepo } from './repos/jobs.js';
import { followsRepo } from './repos/follows.js';
import { commentsRepo } from './repos/comments.js';
import { soulprintRepo } from './repos/soulprint.js';
import { bricksRepo } from './repos/bricks.js';
import { ideasRepo } from './repos/ideas.js';
import { ciRepo } from './repos/ci.js';

export { DEFAULT_SETTINGS };

/** @param {import('node:sqlite').DatabaseSync} db */
export function createSqliteStore(db) {
  const comments = commentsRepo(db);
  comments.moveEmbedded(); // once: comments of reports written before the comments table
  return { db, cache: cacheRepo(db), records: recordsRepo(db, Date.now, comments), saved: savedRepo(db), settings: settingsRepo(db), jobs: jobsRepo(db), follows: followsRepo(db), comments, soulprint: soulprintRepo(db), bricks: bricksRepo(db), ideas: ideasRepo(db), ci: ciRepo(db) };
}
/** @typedef {ReturnType<typeof createSqliteStore>} Store */
