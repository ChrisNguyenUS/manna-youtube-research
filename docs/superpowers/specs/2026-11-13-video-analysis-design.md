# Phân tích video (TikTok và YouTube): thiết kế

> Ngày: 2026-11-13 · Trạng thái: chờ duyệt · Phạm vi: thay các màn "Tìm video" và "Lấy comment" bằng "Phân tích video" ở cả hai nền tảng
> Tài liệu liên quan: [ARCHITECTURE.md](../../ARCHITECTURE.md) (luật lớp, job, record) · [jobs-and-scraping-L4.md](../../jobs-and-scraping-L4.md) (job, huỷ, thử lại) · [2026-11-11-tiktok-insight-design.md](2026-11-11-tiktok-insight-design.md) (nguồn TikTok, luật không lưu tên người comment)

## 1. Mục đích

Chủ app mổ xẻ các video đã thắng để viết kịch bản của mình: đọc hook, bố cục, cách kể, CTA, và nghe khán giả nói gì dưới video đó. Việc này làm theo hai cách cùng lúc: đọc ngay trong app, và xuất ra Markdown để Claude (hoặc skill `content-outline`) phân tích tiếp.

Hiện app lấy được comment theo link nhưng **không có lời thoại (script)** của video, và thông số của một video TikTok lẻ thì không lấy được.

Thành công nghĩa là:
- Dán tới 10 link của một nền tảng, nhận về cho từng video: thông số, script có mốc thời gian, comment đã gom nhóm.
- Có một bảng đặt các video cạnh nhau, gồm cả câu mở đầu và tốc độ nói.
- Một file Markdown cho một video hoặc cả lô, đủ ngữ cảnh để Claude phân tích mà không cần mở app.
- Không cần đăng nhập TikTok hay Google.
- Một video lỗi hoặc không có phụ đề không làm hỏng các video còn lại của lô.

## 2. Phạm vi

**Có:**
1. Màn **Phân tích video** trong nhóm TikTok (`#/tiktok/video`, job `tiktok_video_analysis`).
2. Màn **Phân tích video** trong nhóm YouTube (`#/video`, job `video_analysis`).
3. Lấy script: TikTok từ phụ đề kèm trang video; YouTube từ bảng lời thoại của trang xem, đọc bằng Chromium ẩn.
4. Lấy thông số một video TikTok theo link (khả năng mới của nguồn TikTok).
5. Bảng so sánh, ba tab chi tiết (Script, Comment, Thông số), xuất Markdown và CSV.
6. Gỡ khỏi giao diện: Tìm video và Lấy comment của cả hai nền tảng. Thêm nút "Phân tích" ở các màn khác.

**Không (cố ý):**
- App không nhận xét hay chấm điểm script, hook. Nó chỉ trình bày và đo.
- Không nhận dạng giọng nói cho video thiếu phụ đề.
- Không so sánh chéo TikTok với YouTube trong một bảng.
- Không dịch script, không chọn ngôn ngữ phụ đề: lấy bản mặc định mà nền tảng hiện.
- Không xoá phần server của Tìm video và Lấy comment (xem §9).

## 3. Kết quả kiểm chứng trước khi thiết kế (2026-11-13)

Chạy bằng code tạm, không đăng nhập, từ máy của chủ app:

| Cách | Kết quả |
|---|---|
| YouTube `player` (client web và android), `timedtext`, `get_transcript` gọi trực tiếp | Không dùng được: không có track, nội dung rỗng, hoặc HTTP 400 |
| YouTube: Chromium ẩn mở trang xem, mở mô tả, bấm "Show transcript", đọc bảng lời thoại | **Được.** Video nhạc tiếng Anh và video tiếng Việt chỉ có phụ đề tự động đều ra đủ lời thoại kèm mốc thời gian. 20–30 giây mỗi video |
| TikTok: tải HTML trang video, đọc JSON `__UNIVERSAL_DATA_FOR_REHYDRATION__` | **Được.** `itemInfo.itemStruct` có đủ thông số; `video.subtitleInfos` có link WebVTT (tiếng Việt, nguồn ASR). 1–2 giây mỗi video |

