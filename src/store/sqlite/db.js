// Opens the SQLite database and brings its schema up to date with numbered migrations.
// Rules (docs/ARCHITECTURE.md §5.1): never edit a released migration; add a new file instead.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const KEEP_BACKUPS = 5;

/** @param {string} [dir] @returns {{version: number, name: string, sql: string}[]} */
export function listMigrations(dir = DEFAULT_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: Number(f.slice(0, 3)), name: f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

/**
 * @param {{dataDir: string, file?: string, migrationsDir?: string, now?: () => number}} o
 * @returns {DatabaseSync}
 */
export function openDatabase({ dataDir, file = 'research.db', migrationsDir = DEFAULT_DIR, now = Date.now }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, file);
  const existed = fs.existsSync(dbPath);
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const current = /** @type {any} */ (db.prepare('PRAGMA user_version').get()).user_version;
  const pending = listMigrations(migrationsDir).filter((m) => m.version > current);
  if (!pending.length) return db;
  const hasData = existed && db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='records'").get();
  if (hasData) backup(db, dataDir, current, now);
  for (const m of pending) {
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.exec(`PRAGMA user_version = ${m.version}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      db.close();
      throw new Error(`Migration ${m.name} failed: ${e.message}`);
    }
  }
  return db;
}

/** Copy the DB before migrating it; keep the newest KEEP_BACKUPS copies. */
function backup(db, dataDir, version, now) {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date(now()).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const target = path.join(dir, `research-v${version}-${stamp}.db`);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) fs.rmSync(path.join(dir, f));
}
