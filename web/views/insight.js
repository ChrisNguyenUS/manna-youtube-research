// Insight khách hàng on YouTube: the shared insight screen (web/views/insight-view.js) with YouTube's search filters:
// region, upload date, and duration (long form and Shorts are different audiences, so the duration is always asked).
import { mountInsight } from './insight-view.js';
import { chips, esc, icon } from '../lib.js';
import { fieldRows, regionSelect } from '../components/find-shell.js';
import { DUR_CHIPS, UPLOAD_CHIPS, REGIONS, durToSeconds, durText, youtubeCriteria } from '../search-options.js';

const FORM = { keywords: '', gl: '', upload: 'year', dur: '4-20', minDur: '', maxDur: '', perKeyword: 40, top: 10, commentsPerVideo: 300, replies: true };
const PER_KEYWORD = [20, 40, 80].map((v) => ({ v, label: String(v) }));

/** @param {Record<string, any>} st */
const filters = (st) =>
  fieldRows([
    ['globe', 'Khu vực', regionSelect(st.gl, REGIONS)],
    ['calendar', 'Đăng trong', chips('upload', UPLOAD_CHIPS, st.upload)],
    ['clock', 'Độ dài video', `${chips('dur', DUR_CHIPS, st.dur)}<span class="muted small">hoặc</span>
      <input class="input sm" style="width:84px" data-k="minDur" placeholder="Từ (phút)" aria-label="Từ (phút)" value="${esc(st.minDur)}"> – <input class="input sm" style="width:84px" data-k="maxDur" placeholder="Đến" aria-label="Đến (phút)" value="${esc(st.maxDur)}">
      <span class="rs-tip" tabindex="0" data-tip="Video dài và Shorts có khán giả khác nhau: chọn đúng loại bạn làm." aria-label="Giải thích độ dài">${icon('info')}</span>`],
    ['play', 'Video tìm mỗi từ khoá', chips('perKeyword', PER_KEYWORD, st.perKeyword)],
  ]);

/** @type {import('./insight-view.js').InsightCfg} */
const YOUTUBE = {
  kind: 'youtube_insight',
  path: '/insight',
  formKey: 'yt-insight-form',
  form: FORM,
  label: 'YouTube',
  title: 'Insight khách hàng (YouTube)',
  intro: 'Đọc comment của các video YouTube đang hot cho từ khoá để biết khán giả đang hỏi gì, sợ gì, ai đang cân nhắc thuê dịch vụ, và câu chữ thật của họ.',
  placeholder: 'Ví dụ: định cư mỹ, phỏng vấn quốc tịch',
  help: 'Thị trường Việt thì dùng từ khoá tiếng Việt; từ khoá tiếng Anh trả về video nước ngoài. Nhiều từ khoá thì cách nhau bằng dấu phẩy. Video “hot” = nhiều view mỗi ngày nhất.',
  commentTip: 'Số comment gốc tối đa đọc ở mỗi video, theo thứ tự “Hàng đầu” của YouTube.',
  filters,
  onFilter(el, st, ev) {
    const box = /** @type {HTMLElement} */ (el.closest('[data-filters]'));
    if (ev === 'click') {
      const chip = /** @type {HTMLElement|null} */ (el.closest('[data-chips] .chip'));
      if (!chip) return false;
      const name = String(/** @type {HTMLElement} */ (chip.closest('[data-chips]')).dataset.chips);
      st[name] = name === 'perKeyword' ? Number(chip.dataset.v) : chip.dataset.v;
      if (name === 'dur') (st.minDur = ''), (st.maxDur = '');
    } else {
      const k = /** @type {HTMLElement} */ (el).dataset.k;
      if (!k) return false;
      st[k] = /** @type {HTMLInputElement} */ (el).value.trim();
      if (k === 'minDur' || k === 'maxDur') st.dur = '';
    }
    box.innerHTML = filters(st);
    return true;
  },
  checks: () => '',
  criteria: (p) => youtubeCriteria(p),
  body: (st) => ({ keywords: st.keywords, gl: st.gl, upload: st.upload, ...durToSeconds(st), perKeyword: st.perKeyword, top: st.top, commentsPerVideo: st.commentsPerVideo, replies: st.replies }),
  fromParams(p) {
    const chip = DUR_CHIPS.find((c) => c.v && durText(p.minDur, p.maxDur) === c.label);
    const minutes = (x) => (x ? String(Math.round(Number(x) / 60)) : '');
    return {
      ...p,
      dur: chip ? chip.v : '',
      minDur: chip ? '' : minutes(p.minDur),
      maxDur: chip ? '' : minutes(p.maxDur),
    };
  },
  countsLine: (d) => `${d.counts.found} video tìm được · đọc comment ${d.counts.kept} video hot nhất${d.failedVideos.length ? ` · ${d.failedVideos.length} video lỗi hoặc tắt bình luận` : ''}`,
  reportExtra: (d) =>
    d.failedVideos?.length
      ? `<details class="card card-pad" style="margin-top:12px"><summary class="small">${d.failedVideos.length} video không đọc được comment</summary>${d.failedVideos.map((f) => `<div class="small"><a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.url)}</a> <span class="muted">· ${esc(f.error)}</span></div>`).join('')}</details>`
      : '',
};

/** @param {Element} root @param {Record<string, string>} params */
export const mount = (root, params) => mountInsight(root, params, YOUTUBE);
