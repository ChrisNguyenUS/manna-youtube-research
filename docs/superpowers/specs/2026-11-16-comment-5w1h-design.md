# Nền LLM và phân tích comment 5W1H (TikTok): thiết kế

> Ngày: 2026-11-16 · Trạng thái: chờ duyệt · Phạm vi: phần 1 trong 4 phần của tính năng AI
> Tài liệu liên quan: [ARCHITECTURE.md](../../ARCHITECTURE.md) (luật lớp, job, record) · [jobs-and-scraping-L4.md](../../jobs-and-scraping-L4.md) · [2026-11-13-video-analysis-design.md](2026-11-13-video-analysis-design.md)

## 1. Mục đích

Chủ app đọc comment TikTok để biết khán giả là ai, đang vướng gì, và nên làm content gì. Hiện app xếp nhóm comment bằng luật từ khoá viết cứng cho ngách giấy tờ định cư (`core/analysis/customer-voice.js`). Sang ngách khác thì các nhóm đó không còn đúng.

Phần này thêm lần đầu một lớp gọi LLM vào app, và dùng nó cho một việc: phân tích comment theo 5W1H.

Thành công nghĩa là:
- Chọn các video đã có comment, bấm một nút, nhận về báo cáo 5W1H cho đúng lô comment đó, ở bất kỳ ngách nào.
- Mọi con số trong báo cáo do code đếm. Mọi nhóm bấm vào đều ra comment thật.
- Báo cáo ghi rõ model đã dùng, số token và số tiền.
- Đổi model bằng Cài đặt, không sửa code.
- Một lô comment lỗi không làm hỏng cả báo cáo.

App chỉ chạy trên máy của chủ app. Không thiết kế cho nhiều người dùng hay bán.

## 2. Phạm vi

**Có:**
1. Port `LlmClient`, adapter OpenRouter, adapter giả cho test.
2. Cài đặt: API key OpenRouter, model gắn mã, model tổng hợp.
3. Job `comment_5w1h` chạy ba bước (§5), lưu record `comment_5w1h`.
4. Nút "Phân tích 5W1H (AI)" ở màn Thu thập bình luận TikTok, màn kết quả, mục trong Lịch sử, xuất Markdown.
5. Script `scripts/llm-try.js` chạy lại cùng một lô comment với model khác để so (§9).

**Không (cố ý):**
- Comment YouTube. Chúng chưa nằm trong bảng `comments` dùng chung.
- Lịch content (phần 4), mổ xẻ video và kênh (phần 2), cho model xem video (phần 3).
- Viết bài hoàn chỉnh. App xuất Markdown, việc viết làm ở Claude với các skill sẵn có.
- Màn benchmark trong app. Script ở §9 là đủ.
- Thay thế các nhóm theo luật từ khoá ở những màn hiện có. Chúng giữ nguyên và vẫn chạy khi không có API key.

Thay đổi so với spec Phân tích video: spec đó ghi "app không nhận xét". Từ phần này app có nhận xét do LLM viết, luôn kèm bằng chứng và luôn ghi rõ là AI viết.

## 3. Định nghĩa 5W1H dùng trong app

| Chiều | Câu hỏi |
|---|---|
| Who | Ai đang nói: nhóm người, hoàn cảnh của họ |
| What | Họ nói về chuyện gì, vướng việc gì |
| Why | Vì sao họ quan tâm: nỗi đau, nỗi sợ, mong muốn |
| When | Vấn đề xuất hiện lúc nào: giai đoạn, thời điểm |
| Where | Bối cảnh: nơi chốn, nước, kênh |
| How | Họ đang xoay xở ra sao, muốn được giúp kiểu gì |

Một comment có thể không thuộc nhóm nào ở một chiều. Một chiều có dưới 5% comment được gắn nhóm thì màn kết quả ghi "không đủ dữ liệu" thay vì hiện nhóm.

## 4. Trải nghiệm

### 4.1 Bắt đầu