Hệ quả cho thiết kế: script YouTube phụ thuộc giao diện trang xem nên dễ gãy nhất; nó được tách thành đợt riêng (§11) và có phép thử sống riêng (§10).

## 4. Trải nghiệm

### 4.1 Menu

| Nhóm | Sau thay đổi |
|---|---|
| TikTok | Tìm theo chủ đề · Insight khách hàng · **Phân tích video** |
| YouTube | Nghiên cứu chủ đề · **Phân tích video** · Kênh · Từ khoá |

Hai mục "Video & comment" biến mất. Hai màn Phân tích video dùng chung một bộ component; khác nhau ở nguồn dữ liệu và vài cột.

### 4.2 Màn nhập

- Ô dán link, mỗi dòng một link, tối đa **10**. Vượt 10 thì nút chạy bị khoá và ghi rõ số link thừa.
- Link của nền tảng kia: báo ngay dưới ô nhập, kèm link sang đúng màn. Link không nhận ra: đánh dấu dòng đó, không chặn các dòng còn lại.
- Lựa chọn: **Lấy script** (bật sẵn), **Comment mỗi video** (0 / 100 / 300, mặc định 100), **Lấy cả trả lời** (bật sẵn, ẩn khi comment = 0).
- Nút "Phân tích N video" kèm thời gian dự kiến: TikTok khoảng 10 giây mỗi video cộng thời gian đọc comment; YouTube cộng thêm 30 giây mỗi video khi bật script.
- Nhận tham số `?videos=` (danh sách link) và `&run=1` từ màn khác; `run` bị gỡ khỏi URL ngay khi bắt đầu để tải lại không chạy lần nữa.
- Cuối trang là khối lịch sử dùng chung (5 lần gần nhất, link "Xem tất cả").

### 4.3 Màn kết quả

**Bảng so sánh** (trên cùng, mỗi video một dòng, bấm tiêu đề cột để xếp):

| Cột | TikTok | YouTube |
|---|---|---|
| Ảnh bìa, caption hoặc tiêu đề, kênh | có | có |
| Ngày đăng, độ dài | có | có |
| View, like, comment | có | có |
| Share, save | có | không |
| Tỉ lệ tương tác | (like + comment + share + save) ÷ view | (like + comment) ÷ view |
| View mỗi ngày | có | có |
| Câu mở đầu (hook) | có | có |
| Số từ, tốc độ nói (từ/phút) | có | có |
| Comment đã đọc | có | có |

Dòng của video lỗi hiện link và lý do, các ô số để trống. Dòng của video không có phụ đề vẫn đủ số, ba ô script ghi "Không có phụ đề".

**Chi tiết video** (bên dưới bảng, đổi theo dòng đang chọn; mặc định dòng đầu):

- **Script:** từng đoạn kèm mốc thời gian (có nút ẩn mốc). Các đoạn bắt đầu trước giây thứ 5 được tô nổi và gắn nhãn "Mở đầu". Ô tìm trong script. Nút chép script (theo trạng thái ẩn/hiện mốc). Dòng ghi nguồn: "Phụ đề tự động" hoặc "Phụ đề do kênh đăng", kèm ngôn ngữ nếu biết.
- **Comment:** khối duyệt comment đang dùng ở Insight khách hàng (`commentBrowser`): tìm, lọc theo nhóm, xếp, chọn, chép, lưu vào Đã lưu. Nhóm do server tính lúc lưu (§7).
- **Thông số:** mọi số ở bảng, mô tả đầy đủ, hashtag (TikTok) hoặc tag (YouTube), nhạc (TikTok), nút mở video, nút lưu video (TikTok: `tiktok_video`; YouTube: `video`).

