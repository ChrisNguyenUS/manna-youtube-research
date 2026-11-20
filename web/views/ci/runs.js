// Customer Intelligence → Lần phân tích & AI: create a run (choose data, see exactly what will be processed before it
// runs — PRD Stage 0), the history of runs, each stage's status, and the AI usage of a run (PRD §8.6).
import { ci } from '../../http/client.js';
import { esc, icon, fmt, ago, toast, runJob, progressCard, updateProgress, errorCallout } from '../../lib.js';
import { runChip, usd, PLATFORM_VI, loading, reload } from '../../components/ci.js';

const PATH = '/ci/runs';
const STAGES = [['ingest', 'Nhập & chuẩn hoá'], ['classify', 'Phân loại comment'], ['topics', 'Gom chủ đề & nỗi đau'], ['insights', 'Tổng hợp insight']];
const STAGE_TONE = { complete: 'good', partial: 'warn', failed: 'bad', running: 'blue' };
const STAGE_VI = { complete: 'Xong', partial: 'Một phần', failed: 'Lỗi', running: 'Đang chạy' };
const SAMPLE = `source,author,likes,date,text
https://facebook.com/post/1,user1,12,2026-11-01,Hồ sơ của mình đang chờ thì có cần làm gì thêm không?
https://facebook.com/post/1,user2,3,2026-11-02,Mất bao lâu thì tới lượt phỏng vấn vậy mọi người`;

export async function mount(root, params) {
  root.innerHTML = loading();
  const runs = await ci.runs();
  if (params.new || !runs.length) return createScreen(root, runs);
  return historyScreen(root, runs, Number(params.run) || runs[0].id, params.tab || 'stages');
}

function videoList(platform, list) {
  if (!list.length) return `<div class="muted small">Chưa có video ${PLATFORM_VI[platform]} nào có comment. <a href="#${platform === 'tiktok' ? '/tiktok/comments' : '/comments'}">Thu thập comment</a></div>`;
  return `<label class="check small"><input type="checkbox" data-all="${platform}"> Chọn tất cả (${list.length})</label>
    <div class="ci-vlist">${list.map((v) => `<label class="check ci-vrow"><input type="checkbox" data-v="${platform}" value="${esc(v.id)}"><span><b>${esc(v.caption || v.url || v.id)}</b><span class="muted small">${v.author ? `${esc(v.author)} · ` : ''}${fmt(v.total)} comment · ${ago(v.lastSeen)}</span></span></label>`).join('')}</div>`;
}

