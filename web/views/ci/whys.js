// Content Lab → 5 Whys: from one pain point to the causes that may explain it (PRD §6 Stage 5, §8.4). The AI proposes
// one level at a time; the owner accepts, edits or rejects each Why, digs further on the branch they choose, or stops.
import { ci } from '../../http/client.js';
import { esc, icon, fmt, ago, toast } from '../../lib.js';
import { resolveRun, noRuns, runBar, bindRunBar, stateChip, epiChip, strengthChip, aiConf, refChips, loading, evidenceDrawer, bindRefs, busy, reload, commentRow } from '../../components/ci.js';

const PATH = '/ci/lab/whys';
const STOP_VI = { continue: 'AI đề xuất đào tiếp', branch: 'AI đề xuất mở thêm nhánh', stop_evidence_insufficient: 'Dừng: hết bằng chứng để đi sâu hơn', stop_actionable: 'Dừng: đã đủ để làm nội dung', stop_redundant: 'Dừng: câu trả lời bắt đầu lặp', stop_conflict: 'Dừng: có mâu thuẫn chưa giải được' };
const USER_VI = { pending: 'Chờ bạn xem', accepted: 'Đã chấp nhận', edited: 'Bạn đã sửa', rejected: 'Đã bác bỏ' };

export async function mount(root, params) {
  root.innerHTML = loading();
  const { runs, run } = await resolveRun(params);
  if (!run) return noRuns(root, '5 Whys');
  const drawer = evidenceDrawer();
  const offs = [drawer.off, bindRefs(root, run.id, drawer)];
  if (params.insight) await analysisScreen(root, run, runs, Number(params.insight), Number(params.analysis) || 0, offs, drawer);
  else await pickScreen(root, run, runs, offs);
  return () => offs.forEach((f) => f());
}

async function pickScreen(root, run, runs, offs) {
  const d = await ci.whys(run.id);
  root.innerHTML = `${runBar(d.run, runs, { title: '5 Whys – Phân tích nguyên nhân gốc', sub: 'Chọn một insight để đào: vì sao khách gặp vấn đề này? AI chỉ đi sâu khi còn bằng chứng.', iconName: 'flask' })}
    <section class="card"><div class="card-head"><h3>Chọn insight</h3><span class="sub">Nên chọn insight đã kiểm tra (Sẵn sàng đào sâu / Đã xác nhận)</span></div>
    ${d.insights.length ? `<div class="ci-list">${d.insights.map((i) => `<a class="ci-pick" href="#${PATH}?run=${run.id}&insight=${i.id}"><div><b>${esc(i.title)}</b><div class="row small">${stateChip(i.state)}${strengthChip(i.strength)}<span class="muted">${fmt(i.comments)} comment</span></div></div>
      <span class="muted small">${i.analyses.length ? `${i.analyses.length} lần phân tích · ${ago(i.analyses[0].createdAt)}` : 'Chưa đào'}</span>${icon('chevron')}</a>`).join('')}</div>` : '<div class="card-pad muted">Chưa có insight. Chạy phân tích trước.</div>'}</section>`;
  offs.push(bindRunBar(root, d.run, PATH, reload));
}

/** Nodes as a tree: children under their parent, rejected ones greyed. */
function tree(nodes, picked) {
  const kids = new Map();
  for (const n of nodes) (kids.get(n.parentId ?? 0) ?? kids.set(n.parentId ?? 0, []).get(n.parentId ?? 0)).push(n);
  const draw = (parent) => (kids.get(parent) ?? []).map((n) => `<li class="ci-why ${n.userStatus}">
    <div class="ci-why-card">
      <div class="ci-why-n"><span>Why ${n.depth}</span></div>
      <div class="ci-why-main">
        <div class="ci-why-q">${esc(n.question)}</div>
        <div class="ci-why-a">${esc(n.answer)}</div>
        ${n.reasoning ? `<div class="muted small">${esc(n.reasoning)}</div>` : ''}
        <div class="row small ci-why-meta">${epiChip(n.status)}<span class="badge plain">${USER_VI[n.userStatus] ?? n.userStatus}</span>${aiConf(n.confidence)}
          <button type="button" class="linklike" data-ev="${n.id}">${n.supporting?.length ?? 0} bằng chứng${n.contradicting?.length ? ` · ${n.contradicting.length} phản bác` : ''}</button></div>
        ${n.gap ? `<div class="ci-gap">${icon('info')} Còn thiếu: ${esc(n.gap)}</div>` : ''}
        <div class="row ci-why-acts">
          <label class="check small"><input type="checkbox" data-pick="${n.id}" ${picked.has(n.id) ? 'checked' : ''} ${n.userStatus === 'rejected' ? 'disabled' : ''}> Dùng cho 5W1H</label>
          <button type="button" class="btn sm" data-node="${n.id}" data-act="accepted" ${n.userStatus === 'accepted' ? 'disabled' : ''}>${icon('check')} Chấp nhận</button>
          <button type="button" class="btn sm ghost" data-node="${n.id}" data-act="edit">${icon('edit')} Sửa</button>
          <button type="button" class="btn sm ghost danger" data-node="${n.id}" data-act="rejected" ${n.userStatus === 'rejected' ? 'disabled' : ''}>Bác bỏ</button>
          ${n.userStatus !== 'rejected' && n.depth < 5 ? `<button type="button" class="btn sm" data-continue="${n.id}">${icon('plus')} Đào tiếp Why ${n.depth + 1}</button>` : ''}
          <button type="button" class="btn sm ghost" data-stop="${n.id}">Dừng ở đây</button>
        </div>
      </div>
    </div>
    ${kids.has(n.id) ? `<ul>${draw(n.id)}</ul>` : ''}</li>`).join('');
  return `<ul class="ci-whys">${draw(0)}</ul>`;
}

