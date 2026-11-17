# Video watch spike (phase 8) Plan

> **For agentic workers:** this is a spike, not a feature. Follow it step by step with superpowers:executing-plans. The scripts are throwaway: they live in `/tmp/ytr-video-spike/`, outside the repository, and are deleted at the end. The only thing committed is the report.

**Goal:** Answer, with 5 real Vietnamese TikTok videos, whether the app can download video files and whether a cheap model on OpenRouter sees and hears them well enough to fill the three empty bricks of the library (Visual Format, Key Visuals, Audio), and at what cost.

**Approach:** Three small Node scripts with no dependencies (Node 22 `fetch`, plus `ffmpeg`/`ffprobe` already in `/opt/homebrew/bin`): `fetch.mjs` downloads the videos, `ask.mjs` sends each video to each model with the same eleven questions, `score.mjs` compares the answers with the owner's own. Then a report and a decision.

**Spec:** `docs/superpowers/specs/2026-11-16-video-watch-spike.md`

## Global Constraints

- Nothing in `src/`, `web/` or `test/` changes. No package is installed. Scripts and videos stay in `/tmp/ytr-video-spike/` and are deleted in Task 5.
- The OpenRouter key is passed as the environment variable `OPENROUTER_API_KEY` in the owner's own terminal. It is never written to a file, a log or the report.
- Budget: at most 0.50 USD for the whole spike. If the first video on a model costs more than 0.05 USD, stop that model and write it down.
- Models (prices read from OpenRouter on 2026-11-17, USD per million tokens in/out):
  - `xiaomi/mimo-v2.6-flash`: hình + tiếng, 0.14 / 0.28
  - `z-ai/glm-5.3-flash`: hình only, 0.04 / 0.078
  - `qwen/qwen3.8-omni-flash`: hình + tiếng, 0.15 / 0.47
  - `google/gemini-3.1-flash-lite`: hình + tiếng, 0.25 / 1.5, as the reference
- Videos are sent as `data:video/mp4;base64,…` in a `video_url` content part. A file over 8 MB is shrunk to 480p first.
- Decision rule (from the spec, the owner may change it before Task 3):
  - Hình + Chữ + Nhịp right on at least 80% (28 of 35 answers) and under 0.01 USD per video → write a spec for the Visual Format and Key Visuals bricks.
  - Tiếng also right on at least 80% (16 of 20) → add the Audio brick.
  - Downloads fail often, or the models are often wrong → the three bricks stay typed by the owner; write down the date and the models, to try again with newer ones.
  - Right but expensive → the brick runs only when the owner presses a button for one video, never for a whole batch.
- Report text in Vietnamese, plain and exact. Numbers come from `fetch.json`, `results.json` and `score.md`, never from memory.

## What could go wrong

1. **TikTok refuses the file (HTTP 403) even with the page's cookies.** Then automatic download is a "no" for today. For the model test only, the owner saves the 5 videos by hand into the folder (Task 2, Step 3), so the rest of the spike still runs.
2. **A model rejects `video_url` or strict JSON.** `ask.mjs` falls back to JSON mode, then to no format; an error is recorded per video and counted in "Lỗi gọi". A model that fails on all 5 is a "không nhận video qua OpenRouter".
3. **Free-text answers judged wrong by the word rule** (a right answer in other words). The owner reads the per-question table in `score.md` and corrects the count in the report by hand, saying how many were changed.
4. **A video longer than about 90 seconds** costs more and may hit limits. Pick videos of 30 to 60 seconds.

---

### Task 1: The owner's part, before anything runs

- [ ] **Step 1: Pick 5 TikTok videos** of 30 to 60 seconds, in Vietnamese, one of each kind: quay mặt nói; có chữ lớn trên màn hình; nhiều cảnh cắt nhanh; có nhạc nền; lồng tiếng máy (AI). Optionally one YouTube Short link for Task 2, Step 4.

- [ ] **Step 2: Write the answers before seeing any model's answer.** Create `/tmp/ytr-video-spike/answers.json`, one entry per video id (the long number in the link), all values as text:

```json
{
  "7400000000000000001": {
    "people": "1",
    "setting": "trong phòng",
    "shot": "cận mặt",
    "firstText": "3 lỗi khi phỏng vấn",
    "subtitles": "có",
    "cuts": "12",
    "firstSceneSec": "3",
    "music": "có",
    "voice": "nữ",
    "voiceKind": "thật",
    "firstLine": "Đừng nói câu này khi phỏng vấn quốc tịch"
  }
}
```

