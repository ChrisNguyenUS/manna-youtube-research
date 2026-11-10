// Transitional compatibility layer: the v0 API (no workspace argument) on top of the new store.
// Removed in Task 10 once features receive the store through deps.
import { loadConfig, ROOT } from './config.js';
import { openDatabase } from './store/sqlite/db.js';
import { createSqliteStore, DEFAULT_SETTINGS } from './store/sqlite/index.js';

export { ROOT, DEFAULT_SETTINGS };
export const store = createSqliteStore(openDatabase({ dataDir: loadConfig().dataDir }));
export const db = store.db;
export const cache = store.cache;

const WS = 'local';
export const records = {
  /** @param {string} kind @param {string} title @param {any} [o] */
  add: (kind, title, o) => store.records.add(WS, kind, title, o),
  get: (id) => store.records.get(WS, id),
  update: (id, data) => store.records.update(WS, id, data),
  /** @param {string|null} [kind] @param {number} [limit] */
  list: (kind, limit) => store.records.list(WS, kind, limit),
  remove: (id) => store.records.remove(WS, id),
  latestByRef: (kind, ref) => store.records.latestByRef(WS, kind, ref),
  counts: () => store.records.counts(WS),
};
export const saved = {
  /** @param {string} [kind] */
  list: (kind) => store.saved.list(WS, kind),
  /** @param {string} kind @param {string} ref @param {string} title @param {any} data @param {string} [note] */
  put: (kind, ref, title, data, note) => store.saved.put(WS, kind, ref, title, data, note),
  note: (kind, ref, note) => store.saved.note(WS, kind, ref, note),
  remove: (kind, ref) => store.saved.remove(WS, kind, ref),
  keys: () => store.saved.keys(WS),
};
export const settingsStore = {
  all: () => store.settings.all(WS),
  /** @param {Record<string, any>} o */
  set: (o) => store.settings.set(WS, o),
};
