// Audience Insights → Chủ đề & Nỗi đau: the topic tree and the pain points (PRD §8.2); with ?pain= the detail of one
// pain point: customer words, segment, insight with its checks, and the evidence (supports / contradicts).
import { ci } from '../../http/client.js';
import { esc, icon, fmt, toast } from '../../lib.js';
import { resolveRun, noRuns, runBar, bindRunBar, stageHint, commentRow, stateChip, epiChip, strengthChip, aiConf, refChips, pct, loading, LABEL_VI, evidenceDrawer, bindRefs, busy, reload } from '../../components/ci.js';

const PATH = '/ci/topics';
const KIND = { pain: ['Nỗi đau', 'accent'], question: ['Câu hỏi', 'blue'], decision: ['Cân nhắc mua', 'purple'] };
const SORTS = [['count', 'Số bình luận giảm dần'], ['share', 'Tỷ trọng'], ['score', 'Điểm cơ hội'], ['name', 'Tên A→Z']];

export async function mount(root, params) {
  root.innerHTML = loading();
  const { runs, run } = await resolveRun(params);
  if (!run) return noRuns(root, 'Pain Points', { iconName: 'alert', sub: 'Chủ đề, nỗi đau, câu hỏi và nỗi lo của khách, gom từ comment.' });
  const drawer = evidenceDrawer();
  const offs = [drawer.off, bindRefs(root, run.id, drawer)];
  if (params.pain) await detail(root, run, runs, Number(params.pain), offs);
  else await list(root, run, runs, params, offs);
  return () => offs.forEach((f) => f());
}

