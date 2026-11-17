# Bảng ý tưởng theo lô 10: thiết kế

> Ngày: 2026-11-16 · Trạng thái: đã duyệt · Phạm vi: giai đoạn 5 trong [kế hoạch tổng](../plans/2026-11-16-master-plan.md)
> Cần trước: giai đoạn 1, 2, 4.
> Nguồn nội dung: Chương 4, 5 và 11 của tài liệu Kallaway (Idea Mining, chấm ý tưởng, làm theo lô 10), công thức DICK, phễu.

## 1. Mục đích

Có thư viện gạch và kho nỗi đau rồi, chủ app vẫn phải tự ghép chúng thành ý tưởng và tự hỏi "ý này đáng quay không". Giai đoạn này cho một bảng làm việc: mỗi ý tưởng là một thẻ, đi theo lô 10, mỗi thẻ được chấm bằng 6 câu hỏi của Kallaway với căn cứ rõ ràng.

Thành công nghĩa là:
- Từ một video trong thư viện gạch và một nỗi đau, dựng được thẻ nháp trong một phút.
- Mỗi thẻ có 6 câu trả lời chấm ý tưởng; câu nào trả lời được bằng dữ liệu thì code trả lời.
- Nhìn một lô biết ngay: bao nhiêu ý từ dữ liệu, bao nhiêu ý tự nghĩ, thẻ nào chưa đủ căn cứ.
- Xuất cả lô thành Markdown.

## 2. Phạm vi

**Có:** bảng `idea_batches` và `ideas`; màn **Bảng ý tưởng** (`#/board`) trong nhóm Làm; tạo thẻ từ thư viện gạch, từ Soulprint, từ gợi ý của báo cáo 5W1H, hoặc tự gõ; chấm 6 câu; ba trợ lý AI; xuất Markdown.

**Không (cố ý):**
- Lịch đăng theo ngày giờ, nhắc việc. Ngày đăng chỉ là một trường tuỳ chọn.
- Chấm điểm bằng số. Sáu câu trả lời là có, chưa, hoặc không rõ, kèm căn cứ.
- Dàn ý script (giai đoạn 6) và số liệu sau khi đăng (giai đoạn 7); thẻ chừa sẵn chỗ.

## 3. Một thẻ gồm gì

| Trường | Nội dung |
|---|---|
| `origin` | Từ gạch (trỏ tới video trong thư viện) hoặc tự nghĩ |
| `keep`, `remix` | Trong 7 gạch (Topic, Angle, Hook Structure, Story Structure, Visual Format, Key Visuals, Audio): giữ gạch nào, làm lại gạch nào. Chỉ có khi thẻ từ gạch |
| `topic`, `pillar` | Chủ đề của video mình sẽ làm, thuộc pillar nào |
| `pain` | Nỗi đau nhắm tới, lấy từ kho nỗi đau của Soulprint hoặc một nhóm 5W1H, kèm comment làm bằng chứng |
| `belief` | Điều người ta đang tin và điều video sẽ chỉ ra |
| `angle` | Góc đi ngược của mình, một dòng |
| `title` | Tiêu đề theo DICK: bốn phần (đối tượng, insight, concept, khác) và câu ghép |
| `concept`, `funnel` | Concept chính; giai đoạn phễu (Biết, Thích, Tin, Yêu) |
| `leadMagnet` | Thứ tặng khớp với chủ đề, dẫn về email hoặc tin nhắn |
| `checks` | Sáu câu trả lời (§4) |
| `filterOk` | Câu lọc của Soulprint: có giá trị với avatar không |
| `status` | nháp, chốt, đã quay, đã đăng, bỏ |
| `publishDate` | tuỳ chọn |
| `outline`, `published` | Chỗ cho giai đoạn 6 và 7 |

## 4. Sáu câu chấm ý tưởng

| # | Câu hỏi | Ai trả lời | Cách trả lời |
|---|---|---|---|
| 1 | Đã có video tương tự thắng dạng vượt kênh ở kênh tương đương chưa? | **code** | Tra thư viện gạch: video vượt kênh cùng pillar và trùng concept, hoặc chủ đề chung ít nhất 2 từ khoá. Liệt kê các video tìm được. Thẻ từ gạch tự có một video. |
| 2 | Nỗi đau của avatar nói được trong một câu chưa? | chủ app, AI nháp | Phải gắn với một dòng trong kho nỗi đau hoặc một comment |
| 3 | Góc đi ngược nói được trong một dòng chưa? | chủ app, AI nháp | Trường `angle` |
| 4 | Khoảng cách giữa điều người ta tin và thực tế ở đâu? | chủ app, AI nháp | Trường `belief`, có comment cho thấy niềm tin đó thì ghi kèm |
| 5 | Giữ gạch nào, làm lại gạch nào? | chủ app | `keep`, `remix`; thẻ tự nghĩ thì bỏ qua câu này |
| 6 | Lead magnet nào khớp? | chủ app | Trường `leadMagnet`; trống thì là "chưa" |

Câu 1 do code tra. Câu 2 đến 6 cũng do code trả lời: "có" khi ô tương ứng của thẻ đã có nội dung, nên mỗi chữ "có" luôn có nội dung đứng sau. Chủ app ghi thêm ghi chú cho từng câu. AI nháp nội dung các ô, và nội dung đó chỉ vào thẻ khi chủ app bấm nhận.

