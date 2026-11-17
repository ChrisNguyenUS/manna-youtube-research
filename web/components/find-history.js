// The history card of a search screen: the results of the same job on both platforms in one list, newest first, each
// with its platform, its settings, "Chạy lại" (same settings, run again) and delete (a second click confirms).
// "Chạy lại" opens `<path>?rerun=<id>`: the screen of that result runs the saved settings again.
import { records } from '../http/client.js';
import { esc, icon, ago, emptyState, toast, store, persist } from '../lib.js';
import { PLATFORM_LABELS } from '../nav.js';
import { tiktokCriteria } from './tiktok-filters.js';
import { youtubeCriteria, tiktokRegion } from '../search-options.js';

/**
 * @typedef {{kind: string, path: string, platform: 'tiktok'|'youtube', criteria: (p: any) => string, byRef?: boolean}} Source
 *   byRef: one line per subject (its latest result) with how many times it was run (topic scans)
 */
const tiktok = (p) => [tiktokRegion(p), tiktokCriteria(p)].filter(Boolean).join(' · ');

const CHANNEL_SOURCES = { both: 'kênh + chủ video hot', channels: 'ô tìm kênh', videos: 'chủ video hot' };

/** @type {Record<'topic'|'video'|'channel', Source[]>} */
export const FIND_SOURCES = {
  topic: [
    { kind: 'tiktok_topic', path: '/tiktok/topic', platform: 'tiktok', criteria: tiktok, byRef: true },
    // A report's title already says its direction and time window.
    { kind: 'research', path: '/research', platform: 'youtube', criteria: (p) => youtubeCriteria(p && { ...p, upload: '' }) },
  ],
  video: [
    { kind: 'tiktok_search', path: '/tiktok/search', platform: 'tiktok', criteria: tiktok },
    { kind: 'video_search', path: '/videos', platform: 'youtube', criteria: youtubeCriteria },
  ],
  // A channel search has no date filter on screen: its settings are where the channels came from and the region.
  channel: [{ kind: 'channel_search', path: '/channels', platform: 'youtube', criteria: (p) => [CHANNEL_SOURCES[p?.source] ?? '', youtubeCriteria(p && { ...p, upload: '' })].filter(Boolean).join(' · ') }],
};

/**
 * @param {Element} el the card
 * @param {'topic'|'video'|'channel'} job
 * @param {{limit?: number}} [o]
 * @returns {() => Promise<void>} refresh, to call after a new result was saved
 */
export function findHistory(el, job, { limit = 8 } = {}) {
  const sources = FIND_SOURCES[job];
  const both = new Set(sources.map((s) => s.platform)).size > 1;
  const key = `find-history-${job}`;
  const st = store(key, { plat: 'all' });
  let armed = ''; // id of the row whose delete button waits for a second click
  /** @type {any[]} */
  let rows = [];

  function render() {
    const shown = rows.filter((r) => !both || st.plat === 'all' || r.src.platform === st.plat).slice(0, limit);
    const kind = both && st.plat !== 'all' ? sources.find((s) => s.platform === st.plat)?.kind : !both ? sources[0].kind : '';
    const filter = both
      ? `<div class="chips find-hfilter">${[['all', 'Tất cả'], ...Object.entries(PLATFORM_LABELS)].map(([v, l]) => `<button type="button" class="chip ${st.plat === v ? 'on' : ''}" data-hplat="${v}">${l}</button>`).join('')}</div>`
      : '';
    el.innerHTML = `<div class="card-head"><h3>${icon('clock')} Đã chạy gần đây</h3>${filter}<a class="btn sm" href="#/history${kind ? `?kind=${kind}` : ''}" style="margin-left:auto">Xem tất cả</a></div>${
      shown.length
        ? shown
            .map((r) => {
              const crit = r.src.criteria(r.params);
              return `<div class="list-row find-hrow"><span class="plat-badge ${r.src.platform}">${PLATFORM_LABELS[r.src.platform]}</span><a class="name" href="#${r.src.path}?id=${r.id}">${esc(r.title)}</a>${crit ? `<span class="small muted">${esc(crit)}</span>` : ''}
                <span class="when">${ago(r.created_at)}${r.count > 1 ? ` · ${r.count} lần` : ''}</span>
                <a class="btn sm" href="#${r.src.path}?rerun=${r.id}" title="Chạy lại với đúng cài đặt này">${icon('refresh')} Chạy lại</a>
                ${armed === String(r.id) ? `<button type="button" class="btn sm danger" data-del="${r.id}">Xoá hẳn?</button>` : `<button type="button" class="icon-btn" data-del="${r.id}" title="Xoá${r.count > 1 ? ' lần chạy mới nhất' : ''}">${icon('trash')}</button>`}</div>`;
            })
            .join('')
        : emptyState(st.plat === 'all' ? 'Chưa chạy lần nào' : `Chưa chạy lần nào trên ${PLATFORM_LABELS[st.plat]}`)
    }`;
  }

  async function refresh() {
    const lists = await Promise.all(
      sources.map(async (src) => {
        const list = await records.list(src.kind, src.byRef ? 60 : limit);
        if (!src.byRef) return list.map((r) => ({ ...r, src, count: 1 }));
        const byRef = new Map();
        for (const r of list) {
          const cur = byRef.get(r.ref);
          if (cur) cur.count++;
          else byRef.set(r.ref, { ...r, src, count: 1 });
        }
        return [...byRef.values()];
      }),
    );
    rows = lists.flat().sort((a, b) => b.created_at - a.created_at);
    armed = '';
    render();
  }

  el.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const plat = /** @type {HTMLElement|null} */ (t.closest('[data-hplat]'));
    if (plat) {
      st.plat = String(plat.dataset.hplat);
      persist(key, st);
      armed = '';
      return render();
    }
    const b = /** @type {HTMLElement|null} */ (t.closest('[data-del]'));
    if (!b) return;
    const id = String(b.dataset.del);
    if (armed !== id) {
      armed = id; // a deleted result cannot be brought back: the first click only asks
      return render();
    }
    await records.remove(id);
    toast('Đã xoá');
    refresh();
  });
  return refresh;
}

/**
 * `?rerun=<id>` on a search screen: the saved result, with the address cleaned so a reload does not run it again.
 * @param {Record<string, string>} params @param {string} path
 */
export async function rerunRecord(params, path) {
  if (!params.rerun) return null;
  window.history.replaceState(null, '', '#' + path);
  try {
    return await records.get(params.rerun);
  } catch (e) {
    toast(e.message, 'error');
    return null;
  }
}