async function analysisScreen(root, run, runs, insightId, analysisId, offs, drawer) {
  const ins = await ci.insight(insightId);
  let a = null;
  const pickId = analysisId || ins.analyses[0]?.id;
  if (pickId) a = await ci.analysis(pickId);
  const picked = new Set();
  const runInfo = await ci.run(run.id);
  const draw = () => {
    const d = ins.data;
    const top = a?.candidates?.at?.(-1);
    root.innerHTML = `${runBar(runInfo, runs, { title: '5 Whys – Phân tích nguyên nhân gốc', iconName: 'flask' })}
      <div class="ci-crumb"><a href="#${PATH}?run=${run.id}">5 Whys</a> ${icon('chevron')} <b>${esc(d.title)}</b></div>
      <div class="ci-split ci-split-whys">
        <aside>
          <section class="card card-pad ci-root"><div class="section-label" style="margin-top:0">${icon('target')} Vấn đề ban đầu</div>
            <p>${esc(a?.root?.statement || d.painStatement)}</p>${a?.root ? `${epiChip(a.root.status)} ${refChips(a.root.refs)}` : ''}
            <div class="row small" style="margin-top:8px">${stateChip(ins.state)}${strengthChip(d.evidenceStrength)}<span class="muted">${fmt(d.counts?.commentCount ?? 0)} comment · ${fmt(d.counts?.sourceItemCount ?? 0)} nguồn</span></div>
            ${['ready_for_analysis', 'validated_by_user'].includes(ins.state) ? '' : `<div class="callout small" style="margin-top:8px">Insight chưa được kiểm tra: mọi kết luận ở đây chỉ là giả thuyết. <a href="#/ci/topics?run=${run.id}&pain=${ins.pain?.id}">Kiểm tra insight</a></div>`}
          </section>
          ${a ? `<section class="card card-pad ci-result"><div class="section-label" style="margin-top:0">${icon('bulb')} Kết quả</div>
            <div class="small"><b>${esc(STOP_VI[a.next] ?? a.next)}</b>${a.stopReason ? `: ${esc(a.stopReason)}` : ''}</div>
            ${a.stoppedAt ? `<div class="small" style="margin-top:6px">Bạn dừng ở Why #${esc(a.stoppedAt.nodeId)}: ${esc(a.stoppedAt.reason)}</div>` : ''}
            ${top ? `<div class="section-label">Nguyên nhân gốc (dự kiến)</div><p class="ci-cause">${esc(top.statement)}</p>${epiChip(top.status)}` : '<div class="muted small" style="margin-top:6px">Chưa có nguyên nhân gốc đủ cơ sở. Không ép đủ 5 tầng.</div>'}
            ${a.warnings?.length ? `<div class="callout small" style="margin-top:8px">${a.warnings.map(esc).join('<br>')}</div>` : ''}
            ${a.audit?.fabricatedCount ? `<div class="muted small" style="margin-top:6px">App đã loại ${a.audit.fabricatedCount} ID bằng chứng AI tự đặt ra.</div>` : ''}
          </section>` : ''}
          ${ins.analyses.length > 1 ? `<section class="card card-pad"><div class="section-label" style="margin-top:0">Các lần phân tích</div>${ins.analyses.map((x) => `<a class="ci-mini ${x.id === a?.id ? 'on' : ''}" href="#${PATH}?run=${run.id}&insight=${insightId}&analysis=${x.id}">#${x.id} · ${ago(x.createdAt)}</a>`).join('')}</section>` : ''}
        </aside>
        <section class="card">
          <div class="card-head"><h3>${icon('layers')} Chuỗi nguyên nhân</h3><div class="row">
            ${a ? `<button type="button" class="btn sm" data-brief ${picked.size ? '' : 'disabled'}>${icon('doc')} Tạo 5W1H từ ${picked.size || ''} nhánh đã chọn</button>` : ''}
            <button type="button" class="btn sm ${a ? '' : 'primary'}" data-start>${icon('flask')} ${a ? 'Phân tích lại từ đầu' : 'Bắt đầu 5 Whys'}</button></div></div>
          <div class="card-pad">${a ? (a.nodes.length ? tree(a.nodes, picked) : '<div class="muted">AI không đưa ra được câu Why nào có cơ sở.</div>') : '<div class="muted">AI sẽ đề xuất Why đầu tiên (có thể vài nhánh) kèm bằng chứng. Bạn chọn nhánh nào đào tiếp.</div>'}</div>
        </section>
      </div>`;
  };
  draw();
  offs.push(bindRunBar(root, runInfo, PATH, reload));
  const onClick = async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const start = /** @type {HTMLButtonElement|null} */ (t.closest('[data-start]'));
    if (start) {
      const got = await busy(start, 'AI đang đào Why…', () => ci.startWhys(insightId));
      if (!got) return;
      a = got;
      ins.analyses.unshift({ id: a.id, createdAt: a.createdAt });
      history.replaceState(null, '', `#${PATH}?run=${run.id}&insight=${insightId}&analysis=${a.id}`);
      return draw();
    }
    const cont = /** @type {HTMLButtonElement|null} */ (t.closest('[data-continue]'));
    if (cont) {
      const got = await busy(cont, 'AI đang đào tiếp…', () => ci.continueWhy(Number(cont.dataset.continue)));
      return got && ((a = got), draw());
    }
    const nb = /** @type {HTMLElement|null} */ (t.closest('[data-node]'));
    if (nb) {
      const id = Number(nb.dataset.node);
      const n = a.nodes.find((x) => x.id === id);
      if (nb.dataset.act === 'edit') {
        const question = prompt('Câu hỏi Why', n.question);
        if (question == null) return;
        const answer = prompt('Câu trả lời (nguyên nhân)', n.answer);
        if (answer == null) return;
        a = await ci.editNode(id, { question, answer });
      } else a = await ci.editNode(id, { status: nb.dataset.act });
      if (nb.dataset.act === 'rejected') picked.delete(id);
      return draw();
    }
    const stop = /** @type {HTMLElement|null} */ (t.closest('[data-stop]'));
    if (stop) {
      const reason = prompt('Vì sao dừng ở đây? (vd: đã đủ để làm nội dung, hết bằng chứng)', 'Đã đủ để làm nội dung');
      if (reason == null) return;
      a = await ci.editNode(Number(stop.dataset.stop), { stop: reason || 'Dừng' });
      toast('Đã ghi điểm dừng');
      return draw();
    }
    const ev = /** @type {HTMLElement|null} */ (t.closest('[data-ev]'));
    if (ev) {
      const n = a.nodes.find((x) => x.id === Number(ev.dataset.ev));
      drawer.open(`Bằng chứng của Why ${n.depth}`, `${n.supportingComments.length ? n.supportingComments.map((c) => commentRow(c, { role: 'supports' })).join('') : '<div class="muted card-pad">Không có comment nào làm bằng chứng trực tiếp: đây là giả thuyết.</div>'}${n.contradictingComments.map((c) => commentRow(c, { role: 'contradicts' })).join('')}`);
      return;
    }
    const br = /** @type {HTMLButtonElement|null} */ (t.closest('[data-brief]'));
    if (br) {
      const b = await busy(br, 'AI đang viết brief…', () => ci.makeBrief(insightId, [...picked]));
      if (b) location.hash = `#/ci/lab/brief?run=${run.id}&brief=${b.id}`;
    }
  };
  const onChange = (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    if (!t.matches('[data-pick]')) return;
    t.checked ? picked.add(Number(t.dataset.pick)) : picked.delete(Number(t.dataset.pick));
    const b = /** @type {HTMLButtonElement} */ (root.querySelector('[data-brief]'));
    if (b) (b.disabled = !picked.size), (b.innerHTML = `${icon('doc')} Tạo 5W1H từ ${picked.size || ''} nhánh đã chọn`);
  };
  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  offs.push(() => (root.removeEventListener('click', onClick), root.removeEventListener('change', onChange)));
}
