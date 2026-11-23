// Content Lab → Cơ hội nội dung: opportunities with their priority score (computed by the app, with its breakdown and
// data coverage) kept apart from evidence strength (PRD §7, §8.4). Approving sends one to the idea board — only the owner does.
import { ci } from '../../http/client.js';
import { esc, icon, toast } from '../../lib.js';
import { resolveRun, noRuns, runBar, bindRunBar, strengthChip, refChips, loading, evidenceDrawer, bindRefs, busy, reload } from '../../components/ci.js';

const PATH = '/ci/lab/opportunities';
const TYPE_VI = { education: 'Giáo dục', FAQ: 'Hỏi đáp', myth_clarification: 'Gỡ hiểu lầm', objection_handling: 'Gỡ rào cản', comparison: 'So sánh', process_walkthrough: 'Hướng dẫn quy trình', case_study: 'Câu chuyện thật', trust_building: 'Xây niềm tin', checklist: 'Checklist', story: 'Kể chuyện', conversion: 'Chuyển đổi' };
const STATUS_VI = { suggested: 'Đề xuất', reviewed: 'Đã xem', approved: 'Đã duyệt', rejected: 'Đã bỏ', on_hold: 'Tạm giữ' };
const STATUS_TONE = { suggested: 'plain', reviewed: 'blue', approved: 'good', rejected: 'bad', on_hold: 'warn' };
const DIM_VI = { prevalence: 'Độ phổ biến', severity: 'Mức nghiêm trọng', intent: 'Ý định tìm giải pháp', engagement: 'Tương tác', evidence_strength: 'Độ mạnh bằng chứng', freshness: 'Độ mới', strategic_fit: 'Phù hợp chiến lược' };
const REC_VI = { prioritize: ['Nên ưu tiên', 'good'], keep: ['Giữ', 'blue'], merge: ['Nên gộp', 'warn'], drop: ['Nên bỏ', 'bad'] };
const BAND_TONE = (s) => (s == null ? 'plain' : s >= 80 ? 'good' : s >= 60 ? 'blue' : s >= 40 ? 'warn' : 'plain');

function breakdown(o) {
  const s = o.score ?? {};
  return `<div class="ci-dims">${Object.entries(s.weights ?? {}).map(([k, w]) => {
    const v = s.dims?.[k];
    return `<div class="ci-dim ${v == null ? 'none' : ''}"><div class="row between small"><span>${esc(DIM_VI[k] ?? k)} <span class="muted">${Math.round(Number(w) * 100)}%</span></span><b>${v == null ? 'Chưa có dữ liệu' : v}</b></div>
      <div class="bar"><i style="width:${v ?? 0}%"></i></div><div class="muted small">${esc(s.why?.[k] ?? '')}${k === 'strategic_fit' ? ` <button type="button" class="linklike" data-fit="${o.id}">${v == null ? 'Chấm' : 'Sửa'}</button>` : ''}</div></div>`;
  }).join('')}</div>
  <div class="muted small">Điểm = trung bình có trọng số của các chiều có dữ liệu (chiều thiếu dữ liệu không tính là 0; trọng số còn lại được chia lại). Dữ liệu đủ cho ${Math.round((s.priority?.coverage ?? 0) * 100)}% trọng số. Đây là gợi ý sắp xếp, không phải xác suất viral hay doanh thu.</div>`;
}

