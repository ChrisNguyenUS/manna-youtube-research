// Card for one TikTok video. Covers are expiring CDN links: on error the image hides and a grey box with ▶ shows.
import { esc, fmt, ageText, icon, isSaved } from '../lib.js';

export function tiktokVideoCard(v, { selected = new Set() } = {}) {
  return `<div class="vcard tt-card" data-id="${esc(v.id)}">
    <div class="img tt-cover">${v.cover ? `<img loading="lazy" src="${esc(v.cover)}" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'">` : ''}
      ${v.hotScore != null ? `<span class="ov mult" data-tip="Hot score = tương tác ÷ (ngày + 2)">Hot ${fmt(v.hotScore)}</span>` : ''}
      ${v.onTopic === false ? '<span class="ov rank" style="background:var(--muted)">Lạc đề</span>' : ''}
      <label class="ov sel"><input type="checkbox" data-sel="${esc(v.id)}" ${selected.has(v.id) ? 'checked' : ''}></label></div>
    <div class="body"><a class="t1" href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.caption || '(không có caption)')}</a>
      <div class="stats row between"><span>@${esc(v.author)} · ${ageText(v.ageDays, true)}</span><button type="button" class="icon-btn ${isSaved('tiktok_video', v.id) ? 'on' : ''}" data-ttsave="${esc(v.id)}" title="Lưu video">${icon('bookmark')}</button></div>
      <div class="stats"><b>${fmt(v.plays)}</b> view · ${fmt(v.likes)} like · ${fmt(v.comments)} cmt · ${fmt(v.shares)} share · ${fmt(v.saves)} save</div></div>
  </div>`;
}