The eleven questions, in four groups:

| Nhóm | Khoá | Câu hỏi | Cách chấm |
|---|---|---|---|
| Hình | `people` | Mấy người xuất hiện | đúng số |
| Hình | `setting` | Bối cảnh chính | trùng ít nhất nửa số chữ |
| Hình | `shot` | Góc quay chính (cận mặt, nửa người, toàn thân, quay màn hình, cảnh minh hoạ) | trùng ít nhất nửa số chữ |
| Chữ | `firstText` | Dòng chữ lớn đầu tiên, nguyên văn | có ít nhất 60% số chữ |
| Chữ | `subtitles` | Có phụ đề chạy theo lời không | có/không khớp |
| Nhịp | `cuts` | Số lần chuyển cảnh | lệch tối đa 2 |
| Nhịp | `firstSceneSec` | Cảnh đầu dài mấy giây | lệch tối đa 1 |
| Tiếng | `music` | Có nhạc nền không | có/không khớp |
| Tiếng | `voice` | Giọng nam, nữ, hay không có | trùng ít nhất nửa số chữ |
| Tiếng | `voiceKind` | Giọng thật hay giọng máy | trùng ít nhất nửa số chữ |
| Tiếng | `firstLine` | Câu nói đầu tiên, nguyên văn | có ít nhất 60% số chữ |

- [ ] **Step 3: Agree to the budget** (at most 0.50 USD) and, if wanted, change the decision rule above.

---

### Task 2: Can the app download the videos?

**Files (all in `/tmp/ytr-video-spike/`, never committed):** `fetch.mjs`, `videos.txt`, then `<id>.mp4`, `fetch.json`.

- [ ] **Step 1: Make the folder and the script**

```bash
mkdir -p /tmp/ytr-video-spike && cd /tmp/ytr-video-spike
```

Create `fetch.mjs`:

