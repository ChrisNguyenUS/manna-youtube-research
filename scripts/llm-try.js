// Run the 5W1H pipeline on the same collected comments with several models, to choose the default by reading the
// results side by side. Costs real money (a few cents). Saves nothing to the database.
// Use a COPY of the data folder (the app may be running on the real one):
//   cp -R data /tmp/ytr-try && YTR_DATA_DIR=/tmp/ytr-try npm run llm:try -- 7000…001,7000…002 deepseek/deepseek-v4.1-flash-1017 z-ai/glm-5.3-flash
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { ROOT, loadConfig } from '../src/config.js';
import { makeComment5w1h } from '../src/features/ai/comment-5w1h.js';
import { fiveWMarkdown } from '../src/core/report/five-w.js';

const [videos, ...models] = process.argv.slice(2);
if (!videos || !models.length) {
  console.error('Cách dùng: npm run llm:try -- <id video, cách nhau bằng dấu phẩy> <model> [<model>…]');
  process.exit(2);
}
if (path.resolve(loadConfig().dataDir) === path.join(ROOT, 'data')) {
  console.error('Đang trỏ vào thư mục data thật. Chạy trên bản sao: cp -R data /tmp/ytr-try && YTR_DATA_DIR=/tmp/ytr-try npm run llm:try -- …');
  process.exit(2);
}
const app = createApp();
if (!app.llm.ready()) {
  console.error('Chưa có API key OpenRouter trong Cài đặt của thư mục dữ liệu này.');
  await app.close();
  process.exit(2);
}
const readComments = (ids) => app.features.commentData.comments(ids);
const knowledge = fs.existsSync(path.join(ROOT, 'src/features/ai/knowledge')) ? fs.readdirSync(path.join(ROOT, 'src/features/ai/knowledge')).filter((f) => f.endsWith('.md')).sort().map((f) => fs.readFileSync(path.join(ROOT, 'src/features/ai/knowledge', f), 'utf8')).join('\n\n---\n\n') : '';
const rows = [];
const parts = [];
for (const model of models) {
  const saved = new Map();
  const records = { add: (kind, title, o) => (saved.set(1, { id: 1, kind, title, created_at: Date.now(), ...o }), 1), get: (id) => saved.get(id), update: (id, data) => void (saved.get(id).data = data) };
  const f = makeComment5w1h({ llm: app.llm, readComments, records, knowledge, settings: () => ({ aiTagModel: model, aiWriteModel: model }) });
  const t0 = Date.now();
  try {
    await f.run({ videos }, (p) => process.stdout.write(`\r${model}: ${p.step} ${p.done ?? ''}/${p.total ?? ''}   `));
    const r = f.report(1);
    const c = r.data.counts;
    rows.push({ model, 'giây': Math.round((Date.now() - t0) / 1000), 'gửi': c.sent, 'gắn được %': Math.round((c.tagged / c.sent) * 100), 'lô lỗi': c.failedBatches, 'mã sai': c.badTags, 'dẫn sai': c.badRefs, 'gợi ý': r.data.ideas?.length ?? 0, token: r.data.usage.tokensIn + r.data.usage.tokensOut, usd: r.data.usage.costUsd, 'tổng hợp': r.data.summaryError ? `lỗi: ${r.data.summaryError}` : 'ok' });
    parts.push(`<!-- ===== ${model} ===== -->\n\n${fiveWMarkdown({ ...r, title: `${model} · ${r.title}` })}`);
  } catch (e) {
    rows.push({ model, 'giây': Math.round((Date.now() - t0) / 1000), 'tổng hợp': `hỏng: ${e.code || ''} ${e.message}` });
  }
  process.stdout.write('\n');
}
console.table(rows);
fs.mkdirSync(path.join(ROOT, 'output'), { recursive: true });
const file = path.join(ROOT, 'output', `llm-try-${new Date().toISOString().replace(/[:.]/g, '-')}.md`);
fs.writeFileSync(file, parts.join('\n\n---\n\n'));
console.log(`Đọc và so các báo cáo ở: ${file}`);
await app.close();
