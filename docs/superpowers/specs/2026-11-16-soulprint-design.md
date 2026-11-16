# Soulprint (hồ sơ gốc của content): thiết kế

> Ngày: 2026-11-16 · Trạng thái: chờ duyệt · Phạm vi: giai đoạn 2 trong [kế hoạch tổng](../plans/2026-11-16-master-plan.md)
> Tài liệu liên quan: [ARCHITECTURE.md](../../ARCHITECTURE.md) · [2026-11-16-comment-5w1h-design.md](2026-11-16-comment-5w1h-design.md) (lớp gọi LLM dùng chung)
> Nguồn nội dung: skill `brand-game-interviewer` và `niche-interviewer-standalone` trong `.claude/skills/`, và Chương 3 của tài liệu "Kallaway Social Media A-Z".

## 1. Mục đích

Mọi bước làm content theo hệ thống Kallaway bắt đầu từ ba câu: chơi game nào, nói cho ai, các trụ nội dung là gì. Hiện app không biết ba điều đó, nên AI không thể chấm một video hay một ý tưởng có hợp với kênh của chủ app hay không.

Soulprint là một màn trong app, giữ một hồ sơ duy nhất trả lời ba câu đó. Chủ app điền bằng form, bằng bộ câu hỏi brainstorm, hoặc nhập từ file đã có. AI giúp gọn câu trả lời và soạn nháp khi có API key. Mọi tính năng AI khác đọc hồ sơ này.

Thành công nghĩa là:
- Điền xong hồ sơ trong khoảng 15 phút, kể cả khi bắt đầu mà chưa có ý tưởng rõ.
- Màn dùng được đầy đủ khi chưa nhập API key; có key thì thêm các nút AI.
- AI chỉ đề xuất. Không có chữ nào của AI vào hồ sơ khi chủ app chưa bấm nhận.
- Các tính năng AI khác lấy được một đoạn tóm tắt hồ sơ để đưa vào prompt.
- Xuất được một file Markdown đủ để đưa cho Claude.

## 2. Phạm vi

**Có:**
1. Màn **Soulprint** (`#/soulprint`), đứng ngay dưới Tổng quan trong menu.
2. Hồ sơ lưu trong SQLite, một hồ sơ cho mỗi workspace.
3. Bộ câu hỏi brainstorm cố định (§4), mỗi mục có câu hỏi, câu đẩy khi trả lời mơ hồ, ví dụ tốt và ví dụ dở.
4. Mồi từ dữ liệu app đã có (§5).
5. Trợ lý AI tuỳ chọn (§6).
6. Nhập từ `BRAND.md`, `strategy.md`, `positioning.md` (§7).
7. Xuất Markdown.
8. Hàm `soulprintContext()` cho các tính năng AI khác; báo cáo 5W1H dùng nó ở bước tổng hợp.

**Không (cố ý):**
- Ảnh Game Board và Niche Card của hai skill gốc. Màn Soulprint tự là bản tóm tắt.
- Gọi Sandcastles. App dùng phân tích kênh của chính nó.
- Đối chiếu định vị với đối thủ. Việc đó thuộc giai đoạn 3 (thư viện bricks). Phần giả thuyết định vị luôn mang nhãn "chưa đối chiếu với đối thủ".
- Nhiều hồ sơ cho nhiều kênh. Một hồ sơ; kênh thứ hai là việc sau này.
- Lịch sử phiên bản. Chỉ giữ bản hiện tại và ngày sửa.

## 3. Hồ sơ gồm gì

| Mục | Trường | Nguồn |
|---|---|---|
| Kênh đang có | `channels: [{platform, handle, url}]`, `startingFromZero` | brand-game, Block 0 |
| Kinh doanh | `business: {offer, price, buyer, howBought, viewerIsBuyer, note}` | cả hai skill |
| Game | `game: 'reach' \| 'conversion' \| null`, `gameReason`, `objective` | brand-game, Block 2 |
| Avatar | `avatar: {name, tag, portrait, believes[], fears[], tried[], complains[]}` | cả hai (Chair Test) |
| Kết quả mơ tới | `dreamOutcome` | niche, Q3 |
| Kho nỗi đau | `pains: [{text, type: 'broad' \| 'tactical', pain: 1..5, source}]` | cả hai |
| Lợi thế riêng | `advantage` | cả hai |
| Điều duy nhất | `oneThing` | niche, Q6 |
| Câu định vị | `statement: {chosen, alternates[], why}` | cả hai |
| Câu lọc | `filter` | brand-game, Block 3 |
| Pillars | `pillars: [{name, belief, proof[], subtopics[]}]`, 3 đến 5 | Kallaway, Chương 3 |
| Giả thuyết định vị | `hypothesis: {attributes: [{name, strength, evidence}], lane}` | niche |
| Giọng nói | `voice` | BRAND.md |
| Câu trả lời thô | `answers: {[questionId]: text}` | để mở lại buổi brainstorm |

