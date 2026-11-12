# Content Research

App nghiên cứu content YouTube và TikTok chạy trên máy: tìm video, lọc kênh kiểu Playboard, phân tích kênh, lấy comment, kiểm tra ý tưởng. **Không cần API key, không tốn phí, không cần `npm install`** (Node ≥ 22.13, dùng `node:sqlite` có sẵn).

```bash
npm start          # mở http://localhost:5178
npm test           # unit test parser + chỉ số
```

### Icon bấm là chạy

```bash
bash scripts/make-app.sh          # tạo /Applications/Content Research.app + lối tắt trên Desktop
```

Bấm **Content Research**: nếu server chưa chạy thì bật nền (log ở `data/server.log`), rồi mở app trong cửa sổ riêng (cửa sổ app của Chrome, không có tab hay thanh địa chỉ; máy không có Chrome thì mở trình duyệt mặc định). Đóng cửa sổ thì server vẫn chạy; bấm **Stop Content Research** để tắt. Đổi đường dẫn repo hay cài lại Node thì chạy lại lệnh trên.

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

Nhóm **TikTok** trong menu có 4 màn:

- **Tìm theo chủ đề**: gõ một chủ đề (vd "bảo lãnh vợ chồng"), app lấy từ khoá liên quan từ chính TikTok (gợi ý khi gõ và mục "Những người khác tìm kiếm"), gộp biến thể kiểu "… 2026", "… mới nhất", bỏ từ khoá về nước khác, chia theo ý định (thời gian, chi phí, cách làm, phỏng vấn…). Bạn bật/tắt hoặc thêm từ khoá rồi bấm **Quét**: mỗi từ khoá thành một cột video top (lọc view tối thiểu, ngày đăng; xếp theo tổng hợp, view, view/ngày hoặc mới nhất), mỗi video kèm 3 comment nhiều tym nhất. Cột nào xong hiện cột đó. **Bảng gộp** gom video trùng giữa các từ khoá. **Excel** xuất file .xlsx (sheet Video giống "kho nghiên cứu viral": chủ đề, từ khoá, link, view, top 3 comment; sheet Từ khoá). **Quét lại** một chủ đề cũ thì mỗi video ghi thêm số view tăng từ lần quét trước, video mới có nhãn **Mới**. Không cần AI: mọi bước đều là luật cố định. Khoảng 15 giây mỗi từ khoá (gồm lấy comment).
- **Insight khách hàng**: tìm video top theo từ khoá (cùng thứ tự với API scrape: trending → tương tác → hợp thời), đọc comment, gom câu hỏi theo nhóm (mất bao lâu, hết bao nhiêu tiền, tài chính bảo trợ, giấy tờ, phỏng vấn hỏi gì, trường hợp của tôi có được không, tự làm hay thuê dịch vụ), đếm số câu hỏi + tim + trả lời mỗi nhóm; nỗi sợ theo ngành di trú (giấy xanh, bổ sung, bị từ chối, chờ lâu, kết hôn giả…); người đang cân nhắc mua (hỏi giá, xin tư vấn, tự làm hay thuê); câu chữ thật là câu ngắn nguyên văn được nhiều người phản ứng. Comment của bên bán dịch vụ ("để lại số điện thoại, chuyên viên liên hệ…") bị bỏ. Comment có nhiều trả lời được tính ngang comment nhiều tim. Nút **Markdown** cho file gọn kèm sẵn khung báo cáo (3 phát hiện, khoảng trống, 5 góc quảng cáo, quy tắc không hứa kết quả) để đưa Claude viết.
- **Tìm video TikTok**: lưới video xếp theo Hot score (tương tác ÷ (ngày + 2)), lọc theo tuổi, like, comment; chọn video rồi bấm **Lấy comment**.
- **Comment TikTok**: dán link (kể cả `vm.tiktok.com`), lấy tới 300 comment kèm trả lời.

Cả hai màn trên có bộ lọc video trước khi đọc comment: **View tối thiểu**, **Like tối thiểu**, **Đăng trong** N ngày, **Tương tác ≥** (like + comment + share + save) ÷ view. Comment chỉ có emoji, sticker hoặc @tag bị bỏ khỏi báo cáo.

> Từ tháng 11/2026 TikTok bắt đăng nhập mới cho tìm kiếm (mã 2483), kể cả với trình duyệt thường. Lấy comment theo link vẫn không cần đăng nhập.

