// Customer Intelligence → Toàn cảnh: what the run's customers ask, fear and want, at a glance (PRD §8.1).
import { ci } from '../../http/client.js';
import { esc, icon, fmt } from '../../lib.js';
import { resolveRun, noRuns, runBar, bindRunBar, stageHint, commentRow, stateChip, strengthChip, pct, loading, LABEL_VI, evidenceDrawer, bindRefs, reload } from '../../components/ci.js';

const PATH = '/ci';
const COLORS = ['#e8590c', '#f59f00', '#2f9e44', '#1c7ed6', '#7048e8', '#e64980', '#0ca678', '#868e96', '#d9480f', '#5c940d'];
const KIND = { pain: ['Nỗi đau', 'accent'], question: ['Câu hỏi', 'blue'], decision: ['Cân nhắc mua', 'purple'] };

function donut(topics, total) {
  const R = 52;
  const C = 2 * Math.PI * R;
  let at = 0;
  const shown = topics.slice(0, 8);
  const arcs = shown.map((t, i) => {
    const len = total ? (t.count / total) * C : 0;
    const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${COLORS[i % COLORS.length]}" stroke-width="20" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-at}" transform="rotate(-90 70 70)"><title>${esc(t.name)}: ${t.count}</title></circle>`;
    at += len;
    return s;
  });
  return `<div class="ci-donut"><svg viewBox="0 0 140 140" role="img" aria-label="Phân bổ comment theo chủ đề"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--line)" stroke-width="20"/>${arcs.join('')}<text x="70" y="68" text-anchor="middle" class="ci-donut-n">${fmt(total)}</text><text x="70" y="85" text-anchor="middle" class="ci-donut-l">comment</text></svg>
    <ul class="ci-legend">${shown.map((t, i) => `<li><i style="background:${COLORS[i % COLORS.length]}"></i><span>${esc(t.name)}</span><b>${pct(t.share)}</b></li>`).join('')}</ul></div>`;
}

const kpi = (ic, value, label, tip, hint = '') => `<div class="ci-kpi" title="${esc(tip)}"><span class="ci-kpi-ic">${icon(ic)}</span><div><div class="ci-kpi-v">${value}</div><div class="ci-kpi-l">${esc(label)}</div>${hint ? `<div class="ci-kpi-h">${hint}</div>` : ''}</div></div>`;

export async function mount(root, params) {
  root.innerHTML = loading();
  const { runs, run } = await resolveRun(params);
  if (!run) return noRuns(root, 'Toàn cảnh khách hàng');
  const o = await ci.overview(run.id);
  const k = o.kpis;
  const drawer = evidenceDrawer();
  root.innerHTML = `${runBar(o.run, runs, { title: 'Toàn cảnh khách hàng', sub: 'Khách đang hỏi gì, lo gì và nên làm nội dung gì tiếp — mọi con số do app đếm từ comment.' })}
    ${stageHint(o.run, 'classify') || stageHint(o.run, 'topics')}
    <div class="ci-kpis">
      ${kpi('play', fmt(k.sources), 'Video / bài', 'Số video/bài đăng nguồn trong lần phân tích')}
      ${kpi('message', fmt(k.comments), 'Bình luận', 'Comment hợp lệ (đã bỏ trùng, comment rỗng và comment bạn đánh dấu không liên quan). Không phải số người.', `${k.uniqueCommenters == null ? 'Không rõ số người' : `${fmt(k.uniqueCommenters)} người`}`)}
      ${kpi('layers', fmt(k.topics), 'Chủ đề', 'Nhóm vấn đề rộng do AI gom; bạn có thể gộp/tách')}
      ${kpi('help', fmt(k.questions), 'Câu hỏi', 'Comment có ý định hỏi, tìm thông tin hoặc xin gợi ý')}
      ${kpi('target', fmt(k.pains), 'Nỗi đau', 'Vấn đề cụ thể khách thể hiện, mỗi nỗi đau có comment làm bằng chứng')}
      ${kpi('heart', fmt(k.buyingSignals), 'Tín hiệu mua', 'Comment hỏi giá, dịch vụ, tư vấn hoặc bước tiếp. Like không được tính là tín hiệu mua.')}
    </div>
    <div class="ci-grid3">
      <section class="card"><div class="card-head"><h3>Phân bổ chủ đề</h3>${o.unclassified ? `<span class="sub">${fmt(o.unclassified)} comment chưa vào chủ đề nào</span>` : ''}</div>
        <div class="card-pad">${o.topics.length ? donut(o.topics, k.comments) : '<div class="muted">Chưa gom chủ đề.</div>'}</div></section>
      <section class="card"><div class="card-head"><h3>${icon('help')} Câu hỏi nổi bật</h3><a class="sub linklike" href="#/ci/comments?run=${run.id}&tab=questions">Xem tất cả</a></div>
        <div class="ci-list">${o.questions.length ? o.questions.map((c) => `<div class="ci-qrow"><span>${esc(c.text)}</span><button type="button" class="ci-ref" data-ref="${esc(c.ref)}">${esc(c.ref)}</button></div>`).join('') : '<div class="card-pad muted">Chưa có câu hỏi nào được phân loại.</div>'}</div></section>
      <section class="card"><div class="card-head"><h3>${icon('bulb')} Cơ hội nội dung</h3><a class="sub linklike" href="#/ci/lab/opportunities?run=${run.id}">Content Lab</a></div>
        <div class="ci-list">${o.opportunities.length ? o.opportunities.map((x) => `<a class="ci-opprow" href="#/ci/lab/opportunities?run=${run.id}&opp=${x.id}"><span class="ci-score" title="Điểm ưu tiên do app tính">${x.score?.priority?.score ?? '–'}</span><span>${esc(x.title)}</span></a>`).join('') : `<div class="card-pad muted small">Chưa có cơ hội. Chọn một nỗi đau → 5 Whys → 5W1H → tạo cơ hội.</div>`}</div></section>
    </div>
    <section class="card"><div class="card-head"><h3>${icon('target')} Nỗi đau hàng đầu</h3><a class="sub linklike" href="#/ci/topics?run=${run.id}">Tất cả chủ đề & nỗi đau</a></div>
      ${o.pains.length ? `<div class="table-wrap"><table class="t ci-table"><thead><tr><th>#</th><th>Nỗi đau</th><th class="num">Comment</th><th class="num" title="Tỷ trọng trên comment hợp lệ">Tỷ trọng</th><th>Cảm xúc chính</th><th>Insight</th><th>Cơ hội</th></tr></thead><tbody>
        ${o.pains.map((p, i) => `<tr><td class="muted">${i + 1}</td><td><a href="#/ci/topics?run=${run.id}&pain=${p.id}"><b>${esc(p.title)}</b></a> <span class="badge ${KIND[p.kind][1]}">${KIND[p.kind][0]}</span><div class="muted small">${esc(p.topic)}</div></td>
          <td class="num">${fmt(p.counts.commentCount)}</td><td class="num">${pct(p.counts.share)}</td><td>${p.counts.topEmotion ? `${esc(LABEL_VI.emotion[p.counts.topEmotion.key] ?? p.counts.topEmotion.key)} <span class="muted small">${pct(p.counts.topEmotion.share)}</span>` : '<span class="muted">–</span>'}</td>
          <td>${p.insight ? `${stateChip(p.insight.state)} ${strengthChip(p.insight.strength)}` : '<span class="muted small">Chưa có</span>'}</td><td>${p.opportunityBand ? `<span class="badge accent">${esc(p.opportunityBand)}</span>` : '<span class="muted small">–</span>'}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="card-pad muted">Chưa có nỗi đau nào.</div>'}</section>
    <div class="ci-grid3">
      <section class="card"><div class="card-head"><h3>Rào cản & phản đối</h3></div><div class="card-pad">${o.objections.length ? o.objections.map((x) => `<div class="ci-obj"><div class="row between"><b>${esc(x.label)}</b><span class="muted small">${fmt(x.count)} comment</span></div>${x.examples.map((c) => `<div class="ci-quote">“${esc(c.text)}” <button type="button" class="ci-ref" data-ref="${esc(c.ref)}">${esc(c.ref)}</button></div>`).join('')}</div>`).join('') : '<div class="muted small">Không thấy rào cản rõ ràng trong comment.</div>'}</div></section>
      <section class="card"><div class="card-head"><h3>Tín hiệu mua</h3><a class="sub linklike" href="#/ci/comments?run=${run.id}&tab=buying">Xem tất cả</a></div><div class="ci-list">${o.buying.length ? o.buying.map((c) => commentRow(c, { compact: true })).join('') : '<div class="card-pad muted small">Không có comment nào hỏi giá, dịch vụ hay bước tiếp.</div>'}</div></section>
      <section class="card"><div class="card-head"><h3>${icon('bolt')} Nên làm tiếp</h3></div><div class="card-pad">
        ${o.actions.length ? `<ul class="ci-actions">${o.actions.map((a) => `<li><a href="#${esc(a.href)}">${esc(a.text)} ${icon('chevron')}</a></li>`).join('')}</ul>` : '<div class="muted small">Không có việc gì đang chờ.</div>'}
        <div class="section-label">So với lần trước</div>
        ${o.changes ? (o.changes.newPains.length ? `<div class="small">Nỗi đau mới so với “${esc(o.changes.previous.title)}”:</div><ul class="small">${o.changes.newPains.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : `<div class="muted small">Không có nỗi đau mới so với “${esc(o.changes.previous.title)}”.</div>`) : '<div class="muted small">Chưa có lần phân tích trước cùng nền tảng để so.</div>'}
      </div></section>
    </div>`;
  const offs = [bindRunBar(root, o.run, PATH, reload), bindRefs(root, run.id, drawer), drawer.off];
  return () => offs.forEach((f) => f());
}
