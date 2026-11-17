# Gộp app cho gọn: thiết kế

> Ngày: 2026-11-16 · Trạng thái: đã duyệt · Phạm vi: giai đoạn 3 trong [kế hoạch tổng](../plans/2026-11-16-master-plan.md)
> Tài liệu liên quan: [ARCHITECTURE.md](../../ARCHITECTURE.md) · [2026-11-13-video-analysis-design.md](2026-11-13-video-analysis-design.md) (phần YouTube chưa làm)

## 1. Mục đích

Menu đang chia theo nền tảng, nên cùng một việc nằm ở hai chỗ và chủ app phải nhớ "việc này ở nhóm TikTok hay YouTube". Các giai đoạn sau thêm ít nhất bốn màn nữa; thêm vào cấu trúc này sẽ rối hơn.

Sau giai đoạn này, menu chia theo việc, và phân tích video là một màn duy nhất: dán link, app tự nhận nền tảng.

Thành công nghĩa là:
- Mỗi việc có đúng một mục menu.
- Dán link TikTok hoặc YouTube vào cùng một ô, app chạy đúng cách phân tích.
- Mọi báo cáo cũ và mọi link cũ vẫn mở đúng.
- Không dữ liệu nào bị đổi.

## 2. Hiện trạng đã kiểm tra (2026-11-16)

| Việc | TikTok | YouTube |
|---|---|---|
| Phân tích video | Có: thông số, script, comment (`#/tiktok/video`, job `tiktok_video_analysis`) | **Chưa có.** Chỉ có "Tìm video" và "Lấy comment". Nguồn YouTube chưa lấy được lời thoại. |
| Phân tích kênh | `#/tiktok/channel` | `#/channel`, `#/compare` |
| Bình luận | `#/tiktok/comments` (bảng dùng chung) | `#/comments` (lưu theo từng báo cáo) |
| Tìm | `#/tiktok/topic`, `#/tiktok/search` | `#/research`, `#/videos`, `#/channels` |

Hệ quả: "một màn phân tích video cho cả hai nền tảng" đòi phải làm phần YouTube trước. Phần đó đã có thiết kế trong spec 2026-11-13 nhưng chưa code.

## 3. Phạm vi

**Có:**
1. Menu mới theo việc (§4).
2. Công tắc nền tảng cho các mục có hai phiên bản (§5).
3. Một màn **Phân tích video** `#/video` cho cả hai nền tảng (§6).
4. Phân tích video YouTube: thông số và comment trước (§6.3), lời thoại là bước riêng (§6.4).
5. Tổng quan và các nút "Phân tích" ở màn khác trỏ về màn mới.

**Không (cố ý):**
- Gộp ruột hai màn phân tích kênh. Hai bản báo cáo khác nhau thật (cột, biểu đồ, nguồn số liệu); chỉ gộp lối vào.
- Đưa comment YouTube vào bảng `comments` dùng chung.
- So sánh chéo TikTok với YouTube trong một bảng.
- Đổi đường dẫn của các màn cũ, đổi tên job, đổi dữ liệu.

## 4. Menu mới

| Nhóm | Mục | Màn bên trong |
|---|---|---|
| (không tên) | Tổng quan · Soulprint | như cũ |
| Tìm | Chủ đề | TikTok: Tìm theo chủ đề, Tìm video · YouTube: Nghiên cứu chủ đề, Tìm video, Tìm kênh |
| Tìm | Từ khoá | Gợi ý từ khoá, Chấm điểm từ khoá (YouTube) |
| Tìm | Theo dõi | Kênh đang theo dõi |
| Mổ xẻ | Phân tích video | một màn (§6) |
| Mổ xẻ | Phân tích kênh | TikTok: Phân tích kênh · YouTube: Phân tích kênh, So sánh kênh |
| Khán giả | Bình luận | TikTok: Thu thập bình luận · YouTube: Lấy comment |
| Khán giả | Insight | Theo từ khoá, Từ comment đã có (TikTok) |
| Khán giả | 5W1H | 5W1H (AI) (TikTok) |
| Lưu trữ | Lịch sử · Đã lưu · Cài đặt | như cũ |

Nhóm **Làm** (Bảng ý tưởng, Dàn ý, Chấm lô) và mục **Thư viện gạch** được thêm ở các giai đoạn sau, vào đúng cấu trúc này.

Menu giảm từ 15 mục xuống 13 (tính cả Tổng quan và Soulprint), và không còn mục nào trùng việc. Trạng thái gập mở từng nhóm vẫn được nhớ như hiện nay.

## 5. Công tắc nền tảng

Mục nào có phiên bản cho cả hai nền tảng (Chủ đề, Phân tích kênh, Bình luận) hiện một công tắc **TikTok | YouTube** ở đầu thanh tab. Bấm công tắc đổi bộ tab bên dưới và mở tab đầu của nền tảng đó.

- App nhớ lựa chọn gần nhất cho từng mục.
- Mở một link cũ (ví dụ `#/channel?id=12`) thì công tắc tự đứng đúng nền tảng của màn đó.
- Mục chỉ có một nền tảng (Từ khoá, Insight, 5W1H) không có công tắc; tên nền tảng hiện thành nhãn nhỏ cạnh tiêu đề.

Về code: cấu trúc `Item` trong `web/app.js` thêm dạng `platforms: {tiktok: Tab[], youtube: Tab[]}` bên cạnh `tabs`. Đường dẫn các màn giữ nguyên, nên `web/kinds.js`, Lịch sử và các link đã lưu không đổi.

