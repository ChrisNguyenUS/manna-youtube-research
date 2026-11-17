# Dàn ý script: thiết kế

> Ngày: 2026-11-16 · Trạng thái: chờ duyệt · Phạm vi: giai đoạn 6 trong [kế hoạch tổng](../plans/2026-11-16-master-plan.md)
> Cần trước: giai đoạn 5.
> Nguồn nội dung: Chương 6, 7 và 8 của tài liệu Kallaway (hook 3 bước, Triple Hook, 6 archetype, Dopamine Loop, khung script ngắn), checklist "tính người" và 12 quy tắc viết "có hồn" của chủ app.

## 1. Mục đích

Một thẻ ý tưởng đã chốt vẫn còn xa một video: cần hook, thứ tự các ý, chỗ giữ người xem, lời kêu gọi. Giai đoạn này dựng **dàn ý** cho thẻ đó. Nó không viết lời thoại hoàn chỉnh: lời do chủ app viết, hoặc viết ở Claude với skill sẵn có, đúng nguyên tắc "AI cho đầu vào, không cho đầu ra".

Thành công nghĩa là:
- Từ một thẻ đã chốt, có dàn ý đủ các khối trong vài phút.
- Ba phương án hook để chọn, mỗi phương án đủ ba lớp.
- Một file Markdown đưa cho Claude là viết được lời.
- Dán lời đã viết vào, app chỉ ra chỗ phạm luật "có hồn" mà máy đếm được.

## 2. Phạm vi

**Có:** tab **Dàn ý** trong thẻ ý tưởng; trợ lý dựng dàn ý và trợ lý đổi hook; kiểm 4 chữ S; xuất Markdown; công cụ soát lời thoại bằng code.

**Không (cố ý):**
- Viết lời thoại hoàn chỉnh trong app.
- Dàn ý video dài (title, thumbnail, intro 5 bước, body 2-1-3-4). Phần đó trong tài liệu Kallaway chỉ có tên khung, không đủ chi tiết để làm đúng; giai đoạn này chỉ làm video ngắn.
- Sáu phương pháp Lock-In Zone. Tài liệu ghi rõ danh sách này chưa xác minh được; app chỉ yêu cầu 2 đến 3 câu khoá và không bịa ra tên phương pháp.

## 3. Dàn ý gồm gì

| Phần | Trường | Ghi chú |
|---|---|---|
| Độ dài | `length`: 30, 45, 60 hoặc 90 giây | Mặc định 45 |
| Hook | `hooks`: ba phương án. Mỗi phương án: `archetype`, `lean` (1 đến 2 dòng nêu chủ đề để đúng người ở lại), `interjection` (một từ ngắt: nhưng, thế mà, ai dè…), `snapback` (một câu bật ngược), `text` (3 đến 5 chữ trên màn hình), `visual` (hình mở đầu) | Ba lớp hình, chữ, lời phải nói cùng một ý |
| | `chosenHook` | Chủ app chọn |
| 4 chữ S | `fourS`: chủ thể, được mất, đơn giản, rõ ngay; mỗi mục đạt hoặc chưa, kèm ghi chú | AI chấm nháp, chủ app quyết |
| Lock-In | `lockIn`: 2 đến 3 câu ngay sau hook: hứa cụ thể, bằng chứng sớm, hoặc câu hỏi lớn | |
| Thân | `blocks`: Body 1 (ý mạnh nhất), Rehook 1, Body 2 (có cú đánh lạc hướng hoặc ví dụ cụ thể), Rehook 2 và Body 3 (tuỳ chọn), Closing (tuỳ chọn, một câu đáng nhớ). Mỗi khối: `point`, `example` | |
| Vòng lặp | `loop`: cái đang bị đe doạ, câu hỏi lớn, cú đánh lạc hướng, chỗ mở vòng mới | Bốn bước Dopamine Loop |
| CTA | `cta`: câu kêu gọi nhúng tự nhiên, dẫn về `leadMagnet` của thẻ | Luôn có |
| Mốc thời gian | Code chia theo `length` từ mẫu 45 giây của tài liệu (0–3 hook, 3–8 lock-in, 8–25 body 1, 25–28 rehook, 28–42 body 2, 42–45 CTA) | Không do AI |

Archetype được chọn theo hình ảnh chủ app thật sự có: ô "Mình có cảnh gì để quay" (quay mặt nói, quay màn hình, thí nghiệm thật, trước và sau…) nằm ngay đầu tab, và prompt bắt các phương án hook chỉ dùng cảnh đó.

## 4. Trợ lý AI

