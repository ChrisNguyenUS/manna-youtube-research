// Content Lab → 5W1H Brief: one page, six fields and the content strategy, built from an insight and the Why branch
// chosen (PRD §6 Stage 6). A field without data says so ("Cần thêm dữ liệu") instead of being filled in.
import { ci } from '../../http/client.js';
import { esc, icon, fmt, ago, toast } from '../../lib.js';
import { resolveRun, noRuns, runBar, bindRunBar, stateChip, epiChip, strengthChip, refChips, loading, evidenceDrawer, bindRefs, busy, reload } from '../../components/ci.js';

const PATH = '/ci/lab/brief';
const FIELDS = [['who', 'WHO', 'Ai đang gặp vấn đề?', 'users'], ['what', 'WHAT', 'Họ cần biết / giải quyết gì?', 'help'], ['why', 'WHY', 'Vì sao chủ đề đáng làm?', 'bulb'], ['when', 'WHEN', 'Khi nào vấn đề xuất hiện?', 'clock'], ['where', 'WHERE', 'Họ ở đâu / bối cảnh nào?', 'compass']];
const OBJ_VI = { educate: 'Giáo dục', clarify: 'Làm rõ', reassure: 'Trấn an', compare: 'So sánh', qualify: 'Sàng lọc', convert: 'Chuyển đổi' };
const FORMAT_VI = { step_by_step_explainer: 'Giải thích từng bước', short_video: 'Video ngắn', carousel: 'Carousel', livestream: 'Livestream', faq: 'Hỏi đáp', checklist: 'Checklist' };

export async function mount(root, params) {
  root.innerHTML = loading();
  const { runs, run } = await resolveRun(params);
  if (!run) return noRuns(root, '5W1H Brief');
  const drawer = evidenceDrawer();
  const offs = [drawer.off, bindRefs(root, run.id, drawer)];
  if (params.brief) await briefScreen(root, run, runs, Number(params.brief), offs);
  else await pickScreen(root, run, runs, Number(params.insight) || 0, offs);
  return () => offs.forEach((f) => f());
}