Thẻ **đủ căn cứ để chốt** khi câu 1 đến 4 và câu 6 là "có", và câu lọc là "có". Thẻ chưa đủ vẫn chốt được; màn hiện rõ thiếu câu nào. Thẻ tự nghĩ luôn thiếu câu 1 và được ghi là "thử nghiệm gốc".

## 5. Lô

- Một lô có tên, ngày tạo, tối đa 10 thẻ đang sống (không tính thẻ đã bỏ). Mỗi lúc có một lô đang mở; các lô cũ xem lại được.
- Đầu lô hiện: số thẻ từ dữ liệu và số thẻ tự nghĩ, kèm nhắc theo Kallaway (khoảng 7 đến 8 thẻ từ dữ liệu, 2 đến 3 thẻ tự nghĩ). App đếm và nhắc, không chặn.
- Đầu lô cũng hiện "Gạch nên giữ" và "Gạch nên bỏ" do lô trước để lại (giai đoạn 7 điền).

## 6. Trợ lý AI

Như Soulprint: chỉ hiện khi có key, chỉ đề xuất, bấm nhận mới vào thẻ.

| Nút | Làm gì |
|---|---|
| Nháp thẻ ("Dựng thẻ từ video gốc" khi thẻ có video gốc) | Nháp `topic`, `angle`, nỗi đau, `belief`; khi có video gốc thì gợi ý thêm `keep` và `remix` |
| Gợi ý tiêu đề | Ba tiêu đề theo DICK, mỗi tiêu đề tách rõ bốn phần |

Prompt kèm đoạn Soulprint và file kiến thức (DICK, phễu, mục chấm ý tưởng của Kallaway).

## 7. Màn hình

- Trên cùng: tên lô, bộ đếm, nút tạo thẻ, nút xuất.
- Thân: danh sách thẻ, mỗi thẻ một dòng gồm trạng thái, tiêu đề, pillar, nguồn, và sáu chấm tròn cho sáu câu (đặc, rỗng, hoặc gạch).
- Bấm một thẻ: khung chi tiết kiểu ảnh mẫu với các tab **Ý tưởng**, **Chấm**, **Gạch gốc** (mở chi tiết video trong thư viện). Tab **Dàn ý** và **Kết quả** do giai đoạn 6 và 7 thêm vào.
- Lô đầu tiên được tạo khi mở bảng lần đầu.
- Bộ đếm chia thẻ "từ video đã thắng" (từ thư viện gạch) và các thẻ còn lại; thẻ từ nỗi đau hay gợi ý 5W1H tính vào phần còn lại, vì tỉ lệ 70–80% của Kallaway nói về ý đào từ video vượt kênh.

Lối tạo thẻ ở màn khác: nút "Tạo ý tưởng từ video này" ở chi tiết thư viện gạch; nút "Tạo ý tưởng" cạnh mỗi nỗi đau trong Soulprint; nút "Đưa vào bảng" cạnh mỗi gợi ý content trong báo cáo 5W1H.

## 8. Thành phần

- `src/store/sqlite/migrations/008_ideas.sql`: `idea_batches (id, workspace_id, title, status, learned JSON, created_at, closed_at)` và `ideas (id, workspace_id, batch_id, status, data JSON, created_at, updated_at)`.
- `src/store/sqlite/repos/ideas.js`.
- `src/core/ideas/`: `card.js` (thẻ trống, làm sạch, điều kiện đủ căn cứ, đếm lô), `precedent.js` (câu 1: tra thư viện gạch), `assist.js` (ba trợ lý).
- `src/core/report/ideas.js`: Markdown một lô.
- `src/features/ideas.js`; route dưới `/api/v1/ideas`.
- Web: `web/views/board.js`; các nút ở `bricks.js`, `soulprint.js`, `tiktok/five-w.js`.

## 9. Lỗi và trường hợp biên

| Tình huống | App làm gì |
|---|---|
| Lô đã đủ 10 thẻ | Tạo thẻ mới hỏi: bỏ một thẻ, hay mở lô mới |
| Video gốc bị xoá khỏi thư viện | Thẻ giữ bản chụp các gạch lúc tạo; ghi "video gốc không còn trong thư viện" |
| Thư viện gạch trống | Câu 1 là "không rõ: thư viện chưa có video nào", không phải "chưa" |
| Soulprint chưa có câu lọc | `filterOk` không tính vào điều kiện đủ căn cứ; màn nhắc |
| Nỗi đau bị xoá khỏi Soulprint | Thẻ giữ chữ của nỗi đau, ghi nguồn không còn |

## 10. Test

- Core: làm sạch thẻ, điều kiện đủ căn cứ ở từng tổ hợp, đếm lô, tra tiền lệ (trùng pillar và concept; trùng từ khoá; không có gì; thư viện trống).
- Feature với LLM giả: tạo từ gạch giữ bản chụp, trợ lý không tự ghi, giới hạn 10, đóng và mở lô.
- HTTP, store (migration 008), web (nút ở ba màn khác).

## 11. Thứ tự làm

1. Bảng, core `card`, màn với thẻ tự gõ, xuất Markdown.
2. Tạo từ gạch, từ Soulprint, từ 5W1H; câu 1 bằng code.
3. Ba trợ lý AI.