| Nút | Làm gì |
|---|---|
| Dựng dàn ý | Một lần gọi model tổng hợp: từ thẻ (nỗi đau, niềm tin, góc, gạch giữ lại), gạch gốc trong thư viện, Soulprint (avatar, giọng nói) và file kiến thức hook, trả về cả dàn ý |
| Đổi hook | Ba phương án hook mới theo archetype chủ app chọn |
| Chấm 4 chữ S | Chấm hook đang chọn, mỗi chữ một dòng lý do |

Đề xuất hiện cạnh bản đang có; nhận từng phần được (chỉ lấy hook, hoặc chỉ lấy thân).

File kiến thức mới `hooks.md`: cắt từ Chương 6, 7 và 8 của tài liệu Kallaway, chỉ các mục thuộc mức "dạy lặp lại" (hook 3 bước, Triple Hook, 6 archetype, 4 lỗi hook, Dopamine Loop, khung script ngắn).

## 5. Xuất cho Claude

Một file Markdown gồm: thẻ ý tưởng (nỗi đau kèm comment, niềm tin, góc), dàn ý với mốc thời gian, hook đã chọn đủ ba lớp, giọng nói trong Soulprint, và một dòng nhắc dùng skill viết kịch bản cùng checklist "tính người". File không chứa lời thoại do AI của app viết.

## 6. Soát lời thoại (code, không AI)

Chủ app dán lời đã viết vào ô **Soát lời thoại**. Code trả về danh sách vi phạm, mỗi dòng kèm câu chứa nó:

| Luật | Nguồn |
|---|---|
| Từ cấm trừu tượng (engagement, insight, tối ưu hoá, "tạo sự tò mò"…) và từ văn viết (Tuy nhiên, Do đó, Mặc dù vậy…) kèm từ nên thay | checklist "tính người", phần 5 |
| Ký hiệu thay câu chữ: `→`, `---`; dấu `—` quá 2 lần | quy tắc 7 và checklist |
| Nhịp câu đều: từ 4 câu liền nhau có độ dài chênh nhau dưới 3 từ | "cạnh răng cưa" của Kallaway |
| Câu quá dài không có dấu phẩy (trên 30 từ) | checklist, phần 4 |
| Thiếu CTA: không có câu nào chứa lead magnet hoặc lời kêu gọi | Kallaway, CTA mọi video |
| Số từ so với độ dài: quá 3 từ mỗi giây | ước lượng tốc độ nói, chỉnh được trong Cài đặt |

Danh sách từ nằm trong một file dữ liệu để chủ app thêm bớt. Công cụ không chấm "có hồn hay chưa"; nó chỉ bắt những lỗi đếm được. Lời đã soát có thể lưu vào thẻ (trường `script`) để xem lại ở giai đoạn 7.

## 7. Thành phần

- `src/core/outline/`: `outline.js` (dàn ý trống, làm sạch, chia mốc thời gian), `assist.js` (ba trợ lý), `lint.js` và `lint-words.js` (soát lời).
- `src/core/report/outline.js`: Markdown.
- `src/features/ideas.js`: thêm `outlineAssist`, `lintScript`; dàn ý lưu trong `data.outline` của thẻ, không cần bảng mới.
- Route: `POST /api/v1/ideas/:id/outline/assist`, `POST /api/v1/ideas/lint`, `GET /api/v1/ideas/:id/outline.md`.
- Web: tab Dàn ý trong `web/views/board.js`.
- File kiến thức `hooks.md`.

## 8. Lỗi và trường hợp biên

| Tình huống | App làm gì |
|---|---|
| Thẻ chưa chốt | Vẫn dựng được dàn ý; màn nhắc thẻ còn thiếu câu chấm nào |
| Thẻ không có lead magnet | CTA để trống và đánh dấu "thiếu lead magnet" |
| Ba lớp hook do AI trả về lệch ý nhau | Code không tự phát hiện được; màn đặt ba lớp cạnh nhau để chủ app nhìn thấy |
| Lời thoại dán vào rất dài | Soát tối đa 20.000 ký tự, nói rõ nếu cắt |
| Thẻ tự nghĩ, không có gạch gốc | Dựng dàn ý từ thẻ và Soulprint; không có phần "gạch giữ lại" |

## 9. Test

- Core: chia mốc cho 30, 45, 60, 90 giây; làm sạch dàn ý; từng luật soát lời với câu đạt và câu phạm; danh sách từ thay thế.
- Feature với LLM giả: dựng dàn ý không tự ghi; nhận từng phần; xuất Markdown không có trường lời thoại của AI.
- HTTP; web (tab Dàn ý, ô cảnh quay).

## 10. Thứ tự làm

1. Dàn ý tự gõ, chia mốc thời gian, xuất Markdown.
2. Soát lời thoại.
3. Ba trợ lý AI và file kiến thức.