**Trong lúc chạy:** thẻ tiến trình ở trên; bảng hiện dần từng dòng khi video xong. Rời màn rồi quay lại thì nối lại tiến trình (cơ chế `activeJob` / `watchJob` có sẵn).

**Xuất:** nút Markdown cả lô, Markdown video đang chọn, CSV bảng so sánh.

### 4.4 Đường vào từ màn khác

| Màn | Thay đổi |
|---|---|
| Tìm theo chủ đề | Nút "Lấy comment (N)" của các video đã tích đổi thành "Phân tích (N)", mở `#/tiktok/video?videos=…&run=1`. Quá 10 video thì nút ghi "tối đa 10" và bị khoá |
| Insight khách hàng (ngăn chi tiết video) | Thêm nút "Phân tích video này"; link "Đọc thêm comment video này" trỏ sang màn mới |
| Nghiên cứu chủ đề, Phân tích kênh (bảng video YouTube) | Nút "Comment" đổi thành "Phân tích", mở `#/video?videos=…` |
| Đã lưu | Video TikTok và video YouTube: nút "Comment" đổi thành "Phân tích" |
| Tổng quan | Nút "Tìm video" của YouTube bỏ; còn "Nghiên cứu chủ đề" (thành nút chính) và "Tìm kênh" |
| Từ khoá (gợi ý, đã lưu) | Nút "Tìm video" trỏ sang `#/research?q=…` |

## 5. Dữ liệu vào

### 5.1 Port TikTok (`ports/tiktok-source.js`)

Thêm một method:

```js
/**
 * @typedef {{language: string|null, kind: 'auto'|'manual', segments: {start: number, end: number|null, text: string}[]}} Transcript
 * @property {(urlOrId: string) => Promise<{video: TikTokVideo, transcript: Transcript|null}>} getVideo
 *   Một lần tải trang video: thông số + phụ đề (null khi video không có). Ném lỗi code 'video_unavailable' khi video bị xoá/riêng tư.
 */
```

- Adapter thật (`sources/tiktok/video.js`): giải link ngắn bằng `resolveVideo` có sẵn, tải HTML trang video qua `http.js` (đã có thử lại và giới hạn song song), đọc JSON nhúng, tải file WebVTT đầu tiên trong `subtitleInfos` (ưu tiên bản có `Source` khác `MT`, tức không lấy bản máy dịch).
- Parser thuần trong `sources/tiktok/parse.js`: `parseVideoPage(html)` → `{video, subtitles: [{url, language, source}]}`.
- `kind`: `'auto'` khi `Source` là `ASR`, ngược lại `'manual'`.
- Adapter giả (`sources/fake/tiktok.js`) trả dữ liệu mẫu, có một video không phụ đề và một video `video_unavailable`.

### 5.2 Port YouTube (`ports/youtube-source.js`)

Thêm một method và một capability:

```js
/** @property {(videoId: string) => Promise<Transcript|null>} getTranscript   null khi video không có phụ đề */
// capabilities(): thêm transcript: boolean  (false khi máy chưa cài Playwright/Chromium)
```

- Adapter thật (`sources/innertube/transcript.js`) nhận một `browser` qua tham số (xem §5.3), mở `https://www.youtube.com/watch?v=<id>` với `locale: 'en-US'`, đóng hộp thoại đồng ý cookie nếu có (chọn Reject all), mở mô tả, bấm nút lời thoại, chờ bảng `ytd-engagement-panel-section-list-renderer[target-id*="transcript"]` có nội dung, rồi đọc từng đoạn (mốc thời gian + chữ).
- Không có nút lời thoại → `null`. Có nút nhưng bảng không có đoạn nào sau 20 giây → lỗi code `source_changed`.
- Đọc DOM thành dữ liệu là một hàm thuần chạy trong trang (`extractSegments`) có test riêng bằng HTML mẫu. Mốc thời gian dạng `1:02:03` / `2:03` đổi sang giây ở `core`.
- `end` luôn `null` (bảng chỉ cho mốc bắt đầu). `kind`: `'auto'` khi tiêu đề bảng có chữ "auto-generated", ngược lại `'manual'`. `language`: `null` nếu không đọc được.
- Thông số dùng `getVideo(id, {likes: true})` có sẵn. Tổng số comment của video YouTube chỉ hiện khi nguồn trả về con số đó; không có thì ô "comment" để trống và chỉ còn cột "Comment đã đọc".

