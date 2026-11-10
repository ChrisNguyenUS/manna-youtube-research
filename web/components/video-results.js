// Interactive video results: filters + toolbar + table/grid + selection.
import { VIDEO_FILTER_DEFAULT, filterVideos, videoFilterPanel, bindVideoFilters } from './video-filters.js';
import { videoToolbar, videoTable, videoGrid } from './video-table.js';
import { esc, fmt, full, mult, dur, ageText, thumb, ytVideo, icon, chips, bindChips, isSaved, toggleSave, store, persist, median, emptyState, bindTips, metric } from '../lib.js';
export function mountVideoResults(container, videos, { key = 'vf', onComments, regions = [] } = {}) {
  const f = store(key, VIDEO_FILTER_DEFAULT);
  if (f.region && !regions.includes(f.region)) f.region = '';
  const selected = new Set();
  container.innerHTML = `<div data-filters></div><div class="card" style="margin-top:14px"><div data-toolbar></div><div data-sel-bar></div><div data-list></div></div>`;
  container.querySelector('[data-filters]').innerHTML = videoFilterPanel(f, regions);
  bindVideoFilters(container.querySelector('[data-filters]'), f, key, render);
  bindTips(container);

  function render() {
    const list = filterVideos(videos, f);
    const tb = container.querySelector('[data-toolbar]');
    tb.innerHTML = videoToolbar(f, list.length, videos.length);
    tb.querySelectorAll('[data-f]').forEach((el) =>
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        f[el.dataset.f] = el.value;
        persist(key, f);
        if (el.tagName === 'SELECT') render();
        else renderList(filterVideos(videos, f));
      }),
    );
    tb.querySelectorAll('[data-viewmode]').forEach((b) =>
      b.addEventListener('click', () => {
        f.view = b.dataset.viewmode;
        persist(key, f);
        render();
      }),
    );
    renderList(list);
  }
  function renderList(list) {
    const shown = list.slice(0, 500);
    container.querySelector('[data-list]').innerHTML = f.view === 'grid' ? videoGrid(shown, { selected }) : videoTable(shown, { selected });
    const n = tbCount();
    if (n) n.textContent = list.length;
    selBar();
  }
  const tbCount = () => container.querySelector('[data-toolbar] b');
  function selBar() {
    const bar = container.querySelector('[data-sel-bar]');
    bar.innerHTML = selected.size
      ? `<div class="row" style="padding:10px 16px;background:var(--accent-soft);border-bottom:1px solid var(--accent-line)"><b>Đã chọn ${selected.size} video</b>
        <button class="btn sm primary" data-bulk-comments>${icon('message')} Lấy comment</button>
        <button class="btn sm" data-bulk-clear>Bỏ chọn</button></div>`
      : '';
    bar.querySelector('[data-bulk-comments]')?.addEventListener('click', () => onComments?.([...selected]));
    bar.querySelector('[data-bulk-clear]')?.addEventListener('click', () => {
      selected.clear();
      render();
    });
  }
  container.addEventListener('change', (e) => {
    const s = e.target.closest('[data-sel]');
    if (s) {
      s.checked ? selected.add(s.dataset.sel) : selected.delete(s.dataset.sel);
      selBar();
    }
    if (e.target.matches('[data-selall]')) {
      const ids = filterVideos(videos, f).slice(0, 500).map((v) => v.id);
      ids.forEach((id) => (e.target.checked ? selected.add(id) : selected.delete(id)));
      renderList(filterVideos(videos, f));
    }
  });
  container.addEventListener('click', (e) => {
    const sv = e.target.closest('[data-save]');
    if (sv) {
      const v = videos.find((x) => x.id === sv.dataset.save);
      toggleSave('video', v.id, v.title, { id: v.id, title: v.title, channelTitle: v.channelTitle, channelId: v.channelId, views: v.views, channelSubs: v.channelSubs, viewSub: v.viewSub, durationSec: v.durationSec }, sv);
    }
    const cm = e.target.closest('[data-comment]');
    if (cm) onComments?.([cm.dataset.comment]);
  });
  render();
  return { selected };
}