```js
// SPIKE, throwaway. Downloads the TikTok videos listed in videos.txt (one link per line) into this folder, the way a
// browser would: load the page, keep its cookies, take the video address from the page data, fetch it with them.
// Writes <id>.mp4 (and <id>.small.mp4 when over 8 MB), and fetch.json with time, size and length of each.
//   node fetch.mjs
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_BYTES = 8 * 1024 * 1024;
const links = fs.readFileSync('videos.txt', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const out = [];

/** Cookies a response sets, as one Cookie header (name=value only). */
const cookiesOf = (res) => (res.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const seconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

for (const link of links) {
  const t0 = Date.now();
  const row = { link, id: null, ok: false, ms: 0, bytes: 0, seconds: null, file: null, step: '' };
  try {
    row.step = 'trang video';
    const page = await fetch(link, { headers: { 'user-agent': UA, 'accept-language': 'vi-VN,vi;q=0.9' }, redirect: 'follow' });
    const html = await page.text();
    const json = html.match(/<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
    if (!json) throw new Error(`không thấy dữ liệu trang (HTTP ${page.status})`);
    const item = JSON.parse(json).__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
    if (!item) throw new Error('trang không có video (riêng tư, đã xoá, hoặc bị chặn)');
    row.id = item.id;
    const v = item.video ?? {};
    const src = v.playAddr || v.downloadAddr || v.bitrateInfo?.[0]?.PlayAddr?.UrlList?.[0];
    if (!src) throw new Error('trang không có địa chỉ file video');
    row.step = 'file video';
    const res = await fetch(src, { headers: { 'user-agent': UA, referer: 'https://www.tiktok.com/', cookie: cookiesOf(page), range: 'bytes=0-' } });
    if (!res.ok) throw new Error(`file video trả về HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    row.file = `${item.id}.mp4`;
    fs.writeFileSync(row.file, buf);
    row.bytes = buf.length;
    row.seconds = seconds(row.file);
    if (buf.length > MAX_BYTES) {
      row.step = 'thu nhỏ';
      const small = `${item.id}.small.mp4`;
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', row.file, '-vf', 'scale=-2:480', '-c:v', 'libx264', '-crf', '30', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '64k', small]);
      row.file = small;
      row.bytes = fs.statSync(small).size;
    }
    row.ok = true;
    row.step = 'xong';
  } catch (e) {
    row.step = `lỗi ở ${row.step}: ${e.message}`;
  }
  row.ms = Date.now() - t0;
  out.push(row);
  console.log(`${row.ok ? 'OK ' : 'LỖI'} ${row.id ?? link} · ${row.step} · ${(row.bytes / 1e6).toFixed(1)} MB · ${row.seconds ?? '?'} giây video · ${(row.ms / 1000).toFixed(1)} giây tải`);
}
fs.writeFileSync('fetch.json', JSON.stringify(out, null, 2));
```

Create `videos.txt` with the 5 links, one per line.

- [ ] **Step 2: Run it**

Run: `cd /tmp/ytr-video-spike && node fetch.mjs`
Expected: one line per video, `OK` with size, length and download time, or `LỖI` with the step that failed. Write down for the report: how many of 5 downloaded, the slowest time, and every error as printed.

- [ ] **Step 3: If some failed, save those by hand** (only so the model test can run; automatic download stays "no" for them). Save the file from TikTok into the folder as `<id>.mp4`, then add its row to `fetch.json`:

```json
{ "link": "…", "id": "<id>", "ok": true, "ms": 0, "bytes": 0, "seconds": 45, "file": "<id>.mp4", "step": "tải tay" }
```

- [ ] **Step 4 (optional): YouTube.** The app has no YouTube downloader and this spike does not add one. Check only whether a model takes a YouTube link directly (OpenRouter says Gemini does):

```bash
curl -s https://openrouter.ai/api/v1/chat/completions -H "authorization: Bearer $OPENROUTER_API_KEY" -H 'content-type: application/json' -d '{"model":"google/gemini-3.1-flash-lite","usage":{"include":true},"messages":[{"role":"user","content":[{"type":"text","text":"Mô tả 3 cảnh đầu và câu nói đầu tiên của video này, bằng tiếng Việt."},{"type":"video_url","video_url":{"url":"<YOUTUBE_SHORT_LINK>"}}]}]}' | head -c 2000
```

Write down: did it answer, is the description right, what did it cost (`usage.cost`).

---

### Task 3: Ask the models

- [ ] **Step 1: Create `ask.mjs`**

```js
// SPIKE, throwaway. Sends each downloaded video to each model through OpenRouter with the same eleven questions and
// keeps the answers, tokens, cost and time in results.json. Costs real money (a few cents in all).
//   OPENROUTER_API_KEY=… node ask.mjs xiaomi/mimo-v2.6-flash z-ai/glm-5.3-flash …
// The key is read from the environment only and never written anywhere.
import fs from 'node:fs';

const KEY = process.env.OPENROUTER_API_KEY;
const models = process.argv.slice(2);
if (!KEY || !models.length) {
  console.error('Cách dùng: OPENROUTER_API_KEY=… node ask.mjs <model> [<model>…]');
  process.exit(2);
}
const QUESTIONS = [
  ['people', 'Có bao nhiêu người xuất hiện trong video? Trả lời một con số.'],
  ['setting', 'Bối cảnh chính ở đâu? Một cụm ngắn, ví dụ: trong phòng, văn phòng, ngoài đường, xe hơi, màn hình máy tính.'],
  ['shot', 'Góc quay chính là gì? Một trong: cận mặt, nửa người, toàn thân, quay màn hình, cảnh minh hoạ.'],
  ['firstText', 'Dòng chữ lớn đầu tiên hiện trên màn hình (không tính phụ đề) là gì? Chép nguyên văn; không có thì ghi "không có".'],
  ['subtitles', 'Có phụ đề chạy theo lời nói không? "có" hoặc "không".'],
  ['cuts', 'Video có bao nhiêu lần chuyển cảnh (cắt sang khung hình khác)? Trả lời một con số.'],
  ['firstSceneSec', 'Cảnh đầu tiên dài khoảng bao nhiêu giây trước lần cắt đầu? Trả lời một con số.'],
  ['music', 'Có nhạc nền không? "có" hoặc "không".'],
  ['voice', 'Giọng nói chính là giọng gì? Một trong: nam, nữ, không có giọng nói.'],
  ['voiceKind', 'Giọng nói là người thật nói hay giọng máy (AI, đọc tự động)? Một trong: thật, máy, không có.'],
  ['firstLine', 'Câu nói đầu tiên trong video là gì? Chép nguyên văn bằng tiếng Việt; không có lời thì ghi "không có".'],
];
const SYSTEM = 'Bạn xem và nghe một video ngắn rồi trả lời từng câu hỏi. Chỉ trả lời theo những gì thật sự thấy và nghe được trong video. Không đoán: không chắc thì ghi "không rõ". Trả về JSON đúng các khoá được hỏi, giá trị là chuỗi.';
const SCHEMA = { type: 'object', additionalProperties: false, required: QUESTIONS.map(([k]) => k), properties: Object.fromEntries(QUESTIONS.map(([k]) => [k, { type: 'string' }])) };
const ask = QUESTIONS.map(([k, q]) => `${k}: ${q}`).join('\n');

