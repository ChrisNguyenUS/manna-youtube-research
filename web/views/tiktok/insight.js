// Insight khách hàng on TikTok: the shared insight screen (web/views/insight-view.js) with TikTok's search filters.
import { mountInsight } from '../insight-view.js';
import { tiktokLoginNotice } from '../../components/tiktok-login.js';
import { tiktokFilterSelects, offTopicDetails, tiktokCriteria } from '../../components/index.js';

const FORM = { keywords: '', top: 10, commentsPerVideo: 300, replies: true, keepOffTopic: false, minPlays: 0, minLikes: 0, maxAgeDays: 0, minEngagement: 0 };
const KEYS = Object.keys(FORM);

/** @type {import('../insight-view.js').InsightCfg} */
const TIKTOK = {
  kind: 'tiktok_insight',
  path: '/tiktok/insight',
  formKey: 'tt-insight-form',
  form: FORM,
  label: 'TikTok',
  title: 'Insight khách hàng (TikTok)',
  intro: 'Đọc comment của các video TikTok top đúng chủ đề để biết khách đang hỏi gì, sợ gì, ai đang cân nhắc thuê dịch vụ, và câu chữ thật của họ.',
  placeholder: 'Ví dụ: di trú mỹ, phỏng vấn quốc tịch',
  help: 'Viết tiếng Việt, ghi rõ nước (“di trú mỹ”, không chỉ “di trú”). Nhiều từ khoá thì cách nhau bằng dấu phẩy.',
  commentTip: 'Số comment gốc tối đa đọc ở mỗi video. TikTok xếp comment nổi bật lên trước.',
  notice: tiktokLoginNotice,
  filters: (st) => tiktokFilterSelects(st),
  onFilter(el, st, ev) {
    if (ev !== 'change' || !el.matches('[data-filter]')) return false;
    st[/** @type {HTMLElement} */ (el).dataset.filter] = Number(/** @type {HTMLSelectElement} */ (el).value) || 0;
    return true;
  },
  checks: (st) => `<label class="ix-check"><input type="checkbox" data-k="keepOffTopic" ${st.keepOffTopic ? 'checked' : ''}><span><b>Giữ lại video ngoài chủ đề để tham khảo</b><span class="ix-help">Bình thường video không khớp chủ đề (hoặc nói về nước khác) bị bỏ. Bật lên để đọc comment của cả những video đó.</span></span></label>`,
  criteria: (p) => tiktokCriteria({ minPlays: p.minPlays, minLikes: p.minLikes, maxAgeDays: p.maxAgeDays, minEngagement: p.minEngagement, keepOffTopic: p.keepOffTopic }),
  // The form's values are the job's input, as before.
  body: (st) => Object.fromEntries(KEYS.map((k) => [k, st[k]])),
  fromParams: (p) => p,
  countsLine: (d) => `${d.counts.found} video tìm được · ${d.counts.offTopic} lạc đề bỏ${d.counts.belowFilters ? ` · ${d.counts.belowFilters} dưới ngưỡng lọc` : ''}${d.failedVideos.length ? ` · ${d.failedVideos.length} video lỗi` : ''}`,
  reportExtra: (d) => offTopicDetails(d.offTopicVideos, d.offTopicVideos ? d.counts.offTopic : 0),
};

/** @param {Element} root @param {Record<string, string>} params */
export const mount = (root, params) => mountInsight(root, params, TIKTOK);
