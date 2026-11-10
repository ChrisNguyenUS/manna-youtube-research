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
