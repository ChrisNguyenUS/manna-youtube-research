// "Bỏ N video lạc đề" with the list behind it, so the user can check what the on-topic rule left out.
import { esc, fmt } from '../lib.js';

/** @param {{url: string, caption: string, author?: string, plays: number, reason?: string}[]|undefined} list @param {number} [total] */
export function offTopicDetails(list, total = list?.length ?? 0) {
  if (!total) return '';
  return `<details class="tt-off card card-pad" style="margin-top:14px"><summary>Đã bỏ ${total} video lạc đề (bấm để xem)</summary>
    <div class="small muted" style="margin:6px 0">Đúng chủ đề = caption/hashtag có từ khoá (bỏ chữ “mỹ”, năm), hoặc có ít nhất 2 hashtag của chủ đề; video về nước khác bị bỏ. Muốn giữ hết thì bật “Giữ cả video lạc đề”.</div>
    ${(list ?? []).map((v) => `<div class="small"><a href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.caption || '(không có caption)')}</a> <span class="muted">· @${esc(v.author ?? '')} · ${fmt(v.plays)} view · ${esc(v.reason ?? '')}</span></div>`).join('')}</details>`;
}
