# Giai đoạn 0 — Tái cấu trúc kiến trúc · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chuyển `~/youtube-research` từ v0 (services.js gom mọi thứ, DB không migration, job trong RAM) sang kiến trúc ports & adapters trong `docs/ARCHITECTURE.md` **mà không đổi hành vi người dùng thấy**.

**Architecture:** Lõi thuần (`src/core`) ← use case (`src/features`, nhận deps qua tham số) ← lối vào (`src/http`, `src/cli`). Adapter (`src/sources/innertube`, `src/store/sqlite`) hiện thực port (`src/ports`). `src/app.js` là composition root duy nhất. DB có migration đánh số, record có `schema_version`, job lưu SQLite.

**Tech Stack:** Node ≥ 22.13 (`node:sqlite`, `node:test`, `fetch`), JavaScript + JSDoc, `typescript` (devDependency, chỉ `tsc --noEmit --checkJs`), frontend JS thuần.

**Spec:** [docs/ARCHITECTURE.md](../ARCHITECTURE.md) (nguồn chính) · [docs/youtube-research-prd.md](../youtube-research-prd.md) · [docs/jobs-and-scraping-L4.md](../jobs-and-scraping-L4.md)

## Global Constraints

- Node ≥ 22.13; **không thêm dependency runtime**. Chỉ devDependency được phép: `typescript`.
- Server chỉ nghe `127.0.0.1`; cổng dev 5178.
- Giao diện tiếng Việt; không đổi chữ, bố cục, màu sắc trong giai đoạn này.
- **Không đổi hành vi**: mọi màn, CLI (`research | channel | comments | ideas`), định dạng Markdown digest và CSV giữ nguyên đầu ra (trừ đổi tên cột "Vượt kênh" đã có từ trước).
- Chính sách request YouTube giữ nguyên: 4 song song, nghỉ ~200 ms, 4 lần thử với backoff `attempt² × 1,5 s`.
- `workspace_id` mặc định `'local'`.
- Không sửa file migration đã commit; đổi schema = file mới.
- Sau mỗi task: `npm test` xanh, app mở được bằng `npm start`.
- Commit message kết thúc bằng dòng `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **DB thật của người dùng (v0, đã có record) nâng cấp không mất dữ liệu** → test migrate một bản sao DB v0 mẫu có record (Task 3).
2. **Bộ lọc đã lưu trong localStorage còn dùng khoá cũ `outlier` / sort `outlier`** → giao diện vẫn lọc đúng sau khi đổi tên thành `viewSub` (Task 6).
3. **Tắt app giữa lúc job đang chạy** → mở lại thấy job "Bị gián đoạn", không treo "Đang chạy" mãi (Task 9).
4. **Bấm "Tìm" hai lần / hai tab cùng tham số** → chỉ một job chạy, cả hai theo dõi cùng job (Task 9).
5. **Launcher `/Applications/YouTube Research.app` và skill CLI sau khi đổi entry point** → vẫn bật được server và chạy CLI (Task 12).

---

## Bản đồ file

| File | Trách nhiệm | Task |
|---|---|---|
| `jsconfig.json`, `test/arch.test.js` | Typecheck + luật import | 1 |
| `src/config.js` | Nơi duy nhất đọc env: dataDir, port, host, edition | 2 |
| `src/store/sqlite/db.js`, `migrations/*.sql` | Mở DB, backup, chạy migration | 3, 4 |
| `src/store/sqlite/repos/*.js` | cache, records, saved, settings, jobs | 4 |
| `src/store/upgrades/*.js` | Nâng cấp record cũ | 5 |
| `src/core/**` | Thuần: metrics, analysis, report, registry chỉ số | 6, 7 |
| `src/ports/*.js` | Hợp đồng JSDoc | 8 |
| `src/sources/innertube/**`, `src/sources/fake/**` | Adapter + fixture | 8 |
| `src/features/*.js` | Use case tách từ services.js | 10 |
| `src/jobs/runner.js`, `src/jobs/registry.js` | Job lưu DB | 9 |
| `src/http/**` | Router khai báo, validate, routes | 11 |
| `src/app.js`, `src/main.js`, `src/cli/index.js` | Composition root, entry | 10, 12 |
| `web/**` (đổi tên từ `public/`) | api client, unmount, component tách file | 13 |

---

### Task 1: Typecheck + kiểm tra luật import

**Files:**
- Create: `jsconfig.json`, `test/arch.test.js`
- Modify: `package.json` (scripts, devDependencies)

**Interfaces:**
- Produces: `npm test` = `npm run typecheck && node --test test/`; luật layer trong `test/arch.test.js` (bảng `RULES`) mà mọi task sau phải giữ.

- [ ] **Step 1: Cài typescript (dev) và thêm jsconfig**

```bash
cd ~/youtube-research && npm i -D typescript@5.6.3
```

`jsconfig.json`:
```json
{
  "compilerOptions": {
    "checkJs": true, "allowJs": true, "noEmit": true, "strict": false,
    "module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2023",
    "types": ["node"], "skipLibCheck": true
  },
  "include": ["src/**/*.js", "test/**/*.js"]
}
```

```bash
npm i -D @types/node@22.9.0
```

- [ ] **Step 2: Viết test luật import (fail trước khi có thư mục mới là bình thường — test chỉ kiểm thư mục tồn tại)**

`test/arch.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('src');
// layer → prefixes it may NOT import (relative to src/)
const RULES = {
  'core/': ['ports/', 'sources/', 'store/', 'features/', 'http/', 'jobs/', 'cli/', 'app.js', 'config.js'],
  'ports/': ['sources/', 'store/', 'features/', 'http/', 'jobs/'],
  'features/': ['sources/', 'store/', 'http/', 'cli/', 'app.js'],
  'sources/': ['features/', 'http/', 'store/', 'jobs/'],
  'store/': ['features/', 'http/', 'sources/', 'jobs/'],
  'http/': ['sources/', 'store/'],
  'cli/': ['sources/', 'store/'],
};
const IO_MODULES = ['node:fs', 'node:http', 'node:sqlite', 'node:child_process', 'node:net'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []);
}
function importsOf(file) {
  const src = fs.readFileSync(file, 'utf8');
  return [...src.matchAll(/^\s*import[^'"]*['"]([^'"]+)['"]/gm), ...src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
}

test('layers only import inward', () => {
  const problems = [];
  for (const file of walk(SRC)) {
    const rel = path.relative(SRC, file).split(path.sep).join('/');
    const layer = Object.keys(RULES).find((l) => rel.startsWith(l));
    if (!layer) continue;
    for (const spec of importsOf(file)) {
      if (layer === 'core/' && IO_MODULES.includes(spec)) problems.push(`${rel} imports ${spec} (core must be pure)`);
      if (!spec.startsWith('.')) continue;
      const target = path.relative(SRC, path.resolve(path.dirname(file), spec)).split(path.sep).join('/');
      if (RULES[layer].some((p) => target === p || target.startsWith(p))) problems.push(`${rel} → ${target}`);
    }
  }
  assert.deepEqual(problems, []);
});
```

- [ ] **Step 3: Cập nhật scripts**

`package.json` → `"scripts"`:
```json
"typecheck": "tsc -p jsconfig.json",
"test": "npm run typecheck && node --disable-warning=ExperimentalWarning --test test/*.test.js"
```

- [ ] **Step 4: Chạy, sửa lỗi typecheck có sẵn bằng JSDoc tối thiểu**

Run: `npm test`
Expected: typecheck có thể báo lỗi ở code v0. Với mỗi lỗi: thêm `/** @type {any} */` hoặc JSDoc `@param` đúng kiểu; **không** đổi logic. Lặp tới khi PASS (arch test PASS vì chưa có thư mục layer nào).

- [ ] **Step 5: Commit**

```bash
git add jsconfig.json test/arch.test.js package.json package-lock.json src
git commit -m "chore: add JSDoc typecheck and layer import rules"
```

---

### Task 2: `src/config.js` — nơi duy nhất đọc env

**Files:**
- Create: `src/config.js`, `test/config.test.js`
- Modify: `src/db.js:6-10`, `src/server.js` (PORT/HOST)

**Interfaces:**
- Produces: `loadConfig(env = process.env, platform = process.platform) → { dataDir: string, port: number, host: string, edition: 'dev'|'desktop'|'server', logLevel: string }`

- [ ] **Step 1: Test**

`test/config.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadConfig } from '../src/config.js';

test('dev defaults', () => {
  const c = loadConfig({});
  assert.equal(c.edition, 'dev');
  assert.equal(c.port, 5178);
  assert.equal(c.host, '127.0.0.1');
  assert.ok(c.dataDir.endsWith(path.join('youtube-research', 'data')));
});
test('env overrides and legacy YTR_DATA_DIR', () => {
  const c = loadConfig({ YTR_DATA_DIR: '/tmp/x', PORT: '0', YTR_EDITION: 'desktop' });
  assert.equal(c.dataDir, '/tmp/x');
  assert.equal(c.port, 0);
  assert.equal(c.edition, 'desktop');
});
test('rejects unknown edition', () => {
  assert.throws(() => loadConfig({ YTR_EDITION: 'cloud' }), /edition/);
});
```

- [ ] **Step 2: Run → FAIL** (`Cannot find module '../src/config.js'`)

Run: `node --test test/config.test.js`

- [ ] **Step 3: Implement**

`src/config.js`:
```js
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDITIONS = ['dev', 'desktop', 'server'];

/** @returns {{dataDir: string, port: number, host: string, edition: 'dev'|'desktop'|'server', logLevel: string}} */
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
```

- [ ] **Step 4: Dùng config ở db.js và server.js** — thay `const DATA_DIR = process.env.YTR_DATA_DIR || …` bằng `const DATA_DIR = loadConfig().dataDir;` và `ROOT` import từ `./config.js`; trong server thay `PORT`/`HOST` bằng `loadConfig().port/host`. Giữ `export { ROOT }` từ db.js (re-export) để cli.js chưa phải sửa.

- [ ] **Step 5: Run** `npm test` → PASS; `npm start` → mở http://localhost:5178 thấy Tổng quan.

- [ ] **Step 6: Commit** `git commit -am "refactor: centralize configuration in src/config.js"` (thêm file mới bằng `git add src/config.js test/config.test.js` trước).

---

### Task 3: Migration runner + 001 (schema v0) + backup

**Files:**
- Create: `src/store/sqlite/db.js`, `src/store/sqlite/migrations/001_init.sql`, `test/store/migrate.test.js`, `test/fixtures/v0-schema.sql`
- Modify: `src/db.js` (dùng `openDatabase` thay `new DatabaseSync` + `db.exec(CREATE…)`)

**Interfaces:**
- Produces: `openDatabase({ dataDir, file = 'research.db', migrationsDir?, now? }) → DatabaseSync` (đã migrate tới mới nhất); `listMigrations(dir) → {version:number, name:string, sql:string}[]`

- [ ] **Step 1: Fixture schema v0** — copy nguyên khối `CREATE TABLE … settings` hiện có ở `src/db.js:11-37` (không gồm `PRAGMA journal_mode`) vào `test/fixtures/v0-schema.sql`.

- [ ] **Step 2: Test**

`test/store/migrate.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../src/store/sqlite/db.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-'));

test('fresh DB migrates to latest', () => {
  const dir = tmp();
  const db = openDatabase({ dataDir: dir });
  assert.ok(db.prepare('PRAGMA user_version').get().user_version >= 1);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='records'").get());
});

test('existing v0 DB keeps its records and gets a backup', () => {
  const dir = tmp();
  const v0 = new DatabaseSync(path.join(dir, 'research.db'));
  v0.exec(fs.readFileSync('test/fixtures/v0-schema.sql', 'utf8'));
  v0.prepare("INSERT INTO records (kind,title,params,data,created_at) VALUES ('video_search','kể chuyện','{}','{\"videos\":[]}',1)").run();
  v0.close();
  const db = openDatabase({ dataDir: dir });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM records').get().n, 1);
  const backups = fs.readdirSync(path.join(dir, 'backups'));
  assert.equal(backups.length, 1);
});

test('running twice is a no-op', () => {
  const dir = tmp();
  openDatabase({ dataDir: dir }).close();
  const db = openDatabase({ dataDir: dir });
  assert.equal(fs.existsSync(path.join(dir, 'backups')) ? fs.readdirSync(path.join(dir, 'backups')).length : 0, 0);
  db.close();
});
```

- [ ] **Step 3: Run → FAIL** (module not found)

Run: `node --test test/store/migrate.test.js`

- [ ] **Step 4: `001_init.sql`** = nội dung `test/fixtures/v0-schema.sql` (giữ `IF NOT EXISTS` để DB v0 không lỗi).

- [ ] **Step 5: Implement `src/store/sqlite/db.js`**

```js
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const KEEP_BACKUPS = 5;

/** @param {string} dir */
export function listMigrations(dir = DEFAULT_DIR) {
  return fs.readdirSync(dir).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort()
    .map((f) => ({ version: Number(f.slice(0, 3)), name: f, sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

/** @param {{dataDir: string, file?: string, migrationsDir?: string, now?: () => number}} o */
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
      throw new Error(`Migration ${m.name} failed: ${e.message}`);
    }
  }
  return db;
}

function backup(db, dataDir, version, now) {
  const dir = path.join(dataDir, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date(now()).toISOString().slice(0, 19).replace(/[:T]/g, '-');
  db.exec(`VACUUM INTO '${path.join(dir, `research-v${version}-${stamp}.db`).replace(/'/g, "''")}'`);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_BACKUPS))) fs.rmSync(path.join(dir, f));
}
```

- [ ] **Step 6: Nối vào `src/db.js`** — xoá khối `db.exec(\`PRAGMA… CREATE…\`)`, thay bằng `export const db = openDatabase({ dataDir: DATA_DIR });`.

- [ ] **Step 7: Run** `npm test` → PASS. Kiểm tra DB thật: `npm start`, mở báo cáo cũ ở Nghiên cứu chủ đề → vẫn hiện; `ls data/backups` có 1 file.

- [ ] **Step 8: Commit** `git add src/store test/store test/fixtures src/db.js && git commit -m "feat(store): numbered SQLite migrations with automatic backup"`

---

### Task 4: Migration 002 + repo theo workspace + bảng jobs/request_log

**Files:**
- Create: `src/store/sqlite/migrations/002_workspace_jobs.sql`, `src/store/sqlite/repos/{cache,records,saved,settings,jobs}.js`, `src/store/sqlite/index.js`, `test/store/repos.test.js`
- Modify: `src/db.js` (thành lớp re-export mỏng gọi repo với `'local'`)

**Interfaces:**
- Consumes: `openDatabase` (Task 3)
- Produces: `createSqliteStore(db) → { cache, records, saved, settings, jobs }` với:
  - `records.add(ws, kind, title, {ref, params, data, schemaVersion, jobId}) → id`, `records.get(ws, id)`, `records.list(ws, kind?, limit?)`, `records.update(ws, id, data, schemaVersion)`, `records.remove(ws, id)`, `records.latestByRef(ws, kind, ref)`, `records.counts(ws)`
  - `saved.list(ws, kind?)`, `saved.put(ws, kind, ref, title, data, note?)`, `saved.note(ws, kind, ref, note)`, `saved.remove(ws, kind, ref)`, `saved.keys(ws)`
  - `settings.all(ws)`, `settings.set(ws, obj)` (+ `DEFAULT_SETTINGS`)
  - `cache.*` giữ chữ ký v0 (dữ liệu công khai, không workspace)
  - `jobs.insert(job)`, `jobs.findActiveByKey(key)`, `jobs.update(id, patch)`, `jobs.get(id)`, `jobs.list(ws, limit)`, `jobs.markInterrupted()`

- [ ] **Step 1: Migration**

`002_workspace_jobs.sql`:
```sql
ALTER TABLE records ADD COLUMN workspace_id TEXT NOT NULL DEFAULT 'local';
ALTER TABLE records ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE records ADD COLUMN job_id INTEGER;
CREATE INDEX IF NOT EXISTS records_ws_kind ON records(workspace_id, kind, created_at DESC);

CREATE TABLE saved_v2 (
  workspace_id TEXT NOT NULL DEFAULT 'local', kind TEXT NOT NULL, ref TEXT NOT NULL,
  title TEXT, note TEXT, data TEXT, created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, kind, ref)
);
INSERT INTO saved_v2 (kind, ref, title, note, data, created_at) SELECT kind, ref, title, note, data, created_at FROM saved;
DROP TABLE saved;
ALTER TABLE saved_v2 RENAME TO saved;

CREATE TABLE settings_v2 (workspace_id TEXT NOT NULL DEFAULT 'local', key TEXT NOT NULL, value TEXT, PRIMARY KEY (workspace_id, key));
INSERT INTO settings_v2 (key, value) SELECT key, value FROM settings;
DROP TABLE settings;
ALTER TABLE settings_v2 RENAME TO settings;

CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL DEFAULT 'local',
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','cancelled','interrupted')),
  params TEXT NOT NULL,
  progress TEXT,
  idempotency_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  record_id INTEGER,
  result TEXT,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, started_at INTEGER, finished_at INTEGER
);
CREATE UNIQUE INDEX jobs_active_key ON jobs(idempotency_key) WHERE status IN ('queued','running');
CREATE INDEX jobs_ws_created ON jobs(workspace_id, created_at DESC);

CREATE TABLE request_log (endpoint TEXT NOT NULL, status INTEGER, ms INTEGER, at INTEGER NOT NULL);
CREATE INDEX request_log_at ON request_log(at);
```

- [ ] **Step 2: Test repos**

`test/store/repos.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/store/sqlite/db.js';
import { createSqliteStore } from '../../src/store/sqlite/index.js';

const store = () => createSqliteStore(openDatabase({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-')) }));

test('records are scoped by workspace', () => {
  const s = store();
  const id = s.records.add('local', 'video_search', 'a', { params: {}, data: { videos: [] }, schemaVersion: 2 });
  assert.equal(s.records.get('local', id).schema_version, 2);
  assert.equal(s.records.get('other', id), undefined);
  assert.equal(s.records.list('other').length, 0);
});

test('saved and settings keep v0 behaviour under workspace local', () => {
  const s = store();
  s.saved.put('local', 'channel', 'UC1', 'Kênh', { id: 'UC1' });
  assert.deepEqual(s.saved.keys('local'), ['channel:UC1']);
  s.settings.set('local', { gl: 'VN' });
  assert.equal(s.settings.all('local').gl, 'VN');
  assert.equal(s.settings.all('local').concurrency, 4, 'defaults still applied');
});

test('only one active job per idempotency key', () => {
  const s = store();
  const base = { workspace_id: 'local', kind: 'video_search', title: 't', params: '{}', idempotency_key: 'k', created_at: 1 };
  s.jobs.insert({ ...base, status: 'running' });
  assert.throws(() => s.jobs.insert({ ...base, status: 'queued' }), /UNIQUE/);
  s.jobs.update(s.jobs.findActiveByKey('k').id, { status: 'succeeded' });
  assert.doesNotThrow(() => s.jobs.insert({ ...base, status: 'queued' }));
});

test('markInterrupted flips running jobs', () => {
  const s = store();
  const id = s.jobs.insert({ workspace_id: 'local', kind: 'research', title: 't', params: '{}', idempotency_key: 'x', created_at: 1, status: 'running' });
  s.jobs.markInterrupted();
  assert.equal(s.jobs.get(id).status, 'interrupted');
});
```

- [ ] **Step 3: Run → FAIL**

- [ ] **Step 4: Implement repos** — chuyển nguyên logic `cache`, `records`, `saved`, `settingsStore` từ `src/db.js` vào từng file repo, thêm tham số `ws` đầu tiên và `WHERE workspace_id = ?`. Ví dụ `records.js`:

```js
/** @param {import('node:sqlite').DatabaseSync} db */
export function recordsRepo(db) {
  const parse = (r) => r && { ...r, params: JSON.parse(r.params), data: r.data != null ? JSON.parse(r.data) : null };
  return {
    add(ws, kind, title, { ref = null, params = null, data = null, schemaVersion = 1, jobId = null } = {}) {
      const r = db.prepare('INSERT INTO records (workspace_id, kind, title, ref, params, data, schema_version, job_id, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(ws, kind, title, ref, JSON.stringify(params), JSON.stringify(data), schemaVersion, jobId, Date.now());
      return Number(r.lastInsertRowid);
    },
    get: (ws, id) => parse(db.prepare('SELECT * FROM records WHERE workspace_id = ? AND id = ?').get(ws, id)),
    update(ws, id, data, schemaVersion) {
      db.prepare('UPDATE records SET data = ?, schema_version = COALESCE(?, schema_version) WHERE workspace_id = ? AND id = ?').run(JSON.stringify(data), schemaVersion ?? null, ws, id);
    },
    list(ws, kind = null, limit = 50) {
      const rows = kind
        ? db.prepare('SELECT id, kind, title, ref, params, created_at FROM records WHERE workspace_id = ? AND kind = ? ORDER BY created_at DESC LIMIT ?').all(ws, kind, limit)
        : db.prepare('SELECT id, kind, title, ref, params, created_at FROM records WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(ws, limit);
      return rows.map((r) => ({ ...r, params: JSON.parse(/** @type {string} */ (r.params)) }));
    },
    remove: (ws, id) => void db.prepare('DELETE FROM records WHERE workspace_id = ? AND id = ?').run(ws, id),
    latestByRef: (ws, kind, ref) => parse(db.prepare('SELECT * FROM records WHERE workspace_id = ? AND kind = ? AND ref = ? ORDER BY created_at DESC LIMIT 1').get(ws, kind, ref)),
    counts: (ws) => Object.fromEntries(db.prepare('SELECT kind, COUNT(*) n FROM records WHERE workspace_id = ? GROUP BY kind').all(ws).map((r) => [r.kind, r.n])),
  };
}
```

`jobs.js`:
```js
export function jobsRepo(db) {
  const parse = (r) => r && { ...r, params: JSON.parse(r.params), progress: r.progress ? JSON.parse(r.progress) : null, result: r.result ? JSON.parse(r.result) : null };
  return {
    insert(j) {
      const r = db.prepare(`INSERT INTO jobs (workspace_id, kind, title, status, params, idempotency_key, created_at) VALUES (?,?,?,?,?,?,?)`)
        .run(j.workspace_id, j.kind, j.title, j.status, j.params, j.idempotency_key, j.created_at);
      return Number(r.lastInsertRowid);
    },
    findActiveByKey: (key) => parse(db.prepare("SELECT * FROM jobs WHERE idempotency_key = ? AND status IN ('queued','running')").get(key)),
    get: (id) => parse(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id)),
    update(id, patch) {
      const cols = Object.keys(patch);
      const vals = cols.map((c) => (patch[c] !== null && typeof patch[c] === 'object' ? JSON.stringify(patch[c]) : patch[c]));
      db.prepare(`UPDATE jobs SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...vals, id);
    },
    list: (ws, limit = 20) => db.prepare('SELECT * FROM jobs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?').all(ws, limit).map(parse),
    nextQueued: () => parse(db.prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1").get()),
    markInterrupted: () => void db.prepare("UPDATE jobs SET status = 'interrupted', finished_at = ? WHERE status = 'running'").run(Date.now()),
  };
}
```

`index.js`:
```js
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
```

- [ ] **Step 5: `src/db.js` thành lớp tương thích tạm** (để services/server v0 chưa phải sửa):

```js
import { loadConfig, ROOT } from './config.js';
import { openDatabase } from './store/sqlite/db.js';
import { createSqliteStore, DEFAULT_SETTINGS } from './store/sqlite/index.js';
export { ROOT, DEFAULT_SETTINGS };
export const store = createSqliteStore(openDatabase({ dataDir: loadConfig().dataDir }));
export const db = store.db;
export const cache = store.cache;
const WS = 'local';
export const records = {
  add: (kind, title, o) => store.records.add(WS, kind, title, o),
  get: (id) => store.records.get(WS, id),
  update: (id, data) => store.records.update(WS, id, data),
  list: (kind, limit) => store.records.list(WS, kind, limit),
  remove: (id) => store.records.remove(WS, id),
  latestByRef: (kind, ref) => store.records.latestByRef(WS, kind, ref),
  counts: () => store.records.counts(WS),
};
export const saved = { list: (k) => store.saved.list(WS, k), put: (...a) => store.saved.put(WS, ...a), note: (...a) => store.saved.note(WS, ...a), remove: (...a) => store.saved.remove(WS, ...a), keys: () => store.saved.keys(WS) };
export const settingsStore = { all: () => store.settings.all(WS), set: (o) => store.settings.set(WS, o) };
```

- [ ] **Step 6: Run** `npm test` → PASS; `npm start` → Đã lưu, Cài đặt, mở báo cáo cũ đều như trước.

- [ ] **Step 7: Commit** `git add -A src/store src/db.js test/store && git commit -m "feat(store): workspace-scoped repos, jobs and request_log tables"`

---

### Task 5: Nâng cấp record theo phiên bản (bỏ vá ở giao diện)

**Files:**
- Create: `src/store/upgrades/index.js`, `src/store/upgrades/video_search.js`, `src/store/upgrades/research.js`, `test/store/upgrades.test.js`
- Modify: `src/store/sqlite/repos/records.js` (`get` gọi `upgradeRecord`), `public/components.js` (xoá khối "Records saved before VPH existed")

**Interfaces:**
- Consumes: `recordsRepo` (Task 4)
- Produces: `upgradeRecord(kind: string, version: number, data: any) → { data: any, version: number }`; `LATEST: Record<string, number>`; repo `records.get()` trả thêm `schema_version` = mới nhất.

- [ ] **Step 1: Test**

`test/store/upgrades.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upgradeRecord, LATEST } from '../../src/store/upgrades/index.js';