### 5.3 Chromium dùng chung

`sources/tiktok/browser.js` chuyển thành `sources/browser/index.js` (không đổi hành vi: một Chromium mỗi tiến trình, context mới cho mỗi việc, tự đóng sau 2 phút rảnh). `app.js` tạo một browser và đưa cho cả hai adapter. Phiên đăng nhập TikTok vẫn chỉ gắn vào context của tìm kiếm TikTok; context của YouTube không mang cookie nào.

`test/arch.test.js`: `sources/tiktok/` và `sources/innertube/` vẫn cấm import lẫn nhau; cả hai được import `sources/browser/`. `sources/browser/` không import adapter nào.

## 6. Tính toán thuần (`core/video/`)

| File | Hàm | Luật |
|---|---|---|
| `transcript.js` | `parseVtt(text)` | WebVTT → `segments` (`start`, `end` tính bằng giây; gộp dòng trong một cue; bỏ thẻ `<…>`) |
| | `parseClock(s)` | `"1:02:03"`, `"2:03"`, `"0:07"` → giây |
| | `scriptStats(transcript, durationSec)` | `words`: số từ (tách theo khoảng trắng). `hook`: chữ của các đoạn có `start < 5`, nếu không có đoạn nào thì đoạn đầu tiên, cắt còn 200 ký tự. `wpm`: `words ÷ phút nói`, với phút nói = (mốc cuối − mốc đầu), mốc cuối là `end` của đoạn cuối, không có thì `durationSec`; `null` khi khoảng nói dưới 10 giây |
| | `scriptText(transcript, {timestamps})` | Chữ để chép và xuất: mỗi đoạn một dòng, có hoặc không có `[m:ss]` |
| `metrics.js` | `videoRow(video, platform, now)` | Tỉ lệ tương tác theo công thức ở §4.3, view/ngày = view ÷ max(tuổi, 1 ngày) |

Nhãn và công thức của tỉ lệ tương tác, view/ngày, tốc độ nói đăng ký trong `core/metrics/definitions.js`; giao diện, CSV và Markdown đọc từ đó.

## 7. Use case và record

Hai use case, cùng khung:

- `features/tiktok/video-analysis.js` → `makeTikTokVideoAnalysis({tiktok, records, now})`
- `features/video-analysis.js` → `makeVideoAnalysis({source, records, now, enrich})`

Phần giống nhau (vòng lặp, ghi dần, gom lỗi) nằm trong `features/shared-video-analysis.js`, nhận ba hàm của từng nền tảng: `resolve(link)`, `fetchVideo(ref)`, `fetchComments(ref, opts, onProgress)`. File này không import use case YouTube nào, nên `features/tiktok/` được phép dùng.

**Tham số job** (cả hai kind):

```js
{ videos: 'string!', script: 'bool?', comments: [0, 100, 300], replies: 'bool?' }
```

Hơn 10 link hợp lệ → `invalid_input`, field `videos`.

**Trình tự mỗi video** (chạy lần lượt, không song song): giải link → thông số (+ script nếu bật) → comment (nếu > 0) → tính `stats`, `groups` → ghi vào record → `progress({step, done, total, recordId})`.

**Record** (`kind` = tên job, `schema_version` 1, `title` = caption/tiêu đề video đầu + " (+N)" khi nhiều video, `ref` = null):

