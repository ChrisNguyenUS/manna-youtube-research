// Batch Review (spec 2026-11-16-batch-review-design.md): the posted videos of a batch ranked by Soulprint's game, the
// bricks that go with its top and bottom halves, and closing it with what to keep. Counting only; the numbers come
// from each card's Kết quả tab and the batch_refresh job.
import { ideas } from '../http/client.js';
import { esc, icon, fmt, toast, errorCallout, emptyState, setUrl, runJob, progressCard, updateProgress } from '../lib.js';

const PATH = '/board/review';
const LABEL = { keep: ['nên giữ', ''], review: ['xem lại', 'soft'] };

export async function mount(root, params) {
  /** @type {any} */ let r;
  /** @type {any[]} */ let batches = [];
  /** The close form: lines the owner ticks and edits before they are kept. @type {{on: boolean, kind: 'keep'|'review', text: string}[]|null} */
  let closing = null;
  let busy = false;

  async function load(batchId) {
    const b = await ideas.board(batchId);
    batches = b.batches;
    r = await ideas.review(b.batch.id);
    setUrl(PATH, { batch: r.batch.id });
  }
  try {
    await load(params.batch ? Number(params.batch) : undefined);
  } catch (e) {
    root.innerHTML = errorCallout(e);
    return;
  }

  const cap = (t) => `<div class="fw-cap">${t}</div>`;
  const pct = (v) => (v == null ? '–' : `${(v * 100).toFixed(1)}%`);
  const chip = (t, cls = '') => `<span class="fw-chip ${cls}">${esc(t)}</span>`;

  function rankHtml() {
    if (!r.rows.length) return emptyState('Chưa có video nào được gắn link', 'Mở một thẻ ở Idea Board, tab Kết quả, rồi dán link video đã đăng.');
    const conv = r.game === 'conversion';
    const reach = r.game === 'reach';
    // Kallaway: for a business, views of the wrong people are empty calories; the column stays, dimmed, never ranked by.
    const dim = conv ? 'muted' : '';
    return `<div class="table-wrap"><table class="t"><thead><tr><th>#</th><th>Video</th>${conv ? '<th>Khách</th><th>Follower tăng</th>' : ''}<th class="${dim}">View</th>${reach ? '<th>Tỉ lệ chia sẻ</th>' : ''}<th>Tim</th><th>Comment</th><th></th></tr></thead><tbody>
      ${r.rows.map((x) => `<tr><td>${x.rank}</td><td><a href="#/board?batch=${r.batch.id}&card=${x.id}">${esc(x.title)}</a></td>
        ${conv ? `<td>${fmt(x.metrics.leads)}</td><td>${fmt(x.metrics.followers)}</td>` : ''}<td class="${dim}">${fmt(x.metrics.views)}</td>${reach ? `<td>${pct(x.metrics.shareRate)}</td>` : ''}
        <td>${fmt(x.metrics.likes)}</td><td>${fmt(x.metrics.comments)}</td>
        <td>${x.missing ? chip(conv ? 'chưa nhập' : 'chưa có view', 'soft') : ''} ${x.metrics.fresh ? chip('còn mới', 'soft') : ''}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function tableHtml() {
    const t = r.table;
    const rows = t.rows.length
      ? t.rows.map((x) => `<div class="bd-issue">${x.label ? `${chip(LABEL[x.label][0], LABEL[x.label][1])} ` : ''}<b>${esc(x.attr)} ${esc(x.value)}</b>: ${x.top} video nửa trên, ${x.bottom} video nửa dưới</div>`).join('')
      : '<p class="muted small">Chưa có gì để so: cần ít nhất 2 video đủ số liệu và đăng từ 3 ngày.</p>';
    return `${t.note ? `<div class="callout">${esc(t.note)}</div>` : ''}<div class="bd-lint">${rows}</div>
      <p class="muted small">Nên giữ: có ở ít nhất 3 video nửa trên và nhiều nhất 1 video nửa dưới. Xem lại: ngược lại. Đây là đối chiếu trên một lô nhỏ, không phải nguyên nhân.</p>`;
  }

  function losersHtml() {
    if (!r.losers.length) return '';
    return `<div class="fw-field">${cap('NỬA DƯỚI: ELEMENT NÀO KHÁC')}${r.losers.map((l) => `<div class="bd-issue"><b>${esc(l.title)}</b>
        ${l.diffs.length ? l.diffs.map((d) => `<div class="small">${esc(d.attr)}: <b>${esc(d.mine)}</b>, nửa trên cùng pillar: ${esc(d.theirs.join(', '))}</div>`).join('') : `<div class="muted small">${esc(l.note)}</div>`}</div>`).join('')}
      <p class="muted small">Lần làm lại, sửa đúng element khác đó, đừng bỏ cả format.</p></div>`;
  }

  function levelsHtml() {
    return `<details class="fw-field"><summary class="small">Các mức kẹt view</summary>${r.levels.map(([a, b]) => `<div class="small"><b>${esc(a)}:</b> ${esc(b)}</div>`).join('')}
      <p class="muted small">Chỉ từ một bài đăng, không phải luật. App không tự xếp video nào vào mức nào.</p></details>`;
  }

  function learnedHtml() {
    const l = r.batch.learned;
    if (!l || !(l.keep.length || l.review.length)) return '';
    return `<div class="callout info"><div class="fw-cap">ĐÃ MANG SANG LÔ SAU</div>${l.keep.length ? `<div class="small"><b>Nên giữ:</b> ${esc(l.keep.join('; '))}</div>` : ''}${l.review.length ? `<div class="small"><b>Nên xem lại:</b> ${esc(l.review.join('; '))}</div>` : ''}</div>`;
  }

  function closeHtml() {
    if (!closing) return '';
    const open = r.batch.status === 'open';
    return `<div class="card card-pad"><div class="fw-cap">MANG SANG LÔ SAU</div><p class="muted small">Tick dòng muốn giữ, sửa chữ nếu cần.</p>
      ${closing.map((c, i) => `<div class="row" style="margin-top:6px"><input type="checkbox" data-take="${i}" ${c.on ? 'checked' : ''} aria-label="Mang dòng này sang">
        <select class="select input" data-kind="${i}" style="width:auto"><option value="keep" ${c.kind === 'keep' ? 'selected' : ''}>Nên giữ</option><option value="review" ${c.kind === 'review' ? 'selected' : ''}>Nên xem lại</option></select>
        <input class="input" data-line="${i}" value="${esc(c.text)}" style="flex:1;min-width:220px"></div>`).join('')}
      <div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-add-line>${icon('plus')} Thêm dòng</button><span class="spacer"></span>
        <button type="button" class="btn sm" data-cancel-close>Huỷ</button><button type="button" class="btn sm primary" data-confirm-close>${icon('check')} ${open ? 'Đóng lô' : 'Lưu'}</button></div>
      ${open ? '<p class="muted small">Đóng lô sẽ mở lô mới. Số liệu vẫn cập nhật và sửa được sau đó.</p>' : ''}</div>`;
  }

  function render() {
    const open = r.batch.status === 'open';
    const how = r.game === 'conversion' ? 'xếp theo khách, rồi follower tăng, rồi view' : 'xếp theo view, rồi tỉ lệ chia sẻ';
    root.innerHTML = `
      <div class="page-head"><div><h1>${icon('grid')} Batch Review</h1>
        <p>Xem theo lô 10, không phán từng video. Xếp theo game trong Soulprint, rồi xem element nào đi với video thắng, element nào đi với video thua.</p></div>
        <div class="row"><select class="select input" data-batch style="width:auto">${batches.map((x) => `<option value="${x.id}" ${x.id === r.batch.id ? 'selected' : ''}>${esc(x.title)}${x.status === 'open' ? ' (đang mở)' : ''}</option>`).join('')}</select>
          <button type="button" class="btn" data-refresh ${r.posted && !busy ? '' : 'disabled'}>${icon('refresh')} Cập nhật số liệu cả lô</button>
          <a class="btn" href="${ideas.reviewUrl(r.batch.id)}">${icon('download')} Export .md</a>
          <button type="button" class="btn primary" data-close ${closing ? 'disabled' : ''}>${open ? 'Đóng lô' : 'Sửa điều mang sang'}</button></div></div>
      <div data-prog></div><div data-err></div>
      <div class="card card-pad bd-head"><b>${esc(r.batch.title)}</b><span>${r.posted}/${r.live} thẻ đã gắn link</span>${r.gameLabel ? `<span class="muted">Game ${esc(r.gameLabel)}: ${how}</span>` : ''}</div>
      ${r.note ? `<div class="callout">${esc(r.note)} <a href="#/soulprint">Mở Soulprint</a></div>` : ''}
      ${closeHtml()}${learnedHtml()}
      <div class="card fw-panel"><div class="fw-panel-head">${icon('bars')}<b>Xếp hạng</b></div><div class="fw-body">${rankHtml()}
        ${r.winner && !open ? `<div class="row" style="margin-top:8px"><a class="btn sm primary" href="#/board?from=redo:${r.winner.id}">${icon('refresh')} Làm lại video này: ${esc(r.winner.title)}</a></div>` : ''}
        ${r.winner && open ? '<p class="muted small">Đóng lô xong sẽ có nút làm lại video thắng nhất, vào lô sau.</p>' : ''}</div></div>
      <div class="card fw-panel"><div class="fw-panel-head">${icon('layers')}<b>Element thắng và thua</b></div><div class="fw-body">${tableHtml()}${losersHtml()}${levelsHtml()}</div></div>`;
  }

  const fail = (e) => {
    const box = root.querySelector('[data-err]');
    if (box) box.innerHTML = errorCallout(e);
  };

  root.addEventListener('change', async (e) => {
    const el = /** @type {HTMLSelectElement} */ (e.target);
    if (!el.matches('[data-batch]')) return;
    try {
      closing = null;
      await load(Number(el.value));
      render();
    } catch (err) { fail(err); }
  });
  root.addEventListener('input', (e) => {
    const el = /** @type {HTMLInputElement} */ (e.target);
    const d = el.dataset;
    if (!closing) return;
    if (d.line !== undefined) closing[Number(d.line)].text = el.value;
    else if (d.take !== undefined) closing[Number(d.take)].on = el.checked;
    else if (d.kind !== undefined) closing[Number(d.kind)].kind = /** @type {'keep'|'review'} */ (el.value);
  });
  root.addEventListener('click', async (e) => {
    const el = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('button'));
    if (!el) return;
    const d = el.dataset;
    try {
      if (d.refresh !== undefined) {
        busy = true;
        render();
        const box = /** @type {HTMLElement} */ (root.querySelector('[data-prog]'));
        box.innerHTML = progressCard(`Đang cập nhật ${r.posted} video`);
        try {
          const res = await runJob('batch_refresh', { batchId: r.batch.id }, (p) => updateProgress(box, p));
          toast(`Đã cập nhật ${res.checked} video${res.failed ? `, ${res.failed} video lỗi` : ''}`);
          await load(r.batch.id);
        } finally { busy = false; render(); }
      } else if (d.close !== undefined) {
        const l = r.batch.learned;
        closing = l && (l.keep.length || l.review.length)
          ? [...l.keep.map((text) => ({ on: true, kind: /** @type {const} */ ('keep'), text })), ...l.review.map((text) => ({ on: true, kind: /** @type {const} */ ('review'), text }))]
          : r.proposals.map((p) => ({ on: true, kind: p.kind, text: p.text }));
        if (!closing.length) closing.push({ on: true, kind: 'keep', text: '' });
        render();
      } else if (d.addLine !== undefined && closing) {
        closing.push({ on: true, kind: 'keep', text: '' });
        render();
      } else if (d.cancelClose !== undefined) {
        closing = null;
        render();
      } else if (d.confirmClose !== undefined && closing) {
        const take = closing.filter((c) => c.on && c.text.trim());
        const wasOpen = r.batch.status === 'open';
        await ideas.close(r.batch.id, { keep: take.filter((c) => c.kind === 'keep').map((c) => c.text), review: take.filter((c) => c.kind === 'review').map((c) => c.text) });
        closing = null;
        await load(r.batch.id);
        toast(wasOpen ? 'Đã đóng lô. Lô mới đã mở.' : 'Đã lưu điều mang sang');
        render();
      }
    } catch (err) { fail(err); }
  });

  render();
}
