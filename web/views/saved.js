import { saved } from '../http/client.js';
import { esc, icon, fmt, mult, ago, emptyState, ytVideo, thumb, ytChannel, toast, loadSaved } from '../lib.js';

export async function mount(root, params) {
  let tab = params.tab || 'channel';
  root.innerHTML = `<div class="page-head"><div><h1>${icon('bookmark')} Đã lưu</h1><p>Kênh và video tiềm năng bạn đã lưu, kèm ghi chú.</p></div></div>
    <div class="card"><div class="tabs"><button class="tab" data-tab="channel">Kênh</button><button class="tab" data-tab="video">Video</button></div><div data-body></div></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => ((tab = b.dataset.tab), render())));
  async function render() {
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const list = await saved.list(tab);
    const body = root.querySelector('[data-body]');
    if (!list.length) return (body.innerHTML = emptyState('Chưa lưu gì', 'Bấm biểu tượng dấu trang ở kết quả tìm kiếm để lưu.'));
    body.innerHTML = `<table class="t"><tbody>${list
      .map((s) => {
        const d = s.data;
        const head =
          tab === 'channel'
            ? `<td style="width:56px">${d.avatar ? `<img src="${esc(d.avatar)}" referrerpolicy="no-referrer" style="width:44px;height:44px;border-radius:50%" alt="">` : ''}</td><td><a href="${ytChannel(d)}" target="_blank" rel="noopener"><b>${esc(d.title)}</b></a><div class="muted small">${fmt(d.subs)} sub · trung vị ${fmt(d.medianViews)} view${d.country ? ' · ' + esc(d.country) : ''}</div></td>`
            : `<td class="thumb"><img src="${thumb(d.id)}" alt=""></td><td class="title-cell"><a href="${ytVideo(d.id)}" target="_blank" rel="noopener">${esc(d.title)}</a><div class="meta">${esc(d.channelTitle)} · ${fmt(d.views)} view · ${mult(d.viewSub)} sub</div></td>`;
        return `<tr>${head}<td><input class="input sm" data-note="${esc(s.ref)}" placeholder="Ghi chú…" value="${esc(s.note || '')}"></td><td class="muted small r">${ago(s.created_at)}</td>
          <td class="actions">${tab === 'channel' ? `<a class="btn sm" href="#/channel?input=${encodeURIComponent(d.id)}">${icon('bars')} Phân tích</a>` : `<a class="btn sm" href="#/comments?videos=${d.id}">${icon('message')} Comment</a>`} <button class="icon-btn" data-del="${esc(s.ref)}">${icon('trash')}</button></td></tr>`;
      })
      .join('')}</tbody></table>`;
    body.querySelectorAll('[data-note]').forEach((i) => i.addEventListener('change', async () => (await saved.note({ kind: tab, ref: i.dataset.note, note: i.value }), toast('Đã lưu ghi chú'))));
    body.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => (await saved.remove({ kind: tab, ref: b.dataset.del }), await loadSaved(), render())));
  }
  render();
}