Ở màn Thu thập bình luận (`#/tiktok/comments`), danh sách video đã có comment có ô tick. Khi tick ít nhất một video, hiện nút **Phân tích 5W1H (AI)** kèm dòng: số comment sẽ gửi và số token ước tính (số ký tự chia 3).

- Chưa nhập API key: nút vẫn hiện, bấm vào ra thông báo "Chưa nhập API key OpenRouter" và link sang Cài đặt.
- Quá 5.000 comment sau khi lọc (§5.1): app lấy 5.000 comment có điểm chú ý cao nhất (like cộng reply) và ghi rõ đã bỏ bao nhiêu.

### 4.2 Trong lúc chạy

Thẻ tiến độ như các job khác, ba bước: "Lập bảng mã", "Gắn mã lô 3/27", "Tổng hợp". Huỷ được; huỷ thì không lưu gì.

### 4.3 Màn kết quả (`#/tiktok/5w1h?id=`)

- Đầu trang: các video đã phân tích, số comment đã gắn mã, số comment chưa phân loại, model, token, số tiền, dòng "Nhận định do AI viết, số đếm do app tính".
- Sáu thẻ Who, What, Why, When, Where, How. Mỗi thẻ: 1 đến 3 nhận định, rồi các nhóm xếp theo số comment, có thanh tỉ lệ.
- Bấm một nhóm: mở danh sách comment của nhóm đó bằng component `comment-explorer` sẵn có (sắp theo like, reply, mới nhất).
- **Gợi ý content**: tối đa 10 dòng. Mỗi dòng có tiêu đề nháp theo DICK, nhóm Who, nỗi đau, concept chính và tối đa 2 concept phụ, giai đoạn phễu (Biết, Thích, Tin, Yêu), và các comment làm bằng chứng.
- Nút **Markdown**: toàn bộ báo cáo kèm comment tiêu biểu, để đưa cho Claude.

## 5. Cách chạy bên trong

### 5.1 Chuẩn bị (không gọi LLM)

Đọc comment của các video từ `store.comments.ofVideo`. Bỏ comment không có chữ (`hasWords`) và comment của người bán (`isSeller`). Comment trùng nguyên văn chỉ gửi một lần, kết quả áp cho mọi bản trùng. Reply được gửi kèm 200 ký tự đầu của comment cha. Mỗi comment nhận một số thứ tự ngắn; prompt và đầu ra chỉ dùng số này, không dùng id TikTok.

Tên người comment không được lưu trong app nên không có gì để gỡ.

### 5.2 Bước 1: lập bảng mã (1 lần gọi)

Gửi 300 comment có điểm chú ý cao nhất. Model trả về bảng mã: mỗi chiều tối đa 8 nhóm, mỗi nhóm có `key`, `label` (tiếng Việt, ngắn), `description` (một câu, để bước 2 gắn cho nhất quán).

Bước này lỗi sau khi thử lại thì cả job lỗi với thông báo rõ ràng.

### 5.3 Bước 2: gắn mã (nhiều lần gọi)

Chia comment thành lô 100, chạy 3 lô song song. Mỗi lần gọi gửi bảng mã và một lô; model trả về cho từng số thứ tự sáu trường `who, what, why, when, where, how`, mỗi trường là một `key` trong bảng mã hoặc `null`.

Code kiểm từng dòng: số thứ tự phải thuộc lô, `key` phải có trong bảng mã. Dòng sai bị bỏ. Lô lỗi được thử lại một lần; vẫn lỗi thì comment của lô đó tính là "chưa phân loại" và job chạy tiếp.

Chế độ suy luận của model được tắt hoặc đặt mức thấp nhất ở bước này, vì token suy luận tính tiền như token đầu ra.

### 5.4 Bước 3: tổng hợp (code đếm, rồi 1 lần gọi)

Code đếm số comment mỗi nhóm và chọn 5 comment tiêu biểu mỗi nhóm theo điểm chú ý. Sau đó gửi cho model tổng hợp: bảng đếm, comment tiêu biểu, và các file kiến thức (§6.4). Model trả về:
- `notes`: mỗi chiều 1 đến 3 nhận định, mỗi nhận định dẫn `key` của nhóm làm căn cứ.
- `ideas`: tối đa 10 gợi ý content với các trường ở §4.3, bằng chứng là số thứ tự comment.