Hai game ứng với năm game trong tài liệu Kallaway: `reach` là game 1 và 2 (views tối đa), `conversion` là game 3 đến 5 (views đúng người, đo bằng khách).

**Mức đủ dùng.** Hồ sơ "đủ dùng" khi có: `business.offer`, `game`, `avatar.portrait`, ít nhất 5 nỗi đau, `statement.chosen`, ít nhất 3 pillars. Màn hiện thanh tiến độ theo sáu điều kiện này. Các tính năng AI khác vẫn chạy khi hồ sơ chưa đủ, và ghi rõ là đang thiếu gì.

## 4. Bộ câu hỏi brainstorm

Thứ tự và lời hỏi lấy từ hai skill; lợi thế riêng được hỏi trước câu định vị vì phần "theo cách Z" của câu định vị sinh ra từ nó. Mỗi lần màn chỉ hiện một câu. Câu trả lời lưu ngay vào `answers`, nên bỏ dở rồi quay lại vẫn còn.

Mở đầu buổi: "Khoảng 10 phút. Cứ trả lời dài dòng, lộn xộn cũng được; dùng đọc chính tả nếu tiện. Gọn lại là việc của app."

| # | Điền vào | Câu hỏi | Câu đẩy khi trả lời mơ hồ |
|---|---|---|---|
| 0 | Kênh | Bạn đã có kênh nào đang đăng chưa, dù ít? Dán handle hoặc link. Nếu bắt đầu từ số 0 thì cứ nói vậy. | (không có) |
| 1 | Kinh doanh | Bạn bán gì, hoặc định bán gì? Giá khoảng bao nhiêu, mua bằng cách nào, và ai là người thật sự trả tiền? | Chưa có sản phẩm thì bạn hình dung sẽ kiếm tiền từ đâu: sản phẩm, dịch vụ, phần mềm, tài trợ? |
| 2 | Game | Có hai game, và ai cũng nói muốn cả hai. Bạn muốn nổi tiếng rộng trong một lĩnh vực lớn, hay được một nhóm hẹp coi là số một? Đi từ hẹp ra rộng thì được; đi từ rộng về hẹp rất khó. (Màn hiện bảng so sánh hai game ở §4.1.) | "Cả hai" không được tính. Nếu 18 tháng nữa chỉ được một thứ: 1 triệu follower phần lớn không mua, hay 30.000 follower có mua? Nếu vẫn chưa chọn được: bạn muốn người ta gọi mình là "người chuyên về [lĩnh vực]", hay "người nổi tiếng có làm thêm [lĩnh vực]"? |
| 3 | Mục tiêu | Mục tiêu 12 đến 18 tháng, trong một câu: thương hiệu này phải tạo ra thứ gì cụ thể? (Số cuộc hẹn, số khách, số đơn, danh sách nhà tài trợ…) | Mục tiêu này có khớp với game vừa chọn không? Chọn "rộng" mà mục tiêu là "20 khách giá cao" thì nên chọn lại một trong hai. |
| 4 | Avatar | Hãy tưởng tượng người xem lý tưởng nhất đang ngồi trên ghế trước mặt bạn. Họ là ai? Cả ngày họ làm gì? Họ đang cố làm việc gì mà chưa được, và đã thử những gì rồi? | Đừng dừng ở một nhóm người chung chung. Một người thật bạn từng bán cho, khớp mô tả này, là ai? Tả người đó. |
| 5 | Kết quả mơ tới | Người đó rốt cuộc muốn tới đâu trong thế giới của bạn? Không phải tính năng, mà là phần thưởng cuối cùng. | Nói trong một câu, bằng lời họ sẽ nói. |
| 6 | Kho nỗi đau | Họ hỏi bạn gì trong tin nhắn, hoặc ngay trước khi mua? Và niềm tin sai nào bạn phải sửa đi sửa lại? | Cần 5 đến 10 nỗi đau cụ thể, có cả câu hỏi lớn lẫn việc nhỏ. Mở comment của bạn và của kênh khác ra mà chép. |
| 7 | Lợi thế riêng | Lợi thế riêng của bạn là gì? Kết quả đã làm được, lần vấp đau, bằng cấp, quá trình làm nghề, hay một cách giải thích mà phần lớn người trong ngành không dám nhận là của mình. | Cứ kể dài. Chỗ nào người khác trong ngành không nói được như bạn? |
| 8 | Điều duy nhất | Điền vào chỗ trống: khi ai đó trong thế giới của tôi cần ______, tôi muốn là cái tên đầu tiên họ nghĩ tới. | Nếu ra ba thứ, giữ thứ khớp nhất với người trả tiền ở câu 1 và avatar ở câu 4. |
| 9 | Câu định vị | Viết câu "Tôi giúp [ai] với [việc gì] theo cách [cách của tôi]". Phần "cách của tôi" lấy từ lợi thế ở câu 7, không lấy từ nỗi đau. | "Tôi giúp chủ doanh nghiệp phát triển" là trượt. "Tôi giúp chủ phòng khám biến video ngắn thành lịch hẹn" là đạt. Viết thêm hai dạng khác: "Tôi giúp [ai] [làm gì] để [đạt gì]" và "[Chủ đề] cho [ai]". |
| 10 | Câu lọc | Câu bạn sẽ tự hỏi trước mỗi video: "Cái này có thật sự có giá trị với [avatar trong 5 từ] không?" Có thì làm, không thì bỏ. | Thêm câu thứ hai nếu muốn: "Nó có làm họ tin mình hơn không?" |
| 11 | Pillars | Ba đến năm trụ nội dung của bạn là gì? Với mỗi trụ: một niềm tin đi ngược số đông, và bằng chứng bạn có. | Thử kể nhanh 20 chủ đề con cho mỗi trụ. Không kể nổi thì trụ quá hẹp, hoặc bạn chưa đủ mê nó. Ba điều phải cùng có: avatar cần, bạn có bằng chứng, chủ đề đủ rộng. |

