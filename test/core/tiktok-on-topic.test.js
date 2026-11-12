import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classifyOnTopic, keywordCore, topicCountry } from '../../src/core/tiktok/on-topic.js';
import { keywordInText } from '../../src/core/analysis/topic.js';

// 145 real videos, labelled by hand: R on topic, P adjacent (study/travel/life in the US), N off topic.
const FX = JSON.parse(fs.readFileSync('test/fixtures/tiktok-on-topic.json', 'utf8'));

function score(set, keep) {
  const R = set.videos.filter((v) => v.label === 'R');
  const kept = set.videos.filter((v, i) => keep[i]);
  return { recall: kept.filter((v) => v.label === 'R').length / R.length, offTopic: kept.filter((v) => v.label === 'N').length };
}

for (const set of FX.sets) {
  test(`on-topic rule on "${set.source}": keeps ≥ 94% of on-topic videos, lets ≤ 1 off-topic one through`, () => {
    const verdicts = classifyOnTopic(set.videos, [set.keyword]);
    const now = score(set, verdicts.map((v) => v.onTopic));
    const old = score(set, set.videos.map((v) => keywordInText(`${v.caption} ${v.hashtags.join(' ')}`, [set.keyword])));
    assert.ok(now.recall >= 0.94, `recall ${now.recall}`);
    assert.ok(now.offTopic <= 1, `off-topic kept ${now.offTopic}`);
    assert.ok(now.recall > old.recall, `better than the exact-phrase rule (${old.recall})`);
  });
}

test('the 1.3M "nhập cư bất hợp pháp" video and JISOO for "Di Trú Mỹ - Vogue" get the right verdicts', () => {
  const scan = FX.sets[2].videos;
  const v = classifyOnTopic(scan, ['di trú mỹ']);
  const at = (re) => v[scan.findIndex((x) => re.test(x.caption))];
  assert.equal(at(/Tin vui cho nhập cư bất hợp pháp/).onTopic, true);
  assert.equal(at(/JISOO/).onTopic, false);
  assert.equal(at(/JISOO/).reason, 'no-match');
});

test('another country is out: Canada, "sang Úc", #dinhcuduc; "mới nhất" and "cập nhật" are not Japan', () => {
  const vids = [
    { caption: 'Bảo lãnh vợ chồng sang Canada', hashtags: ['baolanhvochong'] },
    { caption: 'bảo lãnh vợ chồng đi Úc nhanh', hashtags: [] },
    { caption: 'Đoàn tụ gia đình bảo lãnh vợ chồng', hashtags: ['baolanhduc', 'dinhcuduc'] },
    { caption: 'Cập nhật mới nhất bảo lãnh vợ chồng', hashtags: [] },
  ];
  assert.deepEqual(classifyOnTopic(vids, ['bảo lãnh vợ chồng']).map((x) => [x.onTopic, x.reason]), [[false, 'other-country'], [false, 'other-country'], [false, 'other-country'], [true, null]]);
});

test('a topic about Japan keeps Japan and drops Korea', () => {
  assert.equal(topicCountry('du học nhật'), 'japan');
  assert.equal(topicCountry('thi quốc tịch mỹ mới nhất'), 'us');
  const v = classifyOnTopic([{ caption: 'Du học Nhật Bản cần gì', hashtags: [] }, { caption: 'Du học Hàn Quốc 2026', hashtags: [] }], ['du học nhật']);
  assert.deepEqual(v.map((x) => x.onTopic), [true, false]);
});

test('keyword core: country and freshness words dropped, words kept apart', () => {
  assert.deepEqual(keywordCore('di trú mỹ'), ['di', 'tru']);
  assert.deepEqual(keywordCore('Thi quốc tịch Mỹ 2026 mới nhất'), ['thi', 'quoc', 'tich']);
  assert.deepEqual(keywordCore('du học nhật'), ['du', 'hoc']);
  assert.deepEqual(keywordCore('mỹ'), ['my'], 'never empty');
});

test('hashtags learned from the topic bring in videos without the keyword, generic tags do not', () => {
  const on = (caption, hashtags) => ({ caption, hashtags });
  const vids = [
    on('di trú mỹ 1', ['dinhcumy', 'thexanhmy', 'fyp']), on('di trú mỹ 2', ['dinhcumy', 'thexanhmy', 'fyp']),
    on('Ông Trump siết thẻ xanh', ['dinhcumy', 'thexanhmy']), on('Nhảy vui', ['fyp', 'viral']), on('Nhận thẻ xanh định cư Mỹ trong 2 tháng', ['thexanhmy']),
  ];
  assert.deepEqual(classifyOnTopic(vids, ['di trú mỹ']).map((x) => x.via), ['keyword', 'keyword', 'hashtags', null, 'hashtags']);
});