const videos = JSON.parse(fs.readFileSync('fetch.json', 'utf8')).filter((v) => v.ok);
const results = fs.existsSync('results.json') ? JSON.parse(fs.readFileSync('results.json', 'utf8')) : [];
const done = new Set(results.filter((r) => !r.error).map((r) => `${r.model}|${r.id}`));

/** One call; a model that refuses strict JSON schema is asked again with plain JSON mode. */
async function call(model, dataUrl, format) {
  const body = {
    model, usage: { include: true }, reasoning: { enabled: false },
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: [{ type: 'text', text: ask }, { type: 'video_url', video_url: { url: dataUrl } }] }],
    ...(format === 'schema' ? { response_format: { type: 'json_schema', json_schema: { name: 'answer', strict: true, schema: SCHEMA } } } : format === 'json' ? { response_format: { type: 'json_object' } } : {}),
  };
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(300_000) });
  const text = await res.text();
  if (!res.ok) return { status: res.status, error: text.slice(0, 400) };
  return { status: res.status, data: JSON.parse(text) };
}

for (const model of models) {
  for (const v of videos) {
    if (done.has(`${model}|${v.id}`)) continue;
    const dataUrl = `data:video/mp4;base64,${fs.readFileSync(v.file).toString('base64')}`;
    const t0 = Date.now();
    const row = { model, id: v.id, seconds: v.seconds, mb: +(v.bytes / 1e6).toFixed(1), ms: 0, format: '', tokensIn: 0, tokensOut: 0, costUsd: null, answer: null, error: null };
    try {
      let r;
      for (const format of ['schema', 'json', 'none']) {
        r = await call(model, dataUrl, format);
        row.format = format;
        if (!(r.status === 400 && /response_format|json_schema|structured/i.test(r.error ?? ''))) break;
      }
      if (r.error) throw new Error(`HTTP ${r.status}: ${r.error}`);
      const content = r.data.choices?.[0]?.message?.content ?? '';
      row.answer = JSON.parse(String(content).replace(/^```(json)?\s*|\s*```$/g, ''));
      const u = r.data.usage ?? {};
      Object.assign(row, { tokensIn: u.prompt_tokens ?? 0, tokensOut: u.completion_tokens ?? 0, costUsd: typeof u.cost === 'number' ? u.cost : null });
    } catch (e) {
      row.error = String(e.message).slice(0, 400);
    }
    row.ms = Date.now() - t0;
    const i = results.findIndex((x) => x.model === model && x.id === v.id);
    if (i >= 0) results[i] = row;
    else results.push(row);
    fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
    console.log(`${row.error ? 'LỖI' : 'OK '} ${model} · ${v.id} · ${row.tokensIn} token vào · $${row.costUsd ?? '?'} · ${(row.ms / 1000).toFixed(1)} giây${row.error ? ` · ${row.error.slice(0, 120)}` : ''}`);
  }
}
```

- [ ] **Step 2: One video, one model, to check the cost**

Temporarily keep only the first video in `fetch.json` (copy the file to `fetch.all.json` first), then:

Run: `OPENROUTER_API_KEY=… node ask.mjs xiaomi/mimo-v2.6-flash`
Expected: `OK … token vào · $0.00…`. If it costs more than 0.05 USD, stop and tell the owner before going on. Put `fetch.all.json` back as `fetch.json`.

- [ ] **Step 3: All videos, all four models**

Run: `OPENROUTER_API_KEY=… node ask.mjs xiaomi/mimo-v2.6-flash z-ai/glm-5.3-flash qwen/qwen3.8-omni-flash google/gemini-3.1-flash-lite`
Expected: 20 lines. A run that stops half way can be started again; finished pairs are skipped. The total cost is the sum of `costUsd` in `results.json`:

```bash
node -e "const r=require('./results.json');console.log(r.reduce((n,x)=>n+(x.costUsd||0),0).toFixed(4),'USD')"
```

---

### Task 4: Score

- [ ] **Step 1: Create `score.mjs`**

```js
// SPIKE, throwaway. Compares results.json with the owner's answers.json and writes score.md: right answers per group
// and model, tokens, cost and time, and every answer side by side so the owner can overrule a judgement.
//   node score.mjs
import fs from 'node:fs';