### 4.1 Bảng so sánh hai game (hiện cùng câu 2)

| | Rộng (Mass Reach) | Trúng (Efficient Conversion) |
|---|---|---|
| Tiền về bằng cách nào | Phủ rộng trước, một phần nhỏ mua sau, qua nhiều sản phẩm | Người xem thành người mua, đo được trực tiếp |
| Được gì | Tổng tiền lớn hơn nhiều; ai cũng biết mặt | Thắng nhanh hơn nhiều; tiền trên mỗi follower cao hơn nhiều |
| Mất gì | Lâu hơn hẳn; chịu mặt trái của nổi tiếng; khán giả chung chung | Không có fan đại chúng |
| Đổi hướng | Khó thu hẹp lại | Mở rộng ra sau được |

### 4.2 Ví dụ tốt và dở

Mỗi mục có một cặp ví dụ hiện khi bấm "Xem ví dụ". Nội dung lấy từ hai skill, dịch sang tiếng Việt:
- Avatar. Dở: "người bận rộn 25 đến 45 tuổi". Tốt: "chủ spa 34 tuổi, doanh thu 40.000 đô một tháng, đăng bài thất thường và không có khách nào từ đó".
- Kết quả mơ tới. Dở: "kịch bản hay hơn". Tốt: "một cỗ máy content mỗi tuần mang khách tự tìm tới".
- Câu định vị: cặp ví dụ ở câu 9.

## 5. Mồi từ dữ liệu app (không cần AI)

Khi một mục còn trống, màn hiện tối đa 5 gợi ý lấy từ dữ liệu đã có, mỗi gợi ý bấm một lần để chép vào ô nháp:

| Mục | Mồi | Lấy từ |
|---|---|---|
| Kênh | Các kênh đang theo dõi | `follows` |
| Kho nỗi đau | Các nhóm chiều Why trong báo cáo 5W1H gần nhất, kèm số comment | record `comment_5w1h` |
| Kho nỗi đau | Câu hỏi được chú ý nhất theo nhóm (luật từ khoá hiện có) | `core/analysis/customer-voice.js` trên bảng `comments` |
| Avatar | Các nhóm chiều Who của báo cáo 5W1H gần nhất | record `comment_5w1h` |
| Pillars | Chủ đề của các video vượt kênh trong lần phân tích kênh gần nhất của chính kênh ở câu 0 | record `tiktok_channel`, `channel_analysis` |

