import { settings as settingsApi } from '../http/client.js';
import { esc, icon, toast } from '../lib.js';
import { REGIONS } from './videos.js';

export async function mount(root) {
  const s = await settingsApi.get();
  root.innerHTML = `<div class="page-head"><div><h1>${icon('settings')} Cài đặt</h1><p>Lưu trên máy này.</p></div></div>
    <div class="card card-pad" style="max-width:760px">
      <div class="grid grid-2">
        <div class="field"><label>Khu vực mặc định</label><select class="select input" data-k="gl">${REGIONS.slice(1).map(([v, l]) => `<option value="${v}" ${s.gl === v ? 'selected' : ''}>${l} (${v})</option>`).join('')}</select>
          <div class="help">Ảnh hưởng thứ tự kết quả tìm kiếm của YouTube.</div></div>
        <div class="field"><label>Số request chạy song song</label><input class="input" type="number" min="1" max="8" data-k="concurrency" value="${s.concurrency}"><div class="help">4 là vừa. Tăng thì nhanh hơn nhưng dễ bị YouTube chặn tạm.</div></div>
        <div class="field"><label>Nghỉ giữa các request (ms)</label><input class="input" type="number" min="0" max="3000" data-k="delayMs" value="${s.delayMs}"></div>
        <div class="field"><label>Bỏ kênh dưới bao nhiêu sub khi tính "vượt kênh"</label><input class="input" type="number" min="0" data-k="minSubsForOutlier" value="${s.minSubsForOutlier}"><div class="help">Kênh quá nhỏ cho số vượt kênh rất nhiễu.</div></div>
        <div class="field"><label>Các nước dùng khi chọn 🌐 Toàn cầu</label><input class="input" data-k="globalRegions" value="${esc(s.globalRegions)}" placeholder="US,GB,IN,CA,AU,PH,VN,ID"><div class="help">Mã 2 chữ, cách nhau bằng dấu phẩy. Mỗi nước thêm 1 lượt tìm cho mỗi từ khoá.</div></div>
        <div class="field"><label>Video nổi bật = view ≥ bao nhiêu lần trung vị kênh</label><input class="input" type="number" min="1.5" step="0.5" data-k="outlierMultiple" value="${s.outlierMultiple}"></div>
      </div>
      <div class="section-label">AI phân tích (sắp có)</div>
      <div class="grid grid-2">
        <div class="field"><label>Nhà cung cấp</label><select class="select input" data-k="aiProvider"><option value="">Chưa dùng</option><option value="anthropic" ${s.aiProvider === 'anthropic' ? 'selected' : ''}>Claude (Anthropic)</option></select></div>
        <div class="field"><label>API key</label><input class="input" type="password" data-k="aiKey" value="${esc(s.aiKey)}" placeholder="sk-ant-…"></div>
      </div>
      <div class="callout info" style="margin-top:10px">Hiện tại app tự tính mọi số liệu. Muốn AI viết báo cáo: bấm <b>Markdown</b> ở báo cáo rồi đưa cho Claude, hoặc dùng skill <b>nghien-cuu-youtube</b> trong Claude Code.</div>
      <div class="row" style="margin-top:16px"><button class="btn primary" data-save>${icon('check')} Lưu</button></div></div>`;
  root.querySelector('[data-save]').addEventListener('click', async () => {
    const body = {};
    root.querySelectorAll('[data-k]').forEach((el) => (body[el.dataset.k] = el.type === 'number' ? Number(el.value) : el.value));
    await settingsApi.save(body);
    toast('Đã lưu cài đặt');
  });
  const { status, tiktokLogin } = await import('../http/client.js');
  const st = await status.get();
  root.querySelector('.callout.info').insertAdjacentHTML('afterend', `<div class="section-label">TikTok</div><div data-tiktok></div>`);
  const box = root.querySelector('[data-tiktok]');
  const day = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '');

  /** @param {{loggedIn: boolean, savedAt: string|null, expiresAt: string|null}} login @param {string} [note] */
  function render(login, note = '') {
    if (!st.tiktok?.searchReady) {
      box.innerHTML = `<div class="callout">Tìm kiếm TikTok chưa sẵn sàng. ${esc(st.tiktok?.reason || '')} (khoảng 150 MB). Comment TikTok vẫn dùng được.</div>`;
      return;
    }
    box.innerHTML = login.loggedIn
      ? `<div class="callout info">Đã đăng nhập TikTok${login.savedAt ? ` (lưu ngày ${day(login.savedAt)}` : ''}${login.expiresAt ? `, hết hạn ${day(login.expiresAt)})` : login.savedAt ? ')' : ''}. Tìm kiếm TikTok dùng phiên này.</div>
         <div class="row" style="margin-top:10px"><button class="btn" data-login>${icon('refresh')} Đăng nhập lại</button><button class="btn" data-logout>${icon('trash')} Đăng xuất</button></div>`
      : `<div class="callout">TikTok bắt đăng nhập mới cho tìm kiếm. Bấm nút dưới: một cửa sổ Chromium mở ra, bạn tự đăng nhập TikTok ở đó (quét mã QR bằng app TikTok là nhanh nhất). App chỉ giữ phiên đăng nhập trên máy này, không thấy mật khẩu.</div>
         <div class="row" style="margin-top:10px"><button class="btn primary" data-login>${icon('key')} Đăng nhập TikTok</button></div>`;
    if (note) box.insertAdjacentHTML('beforeend', `<div class="help" style="margin-top:8px">${esc(note)}</div>`);
    box.querySelector('[data-login]')?.addEventListener('click', async (e) => {
      const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
      btn.disabled = true;
      btn.textContent = 'Đang chờ bạn đăng nhập trong cửa sổ Chromium…';
      try {
        render(await tiktokLogin.start());
        toast('Đã đăng nhập TikTok');
      } catch (err) {
        render(await tiktokLogin.get(), err.message);
      }
    });
    box.querySelector('[data-logout]')?.addEventListener('click', async () => {
      render(await tiktokLogin.logout());
      toast('Đã đăng xuất TikTok trên máy này');
    });
  }
  render(await tiktokLogin.get());
}