/** [key, group, how it is judged]. */
const RULES = [
  ['people', 'Hình', 'count0'], ['setting', 'Hình', 'words'], ['shot', 'Hình', 'words'],
  ['firstText', 'Chữ', 'text'], ['subtitles', 'Chữ', 'yesno'],
  ['cuts', 'Nhịp', 'count2'], ['firstSceneSec', 'Nhịp', 'count1'],
  ['music', 'Tiếng', 'yesno'], ['voice', 'Tiếng', 'words'], ['voiceKind', 'Tiếng', 'words'], ['firstLine', 'Tiếng', 'text'],
];
const GROUPS = ['Hình', 'Chữ', 'Nhịp', 'Tiếng'];
const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const num = (s) => Number(String(s ?? '').match(/\d+([.,]\d+)?/)?.[0]?.replace(',', '.'));
const words = (s) => new Set(fold(s).split(' ').filter(Boolean));
/** Share of the owner's words the model also has: 1 when every word is there. */
const overlap = (truth, said) => {
  const t = words(truth);
  const s = words(said);
  return t.size ? [...t].filter((w) => s.has(w)).length / t.size : (s.size ? 0 : 1);
};
const YES = (s) => (/^(co|yes)\b/.test(fold(s)) ? 'co' : /^(khong|no)\b/.test(fold(s)) ? 'khong' : '?');

/** @returns {boolean} */
export function judge(how, truth, said) {
  if (how.startsWith('count')) {
    const tol = Number(how.slice(5));
    const a = num(truth);
    const b = num(said);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
  }
  if (how === 'yesno') return YES(truth) !== '?' && YES(truth) === YES(said);
  if (how === 'words') return overlap(truth, said) >= 0.5 || overlap(said, truth) >= 0.5;
  return overlap(truth, said) >= 0.6; // text: most of the owner's words, any order
}

