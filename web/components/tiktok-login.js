// Reminder at the top of the TikTok screens that search: TikTok only answers searches for a signed-in session.
// Shown when nobody is signed in or the saved sign-in is about to expire; silent otherwise.
import { status, tiktokLogin } from '../http/client.js';
import { esc, icon } from '../lib.js';

const SOON = 3 * 86400000;
const day = (iso) => new Date(iso).toLocaleDateString('vi-VN');

/** @param {Element} el @returns {() => void} off */
export function tiktokLoginNotice(el) {
  let alive = true;
  async function render() {
    const [st, login] = await Promise.all([status.get().catch(() => null), tiktokLogin.get().catch(() => null)]);
    if (!alive || !st || !login) return;
    const left = login.expiresAt ? Date.parse(login.expiresAt) - Date.now() : Infinity;
    if (!st.tiktok?.searchReady) el.innerHTML = `<div class="callout tt-login">Tìm kiếm TikTok chưa sẵn sàng trên máy này. ${esc(st.tiktok?.reason || '')} Lấy comment theo link vẫn dùng được.</div>`;
    else if (!login.loggedIn || left <= 0) el.innerHTML = `<div class="callout tt-login"><div><b>${left <= 0 ? 'Phiên đăng nhập TikTok đã hết hạn.' : 'Chưa đăng nhập TikTok.'}</b> TikTok chỉ cho tìm kiếm khi đã đăng nhập, nên màn này chưa chạy được. Bấm nút bên cạnh: một cửa sổ Chromium mở ra, bạn tự đăng nhập ở đó (quét mã QR bằng app TikTok là nhanh nhất). App chỉ giữ phiên trên máy này, không thấy mật khẩu.</div>
        <button type="button" class="btn primary" data-tt-login>${icon('key')} Đăng nhập TikTok</button></div>`;
    else if (left < SOON) el.innerHTML = `<div class="callout info tt-login"><div>Phiên đăng nhập TikTok hết hạn ngày <b>${day(login.expiresAt)}</b>. Đăng nhập lại trước để lần quét sau không bị dừng giữa chừng.</div>
        <button type="button" class="btn" data-tt-login>${icon('refresh')} Đăng nhập lại</button></div>`;
    else el.innerHTML = '';
  }
  // The sign-in button itself is handled once for the whole app (web/lib.js); it says here when it is done.
  window.addEventListener('tiktok-login', render);
  render();
  return () => {
    alive = false;
    window.removeEventListener('tiktok-login', render);
  };
}