## 6. Màn Phân tích video

### 6.1 Nhập

- Một ô dán link, mỗi dòng một link, tối đa 10 link mỗi nền tảng.
- App nhận nền tảng từng dòng: `tiktok.com` và id 15 đến 25 chữ số là TikTok; `youtube.com`, `youtu.be` và id 11 ký tự là YouTube.
- Ô chọn **Nền tảng: Tự nhận | TikTok | YouTube**. Mặc định là Tự nhận. Chọn tay thì mọi dòng không nhận ra được coi là nền tảng đó; dòng nhận ra rõ là nền tảng kia được đánh dấu và không chạy.
- Dưới ô nhập, app nói rõ sẽ làm gì: "3 video TikTok, 2 video YouTube: chạy thành hai lần".
- Các lựa chọn như cũ: lấy script, số comment mỗi video (0, 100, 300), lấy cả trả lời, dùng lại comment đã có (chỉ TikTok).

### 6.2 Chạy và kết quả

- Mỗi nền tảng là một job riêng (`tiktok_video_analysis`, `video_analysis`), chạy lần lượt. Mỗi job một báo cáo, một bảng so sánh.
- Kết quả hiện bằng component `video-analysis` sẵn có; khác nhau ở vài cột theo nền tảng.
- `#/tiktok/video` là tên cũ của `#/video`: router chuyển sang và giữ nguyên tham số. Báo cáo cũ mở tại màn mới.

### 6.3 YouTube, bước 1: thông số và comment

Job `video_analysis` dùng vòng lặp dùng chung (`features/shared-video-analysis.js`) với nguồn YouTube hiện có (`getVideo`, `getComments`). Chưa có lời thoại: cột script ghi "YouTube chưa lấy được lời thoại" và bảng so sánh bỏ các cột về script.

### 6.4 YouTube, bước 2: lời thoại

Theo cách đã kiểm chứng trong spec 2026-11-13: Chromium ẩn mở trang xem, mở mô tả, bấm "Show transcript", đọc bảng lời thoại (20 đến 30 giây mỗi video). Thêm `getTranscript(id)` vào port YouTube, có phép thử sống trong `npm run probe`. Trình đọc lời thoại YouTube dùng một Chromium riêng (chỉ bật khi cần, tự đóng sau 2 phút rảnh), vì Chromium của nguồn TikTok gắn với phiên đăng nhập TikTok.

Đây là phần dễ gãy nhất vì phụ thuộc giao diện trang xem. Nó là bước riêng, làm sau cùng, và màn hình chạy được khi bước này lỗi: video không lấy được lời thoại vẫn có thông số và comment, kèm lý do.

## 7. Thành phần

- `web/app.js`: nhóm menu mới, dạng mục có `platforms`, công tắc, nhớ lựa chọn.
- `web/nav.js` (mới): dữ liệu menu và bảng tên cũ, tách khỏi `web/app.js` để test được.
- `web/views/video.js` (mới): màn gộp, viết từ `web/views/tiktok/video.js`; file cũ bị xoá, đường dẫn cũ do router chuyển.
- `web/video-links.js` (mới): nhận nền tảng từ link.
- `web/kinds.js`: `tiktok_video_analysis` và `video_analysis` cùng trỏ `/video`.
- `src/features/video-analysis.js` (mới): job `video_analysis` cho YouTube.
- `src/ports/youtube-source.js`, `src/sources/innertube/`: `getTranscript` (bước §6.4).
- `src/http/routes/jobs.js`: schema `video_analysis`.

## 8. Lỗi và trường hợp biên

| Tình huống | App làm gì |
|---|---|
| Dòng không phải link của nền tảng nào | Đánh dấu dòng đó, vẫn chạy các dòng còn lại |
| Quá 10 link của một nền tảng | Khoá nút chạy, nói rõ thừa bao nhiêu ở nền tảng nào |
| Job nền tảng thứ nhất lỗi | Job thứ hai vẫn chạy; mỗi khối kết quả có trạng thái riêng |
| Link `youtube.com/shorts/…` | Nhận là YouTube |
| Mở link màn cũ đã bỏ khỏi menu | Mở đúng màn, công tắc và mục menu sáng đúng chỗ |

## 9. Test

- `test/web-nav.test.js`: mọi đường dẫn cũ vẫn thuộc đúng một mục; mục có `platforms` chứa đủ các màn của §4; không mục nào trùng đường dẫn.
- `test/web-video.test.js`: hàm nhận nền tảng từ link (đủ các dạng ở §6.1 và §8), giới hạn 10 mỗi nền tảng.
- `test/features/video-analysis.test.js` với nguồn giả: YouTube chạy trọn với script trống; một video lỗi không làm hỏng lô.
- `test/http`: schema job `video_analysis`; xuất Markdown.
- Test nguồn cho `getTranscript` bằng fixture, cộng phép thử sống.
- Kiểm trong trình duyệt: đi hết menu, mở một báo cáo cũ của mỗi loại.

## 10. Thứ tự làm

1. Menu mới và công tắc nền tảng.
2. Màn Phân tích video gộp, YouTube có thông số và comment.
3. Lời thoại YouTube.

Bước 1 và 2 không phụ thuộc lớp LLM. Giai đoạn 4 (thư viện gạch) chạy được với YouTube khi bước 3 xong; trước đó nó chỉ bóc gạch YouTube từ tiêu đề và comment.
