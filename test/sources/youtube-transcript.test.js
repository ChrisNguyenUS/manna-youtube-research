import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { segmentsFromRows, createTranscriptReader } from '../../src/sources/innertube/transcript.js';

test('rows become segments: clock text to seconds, each ending where the next starts; unreadable rows are dropped', () => {
  const segs = segmentsFromRows([{ time: '0:00', text: ' Xin chào ' }, { time: '0:04', text: 'hôm nay\nmình kể' }, { time: 'x', text: 'rác' }, { time: '1:02:03', text: 'kết' }, { time: '1:02:05', text: '' }]);
  assert.deepEqual(segs, [{ start: 0, end: 4, text: 'Xin chào' }, { start: 4, end: 3723, text: 'hôm nay mình kể' }, { start: 3723, end: null, text: 'kết' }]);
  assert.deepEqual(segmentsFromRows([]), []);
});

test('the captured panel still has the two things the reader looks for', () => {
  const html = fs.readFileSync('src/sources/innertube/fixtures/transcript-panel.html', 'utf8');
  assert.ok((html.match(/<transcript-segment-view-model/g) ?? []).length >= 5);
  assert.match(html, /ytwTranscriptSegmentViewModelTimestamp"?>\d+:\d\d</);
  assert.match(html, /<span[^>]*role="text"[^>]*>[^<]+</);
});

/** A fake Playwright: one page whose locators answer from a script. */
function fakePlaywright({ rows, hasButton = true, launchFails = false }) {
  const calls = [];
  const locator = (sel) => ({
    first: () => locator(sel),
    count: async () => (sel.includes('transcript-section') ? (hasButton ? 1 : 0) : 0),
    click: async () => void calls.push(`click ${sel}`),
  });
  const page = {
    goto: async (url) => void calls.push(`goto ${url}`),
    locator,
    waitForSelector: async (sel) => { if (!rows) throw new Error(`timeout ${sel}`); },
    evaluate: async () => rows,
  };
  const context = { newPage: async () => page, close: async () => void calls.push('context closed') };
  const browser = { newContext: async () => context, close: async () => void calls.push('browser closed') };
  return { calls, load: async () => ({ chromium: { launch: async () => { if (launchFails) throw new Error('Executable doesn\'t exist'); return browser; } } }) };
}

test('reader: opens the watch page, opens the panel, returns the transcript and closes the page', async () => {
  const pw = fakePlaywright({ rows: [{ time: '0:00', text: 'Xin chào' }, { time: '0:03', text: 'các bạn' }] });
  const reader = createTranscriptReader({ loadPlaywright: pw.load, idleMs: 10 });
  const t = await reader.read('dQw4w9WgXcQ');
  assert.deepEqual(t, { language: null, kind: 'auto', segments: [{ start: 0, end: 3, text: 'Xin chào' }, { start: 3, end: null, text: 'các bạn' }] });
  assert.match(pw.calls[0], /^goto https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ&hl=en$/);
  assert.ok(pw.calls.includes('context closed'));
  await reader.close();
  assert.ok(pw.calls.includes('browser closed'));
});

test('reader: no transcript button is "no transcript"; a panel that never fills is source_changed; no Chromium is setup_required (Review Focus #5)', async () => {
  const none = createTranscriptReader({ loadPlaywright: fakePlaywright({ rows: [], hasButton: false }).load });
  assert.equal(await none.read('dQw4w9WgXcQ'), null);
  const changed = createTranscriptReader({ loadPlaywright: fakePlaywright({ rows: null }).load });
  await assert.rejects(changed.read('dQw4w9WgXcQ'), (/** @type {any} */ e) => e.code === 'source_changed');
  const empty = createTranscriptReader({ loadPlaywright: fakePlaywright({ rows: [] }).load });
  await assert.rejects(empty.read('dQw4w9WgXcQ'), (/** @type {any} */ e) => e.code === 'source_changed');
  const missing = createTranscriptReader({ loadPlaywright: fakePlaywright({ rows: [], launchFails: true }).load });
  await assert.rejects(missing.read('dQw4w9WgXcQ'), (/** @type {any} */ e) => e.code === 'setup_required' && /setup:tiktok/.test(e.message));
  const noModule = createTranscriptReader({ loadPlaywright: async () => { throw new Error('Cannot find package playwright'); } });
  await assert.rejects(noModule.read('dQw4w9WgXcQ'), (/** @type {any} */ e) => e.code === 'setup_required');
});
