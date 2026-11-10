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