async function list(root, run, runs, params, offs) {
  const st = { kind: params.kind || 'all', sort: params.sort || 'count', topic: Number(params.topic) || 0, q: '', merge: new Set() };
  let d = await ci.topics(run.id);
  root.innerHTML = `${runBar(d.run, runs, { title: 'Pain Points', sub: `Nhóm các vấn đề, câu hỏi và nỗi lo từ ${fmt(d.total)} comment hợp lệ.`, iconName: 'target' })}
    ${stageHint(d.run, 'topics')}<div data-body></div>`;
  offs.push(bindRunBar(root, d.run, PATH, reload));
  const body = /** @type {HTMLElement} */ (root.querySelector('[data-body]'));

  function draw() {
    const topics = d.topics.filter((t) => !t.hidden);
    let pains = d.pains.filter((p) => (st.kind === 'all' || p.kind === st.kind) && (!st.topic || p.topicId === st.topic) && (!st.q || `${p.title} ${p.statement} ${p.topic}`.toLowerCase().includes(st.q)));
    const sorters = { count: (a, b) => b.counts.commentCount - a.counts.commentCount, share: (a, b) => (b.counts.share ?? 0) - (a.counts.share ?? 0), score: (a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1), name: (a, b) => a.title.localeCompare(b.title, 'vi') };
    pains = pains.sort(sorters[st.sort]);
    const n = (k) => d.pains.filter((p) => k === 'all' || p.kind === k).length;
    body.innerHTML = `<div class="ci-filters">
        <div class="chips">${[['all', 'Tất cả'], ['pain', 'Nỗi đau'], ['question', 'Câu hỏi'], ['decision', 'Cân nhắc mua']].map(([k, l]) => `<button type="button" class="chip ${st.kind === k ? 'on' : ''}" data-kind="${k}">${l} (${n(k)})</button>`).join('')}</div>
        <div class="row"><input class="input ci-search" type="search" placeholder="Tìm nỗi đau…" value="${esc(st.q)}" data-q aria-label="Tìm nỗi đau"><label class="small muted">Sắp xếp <select class="input" data-sort>${SORTS.map(([k, l]) => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      </div>
      <div class="ci-split">
        <aside class="card ci-tree"><div class="card-head"><h3>Chủ đề</h3>${st.merge.size > 1 ? `<button type="button" class="btn sm" data-merge>${icon('layers')} Gộp ${st.merge.size}</button>` : '<span class="sub">Tick để gộp</span>'}</div>
          <button type="button" class="ci-tnode ${!st.topic ? 'on' : ''}" data-topic="0"><span>Tất cả chủ đề</span><b>${fmt(d.total)}</b></button>
          ${topics.map((t) => `<div class="ci-tnode-row"><input type="checkbox" data-mergepick="${t.id}" ${st.merge.has(t.id) ? 'checked' : ''} aria-label="Chọn ${esc(t.name)} để gộp"><button type="button" class="ci-tnode ${st.topic === t.id ? 'on' : ''}" data-topic="${t.id}" title="${esc(t.description)}"><span>${esc(t.name)}${t.origin === 'user' ? ' <small class="muted">(đã sửa)</small>' : ''}</span><b>${fmt(t.count)}</b></button>
            <button type="button" class="icon-btn" data-topic-edit="${t.id}" title="Đổi tên chủ đề" aria-label="Đổi tên ${esc(t.name)}">${icon('edit')}</button><button type="button" class="icon-btn" data-topic-hide="${t.id}" title="Ẩn chủ đề không liên quan" aria-label="Ẩn ${esc(t.name)}">${icon('eye')}</button></div>`).join('')}
          ${d.topics.some((t) => t.hidden) ? `<div class="small muted ci-pad">Đã ẩn: ${d.topics.filter((t) => t.hidden).map((t) => `<button type="button" class="linklike" data-topic-show="${t.id}">${esc(t.name)}</button>`).join(', ')}</div>` : ''}
        </aside>
        <section class="card">${pains.length ? `<div class="table-wrap"><table class="t ci-table"><thead><tr><th>#</th><th>Chủ đề / Nỗi đau</th><th class="num">Số bình luận</th><th class="num">Tỷ trọng</th><th>Cảm xúc</th><th>Insight</th><th>Cơ hội</th><th></th></tr></thead><tbody>
          ${pains.map((p, i) => `<tr class="ci-click" data-open="${p.id}"><td class="muted">${i + 1}</td><td><b>${esc(p.title)}</b> <span class="badge ${KIND[p.kind][1]}">${KIND[p.kind][0]}</span><div class="muted small">${esc(p.topic)}</div></td>
            <td class="num">${fmt(p.counts.commentCount)}</td><td class="num">${pct(p.counts.share)}</td>
            <td>${p.counts.topEmotion ? esc(LABEL_VI.emotion[p.counts.topEmotion.key] ?? p.counts.topEmotion.key) : '<span class="muted">–</span>'}</td>
            <td>${p.insight ? stateChip(p.insight.state) : '<span class="muted small">–</span>'}</td><td>${p.opportunityBand ? `<span class="badge accent">${esc(p.opportunityBand)}</span>` : '<span class="muted small">–</span>'}</td><td>${icon('chevron')}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="card-pad muted">Không có nỗi đau nào khớp bộ lọc.</div>'}</section>
      </div>`;
  }
  draw();
  const refresh = async () => ((d = await ci.topics(run.id)), draw());
  const onClick = async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const k = t.closest('[data-kind]');
    if (k) return ((st.kind = /** @type {HTMLElement} */ (k).dataset.kind), draw());
    const tp = t.closest('[data-topic]');
    if (tp) return ((st.topic = Number(/** @type {HTMLElement} */ (tp).dataset.topic)), draw());
    const open = t.closest('[data-open]');
    if (open) return void (location.hash = `#${PATH}?run=${run.id}&pain=${/** @type {HTMLElement} */ (open).dataset.open}`);
    const ed = /** @type {HTMLElement|null} */ (t.closest('[data-topic-edit]'));
    if (ed) {
      const cur = d.topics.find((x) => x.id === Number(ed.dataset.topicEdit));
      const name = prompt('Tên chủ đề', cur?.name ?? '');
      if (name && name.trim()) (d = await ci.editTopic(run.id, cur.id, { name: name.trim() })), draw();
      return;
    }
    const hide = /** @type {HTMLElement|null} */ (t.closest('[data-topic-hide], [data-topic-show]'));
    if (hide) {
      const id = Number(hide.dataset.topicHide ?? hide.dataset.topicShow);
      d = await ci.editTopic(run.id, id, { hidden: hide.dataset.topicHide != null });
      if (st.topic === id) st.topic = 0;
      return draw();
    }
    if (t.closest('[data-merge]')) {
      const ids = [...st.merge];
      const names = ids.map((id) => d.topics.find((x) => x.id === id)?.name).join(', ');
      if (!confirm(`Gộp ${ids.length} chủ đề (${names}) vào “${d.topics.find((x) => x.id === ids[0])?.name}”?`)) return;
      d = await ci.mergeTopics(run.id, ids[0], ids.slice(1));
      st.merge.clear();
      toast('Đã gộp chủ đề');
      return draw();
    }
  };
  const onChange = (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (t.matches('[data-sort]')) (st.sort = t.value), draw();
    if (t.matches('[data-mergepick]')) (t.checked ? st.merge.add(Number(t.dataset.mergepick)) : st.merge.delete(Number(t.dataset.mergepick))), draw();
  };
  const onInput = (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (!t.matches('[data-q]')) return;
    st.q = t.value.trim().toLowerCase();
    draw();
    const q = /** @type {HTMLInputElement} */ (body.querySelector('[data-q]'));
    q.focus();
    q.setSelectionRange(q.value.length, q.value.length);
  };
  body.addEventListener('click', onClick);
  body.addEventListener('change', onChange);
  body.addEventListener('input', onInput);
  offs.push(() => (body.removeEventListener('click', onClick), body.removeEventListener('change', onChange), body.removeEventListener('input', onInput)));
  void refresh;
}

function insightPanel(ins, runId) {
  if (!ins) return `<div class="card card-pad"><b>Chưa có insight</b><div class="muted small">Bấm Chạy lại → Tổng hợp lại insight.</div></div>`;
  const d = ins.data;
  const v = ins.validation;
  const canDig = ['ready_for_analysis', 'validated_by_user'].includes(ins.state);
  return `<section class="card ci-insight"><div class="card-head"><h3>${icon('bulb')} Insight</h3><div class="row">${stateChip(ins.state)}${strengthChip(d.evidenceStrength)}</div></div>
    <div class="card-pad">
      <div class="ci-ins-title" data-ins-title>${esc(d.title)}${ins.edited ? ' <span class="badge blue">Bạn đã sửa</span>' : ''}</div>
      <div class="ci-field"><span>Điều dữ liệu cho thấy</span><p>${esc(d.observedPattern || '–')} ${refChips(d.supporting, 8)}</p></div>
      <div class="ci-field"><span>Nhu cầu có thể có ${epiChip(d.need?.status)}</span><p>${esc(d.need?.statement ?? 'Chưa đủ dữ liệu')} ${d.need?.refs?.length ? refChips(d.need.refs) : ''}</p></div>
      ${d.contradicting?.length ? `<div class="ci-field"><span>Comment trái chiều</span><p>${refChips(d.contradicting)}</p></div>` : ''}
      ${d.gaps?.length ? `<div class="ci-field"><span>Còn thiếu</span><ul class="small">${d.gaps.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
      ${d.warnings?.length ? `<div class="callout small">${d.warnings.map(esc).join('<br>')}</div>` : ''}
      <div class="row ci-ins-acts">
        <button type="button" class="btn sm" data-validate>${icon('check')} AI kiểm tra bằng chứng</button>
        <button type="button" class="btn sm" data-ins="validate" ${ins.state === 'validated_by_user' ? 'disabled' : ''}>Xác nhận</button>
        <button type="button" class="btn sm danger" data-ins="reject" ${ins.state === 'rejected' ? 'disabled' : ''}>Bác bỏ</button>
        <button type="button" class="btn sm ghost" data-ins-edit>${icon('edit')} Sửa</button>
        ${aiConf(d.confidence)}
      </div>
      ${v ? `<div class="ci-valid"><div class="section-label">Kết quả AI kiểm tra · đề xuất: <b>${esc({ ready_for_analysis: 'đủ cơ sở đào sâu', needs_evidence: 'cần thêm bằng chứng', revise: 'nên sửa câu chữ', rejected: 'không nên dùng' }[v.decision] ?? v.decision)}</b></div>
        ${v.supported.length ? `<div class="small"><b>Có bằng chứng:</b><ul>${v.supported.map((c) => `<li>${esc(c.claim)} ${refChips(c.refs)}</li>`).join('')}</ul></div>` : ''}
        ${v.unsupported.length ? `<div class="small"><b>Chưa có bằng chứng:</b><ul>${v.unsupported.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
        ${v.contradictions.length ? `<div class="small"><b>Mâu thuẫn:</b><ul>${v.contradictions.map((c) => `<li>${esc(c.claim)} ${refChips(c.refs)}</li>`).join('')}</ul></div>` : ''}
        ${v.edits.length ? `<div class="small"><b>Nên sửa:</b><ul>${v.edits.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}</div>` : ''}
      ${canDig ? '' : '<div class="muted small" style="margin-top:8px">Nên kiểm tra/xác nhận insight trước khi đào 5 Whys. Vẫn đào được, nhưng mọi kết luận sẽ chỉ là giả thuyết.</div>'}
    </div></section>`;
}

async function detail(root, run, runs, painId, offs) {
  let d = await ci.pain(run.id, painId);
  const draw = () => {
    const p = d.pain;
    const c = p.counts;
    const ins = d.insight;
    const seg = ins?.data.segment;
    const supports = new Set(ins?.data.supporting ?? []);
    const contra = new Set(ins?.data.contradicting ?? []);
    root.innerHTML = `${runBar(d.run, runs, { title: 'Pain Points', iconName: 'alert' })}
      <div class="ci-crumb"><a href="#${PATH}?run=${run.id}">Chủ đề & Nỗi đau</a> ${icon('chevron')} <span>${esc(d.topic?.name ?? '')}</span> ${icon('chevron')} <b>${esc(p.title)}</b></div>
      <div class="card card-pad ci-pain-head">
        <div><h2>${esc(p.title)} ${epiChip(p.status)}</h2><p class="muted">${esc(p.statement)}</p></div>
        <div class="row">
          ${ins ? `<a class="btn" href="#/ci/lab/whys?run=${run.id}&insight=${ins.id}">${icon('plus')} 5 Whys</a><a class="btn" href="#/ci/lab/brief?run=${run.id}&insight=${ins.id}">${icon('plus')} 5W1H</a><a class="btn primary" href="#/ci/lab/opportunities?run=${run.id}&insight=${ins.id}">${icon('bulb')} Tạo ý tưởng</a>` : ''}
          <div class="ci-menu-wrap"><button type="button" class="btn ghost" data-pain-menu aria-haspopup="true">${icon('sliders')}</button><div class="ci-menu" data-pmenu hidden>
            <button type="button" data-pain-act="edit"><b>Sửa tên / mô tả</b></button><button type="button" data-pain-act="move"><b>Chuyển sang chủ đề khác</b></button>
            <button type="button" data-pain-act="split"><b>Tách thành chủ đề riêng</b></button><button type="button" data-pain-act="hide"><b>Đánh dấu không liên quan</b></button></div></div>
        </div>
      </div>
      <div class="ci-kpis ci-kpis4">
        <div class="ci-kpi"><span class="ci-kpi-ic">${icon('message')}</span><div><div class="ci-kpi-v">${fmt(c.commentCount)}</div><div class="ci-kpi-l">Bình luận</div></div></div>
        <div class="ci-kpi" title="Chỉ đếm được khi nguồn cho biết tác giả"><span class="ci-kpi-ic">${icon('users')}</span><div><div class="ci-kpi-v">${c.uniqueCommenterCount == null ? 'Không rõ' : fmt(c.uniqueCommenterCount)}</div><div class="ci-kpi-l">Người bình luận</div></div></div>
        <div class="ci-kpi"><span class="ci-kpi-ic">${icon('pie')}</span><div><div class="ci-kpi-v">${pct(c.share)}</div><div class="ci-kpi-l">Tỷ trọng · ${fmt(c.sourceItemCount)} nguồn</div></div></div>
        <div class="ci-kpi"><span class="ci-kpi-ic">${icon('heart')}</span><div><div class="ci-kpi-v">${c.topEmotion ? `${esc(LABEL_VI.emotion[c.topEmotion.key] ?? c.topEmotion.key)} (${pct(c.topEmotion.share)})` : '–'}</div><div class="ci-kpi-l">Cảm xúc chính</div></div></div>
      </div>
      <div class="ci-grid3">
        <section class="card"><div class="card-head"><h3>${icon('message')} Khách hàng đang nói gì?</h3></div><div class="card-pad">
          ${(ins?.data.quotes?.length ? ins.data.quotes.map((q) => `<div class="ci-quote">“${esc(q.quote)}” <button type="button" class="ci-ref" data-ref="${esc(q.ref)}">${esc(q.ref)}</button></div>`) : d.questions.map((x) => `<div class="ci-quote">“${esc(x.text)}” <button type="button" class="ci-ref" data-ref="${esc(x.ref)}">${esc(x.ref)}</button></div>`)).join('') || '<div class="muted small">–</div>'}
          <div class="muted small">Trích nguyên văn; câu nào không có trong comment gốc đã bị app loại.</div></div></section>
        <section class="card"><div class="card-head"><h3>${icon('users')} Nhóm khách hàng</h3>${epiChip(seg?.status)}</div><div class="card-pad">
          <p>${esc(seg?.description ?? 'Chưa đủ dữ liệu để nói ai đang gặp vấn đề này.')}</p>${seg?.refs?.length ? refChips(seg.refs) : ''}
          <div class="muted small">App không suy đoán tuổi, giới tính, tình trạng pháp lý hay thuộc tính nhạy cảm.</div></div></section>
        ${insightPanel(ins, run.id)}
      </div>
      <section class="card"><div class="card-head"><h3>${icon('doc')} Bằng chứng (bình luận liên quan)</h3><a class="sub linklike" href="#/ci/comments?run=${run.id}&pain=${p.id}">Xem tất cả (${fmt(d.evidenceTotal)})</a></div>
        <div class="ci-list">${d.evidence.slice(0, 30).map((x) => commentRow(x, { role: contra.has(x.ref) ? 'contradicts' : supports.has(x.ref) ? 'supports' : 'context' })).join('')}</div></section>`;
  };
  draw();
  offs.push(bindRunBar(root, d.run, PATH, reload));
  const refresh = async () => ((d = await ci.pain(run.id, painId)), draw());
  const onClick = async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const ins = d.insight;
    if (t.closest('[data-pain-menu]')) {
      const m = /** @type {HTMLElement} */ (root.querySelector('[data-pmenu]'));
      m.hidden = !m.hidden;
      return;
    }
    const pa = /** @type {HTMLElement|null} */ (t.closest('[data-pain-act]'));
    if (pa) {
      const act = pa.dataset.painAct;
      if (act === 'edit') {
        const title = prompt('Tên nỗi đau', d.pain.title);
        if (title == null) return;
        const statement = prompt('Mô tả (từ góc nhìn khách hàng)', d.pain.statement);
        await ci.editPain(run.id, painId, { title, statement: statement ?? undefined });
      } else if (act === 'move') {
        const list = (await ci.topics(run.id)).topics.filter((x) => !x.hidden && x.id !== d.topic?.id);
        const pick = prompt(`Chuyển sang chủ đề nào? Gõ số:\n${list.map((x, i) => `${i + 1}. ${x.name}`).join('\n')}`);
        const tgt = list[Number(pick) - 1];
        if (!tgt) return;
        await ci.editPain(run.id, painId, { topicId: tgt.id });
      } else if (act === 'split') {
        const name = prompt('Tên chủ đề mới', d.pain.title);
        if (!name) return;
        await ci.editPain(run.id, painId, { topicId: 'new', newTopicName: name });
      } else if (act === 'hide') {
        if (!confirm('Ẩn nỗi đau này khỏi phân tích? (Comment vẫn giữ nguyên.)')) return;
        await ci.editPain(run.id, painId, { hidden: true });
        location.hash = `#${PATH}?run=${run.id}`;
        return;
      }
      toast('Đã lưu');
      return refresh();
    }
    if (!ins) return;
    const v = /** @type {HTMLButtonElement|null} */ (t.closest('[data-validate]'));
    if (v) {
      if (await busy(v, 'AI đang kiểm tra…', () => ci.validate(ins.id))) return refresh();
      return;
    }
    const a = /** @type {HTMLElement|null} */ (t.closest('[data-ins]'));
    if (a) {
      await ci.insightAction(ins.id, { action: a.dataset.ins });
      return refresh();
    }
    if (t.closest('[data-ins-edit]')) {
      const title = prompt('Tên insight', ins.data.title);
      if (title == null) return;
      const need = prompt('Nhu cầu có thể có (giữ là giả thuyết nếu chưa có comment nói thẳng)', ins.data.need?.statement ?? '');
      await ci.insightAction(ins.id, { action: 'edit', title, need: need ?? undefined });
      return refresh();
    }
  };
  root.addEventListener('click', onClick);
  offs.push(() => root.removeEventListener('click', onClick));
}