test('video_search v1 gets vph and viewSub', () => {
  const v1 = { videos: [{ id: 'a', views: 2400, age: 10, outlier: 3 }], summary: { outliers: 1 } };
  const { data, version } = upgradeRecord('video_search', 1, v1);
  assert.equal(version, LATEST.video_search);
  assert.equal(data.videos[0].vph, 10);
  assert.equal(data.videos[0].viewSub, 3);
  assert.equal('outlier' in data.videos[0], false);
});
test('unknown kind passes through', () => {
  assert.deepEqual(upgradeRecord('keywords', 1, { x: 1 }), { data: { x: 1 }, version: 1 });
});
test('already latest is untouched', () => {
  const d = { videos: [] };
  assert.equal(upgradeRecord('video_search', LATEST.video_search, d).data, d);
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement**

`src/store/upgrades/video_search.js`:
```js
const addVph = (v) => (v.vph != null || v.views == null || v.age == null ? v : { ...v, vph: Math.round((v.views / Math.max(v.age * 24, 1)) * 10) / 10 });
const renameViewSub = ({ outlier, ...v }) => ('viewSub' in v || outlier === undefined ? v : { ...v, viewSub: outlier });
export const latest = 2;
/** @type {Record<number, (d: any) => any>} */
export const steps = {
  1: (d) => ({ ...d, videos: (d.videos || []).map((v) => renameViewSub(addVph(v))) }),
};
```

`src/store/upgrades/research.js`:
```js
import { steps as vs } from './video_search.js';
export const latest = 2;
export const steps = { 1: (d) => vs[1](d) };
```

`src/store/upgrades/index.js`:
```js
import * as videoSearch from './video_search.js';
import * as research from './research.js';
const KINDS = { video_search: videoSearch, research };
/** @type {Record<string, number>} */
export const LATEST = Object.fromEntries(Object.entries(KINDS).map(([k, m]) => [k, m.latest]));
/** @param {string} kind @param {number} version @param {any} data */
export function upgradeRecord(kind, version, data) {
  const m = KINDS[kind];
  if (!m || version >= m.latest) return { data, version };
  let d = data;
  for (let v = version; v < m.latest; v++) d = m.steps[v](d);
  return { data: d, version: m.latest };
}
```

Trong `recordsRepo.get` và `latestByRef`: sau `parse`, `const up = upgradeRecord(r.kind, r.schema_version, r.data); return { ...r, data: up.data, schema_version: up.version };`. Khi `add`, nếu không truyền `schemaVersion` thì dùng `LATEST[kind] ?? 1`.

> Lưu ý: bước này đổi tên trường `outlier` → `viewSub` trong dữ liệu đọc ra. Task 6 đổi code ghi và giao diện; **Task 5 và 6 phải merge cùng nhau** (đừng release giữa chừng).

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Commit** `git commit -am "feat(store): versioned record upgrades on read"` (thêm file mới trước).

---

### Task 6: Registry chỉ số + đổi tên `outlier` → `viewSub`

**Files:**
- Create: `src/core/metrics/definitions.js`, `test/core/definitions.test.js`
- Modify: mọi nơi dùng trường `outlier` (view/sub): `src/analysis/metrics.js`, `src/analysis/score.js`, `src/analysis/report.js`, `src/services.js`, `src/server.js` (VIDEO_COLS), `public/components.js`, `public/views/research.js`, `public/views/ideas.js`, `public/views/saved.js`, `public/lib.js`; `GET /api/metrics` mới trong `src/server.js`

**Interfaces:**
- Produces: `METRICS: Record<string, {label:{vi:string,en:string}, unit:'x'|'count'|'per_hour'|'per_day'|'days', formula:string, version:number}>`; `metricLabel(id, lang='vi')`; HTTP `GET /api/metrics` → `METRICS`; frontend `loadMetrics()` / `metric(id)` trong `public/lib.js`.

- [ ] **Step 1: Test**

`test/core/definitions.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRICS, metricLabel } from '../../src/core/metrics/definitions.js';

test('every metric has vi+en label, formula and version', () => {
  for (const [id, m] of Object.entries(METRICS)) {
    assert.ok(m.label.vi && m.label.en, id);
    assert.ok(m.formula.length > 10, id);
    assert.ok(Number.isInteger(m.version), id);
  }
});
test('names do not collide', () => {
  assert.equal(metricLabel('viewSub'), 'View/sub');
  assert.equal(metricLabel('outlierScore'), 'Outlier (× kênh)');
  assert.equal(METRICS.outlier, undefined, 'ambiguous v0 name is gone');
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `definitions.js`**

```js
/** @typedef {{label: {vi: string, en: string}, unit: 'x'|'count'|'per_hour'|'per_day'|'days', formula: string, version: number}} MetricDef */
/** @type {Record<string, MetricDef>} */
export const METRICS = {
  outlierScore: { label: { vi: 'Outlier (× kênh)', en: 'Outlier (× channel)' }, unit: 'x', version: 1,
    formula: 'view ÷ trung vị view các video ≥ 7 ngày tuổi trong 30 video mới nhất của kênh; video < 7 ngày so VPH; không tính Shorts' },
  viewSub: { label: { vi: 'View/sub', en: 'Views/sub' }, unit: 'x', version: 1,
    formula: 'view ÷ số sub của kênh; bỏ kênh dưới ngưỡng sub trong Cài đặt (mặc định 500)' },
  vph: { label: { vi: 'VPH', en: 'VPH' }, unit: 'per_hour', version: 1, formula: 'view ÷ số giờ kể từ lúc đăng (tối thiểu 1 giờ)' },
  viewsPerDay: { label: { vi: 'View/ngày', en: 'Views/day' }, unit: 'per_day', version: 1, formula: 'view ÷ số ngày kể từ lúc đăng (tối thiểu 1 ngày)' },
  channelMedianViews: { label: { vi: 'View trung vị kênh', en: 'Channel median views' }, unit: 'count', version: 1, formula: 'trung vị view các video ≥ 7 ngày tuổi trong 30 video mới nhất' },
  vsMedian: { label: { vi: '× trung vị kênh', en: '× channel median' }, unit: 'x', version: 1, formula: 'view ÷ trung vị view 120 video dài gần nhất của kênh (trang Phân tích kênh)' },
};
/** @param {string} id @param {'vi'|'en'} lang */
export const metricLabel = (id, lang = 'vi') => METRICS[id]?.label[lang] ?? id;
```

- [ ] **Step 4: Đổi tên trường ở nơi ghi** — trong `addVideoMetrics` (`src/analysis/metrics.js`) đổi khoá `outlier:` → `viewSub:`; tìm-thay các tham chiếu:

```bash
grep -rn "\.outlier\b\|outlier:" src public | grep -v outlierScore
```

Đổi từng chỗ sang `viewSub` (giữ `outlierScore` nguyên). Trong `public/components.js` đổi khoá filter `outlier` → `viewSub` và sort `'outlier'` → `'viewSub'`; nhãn cột/CSV lấy từ `METRICS` (server) và `metric(id)` (web).

- [ ] **Step 5: Tương thích localStorage (Review Focus #2)** — trong `public/lib.js` `store()`:

```js
export function store(key, fallback) {
  try {
    const raw = JSON.parse(localStorage.getItem('ytr:' + key) || '{}');
    if ('outlier' in raw) { raw.viewSub = raw.outlier; delete raw.outlier; }
    if (raw.sort === 'outlier') raw.sort = 'viewSub';
    return { ...fallback, ...raw };
  } catch {
    return { ...fallback };
  }
}
```

Thêm test thủ công vào checklist: đặt `localStorage['ytr:vf-videos'] = '{"outlier":"1","sort":"outlier"}'`, mở một lần tìm cũ → chip "×1+" ở hàng View/sub đang bật, bảng xếp theo View/sub.

- [ ] **Step 6: `GET /api/metrics`** trả `METRICS`; `public/lib.js` thêm:

```js
let METRICS = {};
export async function loadMetrics() { METRICS = await api('/api/metrics'); }
export const metric = (id) => METRICS[id] || { label: { vi: id }, formula: '' };
```

`public/app.js` gọi `await loadMetrics()` cạnh `loadSaved()`. Tooltip `OUTLIER_TIP` trong `components.js` thay bằng `metric('outlierScore').formula`.

- [ ] **Step 7: Run** `npm test` → PASS; `npm start` → Tìm video cũ và mới đều có cột Outlier, View/sub, VPH; xuất CSV có cột "View/sub".

- [ ] **Step 8: Commit** `git commit -am "refactor: single metric registry; rename view/sub field to viewSub"`

---

### Task 7: Chuyển `src/analysis` → `src/core` (thuần)

**Files:**
- Move: `src/analysis/metrics.js` → `src/core/metrics/video.js` + `src/core/metrics/outlier.js` + `src/core/metrics/channel.js`; `src/analysis/text.js` → `src/core/analysis/text.js`; `src/analysis/score.js` → `src/core/analysis/keyword-score.js`; `src/analysis/report.js` → `src/core/report/markdown.js` + `src/core/report/csv.js`
- Create: `src/core/metrics/index.js` (re-export), `src/core/types.js`
- Modify: imports trong `src/services.js`, `src/server.js`, `src/cli.js`, `test/parse.test.js`

**Interfaces:**
- Produces: `src/core/metrics/index.js` export đúng tên v0: `median, sum, round, ageDays, addVideoMetrics, channelBaseline, outlierScore, DURATION_BUCKETS, durationBuckets, channelStats`; `src/core/types.js` typedef `Video`, `Channel`, `Comment`, `Baseline`.

- [ ] **Step 1: Di chuyển bằng git (giữ lịch sử)**

```bash
mkdir -p src/core/metrics src/core/analysis src/core/report
git mv src/analysis/text.js src/core/analysis/text.js
git mv src/analysis/score.js src/core/analysis/keyword-score.js
git mv src/analysis/report.js src/core/report/markdown.js
git mv src/analysis/metrics.js src/core/metrics/video.js
```

- [ ] **Step 2: Tách file** — từ `src/core/metrics/video.js` cắt `channelBaseline`, `outlierScore` sang `outlier.js`; cắt `channelStats` sang `channel.js`; cắt `toCsv` từ `markdown.js` sang `csv.js`. Mỗi file import `median/round` từ `./video.js`. Tạo:

```js
// src/core/metrics/index.js
export * from './video.js';
export * from './outlier.js';
export * from './channel.js';
```

- [ ] **Step 3: `src/core/types.js`**

```js
/**
 * @typedef {object} Video
 * @property {string} id
 * @property {string} title
 * @property {string|null} channelId
 * @property {string} channelTitle
 * @property {number|null} views
 * @property {number|null} durationSec
 * @property {string|null} published   YouTube's relative text, e.g. "3 months ago"
 * @property {number|null} ageDays     estimate from `published`
 * @property {string|null} [publishedAt] exact ISO date when known
 * @property {boolean} isLive
 * @property {string[]} [regions]
 */
/** @typedef {{id: string, title: string, handle: string|null, subs: number|null, videoCount: number|null, country: string|null, joined: string|null, totalViews: number|null, avatar: string|null, description: string}} Channel */
/** @typedef {{id: string, text: string, likes: number, replies: number, published: string|null, ageDays: number|null, isReply: boolean, hearted: boolean}} Comment */
/** @typedef {{medianViews: number|null, medianVph: number|null, sample: number}} Baseline */
export {};
```

- [ ] **Step 4: Sửa import**

```bash
grep -rln "analysis/" src test | xargs sed -i '' \
  -e "s#\./analysis/metrics\.js#./core/metrics/index.js#g" \
  -e "s#\.\./src/analysis/metrics\.js#../src/core/metrics/index.js#g" \
  -e "s#\./analysis/text\.js#./core/analysis/text.js#g" \
  -e "s#\.\./src/analysis/text\.js#../src/core/analysis/text.js#g" \
  -e "s#\./analysis/score\.js#./core/analysis/keyword-score.js#g" \
  -e "s#\.\./src/analysis/score\.js#../src/core/analysis/keyword-score.js#g" \
  -e "s#\./analysis/report\.js#./core/report/markdown.js#g"
grep -rn "analysis/" src test
```

Expected: lệnh grep cuối chỉ còn `core/analysis/…`. `toCsv` import từ `./core/report/csv.js` trong `server.js`.

- [ ] **Step 5: Run** `npm test` → PASS (arch test giờ kiểm `core/`: không file nào import ngoài core hoặc module I/O). `rmdir src/analysis`.

- [ ] **Step 6: Commit** `git add -A && git commit -m "refactor: move pure analysis code into src/core"`

---

### Task 8: Port `YouTubeSource` + adapter innertube + nguồn giả + test hợp đồng

**Files:**
- Create: `src/ports/youtube-source.js`, `src/sources/innertube/index.js`, `src/sources/fake/index.js`, `src/sources/fake/fixtures.js`, `test/sources/contract.js`, `test/sources/fake.test.js`, `test/sources/innertube.test.js`, `src/sources/innertube/fixtures/search-video.json` (rút gọn từ phản hồi thật)
- Move: `src/yt/*` → `src/sources/innertube/*` (`client.js` = `innertube.js`)

**Interfaces:**
- Produces:
```js
/** @typedef {{sort?: 'relevance'|'popularity'|'date', upload?: 'any'|'today'|'week'|'month'|'year', duration?: string, cc?: boolean, captions?: boolean, max?: number, regions?: (string|null)[]}} SearchOpts */
/** @typedef {object} YouTubeSource
 * @property {(q: string, o: SearchOpts, onPage?: (n: number) => void) => Promise<import('../core/types.js').Video[]>} searchVideos
 * @property {(q: string, o: SearchOpts, onPage?: (n: number) => void) => Promise<any[]>} searchChannels
 * @property {(input: string) => Promise<string>} resolveChannelId
 * @property {(id: string, o?: {about?: boolean}) => Promise<import('../core/types.js').Channel>} getChannel
 * @property {(id: string, o?: {max?: number, channel?: any}, onPage?: (n: number) => void) => Promise<import('../core/types.js').Video[]>} getChannelVideos
 * @property {(id: string, o?: {max?: number}) => Promise<any[]>} getChannelShorts
 * @property {(id: string, o?: {likes?: boolean}) => Promise<any>} getVideo
 * @property {(id: string, o: {max?: number, sort?: 'top'|'newest', replies?: boolean, maxRepliesPerThread?: number}, onProgress?: (n: number) => void) => Promise<{comments: import('../core/types.js').Comment[], disabled: boolean}>} getComments
 * @property {(q: string, o?: {gl?: string, hl?: string}) => Promise<string[]>} suggest
 * @property {(items: any[], fn: (x: any, i: number) => Promise<any>, onEach?: (done: number, total: number) => void) => Promise<any[]>} mapLimit
 * @property {() => {captionsFilter: boolean, ccFilter: boolean, globalSearch: boolean}} capabilities
 * @property {() => {requests: number, failures: number}} stats
 */
```
  `createInnertubeSource({ gl, concurrency, delayMs }) → YouTubeSource`; `createFakeSource(fixtures?) → YouTubeSource`; `runSourceContract(name, makeSource)` trong `test/sources/contract.js`.

- [ ] **Step 1: Di chuyển**

```bash
mkdir -p src/sources/innertube src/sources/fake src/ports
git mv src/yt/innertube.js src/sources/innertube/client.js
for f in parse search channel comments; do git mv src/yt/$f.js src/sources/innertube/$f.js; done
sed -i '' "s#'\./innertube\.js'#'./client.js'#g" src/sources/innertube/*.js
sed -i '' "s#'\./yt/#'./sources/innertube/#g; s#innertube/innertube\.js#innertube/client.js#g" src/services.js src/server.js src/cli.js
sed -i '' "s#\.\./src/yt/innertube\.js#../src/sources/innertube/client.js#g; s#\.\./src/yt/#../src/sources/innertube/#g" test/*.test.js
```

- [ ] **Step 2: Port file** — `src/ports/youtube-source.js` chứa đúng hai typedef ở mục Interfaces và `export {};`.

- [ ] **Step 3: Test hợp đồng**

`test/sources/contract.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
/** @param {string} name @param {() => import('../../src/ports/youtube-source.js').YouTubeSource} make */
export function runSourceContract(name, make) {
  test(`${name}: searchVideos returns normalized videos`, async () => {
    const list = await make().searchVideos('kể chuyện', { max: 5, regions: [null] });
    assert.ok(list.length > 0);
    for (const v of list) {
      assert.match(v.id, /^[\w-]{11}$/);
      assert.equal(typeof v.title, 'string');
      assert.ok(v.views === null || Number.isFinite(v.views));
      assert.ok(Array.isArray(v.regions));
    }
  });
  test(`${name}: getComments shape`, async () => {
    const r = await make().getComments('NcZSPhEvIjk', { max: 3 });
    assert.equal(typeof r.disabled, 'boolean');
    for (const c of r.comments) assert.equal(typeof c.text, 'string');
  });
  test(`${name}: capabilities is declared`, () => {
    const c = make().capabilities();
    for (const k of ['captionsFilter', 'ccFilter', 'globalSearch']) assert.equal(typeof c[k], 'boolean');
  });
}
```

`test/sources/fake.test.js`:
```js
import { runSourceContract } from './contract.js';
import { createFakeSource } from '../../src/sources/fake/index.js';
runSourceContract('fake', () => createFakeSource());
```

- [ ] **Step 4: Run → FAIL** (fake source chưa có)

- [ ] **Step 5: Nguồn giả**

`src/sources/fake/fixtures.js`:
```js
export const VIDEOS = [
  { id: 'aaaaaaaaaaa', title: 'Bí mật 1979 không ai kể', channelId: 'UC_small_______________', channelTitle: 'Kênh Nhỏ', views: 500000, durationSec: 900, published: '2 months ago', ageDays: 61, isLive: false },
  { id: 'bbbbbbbbbbb', title: 'Lịch sử Việt Nam tóm tắt', channelId: 'UC_big_________________', channelTitle: 'Kênh To', views: 900000, durationSec: 1500, published: '1 year ago', ageDays: 365, isLive: false },
];
export const CHANNELS = {
  UC_small_______________: { id: 'UC_small_______________', title: 'Kênh Nhỏ', handle: '@nho', subs: 5000, videoCount: 40, country: 'VN', joined: '2025-01-01', totalViews: 2e6, avatar: null, description: '' },
  UC_big_________________: { id: 'UC_big_________________', title: 'Kênh To', handle: '@to', subs: 2e6, videoCount: 900, country: 'VN', joined: '2015-01-01', totalViews: 9e8, avatar: null, description: '' },
};
export const CHANNEL_VIDEOS = (id) => Array.from({ length: 30 }, (_, i) => ({ id: `${id.slice(3, 9)}v${String(i).padStart(4, '0')}`.slice(0, 11), title: `video ${i}`, channelId: id, channelTitle: '', views: id.includes('small') ? 2000 : 300000, durationSec: 800, published: `${i + 1} weeks ago`, ageDays: (i + 1) * 7, isLive: false }));
```

`src/sources/fake/index.js`:
```js
import { VIDEOS, CHANNELS, CHANNEL_VIDEOS } from './fixtures.js';
/** @returns {import('../../ports/youtube-source.js').YouTubeSource} */
export function createFakeSource({ videos = VIDEOS, channels = CHANNELS } = {}) {
  let requests = 0;
  const count = (x) => (requests++, Promise.resolve(x));
  return {
    searchVideos: (q, o = {}) => count(videos.slice(0, o.max ?? 20).map((v) => ({ ...v, query: q, regions: (o.regions || [null]).filter(Boolean) }))),
    searchChannels: (q, o = {}) => count(Object.values(channels).slice(0, o.max ?? 20).map((c) => ({ ...c, query: q, regions: [] }))),
    resolveChannelId: (input) => count(Object.values(channels).find((c) => input.includes(c.handle) || input === c.id)?.id ?? Object.keys(channels)[0]),
    getChannel: (id) => count(channels[id]),
    getChannelVideos: (id, o = {}) => count(CHANNEL_VIDEOS(id).slice(0, o.max ?? 30)),
    getChannelShorts: () => count([]),
    getVideo: (id) => count({ id, title: 'x', channelId: null, channelTitle: '', views: 1, durationSec: 60, publishedAt: '2026-10-01T00:00:00Z', category: null, tags: [], description: '', isShort: false, likes: 10 }),
    getComments: () => count({ comments: [{ id: 'c1', text: 'Làm phần 2 đi ad?', likes: 5, replies: 1, published: '1 day ago', ageDays: 1, isReply: false, hearted: false }], disabled: false }),
    suggest: (q) => count([q, `${q} hay nhất`]),
    mapLimit: (items, fn, onEach) => Promise.all(items.map(async (x, i) => { try { return await fn(x, i); } finally { onEach?.(i + 1, items.length); } })),
    capabilities: () => ({ captionsFilter: true, ccFilter: true, globalSearch: true }),
    stats: () => ({ requests, failures: 0 }),
  };
}
```

- [ ] **Step 6: Adapter innertube** — `src/sources/innertube/index.js` gói các hàm hiện có, có gộp request in-flight:

```js
import { configure, mapLimit, suggest, stats, realGl } from './client.js';
import { searchVideosRegions, searchChannelsRegions } from './search.js';
import { resolveChannelId, getChannelInfo, getChannelVideos, getChannelShorts, getVideoDetails } from './channel.js';
import { getComments } from './comments.js';

/** Deduplicate concurrent identical calls (two jobs asking for the same channel). */
function singleFlight(fn) {
  const inflight = new Map();
  return (key, ...args) => {
    if (inflight.has(key)) return inflight.get(key);
    const p = fn(...args).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
}

/** @returns {import('../../ports/youtube-source.js').YouTubeSource} */
export function createInnertubeSource(cfg = {}) {
  configure(cfg); // module-level client settings: one source per process (accepted in phase 0)
  const channel = singleFlight(getChannelInfo);
  const channelVids = singleFlight(getChannelVideos);
  const regionsOf = (o) => (o.regions && o.regions.length ? o.regions : [realGl(o.gl)]);
  return {
    searchVideos: (q, o = {}, onPage) => searchVideosRegions(q, o, regionsOf(o), onPage),
    searchChannels: (q, o = {}, onPage) => searchChannelsRegions(q, o, regionsOf(o), onPage),
    resolveChannelId,
    getChannel: (id, o = {}) => channel(`${id}:${!!o.about}`, id, o),
    getChannelVideos: (id, o = {}, onPage) => channelVids(`${id}:${o.max ?? 120}`, id, o, onPage),
    getChannelShorts,
    getVideo: getVideoDetails,
    getComments,
    suggest: (q, o = {}) => suggest(q, o),
    mapLimit,
    capabilities: () => ({ captionsFilter: true, ccFilter: true, globalSearch: true }),
    stats: () => ({ ...stats }),
    configure,
  };
}
```

- [ ] **Step 7: Test parser bằng fixture (không mạng)** — ghi một phản hồi `search` thật đã rút gọn (giữ `contents…itemSectionRenderer.contents` với 3 `videoRenderer`, bỏ `frameworkUpdates`, `responseContext`) vào `src/sources/innertube/fixtures/search-video.json` bằng:

```bash
node --input-type=module -e '
const r = await fetch("https://www.youtube.com/youtubei/v1/search?prettyPrint=false",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({context:{client:{clientName:"WEB",clientVersion:"2.20261101.00.00",hl:"en",gl:"US"}},query:"storytelling",params:"CAMSBggFEAEYAw=="})}).then(r=>r.json());
const items=[];(function w(o){if(o&&typeof o==="object"){if(o.videoRenderer&&items.length<3)items.push({videoRenderer:o.videoRenderer});for(const k in o)w(o[k])}})(r);
console.log(JSON.stringify({contents:{twoColumnSearchResultsRenderer:{primaryContents:{sectionListRenderer:{contents:[{itemSectionRenderer:{contents:items}}]}}}}}));' > src/sources/innertube/fixtures/search-video.json
```

`test/sources/innertube.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findAll } from '../../src/sources/innertube/parse.js';
import { parseVideoRenderer } from '../../src/sources/innertube/search.js';

test('search fixture parses into normalized videos', () => {
  const json = JSON.parse(fs.readFileSync('src/sources/innertube/fixtures/search-video.json', 'utf8'));
  const vids = findAll(json, 'videoRenderer').map((v) => parseVideoRenderer(v, 'storytelling'));
  assert.equal(vids.length, 3);
  for (const v of vids) {
    assert.match(v.id, /^[\w-]{11}$/);
    assert.ok(v.views > 0);
    assert.ok(v.durationSec > 0);
    assert.ok(v.channelId.startsWith('UC'));
  }
});
```

- [ ] **Step 8: Run** `npm test` → PASS. `rmdir src/yt`.

- [ ] **Step 9: Commit** `git add -A && git commit -m "refactor(sources): YouTubeSource port, innertube adapter, fake source, contract tests"`

---

### Task 9: Job runner lưu SQLite (idempotency, gián đoạn, huỷ)

**Files:**
- Create: `src/jobs/runner.js`, `src/jobs/registry.js`, `test/jobs/runner.test.js`
- Delete: `src/jobs.js`
- Modify: `src/server.js` (dùng runner; thêm `POST /api/jobs/:id/cancel`), `public/lib.js` (`runJob` hiểu `interrupted`/`cancelled`), `public/app.js` (hiện nút Chạy lại cho job bị gián đoạn trong sidebar)

**Interfaces:**
- Consumes: `store.jobs` (Task 4)
- Produces: `createRunner({ jobsRepo, handlers, maxParallel = 2, now = Date.now }) → { enqueue(ws, kind, params, title) → {id, reused: boolean}, get(id), list(ws), cancel(id), start(), stop() }`. Handler chữ ký: `(params, ctx) => Promise<{id?: number, inline?: boolean, [k: string]: any}>`, `ctx = { progress(p), signal: AbortSignal, workspaceId }`. `idempotencyKey(ws, kind, params) → string`.

- [ ] **Step 1: Test**

`test/jobs/runner.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/store/sqlite/db.js';
import { createSqliteStore } from '../../src/store/sqlite/index.js';
import { createRunner, idempotencyKey } from '../../src/jobs/runner.js';

const mkStore = () => createSqliteStore(openDatabase({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-')) }));
const wait = (fn) => new Promise((res) => { const t = setInterval(() => { if (fn()) { clearInterval(t); res(); } }, 5); });

test('key ignores param order, case and whitespace', () => {
  assert.equal(idempotencyKey('local', 'video_search', { keywords: ' Kể Chuyện ', gl: 'VN' }), idempotencyKey('local', 'video_search', { gl: 'VN', keywords: 'kể chuyện' }));
});

test('double submit reuses the running job (Review Focus #4)', async () => {
  const store = mkStore();
  let calls = 0;
  let release;
  const r = createRunner({ jobsRepo: store.jobs, handlers: { video_search: async () => { calls++; await new Promise((x) => (release = x)); return { id: 7 }; } } });
  r.start();
  const a = r.enqueue('local', 'video_search', { keywords: 'a' }, 'a');
  const b = r.enqueue('local', 'video_search', { keywords: 'a' }, 'a');
  assert.equal(a.id, b.id);
  assert.equal(b.reused, true);
  await wait(() => release);
  release();
  await wait(() => r.get(a.id).status === 'succeeded');
  assert.equal(calls, 1);
  assert.equal(r.get(a.id).record_id, 7);
  r.stop();
});

test('jobs left running by a previous process become interrupted (Review Focus #3)', () => {
  const store = mkStore();
  const id = store.jobs.insert({ workspace_id: 'local', kind: 'research', title: 't', params: '{}', idempotency_key: 'z', created_at: 1, status: 'running' });
  const r = createRunner({ jobsRepo: store.jobs, handlers: {} });
  r.start();
  assert.equal(r.get(id).status, 'interrupted');
  r.stop();
});

test('cancel aborts between steps and saves nothing', async () => {
  const store = mkStore();
  const r = createRunner({ jobsRepo: store.jobs, handlers: { comments: async (p, ctx) => {
    for (let i = 0; i < 100; i++) { if (ctx.signal.aborted) throw new Error('cancelled'); await new Promise((x) => setTimeout(x, 5)); }
    return { id: 1 };
  } } });
  r.start();
  const { id } = r.enqueue('local', 'comments', { videos: 'x' }, 'x');
  await wait(() => r.get(id).status === 'running');
  r.cancel(id);
  await wait(() => r.get(id).status === 'cancelled');
  assert.equal(r.get(id).record_id, null);
  r.stop();
});

test('handler error marks job failed with message', async () => {
  const store = mkStore();
  const r = createRunner({ jobsRepo: store.jobs, handlers: { idea_check: async () => { throw new Error('YouTube trả về 429'); } } });
  r.start();
  const { id } = r.enqueue('local', 'idea_check', { keywords: 'x' }, 'x');
  await wait(() => r.get(id).status === 'failed');
  assert.match(r.get(id).error, /429/);
  r.stop();
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `src/jobs/runner.js`**

```js
import crypto from 'node:crypto';

const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, ' ') : Array.isArray(v) ? v.map(norm) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : v);
export const idempotencyKey = (ws, kind, params) => crypto.createHash('sha1').update(JSON.stringify([ws, kind, norm(params)])).digest('hex');

export function createRunner({ jobsRepo, handlers, maxParallel = 2, now = Date.now }) {
  const controllers = new Map();
  let timer = null;
  let active = 0;

  function enqueue(ws, kind, params, title) {
    if (!handlers[kind]) throw Object.assign(new Error(`Unknown job kind: ${kind}`), { code: 'invalid_input' });
    const key = idempotencyKey(ws, kind, params);
    const existing = jobsRepo.findActiveByKey(key);
    if (existing) return { id: existing.id, reused: true };
    try {
      const id = jobsRepo.insert({ workspace_id: ws, kind, title, status: 'queued', params: JSON.stringify(params), idempotency_key: key, created_at: now() });
      queueMicrotask(pump);
      return { id, reused: false };
    } catch (e) {
      const again = jobsRepo.findActiveByKey(key); // lost the race to another insert
      if (again) return { id: again.id, reused: true };
      throw e;
    }
  }

  async function run(job) {
    const ac = new AbortController();
    controllers.set(job.id, ac);
    jobsRepo.update(job.id, { status: 'running', started_at: now(), attempts: job.attempts + 1 });
    const ctx = {
      workspaceId: job.workspace_id,
      signal: ac.signal,
      progress: (p) => jobsRepo.update(job.id, { progress: { ...(jobsRepo.get(job.id).progress || {}), ...p } }),
    };
    try {
      const result = await handlers[job.kind](job.params, ctx);
      if (ac.signal.aborted) throw new Error('cancelled');
      jobsRepo.update(job.id, { status: 'succeeded', finished_at: now(), record_id: result?.id ?? null, result: result?.inline ? result : null });
    } catch (e) {
      const cancelled = ac.signal.aborted;
      jobsRepo.update(job.id, { status: cancelled ? 'cancelled' : 'failed', finished_at: now(), error: cancelled ? null : String(e?.message || e) });
    } finally {
      controllers.delete(job.id);
      active--;
      queueMicrotask(pump);
    }
  }

  function pump() {
    while (active < maxParallel) {
      const job = jobsRepo.nextQueued();
      if (!job) return;
      active++;
      jobsRepo.update(job.id, { status: 'running' }); // claim before awaiting
      run(job);
    }
  }

  return {
    enqueue,
    get: (id) => jobsRepo.get(id),
    list: (ws) => jobsRepo.list(ws),
    cancel(id) {
      jobsRepo.update(id, { cancel_requested: 1 });
      const ac = controllers.get(id);
      if (ac) ac.abort();
      else if (jobsRepo.get(id)?.status === 'queued') jobsRepo.update(id, { status: 'cancelled', finished_at: now() });
    },
    start() {
      jobsRepo.markInterrupted();
      timer = setInterval(pump, 1000);
      pump();
    },
    stop() {
      clearInterval(timer);
      for (const ac of controllers.values()) ac.abort();
    },
  };
}
```

- [ ] **Step 4: Run → PASS**

- [ ] **Step 5: Nối vào server** — trong `src/server.js` thay `startJob/getJob/listJobs` bằng `runner` (tạo trong `src/app.js` ở Task 10; tạm thời tạo ngay trong server với `handlers = JOBS`, chữ ký handler `(params, ctx) => JOBS[kind](params, ctx.progress)`). Route:
  - `POST /api/jobs/:kind` → `runner.enqueue('local', kind, body, title)` → `{id, reused}`
  - `GET /api/jobs/:id` → `{ id, kind, title, status, progress, error, result: status==='succeeded' ? (result?.inline ? result : {id: record_id}) : null }`
  - `POST /api/jobs/:id/cancel` → `runner.cancel(id)`
  - `GET /api/jobs` → `runner.list('local')` (đổi trường cho khớp `public/lib.js`: `status: succeeded → done` **hoặc** sửa `lib.js` hiểu `succeeded`; chọn sửa `lib.js`).

- [ ] **Step 6: Frontend** — `public/lib.js` `runJob`: coi `succeeded` là xong; `failed | cancelled | interrupted` → reject với thông điệp tương ứng; `refreshJobs` hiện nhãn: `queued` "Chờ", `running` "Đang chạy", `succeeded` "Xong", `failed` "Lỗi", `cancelled` "Đã huỷ", `interrupted` "Bị gián đoạn" kèm nút "Chạy lại" gọi lại `POST /api/jobs/:kind` với `params` của job.

- [ ] **Step 7: Kiểm tra tay (Review Focus #3, #4)** — `npm start`; bấm Lập báo cáo 2 lần nhanh → sidebar chỉ có 1 job; trong lúc chạy `pkill -f src/server.js` rồi `npm start` → sidebar hiện "Bị gián đoạn" + "Chạy lại".

- [ ] **Step 8: Commit** `git add -A && git rm --cached src/jobs.js 2>/dev/null; git commit -am "feat(jobs): persistent job runner with idempotency, cancel and interrupted recovery"`

---

### Task 10: Tách `services.js` thành `features/*` + composition root

**Files:**
- Create: `src/features/{shared,video-search,channel-search,channel-analysis,topic-research,comments,keyword-score,keyword-ideas}.js`, `src/app.js`, `test/features/video-search.test.js`, `test/features/topic-research.test.js`
- Delete: `src/services.js`
- Modify: `src/server.js`, `src/cli.js` (lấy feature từ `createApp()`)

**Interfaces:**
- Consumes: `YouTubeSource` (Task 8), `createSqliteStore` (Task 4), `createRunner` (Task 9), `core/*` (Task 7)
- Produces: mỗi file export `make<Name>(deps)` trả về hàm use case với **cùng chữ ký và kết quả** như v0:
  - `makeVideoSearch(deps)(params, progress) → {id, videos, keywords, opts, regions, summary}`
  - `makeChannelSearch`, `makeChannelAnalysis` (`(input, opts, progress)`), `makeCompareChannels` (`(ids)`), `makeFetchComments`, `makeResearch`, `makeResearchComments` (`(recordId, opts, progress)`), `makeKeywordIdeas` (`(seed, opts, progress)`), `makeKeywordScores`
  - `deps = { source: YouTubeSource, store, ws: string, settings: () => object, now: () => number }`
  - `src/features/shared.js`: `makeEnrich(deps) → { channelInfo, channelVideos, videoDetails, enrichVideos }` (chuyển nguyên từ `services.js` dòng 14–90)
  - `createApp({ config, source?, store? }) → { config, store, source, features, runner }` trong `src/app.js`

- [ ] **Step 1: Test feature với nguồn giả**

`test/features/video-search.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/app.js';
import { createFakeSource } from '../../src/sources/fake/index.js';

const app = () => createApp({ config: { dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-')), port: 0, host: '127.0.0.1', edition: 'dev', logLevel: 'error' }, source: createFakeSource() });

test('video search computes outlier vs channel and view/sub, saves a record', async () => {
  const a = app();
  const r = await a.features.videoSearch({ keywords: 'lịch sử', upload: 'year', perKeyword: 10, exactTop: 0 }, () => {});
  const small = r.videos.find((v) => v.channelId.includes('small'));
  assert.equal(small.outlierScore, 250, '500k ÷ 2k median');
  assert.equal(small.viewSub, 100, '500k ÷ 5k subs');
  assert.ok(a.store.records.get('local', r.id));
});
```

`test/features/topic-research.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/app.js';
import { createFakeSource } from '../../src/sources/fake/index.js';
import { researchMarkdown } from '../../src/core/report/markdown.js';

test('research produces the digest sections the skill reads', async () => {
  const a = createApp({ config: { dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-')), port: 0, host: '127.0.0.1', edition: 'dev', logLevel: 'error' }, source: createFakeSource() });
  const r = await a.features.research({ topic: 'lịch sử', keywords: 'lịch sử', comments: { top: 1, max: 5 } }, () => {});
  const md = researchMarkdown(a.store.records.get('local', r.id).data);
  for (const h of ['## Top video theo điểm vượt kênh', '## Mẫu tiêu đề', '## Độ dài video', '## Comment']) assert.ok(md.includes(h), h);
  assert.ok(!/@\w+/.test(md.split('## Comment')[1]), 'no commenter handles');
});
```

- [ ] **Step 2: Run → FAIL** (`createApp` chưa có)

- [ ] **Step 3: Chuyển code** — với mỗi hàm export của `src/services.js`, tạo file feature tương ứng; thân hàm giữ nguyên, chỉ đổi:
  - `searchVideosRegions(kw, opts, regions, cb)` → `deps.source.searchVideos(kw, { ...opts, regions }, cb)`
  - `searchChannelsRegions` → `deps.source.searchChannels`
  - `getChannelInfo / getChannelVideos / getChannelShorts / getVideoDetails / getComments / resolveChannelId / suggest / mapLimit` → `deps.source.*`
  - `records.add(...)` → `deps.store.records.add(deps.ws, ...)`; tương tự `get/update/remove/latestByRef`
  - `settingsStore.all()` → `deps.settings()`
  - `cache.*` → `deps.store.cache.*`
  - `Date.now()` → `deps.now()`
  - Gọi chéo (research gọi videoSearch, keywordIdeas, researchComments) qua tham số: `makeResearch({ ...deps, videoSearch, keywordIdeas, researchComments })`.

  Mẫu khung:
```js
// src/features/video-search.js
import { regionsFor, durationBucket } from './shared.js';
import { median } from '../core/metrics/index.js';
/** @param {import('./shared.js').Deps & {enrich: ReturnType<import('./shared.js').makeEnrich>}} deps */
export function makeVideoSearch(deps) {
  return async function videoSearch(params, progress = () => {}) {
    // body moved verbatim from services.js videoSearch, with the substitutions above
  };
}
```
  `regionsFor` và `durationBucket` là hàm thuần: chuyển từ `sources/innertube/search.js` sang `src/core/search-options.js` và re-export trong `features/shared.js` (features không được import `sources/`).

- [ ] **Step 4: `src/app.js`**

```js
import { loadConfig } from './config.js';
import { openDatabase } from './store/sqlite/db.js';
import { createSqliteStore } from './store/sqlite/index.js';
import { createInnertubeSource } from './sources/innertube/index.js';
import { createRunner } from './jobs/runner.js';
import { makeEnrich } from './features/shared.js';
import { makeVideoSearch } from './features/video-search.js';
import { makeChannelSearch } from './features/channel-search.js';
import { makeChannelAnalysis, makeCompareChannels } from './features/channel-analysis.js';
import { makeFetchComments } from './features/comments.js';
import { makeResearch, makeResearchComments } from './features/topic-research.js';
import { makeKeywordIdeas } from './features/keyword-ideas.js';
import { makeKeywordScores } from './features/keyword-score.js';

export function createApp({ config = loadConfig(), source, store } = {}) {
  store ??= createSqliteStore(openDatabase({ dataDir: config.dataDir }));
  const ws = 'local';
  const settings = () => store.settings.all(ws);
  source ??= createInnertubeSource(settings());
  const base = { source, store, ws, settings, now: Date.now };
  const enrich = makeEnrich(base);
  const videoSearch = makeVideoSearch({ ...base, enrich });
  const keywordIdeas = makeKeywordIdeas(base);
  const researchComments = makeResearchComments(base);
  const features = {
    videoSearch,
    channelSearch: makeChannelSearch({ ...base, enrich }),
    analyzeChannel: makeChannelAnalysis({ ...base, enrich }),
    compareChannels: makeCompareChannels(base),
    fetchComments: makeFetchComments({ ...base, enrich }),
    research: makeResearch({ ...base, enrich, videoSearch, keywordIdeas, researchComments }),
    researchComments,
    keywordIdeas,
    keywordScores: makeKeywordScores({ ...base, enrich }),
  };
  const handlers = {
    video_search: (p, ctx) => features.videoSearch(p, ctx.progress),
    channel_search: (p, ctx) => features.channelSearch(p, ctx.progress),
    channel_analysis: (p, ctx) => features.analyzeChannel(p.input, { max: Number(p.max) || 120 }, ctx.progress),
    research: (p, ctx) => features.research(p, ctx.progress),
    research_comments: (p, ctx) => features.researchComments(Number(p.recordId), p, ctx.progress),
    comments: (p, ctx) => features.fetchComments(p, ctx.progress),
    idea_check: (p, ctx) => features.keywordScores(p, ctx.progress),
    keyword_score: (p, ctx) => features.keywordScores(p, ctx.progress),
    keywords: (p, ctx) => features.keywordIdeas(p.seed, { gl: p.gl }, ctx.progress).then((list) => ({ id: store.records.add(ws, 'keywords', p.seed, { params: p, data: { seed: p.seed, list } }) })),
  };
  const runner = createRunner({ jobsRepo: store.jobs, handlers });
  return { config, store, source, features, runner, ws };
}
```

- [ ] **Step 5: Server và CLI dùng `createApp()`** — xoá import `./services.js`, `./db.js` trong `server.js`/`cli.js`; dùng `app.features.*`, `app.store.*` (với `app.ws`), `app.runner`. Xoá `src/services.js` và lớp tương thích `src/db.js`.

- [ ] **Step 6: Run** `npm test` → PASS. So sánh đầu ra thật trước/sau:

```bash
git stash -u && node src/cli.js ideas "ăn chay lành mạnh" --gl VN > /tmp/ytr-before.txt; git stash pop
node src/cli.js ideas "ăn chay lành mạnh" --gl VN > /tmp/ytr-after.txt
diff <(cut -c1-40 /tmp/ytr-before.txt) <(cut -c1-40 /tmp/ytr-after.txt)
```
Expected: không khác ở phần điểm (số view có thể lệch vài đơn vị do YouTube cập nhật).

- [ ] **Step 7: Commit** `git add -A && git commit -m "refactor: split services into features with a composition root"`

---

### Task 11: HTTP router khai báo + validate + mã lỗi chuẩn + `/api/v1`

**Files:**
- Create: `src/http/server.js`, `src/http/router.js`, `src/http/validate.js`, `src/http/routes/{jobs,records,saved,settings,status,metrics}.js`, `test/http/api.test.js`
- Delete: `src/server.js` (thay bằng `src/main.js` ở Task 12)

**Interfaces:**
- Consumes: `createApp()` (Task 10)
- Produces: `createHttpServer(app) → http.Server`; route khai báo `{ method, path: '/api/v1/jobs/:id', schema?: {body?, query?}, handler(ctx) }` với `ctx = { params, query, body, app, ws }`; lỗi `{ error: { code, message, field? } }`; alias `/api/*` → `/api/v1/*`.
- `validate(schema, value) → {ok: true, value} | {ok: false, field, message}`; schema dạng `{ keywords: 'string!', perKeyword: 'int?', gl: 'string?', upload: ['any','today','week','month','year'] }`.

- [ ] **Step 1: Test**

`test/http/api.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../src/app.js';
import { createFakeSource } from '../../src/sources/fake/index.js';
import { createHttpServer } from '../../src/http/server.js';

async function boot() {
  const app = createApp({ config: { dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ytr-')), port: 0, host: '127.0.0.1', edition: 'dev', logLevel: 'error' }, source: createFakeSource() });
  app.runner.start();
  const srv = createHttpServer(app);
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  return { app, srv, base, close: () => { app.runner.stop(); srv.close(); } };
}

test('invalid job input → 400 invalid_input with field', async () => {
  const s = await boot();
  const r = await fetch(`${s.base}/api/v1/jobs/video_search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ perKeyword: 'many' }) });
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.error.code, 'invalid_input');
  assert.equal(j.error.field, 'keywords');
  s.close();
});

