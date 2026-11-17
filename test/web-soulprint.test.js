// The web UI has no DOM tests; this pins the wiring a refactor could silently drop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const view = () => fs.readFileSync('web/views/soulprint.js', 'utf8');

test('Soulprint sits right under Tổng quan in the menu and has its client', () => {
  const app = fs.readFileSync('web/app.js', 'utf8');
  assert.match(app, /const SOULPRINT = \{ icon: 'target', label: 'Soulprint', tabs: \[\['\/soulprint', 'Soulprint', \(\) => import\('\.\/views\/soulprint\.js'\)\]\] \};/);
  assert.match(app, /const ITEMS = \[HOME, SOULPRINT, /);
  assert.match(app, /navItem\(HOME, path\) \+\s*navItem\(SOULPRINT, path\)/);
  const client = fs.readFileSync('web/http/client.js', 'utf8');
  for (const name of ['get:', 'save:', 'seeds:', 'assist:', 'importText:', 'exportUrl:']) assert.ok(client.slice(client.indexOf('export const soulprint')).includes(name), name);
});

test('three tabs in the reference style, and the readiness line', () => {
  const src = view();
  for (const s of ['fw-tabs', 'role="tablist"', 'fw-panel', 'fw-cap', "'Hồ sơ'", "'Brainstorm'", "'Nhập từ file'", 'Hồ sơ đủ dùng']) assert.ok(src.includes(s), s);
});

test('AI buttons exist for every helper and are only drawn when a key is set', () => {
  const src = view();
  for (const a of ['tidy', 'avatar', 'pains', 'statement', 'check', 'hypothesis', 'import']) assert.match(src, new RegExp(`aiBtn\\('${a}', `), a);
  assert.match(src, /data-ai="\$\{action\}"/);
  assert.match(src, /const aiBtn = \(action, label\) => \(state\.ai \? /, 'one helper draws every AI button, and draws nothing without a key');
  assert.match(src, /data-accept/);
  assert.match(src, /data-reject/);
  assert.match(src, /chưa đối chiếu với đối thủ/);
});

test('the view never calls fetch itself and escapes what it shows', () => {
  const src = view();
  assert.ok(!/\bfetch\(/.test(src));
  assert.match(src, /import \{[^}]*\besc\b[^}]*\} from '\.\.\/lib\.js'/);
});

test('the dashboard links to Soulprint with its progress', () => {
  const src = fs.readFileSync('web/views/dashboard.js', 'utf8');
  assert.match(src, /href="#\/soulprint"/);
  assert.match(src, /data-soulprint/);
});
