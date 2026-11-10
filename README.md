# YouTube Research

App nghiên cứu YouTube chạy trên máy: tìm video, lọc kênh kiểu Playboard, phân tích kênh, lấy comment, kiểm tra ý tưởng. **Không cần API key, không tốn phí, không cần `npm install`** (Node ≥ 22.13, dùng `node:sqlite` có sẵn).

```bash
npm start          # mở http://localhost:5178
npm test           # unit test parser + chỉ số
```

### Icon bấm là chạy

```bash
bash scripts/make-app.sh          # tạo /Applications/YouTube Research.app
```

Bấm icon: nếu server chưa chạy thì bật nền (log ở `data/server.log`), rồi mở trình duyệt. Server chạy tiếp tới khi tắt máy hoặc `pkill -f src/main.js`. Đổi đường dẫn repo hay cài lại Node thì chạy lại lệnh trên.

## Lấy dữ liệu thế nào

Gọi API nội bộ mà chính youtube.com dùng (`youtubei/v1`), không đăng nhập — giống cách actor TikTok trong `~/tiktok-keyword-comments-actor`:

| Việc | Endpoint | Ghi chú |
|---|---|---|
| Tìm video / kênh | `search` + bộ lọc `sp` (protobuf) | Lọc ngày đăng (hôm nay/tuần/tháng/năm), độ dài, xếp theo phổ biến. Giá trị đã đối chiếu với menu lọc của YouTube ngày 2026-11-06 |
| Sub, số video, avatar | `browse` (trang kênh) | Cache 3 ngày |
| Quốc gia, ngày tạo kênh, tổng view | `browse` continuation của panel About | |
| Video của kênh | `browse` tab Videos / Shorts | 30 video mỗi trang |
| Ngày đăng chính xác, like | `player`, `next` | Chỉ cho top N video vì tốn request |
| Comment + trả lời | `next` continuation | Nổi bật hoặc Mới nhất |
| Gợi ý tìm kiếm | `suggestqueries-clients6.youtube.com` | |

Mặc định 4 request song song, nghỉ ~200 ms, tự thử lại khi gặp 429/5xx. Chỉnh trong **Cài đặt**.

Không lấy được: transcript/phụ đề (YouTube yêu cầu token khi không đăng nhập), số view theo ngày của kênh (Playboard có vì họ lưu lịch sử). "View video 7/30 ngày" trong app = tổng view của các video kênh đăng trong 7/30 ngày qua.

## Chỉ số

- **Vượt kênh** = view ÷ sub của kênh. > 1 = video kéo được người ngoài tệp sub (thắng nhờ nội dung). Bỏ kênh < 500 sub.
- **View/ngày** = view ÷ tuổi video (tối thiểu 1 ngày). Tuổi có `~` là ước tính từ "3 tháng trước"; không có `~` là ngày đăng chính xác.
- **Video nổi bật** (phân tích kênh) = view ≥ 3× trung vị của kênh.
- **Điểm từ khoá** (kiểu vidIQ): Volume *ước tính* = 50% view trung vị top 20 + 30% view/ngày + 20% có trong gợi ý tìm kiếm; Competition = 45% sub trung vị + 25% tiêu đề chứa từ khoá + 15% kênh ≥ 1 triệu sub + 15% video mới 30 ngày; Tổng = 55% Volume + 45% (100 − Competition). Không có lượng tìm kiếm thật như vidIQ.
- **VPH** = view ÷ số giờ kể từ lúc đăng.
- **Lift của mẫu tiêu đề** = trung vị chỉ số của nhóm ÷ trung vị chung.

## Cấu trúc

```
src/yt/          innertube client, parser, search, channel, comments
src/analysis/    metrics, phân tích tiêu đề + comment, xuất Markdown/CSV
src/services.js  các thao tác nghiên cứu (dùng chung cho server và CLI)
src/server.js    HTTP API + job nền + file tĩnh
src/cli/index.js       CLI cho skill
public/          giao diện (JS thuần, không build)
skills/nghien-cuu-youtube/   skill Claude Code (symlink vào ~/.claude/skills)
data/            SQLite (gitignore)
```

## CLI

```bash
node src/cli/index.js research "kể chuyện lịch sử" --keywords "lịch sử việt nam, chuyện xưa" --gl VN --min 4 --max 20 --comments 5
node src/cli/index.js channel "@BlackJournals"
node src/cli/index.js comments https://www.youtube.com/watch?v=... --max 200
node src/cli/index.js ideas "từ khoá 1" "từ khoá 2" --gl VN   # chấm điểm kiểu vidIQ
```

Kết quả: `output/*.digest.md`, đồng thời hiện trong app.

## AI (sau này)

App tự tính mọi số liệu. Mỗi báo cáo có nút **Markdown**: file gọn để đưa cho Claude, hoặc dùng skill `nghien-cuu-youtube`. Ô API key trong Cài đặt đã có sẵn để nối AI vào app sau.