const answers = JSON.parse(fs.readFileSync('answers.json', 'utf8'));
const results = JSON.parse(fs.readFileSync('results.json', 'utf8'));
const models = [...new Set(results.map((r) => r.model))];
const L = ['# Kết quả thử: model xem và nghe video', '', `Ngày ${new Date().toISOString().slice(0, 10)} · ${Object.keys(answers).length} video · ${models.length} model`, ''];
L.push('| Model | ' + GROUPS.join(' | ') + ' | Tổng | Lỗi gọi | Token vào TB | $ mỗi video | Giây mỗi video |', '|---|' + GROUPS.map(() => '---|').join('') + '---|---|---|---|---|');
const detail = [];
for (const model of models) {
  const rows = results.filter((r) => r.model === model);
  const ok = rows.filter((r) => r.answer);
  const right = Object.fromEntries(GROUPS.map((g) => [g, [0, 0]]));
  for (const r of ok) {
    const truth = answers[r.id];
    if (!truth) continue;
    for (const [k, g, how] of RULES) {
      if (truth[k] == null || truth[k] === '') continue;
      const hit = judge(how, truth[k], r.answer[k]);
      right[g][1]++;
      if (hit) right[g][0]++;
      detail.push(`| ${model} | ${r.id} | ${k} | ${String(truth[k]).replace(/\|/g, '/')} | ${String(r.answer[k] ?? '').replace(/\|/g, '/')} | ${hit ? 'đúng' : 'sai'} |`);
    }
  }
  const tot = GROUPS.reduce((a, g) => [a[0] + right[g][0], a[1] + right[g][1]], [0, 0]);
  const avg = (f) => (ok.length ? ok.reduce((n, r) => n + (f(r) ?? 0), 0) / ok.length : 0);
  L.push(`| ${model} | ${GROUPS.map((g) => `${right[g][0]}/${right[g][1]}`).join(' | ')} | ${tot[0]}/${tot[1]} | ${rows.length - ok.length} | ${Math.round(avg((r) => r.tokensIn))} | ${avg((r) => r.costUsd).toFixed(4)} | ${(avg((r) => r.ms) / 1000).toFixed(1)} |`);
}
const errors = results.filter((r) => r.error);
if (errors.length) L.push('', '## Lỗi gọi model', '', ...errors.map((r) => `- ${r.model} · ${r.id}: ${r.error}`));
L.push('', '## Từng câu', '', 'Cách chấm: số người đúng tuyệt đối; số lần cắt lệch tối đa 2; giây cảnh đầu lệch tối đa 1; có/không phải khớp; câu chữ cần có ít nhất 60% số chữ trong đáp án (bỏ dấu, không kể thứ tự). Thấy chấm sai thì sửa tay ở đây và ghi vào báo cáo.', '', '| Model | Video | Câu | Đáp án | Model trả lời | Chấm |', '|---|---|---|---|---|---|', ...detail);
fs.writeFileSync('score.md', L.join('\n') + '\n');
console.log(L.slice(0, 4 + models.length + 2).join('\n'));
```

- [ ] **Step 2: Run it**

Run: `node score.mjs`
Expected: a table, one row per model, with right answers per group (`Hình`, `Chữ`, `Nhịp`, `Tiếng`), errors, average input tokens, dollars and seconds per video. `score.md` has every answer side by side.

- [ ] **Step 3: Read the per-question table with the owner.** Mark the answers the word rule judged wrongly (a right answer in other words, or a lucky match). Note how many were changed and the corrected totals per group.

---

### Task 5: Report, decision, clean up

**Files:**
- Create: `docs/superpowers/specs/2026-11-17-video-watch-results.md`
- Modify: `docs/superpowers/specs/2026-11-16-video-watch-spike.md` (status), `docs/superpowers/plans/2026-11-16-master-plan.md` (row 8)

- [ ] **Step 1: Write the report**

```markdown
# Kết quả thử: model xem và nghe video

> Ngày thử: YYYY-MM-DD · [bản thử nghiệm](2026-11-16-video-watch-spike.md) · Code thử đã xoá

## Kết luận

Một đoạn: làm gì tiếp theo, theo luật quyết định (gạch Visual Format và Key Visuals, gạch Audio, hay để chủ app tự điền), và model nào.

## 1. Tải video

- TikTok: N/5 tải tự động được; chậm nhất X giây; lỗi: … (nguyên văn).
- YouTube: app không có công cụ tải; gửi link thẳng cho Gemini: được / không, đúng / sai, giá …

## 2. Model xem và nghe

(dán bảng đầu của score.md, sau khi đã sửa chấm tay; ghi số câu đã sửa)

## 3. Chi phí

Tổng tiền thật: … USD. Mỗi video 30–60 giây: … USD với model chọn. Token vào trung bình: …

## 4. Điều đáng ngờ

Những chỗ model bịa (chữ trên màn hình không có thật, câu nói sai), và model nào hay bịa.

## 5. Thử lại khi nào

Điều kiện để thử lại (model mới, giá mới), và bộ 5 video cùng đáp án được giữ ở đâu (không giữ trong repo).
```

- [ ] **Step 2: Update the spike's status and the master plan.** In the spike spec header: `Trạng thái: đã thử, xem [kết quả](2026-11-17-video-watch-results.md)`. In the master plan table, row 8: `1 buổi, **đã thử**: <kết luận một dòng>`.

- [ ] **Step 3: Delete the throwaway folder**

```bash
rm -rf /tmp/ytr-video-spike
```

Ask the owner first if they want to keep `answers.json` and the links somewhere outside the repository, for a later retry.

- [ ] **Step 4: Commit the report only**

```bash
git add docs/superpowers/specs/2026-11-17-video-watch-results.md docs/superpowers/specs/2026-11-16-video-watch-spike.md docs/superpowers/plans/2026-11-16-master-plan.md
git commit -m "docs: results of the video watch spike (phase 8)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: If the decision is "yes"**, the next step is a new spec (not this plan): Visual Format and Key Visuals (and Audio) in the brick library, run per video on a button, with the chosen model in a new setting.