async function createScreen(root, runs) {
  const av = await ci.available();
  root.innerHTML = `<div class="page-head"><div><h1>${icon('plus')} Lần phân tích mới</h1><p>Chọn dữ liệu, xem trước đúng những gì sẽ được xử lý, rồi chạy. App chỉ dùng comment bạn đã thu thập hoặc tự dán vào; không tự cào thêm.</p></div>${runs.length ? `<a class="btn" href="#${PATH}">${icon('back')} Lịch sử</a>` : ''}</div>
    <form class="ci-create" data-form>
      <section class="card card-pad"><div class="section-label" style="margin-top:0">1. Dữ liệu</div>
        <div class="ci-grid2">
          <div><b>${icon('play')} TikTok</b>${videoList('tiktok', av.tiktok)}</div>
          <div><b>${icon('play')} YouTube</b>${videoList('youtube', av.youtube)}</div>
        </div>
        <details class="ci-manual"><summary><b>Facebook / nguồn khác: dán CSV hoặc JSON</b></summary>
          <div class="row" style="margin:8px 0"><label class="small">Nền tảng mặc định <select class="input" name="manualPlatform">${['facebook', 'instagram', 'tiktok', 'youtube', 'other'].map((p) => `<option value="${p}">${PLATFORM_VI[p]}</option>`).join('')}</select></label></div>
          <textarea class="input" name="manualText" rows="6" placeholder="${esc(SAMPLE)}"></textarea>
          <div class="muted small">Cột nhận được: text/comment/content (bắt buộc), source/url/post, likes, replies, date/created_at, author (app chỉ lưu mã băm, không lưu tên), id, parent_id, platform. Số thiếu để trống, không ghi 0.</div>
        </details>
      </section>
      <section class="card card-pad"><div class="section-label" style="margin-top:0">2. Cấu hình</div>
        <div class="ci-form">
          <label>Tên lần phân tích<input class="input" name="title" placeholder="Tự đặt nếu để trống"></label>
          <label>Ngành / chủ đề<input class="input" name="industry" placeholder="vd: dịch vụ di trú, mỹ phẩm…"></label>
          <label>Tối đa comment<input class="input" type="number" name="maxComments" value="3000" min="10" max="10000"></label>
          <label>Like tối thiểu<input class="input" type="number" name="minLikes" value="0" min="0"></label>
          <label title="Dừng gọi AI khi chi phí thật của lần phân tích chạm mức này">Ngân sách AI (USD)<input class="input" type="number" name="budgetUsd" step="0.01" min="0" placeholder="Không giới hạn"></label>
          <label class="check"><input type="checkbox" name="includeReplies" checked> Gồm cả trả lời</label>
        </div>
      </section>
      <section class="card card-pad"><div class="row between"><div class="section-label" style="margin-top:0">3. Xem trước</div><button type="button" class="btn" data-preview>${icon('eye')} Xem trước dữ liệu</button></div><div data-manifest class="muted small">Chọn dữ liệu rồi bấm Xem trước.</div></section>
      <div class="row"><button type="submit" class="btn primary lg" data-run disabled>${icon('flask')} Tạo & phân tích</button><button type="button" class="btn" data-only disabled>Chỉ tạo (chưa gọi AI)</button>${av.ai ? '' : '<span class="small muted">Chưa có API key OpenRouter: chỉ tạo được, phần AI cần <a href="#/settings">nhập key</a>.</span>'}</div>
      <div data-prog></div>
    </form>`;
  const form = /** @type {HTMLFormElement} */ (root.querySelector('[data-form]'));
  const manifest = /** @type {HTMLElement} */ (root.querySelector('[data-manifest]'));
  const prog = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
  const runBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-run]'));
  const onlyBtn = /** @type {HTMLButtonElement} */ (root.querySelector('[data-only]'));
  const body = () => {
    const fd = new FormData(form);
    const ids = (p) => [...form.querySelectorAll(`[data-v="${p}"]:checked`)].map((x) => /** @type {HTMLInputElement} */ (x).value).join(',');
    return {
      title: fd.get('title'), industry: fd.get('industry'), tiktok: ids('tiktok'), youtube: ids('youtube'), manualText: fd.get('manualText'), manualPlatform: fd.get('manualPlatform'),
      maxComments: Number(fd.get('maxComments')) || 3000, minLikes: Number(fd.get('minLikes')) || 0, includeReplies: fd.get('includeReplies') === 'on', budgetUsd: fd.get('budgetUsd') === '' ? null : Number(fd.get('budgetUsd')),
    };
  };
  let seq = 0;
  async function preview() {
    const mine = ++seq;
    runBtn.disabled = onlyBtn.disabled = true;
    const b = body();
    if (!b.tiktok && !b.youtube && !String(b.manualText ?? '').trim()) return void (manifest.textContent = 'Chọn dữ liệu rồi bấm Xem trước.');
    manifest.textContent = 'Đang đọc…';
    try {
      const p = await ci.preview(b);
      if (mine !== seq) return;
      const sk = p.skipped;
      manifest.innerHTML = `<div class="ci-manifest">
        <div class="ci-kpis ci-kpis4"><div class="ci-kpi"><div><div class="ci-kpi-v">${fmt(p.sources.length)}</div><div class="ci-kpi-l">Nguồn</div></div></div><div class="ci-kpi"><div><div class="ci-kpi-v">${fmt(p.analysable)}</div><div class="ci-kpi-l">Comment sẽ phân tích</div></div></div>
          <div class="ci-kpi"><div><div class="ci-kpi-v">${p.authorsKnown ? 'Có' : 'Không'}</div><div class="ci-kpi-l">Đếm được số người?</div></div></div><div class="ci-kpi" title="Ước lượng thô: ký tự ÷ 3. Chi phí thật lấy từ OpenRouter sau khi chạy."><div><div class="ci-kpi-v">~${fmt(p.workload.approxTokens)}</div><div class="ci-kpi-l">token gửi đi (${fmt(p.workload.classifyBatches)} lô phân loại)</div></div></div></div>
        <table class="t small"><thead><tr><th>Nguồn</th><th>Nền tảng</th><th>Tiêu đề</th><th class="num">Comment</th></tr></thead><tbody>${p.sources.map((s) => `<tr><td>${esc(s.ref)}</td><td>${esc(PLATFORM_VI[s.platform] ?? s.platform)}</td><td>${esc(s.title.slice(0, 80))}</td><td class="num">${fmt(s.comments)}</td></tr>`).join('')}</tbody></table>
        <div class="muted small">Bỏ qua: ${fmt(sk.empty)} comment không có chữ · ${fmt(sk.duplicates)} trùng ID · ${fmt(p.duplicates)} trùng chữ trong cùng nguồn (giữ lại nhưng không phân tích)${sk.replies ? ` · ${fmt(sk.replies)} trả lời` : ''}${sk.lowLikes ? ` · ${fmt(sk.lowLikes)} ít like` : ''}${sk.overLimit ? ` · ${fmt(sk.overLimit)} vượt giới hạn` : ''}</div>
        ${p.manual.errors.length ? `<div class="callout small">${p.manual.errors.map(esc).join('<br>')}</div>` : ''}</div>`;
      runBtn.disabled = !p.analysable || !p.ai;
      onlyBtn.disabled = !p.analysable;
    } catch (e) {
      manifest.innerHTML = errorCallout(e);
    }
  }
  async function create(analyse) {
    runBtn.disabled = onlyBtn.disabled = true;
    try {
      const run = await ci.create(body());
      if (!analyse) return void (location.hash = `#${PATH}?run=${run.id}`);
      prog.innerHTML = progressCard(`Đang phân tích ${run.title}`);
      await runJob('ci_analyze', { runId: run.id, stage: 'all', scope: 'new' }, (p) => updateProgress(prog, p));
      location.hash = `#/ci?run=${run.id}`;
    } catch (e) {
      prog.innerHTML = errorCallout(e);
      runBtn.disabled = onlyBtn.disabled = false;
    }
  }
  form.addEventListener('change', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.matches('[data-all]')) form.querySelectorAll(`[data-v="${t.dataset.all}"]`).forEach((x) => { /** @type {HTMLInputElement} */ (x).checked = t.checked; });
    runBtn.disabled = onlyBtn.disabled = true;
    manifest.textContent = 'Dữ liệu đã đổi: bấm Xem trước.';
  });
  form.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    if (t.closest('[data-preview]')) preview();
    if (t.closest('[data-only]')) create(false);
  });
  form.addEventListener('submit', (e) => (e.preventDefault(), create(true)));
}