```js
{
  platform: 'tiktok' | 'youtube',
  params,                       // như gửi lên
  analyzedAt,                   // ISO
  videos: [{
    link,                       // như người dùng dán
    video,                      // TikTokVideo hoặc Video (kèm url), null khi lỗi trước bước thông số
    row,                        // videoRow(): engagementRate, viewsPerDay, ageDays
    transcript,                 // Transcript | null
    transcriptNote,             // null | 'none' (không có phụ đề) | 'off' (không bật) | 'setup' (thiếu Chromium) | 'changed' (source_changed)
    script,                     // scriptStats() | null
    comments,                   // như báo cáo comment hiện có, không tên người viết
    groups,                     // voiceTopics(comments): {total, questions, topics: [{key, kind, label, count, ids}]}
    error,                      // null | {code, message} khi video không phân tích được
  }],
}
```

- Record được tạo sau video đầu tiên và `update` sau mỗi video tiếp theo. Job bị huỷ thì record bị xoá (`onCancelled` có sẵn).
- Mọi video của lô đều lỗi → job `failed` với thông điệp của lỗi đầu tiên; không để lại record.
- `store/upgrades/` thêm hai kind với `latest = 1`.
- `web/kinds.js` thêm hai kind (nhãn "Phân tích video", đường dẫn tương ứng).

## 8. HTTP và xuất

- `JOB_SCHEMAS` thêm hai kind như §7.
- `GET /api/v1/records/:id/export.md` cho hai kind mới, thêm tham số `?video=<số thứ tự>` để xuất một video. `export.csv` xuất bảng so sánh.
- `core/report/video-analysis.js`:
  - Markdown mỗi video: tiêu đề + link; một dòng thông số; "Mở đầu" (hook); "Script" (có mốc thời gian); "Comment nổi bật" theo nhóm (tối đa 15 câu mỗi nhóm, nguyên văn, kèm số tim và trả lời). Bản cả lô mở đầu bằng bảng so sánh.
  - Cột CSV: link, caption/tiêu đề, kênh, ngày đăng, độ dài, view, like, comment, share, save, tỉ lệ tương tác, view/ngày, hook, số từ, từ/phút, comment đã đọc, ghi chú script, lỗi.

## 9. Gỡ bỏ

Chỉ gỡ ở giao diện:

- Mục menu và form của `web/views/videos.js`, `web/views/comments.js`, `web/views/tiktok/search.js`, `web/views/tiktok/comments.js`.
- Bốn đường dẫn `#/videos`, `#/comments`, `#/tiktok/search`, `#/tiktok/comments` vẫn tồn tại nhưng không nằm trong menu: có `?id=` thì hiện báo cáo cũ ở chế độ chỉ xem (không form, có dòng "Màn này đã được thay bằng Phân tích video"); không có `?id=` thì chuyển sang màn Phân tích video cùng nền tảng, mang theo `?videos=` nếu có.
- `components/tiktok-video-card.js` chỉ còn phục vụ báo cáo cũ.

Giữ nguyên ở server: các job `video_search`, `tiktok_search`, `comments`, `tiktok_comments`, API `/api/v1/tiktok/videos` và CLI, vì skill `nghien-cuu-tiktok`, skill `nghien-cuu-youtube` và use case `research` đang dùng.

## 10. Lỗi và test

**Lỗi:**

| Tình huống | Mã | Hành vi |
|---|---|---|
| Link không nhận ra / của nền tảng kia | (ở giao diện) | Đánh dấu dòng, không gửi lên |
| Hơn 10 link | `invalid_input` | Job không được tạo |
| Video bị xoá, riêng tư | `video_unavailable` | Dòng lỗi trong bảng; video khác chạy tiếp |
| Không có phụ đề | — | `transcript: null`, `transcriptNote: 'none'` |
| Thiếu Playwright/Chromium (YouTube, script bật) | — | `transcriptNote: 'setup'`; thông số và comment vẫn chạy |
| Bảng lời thoại YouTube không đọc được | `source_changed` | `transcriptNote: 'changed'`; phần còn lại vẫn lưu |
| TikTok chặn trang video | `tiktok_blocked` | Dòng lỗi cho video đó |
| Comment bị tắt | — | `comments: []`, ghi chú ở tab Comment |

