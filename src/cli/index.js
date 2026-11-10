// CLI for the nghien-cuu-youtube skill: run research without opening the UI.
//   node src/cli/index.js research "chủ đề" --keywords "kw1, kw2" [--direction top|trend|keyword] [--upload week|month|year|any]
//        [--min 4 --max 20 (phút)] [--per 40] [--gl VN] [--competitors "@a,@b"] [--comments 5] [--comment-max 50]
//   node src/cli/index.js channel "@handle"
//   node src/cli/index.js comments <videoUrl...> [--max 100]
//   node src/cli/index.js ideas "ý tưởng 1" "ý tưởng 2"
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../config.js';
import { createApp } from '../app.js';
import { researchMarkdown, channelMarkdown, commentsMarkdown } from '../core/report/markdown.js';

const app = createApp();
const svc = app.features;
const records = { get: (id) => app.store.records.get(app.ws, id) };

const argv = process.argv.slice(2);
const cmd = argv.shift();
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const k = argv[i].slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    flags[k] = v;
  } else pos.push(argv[i]);
}

const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 50);
const day = new Date().toISOString().slice(0, 10);
let last = '';
const progress = (p) => {
  const line = `${p.step}${p.total ? ` ${p.done}/${p.total}` : ''}`;
  if (line !== last) process.stderr.write(`\r\x1b[K${line}`);
  last = line;
};
function write(name, md) {
  const dir = path.join(ROOT, 'output');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, md);
  process.stderr.write('\r\x1b[K');
  console.log(`✔ ${file}`);
}

if (cmd === 'research') {
  const topic = pos.join(' ');
  const r = await svc.research(
    {
      topic,
      keywords: flags.keywords || topic,
      direction: flags.direction || 'top',
      upload: flags.upload,
      minDur: flags.min ? Number(flags.min) * 60 : undefined,
      maxDur: flags.max ? Number(flags.max) * 60 : undefined,
      perKeyword: flags.per ? Number(flags.per) : 40,
      gl: flags.gl,
      competitors: flags.competitors,
      comments: flags.comments ? { top: Number(flags.comments), max: Number(flags['comment-max']) || 50 } : null,
    },
    progress,
  );
  write(`${slug(r.topic)}-${day}.digest.md`, researchMarkdown(records.get(r.id).data));
  console.log(`Báo cáo #${r.id} cũng có trong app (Nghiên cứu chủ đề).`);
} else if (cmd === 'channel') {
  const r = await svc.analyzeChannel(pos[0], { max: Number(flags.max) || 120 }, progress);
  write(`kenh-${slug(r.info.handle || r.info.title)}-${day}.digest.md`, channelMarkdown(r));
} else if (cmd === 'comments') {
  const r = await svc.fetchComments({ videos: pos, max: Number(flags.max) || 100, sort: flags.sort || 'top', replies: !!flags.replies }, progress);
  for (const j of r.jobs) write(`comment-${j.video.id}-${day}.md`, commentsMarkdown(records.get(j.id).data));
} else if (cmd === 'ideas') {
  const r = await svc.keywordScores({ keywords: pos, gl: flags.gl }, progress);
  process.stderr.write('\r\x1b[K');
  for (const x of r.results) console.log(x.error ? `lỗi: ${x.error} — ${x.keyword}` : `điểm ${String(x.overall).padStart(3)} (volume ${x.volume}, cạnh tranh ${x.competition}) · ${x.verdict.padEnd(11)} · view TB ${Math.round(x.stats.avgViews ?? 0)} · sub TB ${Math.round(x.stats.avgSubs ?? 0)} · mới 7 ngày ${x.stats.added7d}/${x.stats.results} — ${x.keyword}`);
} else {
  console.log('Lệnh: research | channel | comments | ideas  (xem đầu file src/cli/index.js)');
  process.exit(1);
}
process.exit(0);