Không có dữ liệu thì mục đó không hiện mồi, không báo lỗi. Nỗi đau chép từ mồi mang `source` là `5w1h` hoặc `comment`; nỗi đau tự gõ mang `source` là `self`.

## 6. Trợ lý AI (tuỳ chọn)

Các nút chỉ hiện khi đã có API key. Mỗi nút là một lần gọi ngắn qua lớp `LlmClient`, dùng model tổng hợp (`aiWriteModel`), không phải job nền. Kết quả hiện trong một khung đề xuất với hai nút **Nhận** và **Bỏ**; có thể sửa trước khi nhận.

| Nút | Ở đâu | AI làm gì |
|---|---|---|
| Gọn lại | Mỗi câu hỏi brainstorm | Nhắc lại câu trả lời bằng một câu gọn. Trả lời mơ hồ thì đưa một phỏng đoán cụ thể hơn để chủ app sửa, không hỏi thêm câu mới. |
| Điền từ câu trả lời | Avatar | Đặt tên avatar, viết chân dung, tách bốn danh sách (tin gì, sợ gì, đã thử gì, hay than gì) từ câu trả lời câu 4. |
| Xếp hạng | Kho nỗi đau | Gộp ý trùng, gắn loại lớn hay nhỏ, chấm độ đau 1 đến 5, xếp lại. |
| Soạn câu định vị | Câu định vị | Ba dạng câu từ avatar, điều duy nhất và lợi thế riêng; nói rõ nên chọn dạng nào và vì sao. |
| Kiểm tra khớp | Game | Chỉ ra nếu mục tiêu 12 đến 18 tháng không khớp game đã chọn, hoặc người xem không phải người trả tiền. |
| Đọc giả thuyết | Giả thuyết định vị | Chấm năm thuộc tính (Chủ đề, Chiều sâu, Avatar, Cách kể, Hình ảnh) mạnh, có thể, hoặc chưa; viết một đoạn về hướng có thể chiếm. Luôn kèm dòng "chưa đối chiếu với đối thủ". |
| Điền từ file | Nhập (§7) | Đọc văn bản tự do và xếp vào đúng các mục. |

Prompt của trợ lý chứa: luật của hai skill (một câu một lần, không dùng thuật ngữ khi chưa giải thích, không để người dùng trả lời bằng một nhóm chung chung), phần hồ sơ đã điền, và câu trả lời đang xét. Văn bản chủ app gõ là dữ liệu, không phải hướng dẫn cho model.

Lỗi (chưa có key, key sai, model lỗi) hiện ngay trong khung đề xuất bằng thông báo của lớp LLM. Form không bị ảnh hưởng.

## 7. Nhập từ file

Một ô dán văn bản và một nút chọn file `.md`.

- **Không có AI:** app tách theo tiêu đề cấp 2 và chép vào ô nháp của mục tương ứng theo bảng dưới. Tiêu đề không nhận ra thì gom vào "Chưa xếp được" để chủ app tự kéo sang.
- **Có AI:** nút "Điền từ file" xếp cả văn bản tự do vào các mục, hiện thành đề xuất cho từng mục.

| Tiêu đề trong file | Mục của Soulprint |
|---|---|
| Lời hứa, Target Authority Statement | Câu định vị |
| Khán giả, Ideal viewer, Ideal Viewer Avatar | Avatar |
| Bằng chứng, Cơ chế độc quyền, Raw material, Unfair advantage | Lợi thế riêng |
| Góc nhìn | Pillars (niềm tin đi ngược) |
| Đường ra tiền, The business | Kinh doanh |
| Giọng nói, Cá tính | Giọng nói |
| The game | Game |
| Pain-point bank, Pain point bank | Kho nỗi đau |
| Dream outcome | Kết quả mơ tới |
| The one thing | Điều duy nhất |
| The Avatar Filter, The two filter questions | Câu lọc |

Nhập không bao giờ ghi đè mục đã có nội dung; nó chỉ tạo bản nháp bên cạnh để chủ app chọn.

## 8. Thành phần