async function pickScreen(root, run, runs, insightId, offs) {
  const d = await ci.briefs(run.id);
  const insights = insightId ? d.insights.filter((i) => i.id === insightId) : d.insights;
  root.innerHTML = `${runBar(d.run, runs, { title: 'Content Brief – 5W1H', sub: 'Góc nội dung dựa trên insight và nhánh 5 Whys đã chọn. Trường nào thiếu dữ liệu sẽ để trống.', iconName: 'doc' })}
    <div class="ci-grid2">
      <section class="card"><div class="card-head"><h3>Tạo brief từ insight</h3><span class="sub">Mặc định dùng Why sâu nhất bạn đã chấp nhận</span></div>
        ${insights.length ? `<div class="ci-list">${insights.map((i) => `<div class="ci-pick"><div><b>${esc(i.title)}</b><div class="row small">${stateChip(i.state)}${strengthChip(i.strength)}<span class="muted">${i.analyses.length ? `${i.analyses[0].nodes} Why` : 'chưa có 5 Whys'}</span></div></div>
          <div class="row">${i.analyses.length ? '' : `<a class="btn sm ghost" href="#/ci/lab/whys?run=${run.id}&insight=${i.id}">5 Whys trước</a>`}<button type="button" class="btn sm primary" data-make="${i.id}">${icon('doc')} Tạo 5W1H</button></div></div>`).join('')}</div>` : '<div class="card-pad muted">Chưa có insight.</div>'}</section>
      <section class="card"><div class="card-head"><h3>Brief đã có</h3></div>
        ${d.briefs.length ? `<div class="ci-list">${d.briefs.map((b) => `<a class="ci-pick" href="#${PATH}?run=${run.id}&brief=${b.id}"><div><b>${esc(b.title)}</b><div class="muted small">${esc(b.centralInsight)}</div></div><span class="muted small">${b.opportunities} cơ hội · ${ago(b.createdAt)}</span>${icon('chevron')}</a>`).join('')}</div>` : '<div class="card-pad muted">Chưa có brief nào.</div>'}</section>
    </div>`;
  offs.push(bindRunBar(root, d.run, PATH, reload));
  const onClick = async (e) => {
    const b = /** @type {HTMLButtonElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-make]'));
    if (!b) return;
    const brief = await busy(b, 'AI đang viết brief…', () => ci.makeBrief(Number(b.dataset.make), []));
    if (brief) location.hash = `#${PATH}?run=${run.id}&brief=${brief.id}`;
  };
  root.addEventListener('click', onClick);
  offs.push(() => root.removeEventListener('click', onClick));
}

const fieldRow = ([k, label, q, ic], f, edited) => `<div class="ci-5w ${f?.status === 'needs_input' ? 'empty' : ''}">
  <div class="ci-5w-k"><span class="ci-5w-ic">${icon(ic)}</span><div><b>${label}</b><small>${q}</small></div></div>
  <div class="ci-5w-v" data-field="${k}">${f?.value ? esc(f.value) : '<span class="muted">Cần thêm dữ liệu</span>'}
    <div class="row small">${epiChip(f?.status)}${f?.refs?.length ? refChips(f.refs) : ''}${edited ? '<span class="badge blue">Bạn đã sửa</span>' : ''}<button type="button" class="linklike" data-edit="${k}">${icon('edit')} Sửa</button></div></div>
</div>`;

async function briefScreen(root, run, runs, briefId, offs) {
  let b = await ci.brief(briefId);
  const runInfo = await ci.run(run.id);
  const draw = () => {
    const d = b.data;
    const h = d.how ?? {};
    root.innerHTML = `${runBar(runInfo, runs, { title: 'Content Brief – 5W1H', iconName: 'doc' })}
      <div class="ci-crumb"><a href="#${PATH}?run=${run.id}">5W1H Brief</a> ${icon('chevron')} <b>${esc(b.insight?.data.title ?? '')}</b></div>
      <div class="ci-split ci-split-brief">
        <section class="card"><div class="card-head"><h3>5W1H</h3><span class="sub">Dựa trên ${b.whyNodes.length ? `${b.whyNodes.length} Why: ${b.whyNodes.map((n) => `Why ${n.depth}`).join(' → ')}` : 'insight (chưa chọn nhánh 5 Whys)'}</span></div>
          ${FIELDS.map((f) => fieldRow(f, d[f[0]], b.userEdited.includes(f[0]))).join('')}
          <div class="ci-5w"><div class="ci-5w-k"><span class="ci-5w-ic">${icon('bolt')}</span><div><b>HOW</b><small>Nên truyền tải thế nào?</small></div></div>
            <div class="ci-5w-v">${(h.formats ?? []).map((x) => `<span class="badge plain">${esc(FORMAT_VI[x] ?? x)}</span>`).join(' ') || '<span class="muted">Cần thêm dữ liệu</span>'}
              ${h.narrative ? `<div><b class="small">Cách kể:</b> ${esc(h.narrative)}</div>` : ''}${h.proof ? `<div><b class="small">Bằng chứng nên đưa:</b> ${esc(h.proof)}</div>` : ''}${h.visual ? `<div><b class="small">Minh hoạ:</b> ${esc(h.visual)}</div>` : ''}${h.cta ? `<div><b class="small">Ý định CTA:</b> ${esc(h.cta)}</div>` : ''}
              <div class="row small">${epiChip(h.status)}</div></div></div>
        </section>
        <aside>
          <section class="card card-pad ci-strategy"><div class="section-label" style="margin-top:0">${icon('target')} Chiến lược nội dung</div>
            <div class="ci-field"><span>Insight trung tâm</span><p data-field="centralInsight">${esc(d.centralInsight)} <button type="button" class="linklike" data-edit="centralInsight">${icon('edit')}</button></p></div>
            <div class="ci-field"><span>Mục tiêu</span><p><span class="badge accent">${esc(OBJ_VI[d.objective] ?? d.objective)}</span></p></div>
            <div class="ci-field"><span>Thông điệp cần chốt</span><p>${esc(d.message)} <button type="button" class="linklike" data-edit="message">${icon('edit')}</button></p></div>
            <div class="ci-field"><span>Hiểu lầm cần gỡ ${epiChip(d.misconception?.status)}</span><p>${esc(d.misconception?.value ?? 'Không thấy bằng chứng về hiểu lầm cụ thể.')} ${d.misconception?.refs?.length ? refChips(d.misconception.refs) : ''}</p></div>
            ${d.proof?.length ? `<div class="ci-field"><span>Cần bằng chứng</span><ul class="small">${d.proof.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
            <div class="ci-field"><span>CTA</span><p>${esc(d.cta)} <button type="button" class="linklike" data-edit="cta">${icon('edit')}</button></p></div>
            ${d.compliance?.length ? `<div class="callout small"><b>Lưu ý trước khi đăng:</b><ul>${d.compliance.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
            ${d.questions?.length ? `<div class="ci-field"><span>Câu hỏi còn mở</span><ul class="small">${d.questions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
            ${d.notes ? `<div class="ci-field"><span>Ghi chú của bạn</span><p>${esc(d.notes)}</p></div>` : ''}
            <button type="button" class="linklike small" data-edit="notes">${icon('plus')} Ghi chú</button>
          </section>
          <section class="card card-pad"><div class="row between"><b>Cơ hội nội dung</b><span class="muted small">${fmt(b.opportunities.length)} đã tạo</span></div>
            ${b.opportunities.map((o) => `<a class="ci-opprow" href="#/ci/lab/opportunities?run=${run.id}&opp=${o.id}"><span class="ci-score">${o.score?.priority?.score ?? '–'}</span><span>${esc(o.title)}</span></a>`).join('')}
            <button type="button" class="btn primary" data-opps style="margin-top:10px;width:100%">${icon('bulb')} ${b.opportunities.length ? 'Tạo thêm cơ hội' : 'Tạo cơ hội nội dung'}</button></section>
        </aside>
      </div>`;
  };
  draw();
  offs.push(bindRunBar(root, runInfo, PATH, reload));
  const onClick = async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const ed = /** @type {HTMLElement|null} */ (t.closest('[data-edit]'));
    if (ed) {
      const k = String(ed.dataset.edit);
      const cur = b.data[k];
      const value = prompt('Sửa (để trống nếu chưa có dữ liệu)', typeof cur === 'object' && cur ? cur.value ?? '' : cur ?? '');
      if (value == null) return;
      b = await ci.editBrief(b.id, { [k]: value });
      toast('Đã lưu');
      return draw();
    }
    const op = /** @type {HTMLButtonElement|null} */ (t.closest('[data-opps]'));
    if (op) {
      const r = await busy(op, 'AI đang đề xuất cơ hội…', () => ci.makeOpportunities(b.id));
      if (r) location.hash = `#/ci/lab/opportunities?run=${run.id}&brief=${b.id}`;
    }
  };
  root.addEventListener('click', onClick);
  offs.push(() => root.removeEventListener('click', onClick));
}
