// The web UI has no DOM tests; this pins the wiring a refactor could silently drop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Loaded by URL: nav.js lazy-loads every screen and typecheck would follow those imports into web/.
const { GROUPS, ITEMS } = await import(new URL('../web/nav.js', import.meta.url).href);

const view = () => fs.readFileSync('web/views/board.js', 'utf8');

test('a "Làm" group holds the board, after Khán giả and before Lưu trữ', () => {
  assert.deepEqual(GROUPS.map((g) => g.key), ['find', 'dissect', 'audience', 'make', 'library']);
  assert.deepEqual(GROUPS.find((g) => g.key === 'make').items.map((it) => [it.label, it.tabs[0][0]]), [['Bảng ý tưởng', '/board']]);
  assert.equal(ITEMS.length, 15);
  const client = fs.readFileSync('web/http/client.js', 'utf8');
  for (const name of ['board:', 'create:', 'update:', 'remove:', 'newBatch:', 'exportUrl:']) assert.ok(client.slice(client.indexOf('export const ideas')).includes(name), name);
});

test('the board: counters, six dots, the card panel with its tabs, the batch-full choice', () => {
  const src = view();
  for (const s of ['fw-tabs', "'Ý tưởng'", "'Chấm'", "'Gạch gốc'", 'data-dot', 'đủ căn cứ để chốt', 'thử nghiệm gốc', 'data-new-batch', 'data-drop', 'Mở lô mới', 'TOPIC', 'NỖI ĐAU', 'GÓC ĐI NGƯỢC', 'LEAD MAGNET', 'GIỮ GẠCH', 'LÀM LẠI GẠCH']) assert.ok(src.includes(s), s);
  assert.ok(!/\bfetch\(/.test(src));
  assert.match(src, /import \{[^}]*\besc\b[^}]*\} from '\.\.\/lib\.js'/);
});

test('unsaved edits and the batch that gets closed are asked about first; the screen cleans up after itself', () => {
  const src = view();
  for (const s of ['leaveOk()', 'Thẻ đang sửa chưa lưu', 'beforeunload', "removeEventListener('beforeunload'", 'Lô đã đóng vẫn xem lại được', 'originOf(x)', 'Từ thư viện gạch']) assert.ok(src.includes(s), s);
});

test('other screens link to the board, and never call its API themselves', () => {
  assert.match(fs.readFileSync('web/views/bricks.js', 'utf8'), /#\/board\?from=brick:/);
  assert.match(fs.readFileSync('web/views/soulprint.js', 'utf8'), /#\/board\?from=pain:/);
  assert.match(fs.readFileSync('web/views/tiktok/five-w.js', 'utf8'), /#\/board\?from=5w1h:/);
  for (const f of ['web/views/bricks.js', 'web/views/soulprint.js', 'web/views/tiktok/five-w.js']) assert.ok(!/import \{[^}]*\bideas\b[^}]*\} from '[./]*http\/client\.js'/.test(fs.readFileSync(f, 'utf8')), f);
});

test('two AI helpers on the card, drawn only with a key, offered with Nhận and Bỏ', () => {
  const src = view();
  for (const s of ["aiBtn('draft'", "aiBtn('titles'", 'data-accept', 'data-reject', 'AI đề xuất']) assert.ok(src.includes(s), s);
  assert.match(src, /const aiBtn = \(action, text\) => \(b\.ai \? /);
});

test('the Dàn ý tab: length, scenes, three hooks in three layers, the four S, blocks with times, the script check', () => {
  const src = view();
  for (const s of ["['outline', 'Dàn ý'", 'DÀN Ý', 'ĐỘ DÀI', 'CẢNH QUAY ĐƯỢC', 'NGHIÊNG VỀ', 'NGẮT', 'BẬT NGƯỢC', 'CHỮ TRÊN MÀN HÌNH', 'HÌNH MỞ ĐẦU', '4 CHỮ S', 'VÒNG LẶP', 'SOÁT LỜI THOẠI',
    'data-pick-hook', 'data-scene', 'data-o=', 'data-lint', 'data-save-script', "outlineBtn('outline'", "outlineBtn('hooks'", "outlineBtn('fourS'", 'Còn thiếu', 'không viết lời thoại']) assert.ok(src.includes(s), s);
  const client = fs.readFileSync('web/http/client.js', 'utf8');
  for (const name of ['saveOutline:', 'saveScript:', 'lint:', 'outlineAssist:', 'outlineUrl:']) assert.ok(client.slice(client.indexOf('export const ideas')).includes(name), name);
});

test('phase 7: Chấm lô is a tab of the board entry; the Kết quả tab; the refresh job is named and linked', () => {
  const make = GROUPS.find((g) => g.key === 'make').items[0];
  assert.deepEqual(make.tabs.map((t) => [t[0], t[1]]), [['/board', 'Bảng ý tưởng'], ['/board/review', 'Chấm lô']]);
  const src = view();
  for (const s of ["'Kết quả'", 'data-attach', 'data-detach', 'data-save-result', 'Để trống nghĩa là chưa biết', 'swapIn(', '#/board/review?batch=', 'learnedHtml(b.learnedFrom)', 'Làm lại video đã đăng']) assert.ok(src.includes(s), s);
  const rv = fs.readFileSync('web/views/board-review.js', 'utf8');
  for (const s of ["runJob('batch_refresh'", 'data-confirm-close', 'from=redo:', 'không phải luật', 'chưa nhập', 'còn mới', 'không phải nguyên nhân']) assert.ok(rv.includes(s), s);
  assert.ok(!/\bfetch\(/.test(rv));
  assert.match(rv, /import \{[^}]*\besc\b[^}]*\} from '\.\.\/lib\.js'/);
  const client = fs.readFileSync('web/http/client.js', 'utf8');
  for (const name of ['attachVideo:', 'clearVideo:', 'saveResult:', 'review:', 'close:', 'reviewUrl:']) assert.ok(client.slice(client.indexOf('export const ideas')).includes(name), name);
  assert.match(fs.readFileSync('web/lib.js', 'utf8'), /batch_refresh: 'Cập nhật số liệu lô'/);
  assert.match(fs.readFileSync('web/kinds.js', 'utf8'), /j\.kind === 'batch_refresh'\) return `#\/board\/review\?batch=/);
});