- `src/store/sqlite/migrations/006_soulprint.sql`: bảng `soulprint (workspace_id PRIMARY KEY, data JSON, schema_version, updated_at)`.
- `src/store/sqlite/repos/soulprint.js`: `get(ws)`, `save(ws, data)`.
- `src/core/soulprint/profile.js` (thuần): hồ sơ trống, làm sạch dữ liệu vào, tính mức đủ dùng, `contextText(profile)` cho prompt, tách file theo tiêu đề.
- `src/core/soulprint/questions.js` (thuần): bộ câu hỏi ở §4 dưới dạng dữ liệu (id, mục, câu hỏi, câu đẩy, ví dụ).
- `src/core/soulprint/assist.js` (thuần): dựng request và kiểm đầu ra cho từng nút ở §6.
- `src/core/report/soulprint.js`: Markdown.
- `src/features/soulprint.js`: `get`, `save`, `seeds`, `assist(action, input)`, `importText(text)`, `context()`.
- Route: `GET` và `PUT /api/v1/soulprint`, `GET /api/v1/soulprint/seeds`, `POST /api/v1/soulprint/assist`, `POST /api/v1/soulprint/import`, `GET /api/v1/soulprint/export.md`.
- Web: `web/views/soulprint.js` với hai tab **Hồ sơ** (form) và **Brainstorm** (từng câu hỏi); mục menu; thẻ tiến độ ở Tổng quan.
- Nối với 5W1H: `summaryRequest` nhận thêm đoạn `contextText`, để gợi ý content nhắm đúng avatar và pillars. Hồ sơ trống thì prompt không đổi.

`contextText(profile)` là một đoạn văn bản ngắn, tối đa khoảng 400 từ: game và mục tiêu, câu định vị, avatar (tên, chân dung rút gọn), 5 nỗi đau đau nhất, tên các pillars kèm niềm tin, câu lọc. Mục nào trống thì bỏ qua.

## 9. Lỗi và trường hợp biên

| Tình huống | App làm gì |
|---|---|
| Lưu khi đang mở ở hai tab trình duyệt | Bản lưu sau thắng; màn hiện ngày sửa gần nhất |
| Văn bản dán rất dài (trên 50.000 ký tự) | Chỉ nhận 50.000 ký tự đầu và nói rõ |
| Danh sách quá dài | Tối đa 30 nỗi đau, 5 pillars, 30 chủ đề con mỗi pillar, 10 dòng mỗi danh sách của avatar; phần thừa không lưu và màn nói rõ |
| AI trả về mục không tồn tại hoặc sai kiểu | Bỏ mục đó, giữ các mục hợp lệ |
| Chưa có báo cáo 5W1H hay phân tích kênh | Không có mồi cho mục liên quan |
| Chưa chọn game | Các tính năng sau coi như chưa biết game và nói rõ, không tự đoán |

## 10. Test

- `test/core/soulprint-profile.test.js`: làm sạch dữ liệu, giới hạn độ dài, mức đủ dùng, `contextText` bỏ mục trống, tách file theo tiêu đề (cả `BRAND.md` kiểu tiếng Việt lẫn `strategy.md` kiểu skill).
- `test/core/soulprint-questions.test.js`: đủ 12 câu, đúng thứ tự, câu 7 đứng trước câu 9, mỗi câu trỏ tới một mục có thật.
- `test/core/soulprint-assist.test.js`: mỗi nút dựng đúng request; đầu ra sai kiểu bị bỏ; văn bản người dùng nằm trong phần dữ liệu.
- `test/features/soulprint.test.js` với LLM giả: lưu và đọc lại, mồi từ record có sẵn, `assist` không tự ghi vào hồ sơ, `importText` không ghi đè.
- `test/http/soulprint-api.test.js`: các route, xuất Markdown, `assist` khi chưa có key trả lỗi rõ.
- `test/store`: migration 006 chạy trên DB cũ.
- `test/web-soulprint.test.js`: mục menu, hai tab, các nút AI ẩn khi chưa có key.

## 11. Thứ tự làm

1. Bảng, repo, core `profile` và `questions`, route đọc và lưu.
2. Màn form và tab Brainstorm (không AI), xuất Markdown.
3. Mồi từ dữ liệu, nhập theo tiêu đề.
4. Trợ lý AI và nhập bằng AI.
5. `contextText` vào bước tổng hợp của 5W1H; thẻ tiến độ ở Tổng quan.

Bước 1 đến 3 không cần lớp LLM. Bước 4 và 5 cần giai đoạn 1 đã xong.
