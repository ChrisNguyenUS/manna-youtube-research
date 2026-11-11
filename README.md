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

Kiến trúc chi tiết và luật thêm tính năng: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Sản phẩm: [docs/youtube-research-prd.md](docs/youtube-research-prd.md).

```
src/
  main.js            entry: npm start, launcher macOS
  app.js             composition root: chọn adapter, đăng ký use case + job
  config.js          nơi duy nhất đọc biến môi trường
  core/              tính toán thuần: metrics (outlier, view/sub, VPH), phân tích tiêu đề/comment, chấm điểm từ khoá, Markdown/CSV
  ports/             hợp đồng: YouTubeSource, Store
  sources/innertube/ lấy dữ liệu YouTube (không key) + fixture test
  sources/fake/      nguồn giả cho test
  store/sqlite/      SQLite: migration đánh số, repo theo workspace, job
  store/upgrades/    nâng cấp record cũ khi đọc
  jobs/runner.js     job nền lưu DB (chống chạy trùng, huỷ, gián đoạn)
  features/          use case: tìm video, tìm kênh, phân tích kênh, nghiên cứu, comment, chấm điểm, gợi ý từ khoá
  http/              router khai báo, kiểm tra input, /api/v1
  cli/index.js       CLI cho skill
web/                 giao diện (JS thuần, không build): http/client.js, components/, views/
scripts/             make-app.sh (icon macOS), probe.js (kiểm tra YouTube còn đúng định dạng)
skills/nghien-cuu-youtube/   skill Claude Code (symlink vào ~/.claude/skills)
data/                SQLite + backups/ (gitignore)
```

Lệnh kiểm tra:

```bash
npm test             # typecheck (JSDoc) + test, không cần mạng
npm run probe        # gọi YouTube thật 6 lần, báo nếu định dạng đổi
```

## CLI

```bash
node src/cli/index.js research "kể chuyện lịch sử" --keywords "lịch sử việt nam, chuyện xưa" --gl VN --min 4 --max 20 --comments 5
node src/cli/index.js channel "@BlackJournals"
node src/cli/index.js comments https://www.youtube.com/watch?v=... --max 200
node src/cli/index.js ideas "từ khoá 1" "từ khoá 2" --gl VN   # chấm điểm kiểu vidIQ
```

Kết quả: `output/*.digest.md`, đồng thời hiện trong app.

## TikTok (insight khách hàng)

Nhóm **TikTok** trong menu có 3 màn:

- **Insight khách hàng**: tìm video hot theo từ khoá, đọc comment của top video, gom lại thành khách hỏi gì, sợ gì, phàn nàn gì, muốn mua gì, cùng câu chữ thật họ hay dùng. Nút **Markdown** cho file gọn để đưa Claude viết góc quảng cáo và hook.
- **Tìm video TikTok**: lưới video xếp theo Hot score (tương tác ÷ (ngày + 2)), lọc theo tuổi, like, comment; chọn video rồi bấm **Lấy comment**.
- **Comment TikTok**: dán link (kể cả `vm.tiktok.com`), lấy tới 300 comment kèm trả lời.

Tìm kiếm TikTok cần Chromium ẩn, cài một lần (~150 MB):

```bash
npm run setup:tiktok
```

Lấy comment theo link không cần bước này. Nếu TikTok chặn tìm kiếm, app báo lỗi, không tự chuyển sang dịch vụ trả phí.

```bash
node src/cli/index.js tiktok-insight "thi quốc tịch mỹ" "phỏng vấn quốc tịch" --top 10 --comments 300
```

Ghi chú:
- App không lưu tên hay username người bình luận, chỉ lưu nội dung comment.
- Từ khoá nên có chữ tiếng Việt và ghi rõ nước (vd "thi quốc tịch mỹ"); video không có từ khoá trong caption/hashtag bị bỏ.

## AI (sau này)

App tự tính mọi số liệu. Mỗi báo cáo có nút **Markdown**: file gọn để đưa cho Claude, hoặc dùng skill `nghien-cuu-youtube`. Ô API key trong Cài đặt đã có sẵn để nối AI vào app sau.