**Đăng nhập TikTok (một lần):** vào **Cài đặt → TikTok → Đăng nhập TikTok**, hoặc chạy `npm run login:tiktok`. Một cửa sổ Chromium mở ra, bạn tự đăng nhập ở đó (quét mã QR bằng app TikTok là nhanh nhất), cửa sổ tự đóng khi xong. App không thấy mật khẩu, chỉ giữ phiên đăng nhập (cookie) trong `data/tiktok-session.json`, chỉ tài khoản máy của bạn đọc được. Mọi lượt tìm sau dùng phiên này cho tới khi hết hạn (TikTok thường để khoảng 2 tháng); hết hạn thì app báo đăng nhập lại. Đăng xuất: nút **Đăng xuất** trong Cài đặt hoặc `node src/cli/index.js tiktok-logout`. Nên dùng tài khoản phụ: scrape nhiều có thể khiến TikTok hạn chế tài khoản.

API từ khoá liên quan: `POST /api/v1/tiktok/topic/keywords` với `{"topic": "bảo lãnh vợ chồng"}` (khoảng 10 giây). Quét chủ đề là job nền `POST /api/v1/jobs/tiktok_topic` (`topic`, `keywords` tuỳ chọn, `perKeyword`, `sort`, `minPlays`, `maxAgeDays`, `topComments` 0 hoặc 3); file Excel ở `/api/v1/records/<id>/export.xlsx`.

API đăng nhập: `GET /api/v1/tiktok/login` (trạng thái), `POST` (mở cửa sổ, trả về khi đăng nhập xong; `409` nếu đóng cửa sổ, `408` sau 10 phút), `DELETE` (đăng xuất).

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

### API scrape video TikTok

Gọi thẳng, chờ trả về danh sách video (giống actor `tiktok-search` cũ, cùng tên trường: `videoId`, `videoUrl`, `playCount`, `likeCount`, `engagementRate`, `hotScore`, `authorUsername`, `authorName`, `authorVerified`, `musicTitle`, `scrapedAt`…). Mỗi từ khoá mất khoảng 15–60 giây; đóng request là dừng scrape. Mỗi lúc chỉ chạy một lượt scrape, lượt sau xếp hàng.

```bash
curl -s localhost:5178/api/v1/tiktok/videos -H 'content-type: application/json' \
  -d '{"keywords": ["bảo lãnh vợ chồng", "eb3"], "perKeyword": 60, "maxAgeDays": 30, "limit": 20}'
```

Hoặc mở trên trình duyệt: `http://localhost:5178/api/v1/tiktok/videos?keywords=eb3&sort=trending&limit=20`

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `keywords` | bắt buộc | chuỗi cách nhau bằng dấu phẩy, hoặc mảng |
| `perKeyword` | 60 | số video lấy mỗi từ khoá (10–200) |
| `sort` | `score` | `score` (tổng hợp), `trending`, `engagement`, `fresh`, `hot` (Hot score cũ) |
| `limit` | tất cả | chỉ trả N video đầu |
| `minPlays`, `minLikes`, `maxAgeDays`, `minEngagement` | 0 | lọc như màn Tìm video (`minEngagement` tính bằng %) |
| `keepOffTopic` | false | giữ cả video không có từ khoá trong caption/hashtag |
| `save` | false | lưu lại để mở trong app (trả `recordId`) |

**Thứ tự xếp hạng** (`sort=score`), từ nặng tới nhẹ:

1. **Trending (50%)**: view/ngày = view ÷ (số ngày tuổi + 2), đổi ra bách phân vị 0–100 trong cùng lượt tìm.
2. **Tương tác (30%)**: trung bình bách phân vị của tổng tương tác (like + comment + share + save) và tỉ lệ tương tác ÷ view. Cần cả hai: nhiều tương tác nhưng tỉ lệ thấp là video cũ viral, tỉ lệ cao nhưng ít tương tác là video quá nhỏ.
3. **Hợp thời (20%)**: 100 × 0,5^(số ngày tuổi ÷ 14). Đăng hôm nay 100, 2 tuần 50, 4 tuần 25.

Mỗi video trả kèm `trendingScore`, `engagementScore`, `freshnessScore`, `score` để thấy vì sao nó đứng ở hạng đó. Bằng điểm thì xét tiếp trending, rồi tương tác, rồi hợp thời.

Lỗi: `400` sai tham số; `503` khi TikTok không trả lời được, kèm `error.code` là `tiktok_setup_required` (chưa cài Chromium), `tiktok_login_required` (TikTok bắt đăng nhập, mã 2483) hoặc `tiktok_blocked` (bị chặn, thử lại sau).

## AI (sau này)

App tự tính mọi số liệu. Mỗi báo cáo có nút **Markdown**: file gọn để đưa cho Claude, hoặc dùng skill `nghien-cuu-youtube`. Ô API key trong Cài đặt đã có sẵn để nối AI vào app sau.