test('legacy /api alias and job lifecycle', async () => {
  const s = await boot();
  const { id } = await (await fetch(`${s.base}/api/jobs/idea_check`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ keywords: ['lịch sử'] }) })).json();
  let job;
  for (let i = 0; i < 50 && job?.status !== 'succeeded'; i++) { job = await (await fetch(`${s.base}/api/v1/jobs/${id}`)).json(); await new Promise((r) => setTimeout(r, 20)); }
  assert.equal(job.status, 'succeeded');
  assert.ok(job.result.id);
  s.close();
});

test('unknown record → 404 not_found; unknown kind → 400', async () => {
  const s = await boot();
  assert.equal((await fetch(`${s.base}/api/v1/records/999`)).status, 404);
  assert.equal((await fetch(`${s.base}/api/v1/jobs/hack`, { method: 'POST', body: '{}' })).status, 400);
  s.close();
});
```

- [ ] **Step 2: Run → FAIL**

- [ ] **Step 3: Implement `validate.js`**

```js
/** @param {Record<string, string|string[]>} schema @param {any} value */
export function validate(schema, value = {}) {
  const out = { ...value };
  for (const [field, rule] of Object.entries(schema)) {
    const v = value[field];
    if (Array.isArray(rule)) {
      if (v != null && v !== '' && !rule.includes(v)) return { ok: false, field, message: `phải là một trong: ${rule.join(', ')}` };
      continue;
    }
    const [type, flag] = [rule.replace(/[!?]$/, ''), rule.slice(-1)];
    const missing = v == null || v === '' || (Array.isArray(v) && !v.length);
    if (missing) {
      if (flag === '!') return { ok: false, field, message: 'bắt buộc' };
      continue;
    }
    if (type === 'int') {
      const n = Number(v);
      if (!Number.isInteger(n)) return { ok: false, field, message: 'phải là số nguyên' };
      out[field] = n;
    } else if (type === 'string' && typeof v !== 'string' && !Array.isArray(v)) return { ok: false, field, message: 'phải là chuỗi' };
    else if (type === 'bool') out[field] = v === true || v === 'true' || v === 1;
  }
  return { ok: true, value: out };
}
```

Schema theo kind (đặt trong `routes/jobs.js`):
```js
export const JOB_SCHEMAS = {
  video_search: { keywords: 'string!', upload: ['any', 'today', 'week', 'month', 'year'], sort: ['relevance', 'popularity', 'date'], perKeyword: 'int?', exactTop: 'int?', gl: 'string?', minDur: 'int?', maxDur: 'int?' },
  channel_search: { keywords: 'string!', source: ['both', 'channels', 'videos'], perKeyword: 'int?', gl: 'string?' },
  channel_analysis: { input: 'string!', max: 'int?' },
  research: { topic: 'string?', keywords: 'string?', direction: ['top', 'trend', 'keyword'], perKeyword: 'int?', gl: 'string?' },
  research_comments: { recordId: 'int!', top: 'int?', max: 'int?' },
  comments: { videos: 'string!', max: 'int?', sort: ['top', 'newest'] },
  idea_check: { keywords: 'string!' },
  keyword_score: { keywords: 'string!', lite: 'bool?' },
  keywords: { seed: 'string!', gl: 'string?' },
};
```

- [ ] **Step 4: `router.js` + `server.js`** — router: danh sách route, khớp `:param` thành regex; chuẩn hoá đường dẫn `/api/x` → `/api/v1/x`; mọi lỗi ném ra có `code` → `{error:{code,message,field}}` với mã HTTP: `invalid_input` 400, `not_found` 404, `license_required` 402, `rate_limited` 429, còn lại 500. Static files phục vụ từ `public/` (đổi thành `web/` ở Task 13). Chuyển từng route trong `src/server.js` cũ sang file `routes/*.js` tương ứng, giữ nguyên phản hồi (CSV/Markdown export giữ tên file và header).

- [ ] **Step 5: Run → PASS**; `public/lib.js` đổi `api()` để đọc `data.error.message` khi lỗi (`throw new Error(data.error?.message || data.error || \`Lỗi ${res.status}\`)`).

- [ ] **Step 6: Commit** `git add -A && git commit -m "refactor(http): declarative router, input validation, standard errors, /api/v1"`

---

### Task 12: Entry point mới, CLI, launcher, probe

**Files:**
- Create: `src/main.js`, `src/cli/index.js` (chuyển từ `src/cli.js`), `scripts/probe.js`
- Modify: `package.json` scripts, `scripts/make-app.sh` (đường dẫn entry), `.claude/launch.json`, `skills/nghien-cuu-youtube/SKILL.md`, `README.md`

**Interfaces:**
- Consumes: `createApp`, `createHttpServer`
- Produces: `npm start` → `node src/main.js`; `node src/cli/index.js <cmd>` với cùng lệnh/cờ như v0; `npm run probe` thoát mã 1 khi YouTube đổi định dạng.

- [ ] **Step 1: `src/main.js`**

```js
import { createApp } from './app.js';
import { createHttpServer } from './http/server.js';
const app = createApp();
app.runner.start();
const srv = createHttpServer(app);
srv.listen(app.config.port, app.config.host, () => console.log(`YouTube Research → http://localhost:${srv.address().port}`));
const shutdown = () => { app.runner.stop(); srv.close(() => process.exit(0)); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 2: Scripts**

```json
"start": "node --disable-warning=ExperimentalWarning src/main.js",
"dev": "node --disable-warning=ExperimentalWarning --watch src/main.js",
"research": "node --disable-warning=ExperimentalWarning src/cli/index.js research",
"probe": "node --disable-warning=ExperimentalWarning scripts/probe.js"
```

- [ ] **Step 3: CLI** — `git mv src/cli.js src/cli/index.js`; sửa import sang `../app.js`, `../core/report/markdown.js`; lấy `features/store` từ `createApp()`.

- [ ] **Step 4: Launcher (Review Focus #5)** — trong `scripts/make-app.sh` đổi `src/server.js` → `src/main.js` (2 chỗ: lệnh `nohup` và mọi `pkill` gợi ý trong README). Chạy lại và kiểm tra:

```bash
bash scripts/make-app.sh
pkill -f "src/(server|main).js"; open "/Applications/YouTube Research.app"
for i in $(seq 1 20); do curl -sf localhost:5178/api/v1/status >/dev/null && echo UP && break; sleep 0.5; done
```
Expected: `UP`. Sửa README phần "Icon bấm là chạy": `pkill -f src/main.js`.

- [ ] **Step 5: Skill (Review Focus #5)** — trong `skills/nghien-cuu-youtube/SKILL.md` thay mọi `src/cli.js` → `src/cli/index.js`. Chạy:

```bash
node --disable-warning=ExperimentalWarning src/cli/index.js ideas "kể chuyện đêm khuya" --gl VN
```
Expected: một dòng `điểm …` như trước.

- [ ] **Step 6: Probe** — `scripts/probe.js`:

```js
import { createInnertubeSource } from '../src/sources/innertube/index.js';
const src = createInnertubeSource({ gl: 'US', concurrency: 2, delayMs: 300 });
const checks = [
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
  try { ok = await fn(); } catch (e) { console.error(name, e.message); }
  console.log(`${ok ? '✔' : '✖'} ${name}`);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
```
Run: `npm run probe` → 6 dòng ✔.

- [ ] **Step 7: Run** `npm test` → PASS.

- [ ] **Step 8: Commit** `git add -A && git commit -m "refactor: new entry point, CLI path, probe script; update launcher and skill"`

---

### Task 13: Frontend — `web/`, api client, view trả `unmount()`, tách components

**Files:**
- Move: `public/` → `web/`
- Create: `web/api/client.js`, `web/dom.js`, `web/components/{video-table,video-grid,video-filters,charts,score-card,patterns}.js`
- Delete: `web/components.js` (sau khi tách)
- Modify: mọi `web/views/*.js`, `web/app.js`, `web/lib.js`, `src/http/server.js` (thư mục static `web/`)

**Interfaces:**
- Produces:
  - `web/api/client.js`: `api(path, {method, body})` (chuyển từ lib.js), `jobs.start(kind, params) → {id, reused}`, `jobs.get(id)`, `jobs.cancel(id)`, `records.get(id)`, `records.list(kind, limit)`, `records.remove(id)`, `saved.*`, `settings.*`, `metrics.load()`
  - `web/dom.js`: `on(root, event, selector, handler) → off()`; `scope()` → `{ on(...), off() }` gom mọi listener của một view
  - Mỗi view: `export async function mount(root, params) { const s = scope(); …; return () => s.off(); }`; `app.js` gọi hàm trả về khi đổi màn.

- [ ] **Step 1: Di chuyển + static path**

```bash
git mv public web
sed -i '' "s#'public'#'web'#" src/http/server.js
```
Run: `npm start` → giao diện như cũ.

- [ ] **Step 2: `web/dom.js`**

```js
/** Delegated listener; returns a function that removes it. */
export function on(root, event, selector, handler) {
  const fn = (e) => {
    const el = selector ? e.target.closest(selector) : root;
    if (el && root.contains(el)) handler(e, el);
  };
  root.addEventListener(event, fn);
  return () => root.removeEventListener(event, fn);
}
/** Collects listeners/timers of one view so unmount removes all of them. */
export function scope() {
  const offs = [];
  return {
    on: (...a) => offs.push(on(...a)),
    timer: (id) => offs.push(() => clearInterval(id)),
    off: () => offs.splice(0).forEach((f) => f()),
  };
}
```

- [ ] **Step 3: Kiểm tra rò listener trước khi sửa (test tay ghi lại số liệu)** — trong DevTools console ở màn Phân tích kênh mở một kênh 3 lần; `getEventListeners(document.querySelector('[data-out]')).click.length` → ghi số (v0: tăng mỗi lần).

- [ ] **Step 4: Chuyển từng view** — trong mỗi `web/views/*.js`: thay `x.addEventListener(...)` trên phần tử sống lâu (`root`, `out`, `[data-list]`) bằng `s.on(root, 'click', '[data-…]', handler)`; trả về `() => s.off()`. `web/app.js`:

```js
let unmount = null;
async function route() {
  // …
  unmount?.();
  unmount = (await entry[3].mount(main.firstChild, params)) || null;
}
```
Lặp lại Step 3 → số listener không tăng giữa các lần mở.

- [ ] **Step 5: Tách `components.js`** theo bảng: `video-filters.js` (SUB_RANGES, VIDEO_FILTER_DEFAULT, filterVideos, videoFilterPanel, bindVideoFilters), `video-table.js` (videoTable, oscoreBadge, viewSub badge), `video-grid.js` (videoGrid), `video-results.js` (mountVideoResults), `charts.js` (viewsChart, hbars), `patterns.js` (patternList, phraseChips), `score-card.js` (scoreCard, bindScoreCards, VERDICT). Views import trực tiếp file cần. `git rm web/components.js`.

- [ ] **Step 6: Mọi `fetch`/`api(` trong views đi qua `web/api/client.js`**

```bash
grep -rn "fetch(\|api(\`/api\|api('/api" web/views web/components
```
Expected: không còn kết quả (chỉ còn trong `web/api/client.js`).

- [ ] **Step 7: Kiểm tra tay toàn app** — mở lần lượt 13 màn; chạy một Tìm video, một Chấm điểm, mở một báo cáo cũ; Console không có lỗi.

- [ ] **Step 8: Commit** `git add -A && git commit -m "refactor(web): api client, view unmount, split components"`

---

### Task 14: Cập nhật tài liệu và kiểm tra cuối giai đoạn 0

**Files:**
- Modify: `README.md` (Cấu trúc, lệnh), `docs/ARCHITECTURE.md` §1 (đánh dấu D1–D11 đã xử lý / còn lại), `skills/nghien-cuu-youtube/SKILL.md`

- [ ] **Step 1: README** — thay mục "Cấu trúc" bằng cây thư mục ở ARCHITECTURE.md §3 (phần đã có), thêm `npm run probe`, `npm run typecheck`.

- [ ] **Step 2: ARCHITECTURE.md §1** — thêm cột "Trạng thái": D1–D10 "Đã xử lý (giai đoạn 0)", D8 "Một phần — Preact ở v1.2", D11 "Đã có cột, chưa có auth".

- [ ] **Step 3: Kiểm tra cuối**

```bash
npm test && npm run probe
wc -l src/features/*.js | sort -n | tail -3      # không file nào > 250 dòng
grep -rn "services.js\|src/yt/\|src/analysis/\|src/server.js\|src/cli.js" src web scripts skills README.md docs/ARCHITECTURE.md
```
Expected: test + probe xanh; grep không còn tham chiếu đường dẫn cũ (trừ bảng "Ánh xạ từ v0" trong ARCHITECTURE.md).

- [ ] **Step 4: Commit** `git commit -am "docs: update README, architecture status and skill paths after phase 0"`

---

## Self-review

- **Độ phủ spec (ARCHITECTURE.md)**: §2 nguyên tắc → Task 1 (arch test), 10 (composition root); §3 thư mục → Task 3–13; §4 luật layer → Task 1; §5.1 migration → Task 3; §5.2 bảng → Task 4 (bảng v1.1/v1.2 thuộc giai đoạn sau); §5.3 record version → Task 5; §6 registry → Task 6; §7 job → Task 9 (ngân sách request mỗi job: **chưa có task** — để giai đoạn 1.1 cùng scheduler, ghi rõ ở đây); §8 port + contract + probe → Task 8, 12; §9 HTTP → Task 11; §10 frontend → Task 13; §11 config → Task 2; §12 test → Task 1, 3–11; §14 checklist → Task 14.
- **Placeholder**: không có TBD; bước "chuyển nguyên thân hàm" (Task 10 Step 3, Task 11 Step 4) mô tả đúng phép thay thế cần làm vì thân hàm giữ nguyên 100%.
- **Nhất quán kiểu**: `records.add(ws, kind, title, opts)` dùng giống nhau ở Task 4, 5, 10; `createRunner({jobsRepo, handlers})` ở Task 9 và 10; `createApp({config, source, store})` ở Task 10, 11, 12; trường `viewSub` từ Task 5 trở đi.
- **Review Focus**: #1 → Task 3 test v0 DB; #2 → Task 6 Step 5; #3, #4 → Task 9 tests; #5 → Task 12 Step 4–5.
