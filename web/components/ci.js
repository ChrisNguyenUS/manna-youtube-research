// Shared pieces of the Audience Insights screens: which run is open, the run bar above every screen (platforms,
// counts, status, re-analyse, export, AI cost), status chips that keep fact, inference and hypothesis apart, and
// comment rows used as evidence. Components return HTML; the screens bind events.
import { ci } from '../http/client.js';
import { esc, icon, fmt, ago, store, persist, toast, runJob, watchJob, activeJob, progressCard, updateProgress, errorCallout, emptyState } from '../lib.js';

export const PLATFORM_VI = { tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', other: 'Nhập tay' };
export const STATE_VI = { draft: 'Nháp AI', needs_evidence: 'Thiếu bằng chứng', ready_for_analysis: 'Sẵn sàng đào sâu', validated_by_user: 'Đã xác nhận', rejected: 'Đã bác bỏ' };
const STATE_TONE = { draft: 'plain', needs_evidence: 'warn', ready_for_analysis: 'blue', validated_by_user: 'good', rejected: 'bad' };
export const EPI_VI = { observed: 'Quan sát', supported: 'Có bằng chứng', hypothesis: 'Giả thuyết', unverified: 'Chưa kiểm chứng', contradicted: 'Có mâu thuẫn', rejected: 'Đã bác bỏ', needs_input: 'Cần thêm dữ liệu' };
const EPI_TONE = { observed: 'good', supported: 'good', hypothesis: 'purple', unverified: 'plain', contradicted: 'bad', rejected: 'bad', needs_input: 'warn' };
const EPI_TIP = {
  observed: 'Thấy trực tiếp trong dữ liệu hoặc do app đếm',
  supported: 'Diễn giải có comment làm bằng chứng rõ',
  hypothesis: 'Suy luận hợp lý nhưng chưa được comment nào nói thẳng',
  unverified: 'Chưa đủ dữ liệu để xác nhận',
  contradicted: 'Có comment đi ngược nhận định này',
  rejected: 'Bạn đã bác bỏ',
  needs_input: 'Dữ liệu chưa nói tới: cần bạn bổ sung',
};
export const STRENGTH_VI = { strong: 'Mạnh', moderate: 'Vừa', weak: 'Yếu' };
const STRENGTH_TONE = { strong: 'good', moderate: 'blue', weak: 'warn' };
export const RUN_STATUS_VI = { draft: 'Chưa phân tích', queued: 'Đang chờ', running: 'Đang chạy', complete: 'Hoàn tất', partial: 'Một phần', failed: 'Lỗi' };
const RUN_TONE = { draft: 'plain', queued: 'blue', running: 'blue', complete: 'good', partial: 'warn', failed: 'bad' };
export const LABEL_VI = {
  intent: { question: 'Câu hỏi', information_seeking: 'Tìm thông tin', comparison: 'So sánh', recommendation_request: 'Xin gợi ý', service_request: 'Hỏi dịch vụ', complaint: 'Phàn nàn', testimonial: 'Kể trải nghiệm', discussion: 'Thảo luận', other: 'Khác', unknown: 'Chưa rõ' },
  pain: { uncertainty: 'Không chắc chắn', delay: 'Chậm trễ', complexity: 'Phức tạp', cost: 'Chi phí', eligibility: 'Điều kiện', documentation: 'Giấy tờ', trust: 'Niềm tin', access: 'Tiếp cận', outcome_risk: 'Sợ rủi ro', process_confusion: 'Rối quy trình', other: 'Khác', unknown: 'Chưa rõ' },
  emotion: { anxiety: 'Lo lắng', frustration: 'Bực bội', hope: 'Hy vọng', anger: 'Tức giận', relief: 'Nhẹ nhõm', excitement: 'Hào hứng', neutral: 'Trung tính', unknown: 'Chưa rõ' },
  objection: { price: 'Giá', trust: 'Niềm tin', proof: 'Bằng chứng', timing: 'Thời điểm', eligibility: 'Điều kiện', effort: 'Công sức', risk: 'Rủi ro', no_objection: 'Không có', unknown: 'Chưa rõ' },
  buying_signal: { asks_price: 'Hỏi giá', asks_service: 'Hỏi dịch vụ', asks_consultation: 'Xin tư vấn', asks_next_step: 'Hỏi bước tiếp', explicit_purchase: 'Muốn mua', none: 'Không có', unknown: 'Chưa rõ' },
  experience: { first_hand: 'Tự trải qua', second_hand: 'Người quen kể', hearsay: 'Nghe nói', hypothetical: 'Giả định', unclear: 'Không rõ' },
};
export const DIM_VI = { intent: 'Ý định', pain: 'Nỗi đau', emotion: 'Cảm xúc', objection: 'Rào cản', buying_signal: 'Tín hiệu mua', experience: 'Trải nghiệm' };
const LABEL_TONE = { intent: 'blue', pain: 'accent', emotion: 'purple', objection: 'warn', buying_signal: 'good', experience: 'plain' };
const SKIP = new Set(['unknown', 'none', 'no_objection', 'neutral', 'unclear', 'other']);

const badge = (tone, text, tip = '') => `<span class="badge ${tone}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(text)}</span>`;
export const stateChip = (s) => badge(STATE_TONE[s] ?? 'plain', STATE_VI[s] ?? s);
export const epiChip = (s) => (s ? badge(EPI_TONE[s] ?? 'plain', EPI_VI[s] ?? s, EPI_TIP[s]) : '');
export const strengthChip = (s) => (s ? badge(STRENGTH_TONE[s] ?? 'plain', `Bằng chứng ${(STRENGTH_VI[s] ?? s).toLowerCase()}`, 'Độ mạnh bằng chứng do app tính: số comment, số nguồn, đã xét mâu thuẫn chưa. Tách riêng với điểm ưu tiên.') : '');
export const runChip = (s) => badge(RUN_TONE[s] ?? 'plain', RUN_STATUS_VI[s] ?? s);
export const pct = (x) => (x == null ? '–' : `${(Math.round(x * 1000) / 10).toString().replace('.', ',')}%`);
export const usd = (n) => (n == null ? '–' : `$${Number(n).toFixed(n < 0.01 ? 4 : 3)}`);
/** AI confidence is shown as the model's own estimate, never as a probability. */
export const aiConf = (x) => (x == null ? '' : `<span class="ci-conf" title="Mức tự tin của AI (tự ước lượng, không phải xác suất)">AI tự tin ${Math.round(x * 100)}%</span>`);

/** Label chips of a comment, the meaningful ones only, at most `max`. */
export function labelChips(labels, max = 4) {
  if (!labels) return '<span class="muted small">Chưa phân loại</span>';
  const out = [];
  for (const d of ['intent', 'pain', 'emotion', 'buying_signal', 'objection']) for (const v of labels[d] ?? []) if (!SKIP.has(v)) out.push(`<span class="ci-lab ${LABEL_TONE[d]}" title="${esc(DIM_VI[d])}">${esc(LABEL_VI[d]?.[v] ?? v)}</span>`);
  const more = out.length > max ? `<span class="ci-lab plain">+${out.length - max}</span>` : '';
  return out.slice(0, max).join('') + more;
}

/** Evidence ref chips (C12) that open the evidence drawer. */
export const refChips = (refs = [], max = 6) => (refs.length ? `<span class="ci-refs">${refs.slice(0, max).map((r) => `<button type="button" class="ci-ref" data-ref="${esc(r)}" title="Mở comment ${esc(r)}">${esc(r)}</button>`).join('')}${refs.length > max ? `<span class="muted small">+${refs.length - max}</span>` : ''}</span>` : '<span class="muted small">Không có bằng chứng trực tiếp</span>');

/** One comment shown as evidence: exact words, source, numbers (– when unknown), labels, AI summary kept apart. */
export function commentRow(c, { role = '', compact = false, select = false } = {}) {
  if (!c) return '';
  const src = c.source ? `${PLATFORM_VI[c.source.platform] ?? c.source.platform} · ${esc(c.source.ref)}${c.source.title ? ` · ${esc(c.source.title.slice(0, 60))}` : ''}` : '';
  return `<div class="ci-cm${c.irrelevant ? ' off' : ''}" data-cm="${esc(c.ref)}">
    ${select ? `<input type="checkbox" class="ci-cm-sel" data-sel="${esc(c.ref)}" aria-label="Chọn ${esc(c.ref)}">` : ''}
    <div class="ci-cm-main">
      ${c.parentText ? `<div class="ci-cm-parent">↳ trả lời: “${esc(c.parentText)}”</div>` : ''}
      <div class="ci-cm-text">“${esc(c.text)}”</div>
      ${!compact && c.ai?.summary ? `<div class="ci-cm-ai" title="Tóm tắt của AI, không phải lời khách">AI: ${esc(c.ai.summary)}</div>` : ''}
      <div class="ci-cm-meta"><span class="ci-id">${esc(c.ref)}</span>${role ? `<span class="badge ${role === 'contradicts' ? 'bad' : role === 'supports' ? 'good' : 'plain'}">${role === 'contradicts' ? 'Phản bác' : role === 'supports' ? 'Ủng hộ' : 'Ngữ cảnh'}</span>` : ''}
        <span>${icon('heart')} ${c.likes == null ? '–' : fmt(c.likes)}</span>${c.replies != null ? `<span>${icon('message')} ${fmt(c.replies)}</span>` : ''}
        ${c.createdAt ? `<span>${esc(String(c.createdAt).slice(0, 10))}</span>` : ''}<span class="ci-src">${src}</span>
        ${c.source?.url ? `<a href="${esc(c.source.url)}" target="_blank" rel="noopener" class="ci-ext" title="Mở nguồn">${icon('ext')}</a>` : ''}
        ${c.corrected ? '<span class="badge blue">Đã sửa nhãn</span>' : ''}${c.ai?.needsReview ? '<span class="badge warn">Cần xem</span>' : ''}</div>
    </div>
    <div class="ci-cm-labels">${labelChips(c.labels, compact ? 3 : 5)}</div>
  </div>`;
}

/** The run to show: ?run=, else the last one opened, else the newest. Remembered for the other CI screens. */
export async function resolveRun(params) {
  const runs = await ci.runs();
  const want = Number(params.run) || Number(store('ci', { run: 0 }).run) || 0;
  const run = runs.find((r) => r.id === want) ?? runs[0] ?? null;
  if (run) persist('ci', { run: run.id });
  return { runs, run };
}

/** Screen with no run yet: the screen's own title, icon and one line on what it will show. */
export function noRuns(root, title, { iconName = 'pie', sub = 'Phân tích comment TikTok, YouTube, Facebook (nhập tay) thành chủ đề, nỗi đau, nguyên nhân và cơ hội nội dung có bằng chứng.' } = {}) {
  root.innerHTML = `<div class="page-head"><div><h1>${icon(iconName)} ${esc(title)}</h1><p>${esc(sub)}</p></div></div>
    <div class="card card-pad">${emptyState('Chưa có lần phân tích nào', ' Tạo lần phân tích đầu tiên từ comment đã thu thập hoặc dán dữ liệu.')}
    <div class="row" style="justify-content:center;margin-top:8px"><a class="btn primary" href="#/ci/runs?new=1">${icon('plus')} Tạo lần phân tích</a></div></div>`;
}

/** The run bar shown at the top of every CI screen (PRD §5.2). */
export function runBar(run, runs, { title, sub, iconName = 'pie' }) {
  const st = run.stages ?? {};
  const last = Math.max(run.updatedAt ?? 0, ...['classify', 'topics', 'insights'].map((s) => st[s]?.at ?? 0));
  return `<div class="ci-head">
    <div class="ci-head-l"><h1>${icon(iconName)} ${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
    <div class="ci-head-r">
      <a class="ci-usage" href="#/ci/runs?run=${run.id}&tab=usage" title="Chi phí AI thực tế của lần phân tích này (theo OpenRouter)">${icon('bolt')} AI ${usd(run.spentUsd)}</a>
      <label class="ci-runsel"><span class="sr">Lần phân tích</span><select data-run-select>${runs.map((r) => `<option value="${r.id}" ${r.id === run.id ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}</select></label>
      <div class="ci-menu-wrap"><button type="button" class="btn primary" data-reanalyze aria-haspopup="true" aria-expanded="false">${icon('refresh')} Chạy lại</button>
        <div class="ci-menu" data-menu hidden>
          <button type="button" data-stage="classify" data-scope="new"><b>Chỉ phần mới</b><span>Phân loại comment chưa có nhãn (rẻ nhất)</span></button>
          <button type="button" data-stage="all" data-scope="new"><b>Phân tích đầy đủ</b><span>Phân loại phần mới → gom chủ đề → insight</span></button>
          <button type="button" data-stage="classify" data-scope="full"><b>Phân loại lại toàn bộ</b><span>Comment đã có kết quả cùng prompt/model lấy từ cache</span></button>
          <button type="button" data-stage="topics" data-confirm="Gom lại chủ đề sẽ xoá nỗi đau, insight, 5 Whys, brief và cơ hội của lần này (thẻ đã sang Idea Board vẫn giữ). Tiếp tục?"><b>Gom lại chủ đề</b><span>Viết lại chủ đề, nỗi đau và insight</span></button>
          <button type="button" data-stage="insights" data-confirm="Tổng hợp lại sẽ xoá insight, 5 Whys, brief và cơ hội của lần này. Tiếp tục?"><b>Tổng hợp lại insight</b><span>Giữ chủ đề, viết lại insight</span></button>
        </div></div>
      <div class="ci-menu-wrap"><button type="button" class="btn" data-export aria-haspopup="true" aria-expanded="false">${icon('download')} Export</button>
        <div class="ci-menu" data-menu hidden><a href="${ci.exportUrl(run.id, 'md')}"><b>Markdown</b><span>Báo cáo đọc được, có trích dẫn</span></a><a href="${ci.exportUrl(run.id, 'csv')}"><b>CSV</b><span>Comment và nhãn</span></a><a href="${ci.exportUrl(run.id, 'json')}"><b>JSON</b><span>Toàn bộ dữ liệu</span></a></div></div>
    </div>
  </div>
  <div class="ci-runline">
    ${(run.config?.platforms ?? []).map((p) => `<span class="ci-plat ${esc(p)}">${esc(PLATFORM_VI[p] ?? p)}</span>`).join('')}
    <span><b>${fmt(run.sources)}</b> nguồn</span><span><b>${fmt(run.analysable)}</b> comment</span>
    <span title="Chỉ đếm được khi nguồn cho biết tác giả"><b>${run.uniqueCommenters == null ? 'Không rõ' : fmt(run.uniqueCommenters)}</b> người comment</span>
    ${runChip(run.status)}<span class="muted">Cập nhật ${last ? ago(last) : '–'}</span>
  </div>
  <div data-run-progress></div>`;
}

/**
 * Run bar behaviour: switch run, menus, re-analyse (follows the job, then calls onDone). Returns off().
 * @param {HTMLElement} root @param {any} run @param {string} path @param {() => void} onDone
 */
export function bindRunBar(root, run, path, onDone) {
  /** Looked up each time: a screen may draw itself again under the same root. */
  const box = () => /** @type {HTMLElement} */ (root.querySelector('[data-run-progress]') ?? document.createElement('div'));
  const closeMenus = () => root.querySelectorAll('[data-menu]').forEach((m) => { /** @type {HTMLElement} */ (m).hidden = true; m.previousElementSibling?.setAttribute('aria-expanded', 'false'); });
  const follow = async (p) => {
    box().innerHTML = progressCard('Audience Insights đang phân tích');
    try {
      await p;
      box().innerHTML = '';
      toast('Đã phân tích xong');
      onDone();
    } catch (e) {
      box().innerHTML = errorCallout(e);
    }
  };
  const onClick = async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const toggle = t.closest('[data-reanalyze], [data-export]');
    if (toggle) {
      const m = /** @type {HTMLElement} */ (toggle.nextElementSibling);
      const open = m.hidden;
      closeMenus();
      m.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      return;
    }
    const b = /** @type {HTMLElement|null} */ (t.closest('[data-stage]'));
    if (b) {
      closeMenus();
      if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
      follow(runJob('ci_analyze', { runId: run.id, stage: b.dataset.stage, scope: b.dataset.scope || 'new' }, (p) => updateProgress(box(), p)));
      return;
    }
    if (!t.closest('.ci-menu-wrap')) closeMenus();
  };
  const onChange = (e) => {
    const s = /** @type {HTMLSelectElement} */ (e.target);
    if (s.matches('[data-run-select]')) {
      persist('ci', { run: Number(s.value) });
      location.hash = `#${path}?run=${s.value}`;
    }
  };
  const onKey = (e) => e.key === 'Escape' && closeMenus();
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey);
  // A job of this run already running: show it.
  activeJob('ci_analyze').then((j) => {
    if (j && Number(j.params?.runId) === run.id) follow(watchJob(j.id, (p) => updateProgress(box(), p)));
  });
  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    document.removeEventListener('keydown', onKey);
  };
}