**Test (không mạng, trong `npm test`):**

- `core/video`: `parseVtt` (cue nhiều dòng, thẻ, giờ có/không có phần giờ), `parseClock`, `scriptStats` (hook khi không có đoạn nào trước giây 5; `wpm` null khi quá ngắn; không có `end`), `videoRow`.
- `sources/tiktok`: `parseVideoPage` với fixture trang video đã lược (≤ 50 KB) và một file WebVTT; trường hợp không có `subtitleInfos`; trường hợp video không tồn tại.
- `sources/innertube`: `extractSegments` với fixture HTML của bảng lời thoại; nhận ra "auto-generated".
- Hợp đồng: `test/sources/tiktok-contract.js` và `contract.js` thêm `getVideo` / `getTranscript` cho adapter giả.
- `features`: lô 3 video với một video lỗi và một video không phụ đề; mọi video lỗi → job failed; hơn 10 link; `script: false`; `comments: 0`; record không chứa tên người comment.
- `http`: schema hai job; `export.md` cả lô và `?video=`; `export.csv`.
- `arch`: luật mới cho `sources/browser/`.
- `store/upgrades`: hai kind mới có `latest`.

**Phép thử sống** (`npm run probe`, không nằm trong `npm test`): một video TikTok công khai (có thông số, có ít nhất một phụ đề) và một video YouTube có phụ đề (đọc được ít nhất 5 đoạn).

**Kiểm tra tay mỗi đợt:** chạy link thật trên bản sao dữ liệu (`YTR_DATA_DIR` riêng, cổng riêng), không đụng app đang chạy.

## 11. Thứ tự làm

Mỗi đợt một nhánh, gộp riêng, app chạy được sau từng đợt.

1. **TikTok trọn vẹn.** `core/video`, `getVideo` của TikTok, use case + record + job, màn `#/tiktok/video` với bảng so sánh và ba tab, xuất Markdown/CSV. Menu TikTok: thêm "Phân tích video" (các mục cũ chưa gỡ).
2. **YouTube.** Chuyển Chromium ra `sources/browser/`, `getTranscript`, use case YouTube, màn `#/video` dùng lại component của đợt 1, phép thử sống.
3. **Dọn dẹp và đường vào.** Gỡ bốn màn cũ khỏi menu và đặt chế độ chỉ xem + chuyển hướng (§9), đổi các nút ở màn khác (§4.4), cập nhật README, ARCHITECTURE và hai skill nếu lệnh/đường dẫn chúng nhắc tới thay đổi.

## 12. Rủi ro

| Rủi ro | Giảm thế nào |
|---|---|
| YouTube đổi giao diện trang xem, script gãy | Tách `extractSegments` có test; mã `source_changed`; phép thử sống; phần còn lại của báo cáo không phụ thuộc script |
| YouTube bắt đầu đòi đăng nhập hoặc chặn Chromium ẩn | Báo cáo vẫn có thông số và comment; khi đó mới xét phương án đăng nhập hoặc nhận dạng giọng nói, là việc ngoài phạm vi spec này |
| TikTok bỏ JSON nhúng hoặc chặn tải trang | Parser có fixture và phép thử sống; lỗi theo từng video, không theo lô |
| Phụ đề tự động sai chữ (nhất là tên riêng) | Ghi rõ "Phụ đề tự động" ở tab Script và trong Markdown |
| Record lớn (10 video × 300 comment) | Cùng cỡ với báo cáo Insight hiện tại (lớn nhất 0,4 MB); không cần thay đổi cách lưu |
