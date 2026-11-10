// Guard against the v0 view/sub field name creeping back into the web UI (final-review finding 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));

test('web UI reads viewSub, never the v0 `outlier` field', () => {
  const hits = walk('web')
    .filter((f) => !f.endsWith(path.join('web', 'lib.js'))) // lib.js migrates old localStorage keys on purpose
    .flatMap((f) => fs.readFileSync(f, 'utf8').split('\n').map((l, i) => [f, i + 1, l]))
    .filter(([, , l]) => /\.outlier\b/.test(l))
    .map(([f, n]) => `${f}:${n}`);
  assert.deepEqual(hits, []);
});