/** A callout when the run has not been analysed yet (or only partly). */
export function stageHint(run, need) {
  const st = run.stages?.[need]?.status;
  if (st === 'complete') return '';
  if (st === 'running') return '<div class="callout info">Đang phân tích… kết quả sẽ hiện khi xong.</div>';
  const what = { classify: 'phân loại comment', topics: 'gom chủ đề & nỗi đau', insights: 'tổng hợp insight' }[need];
  if (st === 'failed') return `<div class="callout err-box">Bước ${what} bị lỗi: ${esc(run.stages[need].error ?? '')}. Bấm <b>Chạy lại</b>.</div>`;
  if (st === 'partial') return `<div class="callout">Bước ${what} mới xong một phần. Kết quả bên dưới chưa đủ; bấm <b>Chạy lại → Chỉ phần mới</b> để làm tiếp.</div>`;
  return `<div class="callout info">Lần phân tích này chưa ${what}. Bấm <b>Chạy lại → Phân tích đầy đủ</b>.</div>`;
}

/**
 * Right-side evidence drawer (bottom sheet on narrow screens). open(title, html); closes on Esc / backdrop.
 */
export function evidenceDrawer() {
  const el = document.createElement('div');
  el.className = 'ci-drawer-root';
  el.hidden = true;
  el.innerHTML = '<div class="ci-drawer-back" data-close></div><aside class="ci-drawer" role="dialog" aria-modal="true" aria-label="Bằng chứng"><div class="ci-drawer-head"><b data-title></b><button type="button" class="icon-btn" data-close aria-label="Đóng">' + icon('x') + '</button></div><div class="ci-drawer-body" data-body></div></aside>';
  document.body.append(el); // outside the page: re-renders of the screen never remove it
  const close = () => (el.hidden = true);
  el.addEventListener('click', (e) => /** @type {HTMLElement} */ (e.target).closest('[data-close]') && close());
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  return {
    open(title, html) {
      el.querySelector('[data-title]').textContent = title;
      el.querySelector('[data-body]').innerHTML = html;
      el.hidden = false;
      /** @type {HTMLElement} */ (el.querySelector('.ci-drawer [data-close]')).focus();
    },
    close,
    off: () => (document.removeEventListener('keydown', onKey), el.remove()),
  };
}

/** Clicking a ref chip (C12) anywhere in root opens that comment in the drawer. */
export function bindRefs(root, runId, drawer) {
  const onClick = async (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-ref]'));
    if (!b) return;
    const ref = String(b.dataset.ref);
    try {
      const c = (await ci.comments(runId, { ref })).rows[0];
      drawer.open(`Comment ${ref}`, c ? commentRow(c) : '<div class="muted">Không thấy comment này trong lần phân tích.</div>');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
/** Mount the open screen again (after a job or an AI step changed its data); the router unmounts the old one first. */
export const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

/** A small "loading" placeholder. */
export const loading = (text = 'Đang tải…') => `<div class="card card-pad"><div class="muted">${esc(text)}</div></div>`;

/** Runs an AI action on a button: disables it, shows "AI đang…"; an error is shown once and gives null. */
export async function busy(btn, text, fn) {
  const before = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="ci-spin"></span> ${esc(text)}`;
  try {
    return await fn();
  } catch (e) {
    toast(e.message, 'error');
    return null;
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = before;
    }
  }
}
