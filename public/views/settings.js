import { esc, icon, api, toast } from '../lib.js';
import { REGIONS } from './videos.js';

export async function mount(root) {
  const s = await api('/api/settings');
  root.innerHTML = `<div class="page-head"><div><h1>${icon('settings')} Cài đặt</h1><p>Lưu trên máy này.</p></div></div>
    <div class="card card-pad" style="max-width:760px">
      <div class="grid grid-2">
        <div class="field"><label>Khu vực mặc định</label><select class="select input" data-k="gl">${REGIONS.slice(1).map(([v, l]) => `<option value="${v}" ${s.gl === v ? 'selected' : ''}>${l} (${v})</option>`).join('')}</select>
          <div class="help">Ảnh hưởng thứ tự kết quả tìm kiếm của YouTube.</div></div>
        <div class="field"><label>Số request chạy song song</label><input class="input" type="number" min="1" max="8" data-k="concurrency" value="${s.concurrency}"><div class="help">4 là vừa. Tăng thì nhanh hơn nhưng dễ bị YouTube chặn tạm.</div></div>
        <div class="field"><label>Nghỉ giữa các request (ms)</label><input class="input" type="number" min="0" max="3000" data-k="delayMs" value="${s.delayMs}"></div>
        <div class="field"><label>Bỏ kênh dưới bao nhiêu sub khi tính "vượt kênh"</label><input class="input" type="number" min="0" data-k="minSubsForOutlier" value="${s.minSubsForOutlier}"><div class="help">Kênh quá nhỏ cho số vượt kênh rất nhiễu.</div></div>
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
    await api('/api/settings', { method: 'POST', body });
    toast('Đã lưu cài đặt');
  });
}