async function historyScreen(root, runs, runId, tab) {
  const run = runs.find((r) => r.id === runId) ?? runs[0];
  const u = await ci.usage(run.id);
  const t = u.total;
  root.innerHTML = `<div class="page-head"><div><h1>${icon('clock')} Lần phân tích & AI</h1><p>Lịch sử phân tích, trạng thái từng bước và chi phí AI thật (theo OpenRouter). Chạy lại chỉ bước cần thiết để tiết kiệm.</p></div><a class="btn primary" href="#${PATH}?new=1">${icon('plus')} Lần phân tích mới</a></div>
    <div class="ci-split ci-split-runs">
      <aside class="card"><div class="card-head"><h3>Các lần phân tích</h3></div>${runs.map((r) => `<a class="ci-runrow ${r.id === run.id ? 'on' : ''}" href="#${PATH}?run=${r.id}&tab=${tab}"><b>${esc(r.title)}</b><span class="row small">${runChip(r.status)}<span class="muted">${fmt(r.analysable)} comment · ${usd(r.spentUsd)} · ${ago(r.createdAt)}</span></span></a>`).join('')}</aside>
      <section>
        <div class="card card-pad"><div class="row between"><div><h2 class="ci-h2">${esc(run.title)}</h2><div class="row small muted">${(run.config?.platforms ?? []).map((p) => `<span class="ci-plat ${esc(p)}">${esc(PLATFORM_VI[p] ?? p)}</span>`).join('')}<span>${fmt(run.sources)} nguồn · ${fmt(run.analysable)} comment · ${run.uniqueCommenters == null ? 'không rõ số người' : `${fmt(run.uniqueCommenters)} người`}</span></div></div>
          <div class="row"><a class="btn" href="#/ci?run=${run.id}">${icon('pie')} Mở</a><button type="button" class="btn" data-analyze>${icon('flask')} Phân tích đầy đủ</button><button type="button" class="btn ghost" data-rename>${icon('edit')}</button><button type="button" class="btn ghost danger" data-del>${icon('trash')}</button></div></div>
          <div data-prog></div></div>
        <div class="ci-tabs" role="tablist"><button type="button" role="tab" class="${tab === 'stages' ? 'on' : ''}" data-tab="stages">Các bước</button><button type="button" role="tab" class="${tab === 'usage' ? 'on' : ''}" data-tab="usage">AI Usage</button></div>
        ${tab === 'usage' ? `<div class="ci-kpis">
            <div class="ci-kpi"><div><div class="ci-kpi-v">${usd(t.costUsd)}</div><div class="ci-kpi-l">Chi phí thật</div>${t.costUnknown ? `<div class="ci-kpi-h">${fmt(t.costUnknown)} lần gọi không báo giá: tổng có thể thấp hơn thật</div>` : ''}</div></div>
            <div class="ci-kpi"><div><div class="ci-kpi-v">${fmt(t.calls)}</div><div class="ci-kpi-l">Lần gọi · ${fmt(t.cacheHits)} từ cache</div></div></div>
            <div class="ci-kpi"><div><div class="ci-kpi-v">${fmt(t.tokensIn)} / ${fmt(t.tokensOut)}</div><div class="ci-kpi-l">Token vào / ra</div></div></div>
            <div class="ci-kpi"><div><div class="ci-kpi-v">${fmt(t.errors)}</div><div class="ci-kpi-l">Lỗi / thử lại</div></div></div>
          </div>
          <section class="card"><div class="card-head"><h3>Theo bước</h3><span class="sub">Prompt ${esc(u.promptVersion)} · schema ${esc(u.schemaVersion)} · model: ${u.models.map(esc).join(', ') || '–'}</span></div>
            <table class="t"><thead><tr><th>Bước</th><th class="num">Lần gọi</th><th class="num">Cache</th><th class="num">Token vào</th><th class="num">Token ra</th><th class="num">Chi phí</th><th class="num">Thời gian</th><th class="num">Lỗi</th></tr></thead>
            <tbody>${u.stages.map((s) => `<tr><td>${esc(s.label)}</td><td class="num">${fmt(s.calls)}</td><td class="num">${fmt(s.cacheHits)}</td><td class="num">${fmt(s.tokensIn)}</td><td class="num">${fmt(s.tokensOut)}</td><td class="num">${usd(s.costUsd)}</td><td class="num">${(s.latencyMs / 1000).toFixed(1)}s</td><td class="num">${fmt(s.errors)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Chưa gọi AI.</td></tr>'}</tbody></table></section>
          <section class="card card-pad"><div class="row"><b>Ngân sách AI của lần này</b><input class="input" type="number" step="0.01" min="0" data-budget value="${u.budgetUsd ?? ''}" placeholder="Không giới hạn" style="width:140px"><button type="button" class="btn sm" data-save-budget>Lưu</button><span class="muted small">Khi chi phí thật chạm mức này, app dừng gọi AI và báo.</span></div></section>
          <section class="card"><div class="card-head"><h3>Nhật ký gọi AI</h3><span class="sub">${fmt(u.recent.length)} lần gần nhất</span></div><div class="table-wrap"><table class="t small"><thead><tr><th>Lúc</th><th>Bước</th><th>Task</th><th>Model</th><th class="num">Token</th><th class="num">Chi phí</th><th class="num">ms</th><th>Kết quả</th></tr></thead>
            <tbody>${u.recent.map((g) => `<tr><td>${ago(g.createdAt)}</td><td>${esc(g.stage)}</td><td>${esc(g.task)}</td><td>${esc(g.model ?? '')}</td><td class="num">${g.cacheHit ? 'cache' : `${fmt(g.tokensIn)}/${fmt(g.tokensOut)}`}</td><td class="num">${usd(g.costUsd)}</td><td class="num">${fmt(g.latencyMs)}</td><td>${g.status === 'ok' ? '<span class="badge good">OK</span>' : `<span class="badge bad" title="${esc(g.error ?? '')}">Lỗi</span>`}</td></tr>`).join('')}</tbody></table></div></section>`
        : `<section class="card"><div class="ci-stages">${STAGES.map(([k, l], i) => {
          const s = run.stages?.[k] ?? {};
          const detail = k === 'ingest' ? `${fmt(s.sources)} nguồn · ${fmt(s.comments)} comment${s.duplicates ? ` · ${fmt(s.duplicates)} trùng` : ''}`
            : k === 'classify' ? (s.status ? `${fmt(s.total)} cần phân loại · ${fmt(s.cached ?? 0)} từ cache · ${fmt(s.sent ?? 0)} gửi AI${s.failedBatches ? ` · ${s.failedBatches} lô lỗi` : ''}${s.unlabelled ? ` · ${s.unlabelled} chưa có nhãn` : ''}${s.audit?.fabricated ? ` · loại ${s.audit.fabricated} ID AI tự đặt` : ''}` : '')
            : k === 'topics' ? (s.status ? `${fmt(s.topics)} chủ đề · ${fmt(s.pains)} nỗi đau${s.unclassified ? ` · ${fmt(s.unclassified)} comment chưa vào chủ đề` : ''}` : '')
            : s.status ? `${fmt(s.insights)} insight${s.failedTopics ? ` · ${s.failedTopics} chủ đề lỗi` : ''}` : '';
          return `<div class="ci-stage"><span class="ci-stage-n">${i + 1}</span><div><b>${l}</b><div class="small muted">${detail || 'Chưa chạy'}${s.at ? ` · ${ago(s.at)}` : ''}</div>${s.error ? `<div class="small" style="color:var(--bad)">${esc(s.error)}</div>` : ''}${s.notes?.length ? `<div class="small muted">${s.notes.map(esc).join(' · ')}</div>` : ''}</div>
            <span class="badge ${STAGE_TONE[s.status] ?? 'plain'}">${STAGE_VI[s.status] ?? 'Chưa chạy'}</span>${k === 'ingest' ? '' : `<button type="button" class="btn sm" data-stage="${k}">${icon('refresh')} Chạy bước này</button>`}</div>`;
        }).join('')}</div></section>
        <div class="muted small">Chạy lại "Gom chủ đề" sẽ viết lại nỗi đau, insight và xoá 5 Whys/brief/cơ hội của lần này. Thẻ đã đưa sang Bảng ý tưởng vẫn giữ.</div>`}
      </section>
    </div>`;
  const prog = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
  const analyze = async (stage) => {
    prog.innerHTML = progressCard('Customer Intelligence đang phân tích');
    try {
      await runJob('ci_analyze', { runId: run.id, stage, scope: 'new' }, (p) => updateProgress(prog, p));
      toast('Đã phân tích xong');
      reload();
    } catch (e) {
      prog.innerHTML = errorCallout(e);
    }
  };
  const onClick = async (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    const tb = /** @type {HTMLElement|null} */ (el.closest('[data-tab]'));
    if (tb) return void (location.hash = `#${PATH}?run=${run.id}&tab=${tb.dataset.tab}`);
    if (el.closest('[data-analyze]')) return analyze('all');
    const sb = /** @type {HTMLElement|null} */ (el.closest('[data-stage]'));
    if (sb) {
      if (sb.dataset.stage !== 'classify' && !confirm('Chạy lại bước này sẽ viết lại kết quả phía sau nó (5 Whys/brief/cơ hội của lần này sẽ bị xoá). Tiếp tục?')) return;
      return analyze(sb.dataset.stage);
    }
    if (el.closest('[data-rename]')) {
      const title = prompt('Tên lần phân tích', run.title);
      if (title && title.trim()) (await ci.rename(run.id, title.trim()), reload());
      return;
    }
    if (el.closest('[data-del]')) {
      if (!confirm(`Xoá hẳn “${run.title}” cùng mọi chủ đề, insight, 5 Whys, brief và cơ hội của nó? Không hoàn tác được. (Thẻ đã ở Bảng ý tưởng vẫn giữ.)`)) return;
      await ci.remove(run.id);
      toast('Đã xoá lần phân tích');
      location.hash = `#${PATH}`;
      return;
    }
    if (el.closest('[data-save-budget]')) {
      const v = /** @type {HTMLInputElement} */ (root.querySelector('[data-budget]')).value;
      await ci.budget(run.id, v === '' ? null : Number(v));
      toast('Đã lưu ngân sách');
    }
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