Code bỏ mọi `key` và số thứ tự không tồn tại. Nhận định hoặc gợi ý không còn bằng chứng nào thì bị bỏ.

Prompt yêu cầu viết bằng lời thường ngày, cụ thể, không dùng từ chuyên ngành marketing. App không tự kiểm giọng văn.

Bước này lỗi thì báo cáo vẫn được lưu với bảng đếm và nhóm, phần nhận định và gợi ý ghi "AI chưa viết được", kèm nút chạy lại riêng bước 3.

## 6. Thành phần

### 6.1 Port và adapter

`src/ports/llm.js`:

```js
/**
 * @typedef {{model: string, system: string, user: string, schema: object, reasoning?: 'off'|'low', signal?: AbortSignal}} LlmRequest
 * @typedef {{json: any, model: string, tokensIn: number, tokensOut: number, costUsd: number|null}} LlmResult
 * @typedef {{complete(req: LlmRequest): Promise<LlmResult>, ready(): boolean}} LlmClient
 */
```

`src/llm/openrouter.js`: gọi `POST https://openrouter.ai/api/v1/chat/completions` với `response_format` kiểu JSON schema. Thử lại tối đa 2 lần khi gặp 429 hoặc 5xx, có chờ tăng dần. Timeout 120 giây mỗi lần gọi. Đầu ra không phải JSON hợp lệ hoặc sai schema thì ném lỗi `llm_bad_output`. Chi phí lấy từ trường `usage` của phản hồi; không có thì `costUsd` là `null` và màn hình chỉ hiện token. Lỗi 401 thành mã `llm_auth` ("API key không đúng").

`src/llm/fake.js`: trả kết quả soạn sẵn theo thứ tự gọi, dùng cho test.

`src/app.js` tạo adapter từ cài đặt và truyền vào feature. `test/arch.test.js` thêm `llm/` vào nhóm adapter.

### 6.2 Core (thuần, không I/O)

`src/core/ai/five-w.js`:
- `prepare(comments)`: lọc, khử trùng, đánh số, cắt 5.000.
- `codebookRequest(sample)`, `tagRequest(codebook, batch)`, `summaryRequest(tables, knowledge)`: dựng `system`, `user`, `schema`.
- `checkCodebook`, `checkTags`, `checkSummary`: kiểm và làm sạch đầu ra.
- `tally(tags, comments)`: bảng đếm và comment tiêu biểu.

`src/core/report/five-w.js`: Markdown của báo cáo.

### 6.3 Feature

`src/features/ai/comment-5w1h.js`: `makeComment5w1h({llm, comments, records, settings, knowledge, now})`. Handler job `comment_5w1h`, tham số `{videos: string, onlyStep3?: int}` (danh sách id video cách nhau bằng dấu phẩy; `onlyStep3` là id record cần viết lại phần tổng hợp).

Record `comment_5w1h`, `schema_version` 1:

```
{ videoIds, counts: {sent, tagged, untagged, dropped},
  codebook: {who: [{key, label, description}], …},
  tags: {[commentId]: {who, what, why, when, where, how}},
  notes: {who: [{text, keys}], …} | null,
  ideas: [{title, who, pain, concept, extraConcepts, funnel, evidence: [commentId]}] | null,
  usage: {tagModel, writeModel, calls, tokensIn, tokensOut, costUsd} }
```

Record lưu id comment, không lưu chữ. Màn kết quả đọc chữ từ bảng `comments` qua một route đọc mới `GET /api/v1/tiktok/5w1h/:id`, trả record kèm các comment của `videoIds`.

### 6.4 Kiến thức

`src/features/ai/knowledge/`: `viral-concepts.md` (40 concept: tên, một dòng mô tả, mẫu tiêu đề), `dick.md`, `funnel.md`. `app.js` đọc lúc khởi động và truyền vào dạng chuỗi. Sửa file rồi khởi động lại là prompt đổi. Nội dung lấy từ tài liệu khoá học chủ app đã mua; thư mục này nằm trong `.gitignore` để không lên remote.