function card(o, i, open, runId) {
  const sc = o.score?.priority?.score;
  const e = o.evaluation;
  return `<article class="card ci-opp ${open ? 'open' : ''}" id="opp-${o.id}">
    <div class="ci-opp-head" data-toggle="${o.id}">
      <span class="ci-rank">#${String(i + 1).padStart(2, '0')}</span>
      <div class="ci-opp-main"><h3>${esc(o.title)}</h3>
        <div class="row small"><span class="badge accent">${esc(TYPE_VI[o.type] ?? o.type)}</span>${o.pain ? `<span class="badge plain">${esc(o.pain.title)}</span>` : ''}<span class="badge ${STATUS_TONE[o.status]}">${STATUS_VI[o.status] ?? o.status}</span></div>
        <div class="row small muted">${icon('play')} ${esc(o.format?.platform ?? '')} ${esc(o.format?.format ?? '')}${o.format?.duration ? ` · ${o.format.duration}s` : ''} · CTA: ${esc(o.cta)}</div></div>
      <div class="ci-opp-score"><span class="badge ${BAND_TONE(sc)}">${esc(o.score?.priority?.band ?? 'Chưa đủ dữ liệu')}</span><div class="ci-score-big" title="Điểm ưu tiên 0–100 do app tính">${sc ?? '–'}<small>/100</small></div>${strengthChip(o.score?.evidenceStrength)}</div>
    </div>
    ${open ? `<div class="ci-opp-body">
      <div class="ci-grid2">
        <div>
          <div class="ci-field"><span>Cho ai</span><p>${esc(o.segment)}</p></div>
          <div class="ci-field"><span>Góc tiếp cận</span><p>${esc(o.angle)}</p></div>
          <div class="ci-field"><span>Vì sao nên làm</span><p>${esc(o.whyPrioritize)}</p></div>
          <div class="ci-field"><span>Hook gợi ý</span><ol class="small">${o.hooks.map((h) => `<li>${esc(h)}</li>`).join('')}</ol></div>
          <div class="ci-field"><span>Dàn ý</span><ol class="small">${o.outline.map((h) => `<li>${esc(h)}</li>`).join('')}</ol></div>
          <div class="ci-field"><span>Người xem sẽ làm được</span><p>${esc(o.audienceAction)}</p></div>
          <div class="ci-field"><span>Bằng chứng</span><p>${refChips(o.refs, 10)}</p></div>
          <div class="ci-field"><span>Nguồn gốc</span><p class="small"><a href="#/ci/topics?run=${runId}&pain=${o.pain?.id}">Nỗi đau: ${esc(o.pain?.title ?? '')}</a> · <a href="#/ci/lab/whys?run=${runId}&insight=${o.insightId}">5 Whys</a> · <a href="#/ci/lab/brief?run=${runId}&brief=${o.briefId}">Brief 5W1H</a></p></div>
        </div>
        <div>
          <div class="section-label" style="margin-top:0">Điểm ưu tiên (app tính)</div>${breakdown(o)}
          ${o.facts?.length ? `<div class="callout small" style="margin-top:10px"><b>Cần kiểm chứng trước khi đăng:</b><ul>${o.facts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          ${o.compliance?.length ? `<div class="callout small" style="margin-top:8px"><b>Lưu ý:</b><ul>${o.compliance.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
          ${o.warnings?.length ? `<div class="muted small" style="margin-top:8px">${o.warnings.map(esc).join('<br>')}</div>` : ''}
          ${o.nearDuplicates?.length ? `<div class="muted small">Gần trùng: ${o.nearDuplicates.map(esc).join('; ')}</div>` : ''}
          ${e ? `<div class="ci-eval"><div class="row between"><b class="small">AI so sánh</b><span class="badge ${REC_VI[e.recommendation]?.[1] ?? 'plain'}">${REC_VI[e.recommendation]?.[0] ?? e.recommendation}</span></div><p class="small">${esc(e.reason)}</p>
            <ul class="small muted"><li>Khác biệt: ${esc(e.differentiation)}</li><li>Khả thi: ${esc(e.feasibility)}</li><li>Kiểm chứng/compliance: ${esc(e.compliance)}</li></ul></div>` : ''}
        </div>
      </div>
      <div class="row ci-opp-acts">
        ${o.ideaId ? `<a class="btn" href="#/board">${icon('check')} Đã ở Idea Board (thẻ #${o.ideaId})</a>` : `<button type="button" class="btn primary" data-approve="${o.id}">${icon('check')} Duyệt → Idea Board</button>`}
        ${o.ideaId ? '' : `<button type="button" class="btn" data-status="${o.id}" data-to="reviewed">Đã xem</button><button type="button" class="btn" data-status="${o.id}" data-to="on_hold">Tạm giữ</button><button type="button" class="btn danger" data-status="${o.id}" data-to="rejected">Bỏ</button>`}
        <a class="btn ghost" href="#/ci/lab/brief?run=${runId}&brief=${o.briefId}">${icon('plus')} Tạo biến thể từ brief</a>
      </div>
    </div>` : ''}
  </article>`;
}

export async function mount(root, params) {
  root.innerHTML = loading();
  const { runs, run } = await resolveRun(params);
  if (!run) return noRuns(root, 'Opportunities', { iconName: 'flame', sub: 'Ý tưởng nội dung có bằng chứng, duyệt để đưa sang Idea Board.' });
  const drawer = evidenceDrawer();
  let d = await ci.opportunities(run.id);
  const st = { status: 'active', brief: Number(params.brief) || 0, open: new Set(params.opp ? [Number(params.opp)] : []), picked: new Set(), summary: '' };
  const insightId = Number(params.insight) || 0;
  root.innerHTML = `${runBar(d.run, runs, { title: 'Opportunities', sub: 'Ý tưởng nội dung có bằng chứng, xếp theo điểm ưu tiên app tính. Duyệt để đưa sang Idea Board.', iconName: 'flame' })}<div data-body></div>`;
  const body = /** @type {HTMLElement} */ (root.querySelector('[data-body]'));
  function draw() {
    let list = d.opportunities.filter((o) => (st.status === 'all' || (st.status === 'active' ? !['rejected'].includes(o.status) : o.status === st.status)) && (!st.brief || o.briefId === st.brief) && (!insightId || o.insightId === insightId));
    const brief = st.brief ? d.briefs.find((b) => b.id === st.brief) : null;
    body.innerHTML = `${insightId && !list.length ? `<div class="callout info">Insight này chưa có cơ hội. Cần một brief 5W1H trước: <a href="#/ci/lab/brief?run=${run.id}&insight=${insightId}">Tạo 5W1H</a> (hoặc đào <a href="#/ci/lab/whys?run=${run.id}&insight=${insightId}">5 Whys</a> trước để brief có nhánh nguyên nhân).</div>` : ''}
      <div class="ci-filters">
        <div class="chips">${[['active', 'Đang xét'], ['suggested', 'Đề xuất'], ['approved', 'Đã duyệt'], ['on_hold', 'Tạm giữ'], ['rejected', 'Đã bỏ'], ['all', 'Tất cả']].map(([k, l]) => `<button type="button" class="chip ${st.status === k ? 'on' : ''}" data-st="${k}">${l}</button>`).join('')}</div>
        <div class="row">${brief ? `<span class="badge accent">Brief: ${esc(brief.title)} <button type="button" class="linklike" data-clear-brief>bỏ lọc</button></span>` : ''}${insightId ? `<a class="badge accent" href="#${PATH}?run=${run.id}">Lọc theo insight · bỏ</a>` : ''}
          <button type="button" class="btn sm" data-evaluate ${list.length < 2 ? 'disabled' : ''}>${icon('sort')} AI so sánh ${list.length} cơ hội</button></div>
      </div>
      ${st.summary ? `<div class="callout info small">${esc(st.summary)}</div>` : ''}
      ${list.length ? list.map((o, i) => card(o, i, st.open.has(o.id), run.id)).join('') : `<div class="card card-pad">${d.opportunities.length ? '<div class="muted">Không có cơ hội nào khớp bộ lọc.</div>' : `<div class="muted">Chưa có cơ hội. Đi theo: <a href="#/ci/topics?run=${run.id}">chọn nỗi đau</a> → 5 Whys → <a href="#/ci/lab/brief?run=${run.id}">5W1H</a> → Tạo cơ hội.</div>`}</div>`}`;
  }
  draw();
  if (params.opp) requestAnimationFrame(() => document.getElementById(`opp-${params.opp}`)?.scrollIntoView({ block: 'start' }));
  const refresh = async () => ((d = await ci.opportunities(run.id)), draw());
  const onClick = async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const s = /** @type {HTMLElement|null} */ (t.closest('[data-st]'));
    if (s) return ((st.status = String(s.dataset.st)), draw());
    if (t.closest('[data-clear-brief]')) return ((st.brief = 0), draw());
    const fit = /** @type {HTMLElement|null} */ (t.closest('[data-fit]'));
    if (fit) {
      const v = prompt('Mức phù hợp với dịch vụ, khán giả và mục tiêu của bạn (0–100; để trống = chưa chấm)', '');
      if (v == null) return;
      await ci.setOpportunity(Number(fit.dataset.fit), { strategicFit: v.trim() === '' ? null : Number(v) });
      return refresh();
    }
    const ap = /** @type {HTMLButtonElement|null} */ (t.closest('[data-approve]'));
    if (ap) {
      const r = await busy(ap, 'Đang đưa sang Idea Board…', () => ci.approve(Number(ap.dataset.approve)));
      if (r) toast(`Đã thêm vào Idea Board (thẻ #${r.ideaId})`, '', { href: '#/board', label: 'Mở bảng' });
      return refresh();
    }
    const sb = /** @type {HTMLElement|null} */ (t.closest('[data-status]'));
    if (sb) {
      await ci.setOpportunity(Number(sb.dataset.status), { status: sb.dataset.to });
      return refresh();
    }
    const ev = /** @type {HTMLButtonElement|null} */ (t.closest('[data-evaluate]'));
    if (ev) {
      const ids = d.opportunities.filter((o) => st.status === 'all' || o.status !== 'rejected').map((o) => o.id);
      const r = await busy(ev, 'AI đang so sánh…', () => ci.evaluate(run.id, ids));
      if (r) ((d = r), (st.summary = r.summary), draw());
      return;
    }
    if (t.closest('a, button, input')) return;
    const tg = /** @type {HTMLElement|null} */ (t.closest('[data-toggle]'));
    if (tg) {
      const id = Number(tg.dataset.toggle);
      st.open.has(id) ? st.open.delete(id) : st.open.add(id);
      draw();
    }
  };
  body.addEventListener('click', onClick);
  const offs = [drawer.off, bindRefs(root, run.id, drawer), bindRunBar(root, d.run, PATH, reload), () => body.removeEventListener('click', onClick)];
  return () => offs.forEach((f) => f());
}