Thiếu file kiến thức (ví dụ sau khi clone lại repo) thì app vẫn chạy: bước 3 bỏ các trường concept, DICK và phễu trong gợi ý content, và màn kết quả ghi "chưa có file kiến thức".

### 6.5 Cài đặt

Bỏ ô `aiProvider`. Giữ `aiKey` (nay là key OpenRouter), thêm `aiTagModel` và `aiWriteModel`. Mặc định tạm của cả hai là `deepseek/deepseek-v4.1-flash-1017`, sẽ đổi theo kết quả chạy thử ở §9. Luôn ghi mã phiên bản cụ thể, không dùng tên kiểu `latest`.

Key lưu dạng chữ thường trong SQLite trên máy, như ô `aiKey` hiện có. App chỉ nghe ở `127.0.0.1`.

### 6.6 Web

- `web/views/tiktok/comments.js`: ô tick, nút, dòng ước tính.
- `web/views/tiktok/five-w.js`: màn kết quả.
- `web/kinds.js`: thêm `comment_5w1h` ("5W1H comment (AI)", `/tiktok/5w1h`).
- `web/views/settings.js`: ba ô ở §6.5, bỏ dòng "sắp có".
- `src/http/routes/jobs.js`: schema tham số của job. `routes/records.js`: Markdown cho kind mới.

## 7. Lỗi

| Tình huống | App làm gì |
|---|---|
| Chưa có key | Không tạo job; thông báo kèm link Cài đặt |
| Key sai (401) | Job lỗi `llm_auth`, thông báo "API key không đúng" |
| 429, 5xx, timeout | Thử lại 2 lần; vẫn lỗi thì xử lý theo bước (§5.2 đến §5.4) |
| Đầu ra sai schema | Coi như lần gọi lỗi, thử lại theo luật của bước |
| Huỷ job | Dừng giữa các lô, không lưu record |
| Không còn comment nào sau khi lọc | Không tạo job; thông báo "Không có comment nào có chữ" |

## 8. Test

- `test/core/five-w.test.js`: lọc và khử trùng, đánh số, kiểm bảng mã, bỏ `key` và số thứ tự lạ, đếm, ngưỡng 5%.
- `test/features/comment-5w1h.test.js` với LLM giả: chạy trọn ba bước; một lô lỗi hai lần thành "chưa phân loại"; bước 3 lỗi vẫn lưu record; huỷ không lưu gì; `onlyStep3` chỉ gọi một lần.
- `test/llm/openrouter.test.js` với `fetch` giả: thân request đúng, thử lại khi 429, 401 thành `llm_auth`, đọc `usage`.
- `test/http`: schema tham số job, route đọc báo cáo.
- `npm test` (gồm typecheck và `arch.test.js`) phải qua.

## 9. Chạy thử để chốt model

`scripts/llm-try.js <videoIds> <model…>` chạy pipeline ở §5 trên comment thật trong máy với từng model, không lưu record. In ra cho mỗi model: số lần gọi lỗi, tỉ lệ comment gắn được mã, số `key` và số thứ tự bị bỏ, thời gian, token, số tiền; và ghi phần nhận định cùng gợi ý của từng model ra một file Markdown để chủ app đọc cạnh nhau.

Sau khi code xong, chạy với DeepSeek V4.1 Flash 1017, GLM 5.3 Flash, Qwen 3.7 Flash, Qwen 3.8 Flash, Hy4 Flash. Model rẻ nhất mà chủ app thấy đủ dùng thành mặc định của `aiTagModel`; tương tự cho `aiWriteModel`.

## 10. Thứ tự làm

1. Port, adapter OpenRouter, adapter giả, cài đặt.
2. Core `five-w` và test.
3. Feature, job, record, route.
4. Web: nút, màn kết quả, Lịch sử, Markdown.
5. Script chạy thử; chốt model mặc định.
