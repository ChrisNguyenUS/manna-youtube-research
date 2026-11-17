# Chấm lô: thiết kế

> Ngày: 2026-11-16 · Trạng thái: đã duyệt, có [kế hoạch code](../plans/2026-11-17-batch-review.md) · Phạm vi: giai đoạn 7 trong [kế hoạch tổng](../plans/2026-11-16-master-plan.md)
> Cần trước: giai đoạn 5. Không cần AI.
> Nguồn nội dung: Chương 1 và 11 của tài liệu Kallaway (chọn game, đo theo lô 10, thứ tự thước đo).

## 1. Mục đích

Đăng xong mà không nhìn lại theo lô thì lô sau lặp đúng lỗi lô trước. Kallaway dạy ba điều: đo theo lô 10 chứ không phán từng video; với người làm dịch vụ, xếp theo khách rồi follower rồi mới tới view; video thua thì tìm đúng viên gạch thua, đừng vứt cả format.

Giai đoạn này khép vòng: nhập kết quả của một lô, app xếp hạng theo đúng game trong Soulprint và chỉ ra gạch nào đang đi với video thắng, gạch nào đi với video thua.

Thành công nghĩa là:
- Gắn link video đã đăng vào thẻ; view, tim, comment tự cập nhật.
- Nhập số khách và số follower tăng cho từng video trong vài giây.
- Một bảng xếp hạng theo game, và một bảng gạch thắng, gạch thua kèm số video.
- Đóng lô để lại danh sách "nên giữ" và "nên bỏ" cho lô sau.

## 2. Phạm vi

**Có:** tab **Kết quả** trong thẻ; màn **Chấm lô** (`#/board/review`) trong nhóm Làm; job cập nhật số liệu; xếp hạng; bảng gạch; đóng lô.

**Không (cố ý):**
- Tự lấy số khách, email, follower của kênh chủ app. App không đăng nhập vào kênh; các số này nhập tay.
- Biểu đồ giữ chân người xem. Kallaway xếp nó vào nhóm chỉ số gây xao nhãng với người làm dịch vụ, và app cũng không lấy được.
- Kết luận nhân quả. Bảng gạch là đối chiếu trên một lô nhỏ.
- AI. Mọi thứ ở đây là đếm.

## 3. Nhập kết quả

Tab Kết quả của một thẻ:
- **Link video đã đăng.** App nhận nền tảng và lấy thông số bằng nguồn sẵn có (cùng cách với Phân tích video).
- **Tự cập nhật:** view, tim, comment, chia sẻ, lưu (trường nào nền tảng có), ngày đăng, số ngày đã đăng.
- **Nhập tay:** số khách hoặc email từ video này; số follower tăng. Hai ô số, để trống nghĩa là chưa biết (khác với 0).
- Thẻ chuyển sang trạng thái "đã đăng".

Nút **Cập nhật số liệu cả lô** chạy job `batch_refresh` cho mọi thẻ đã gắn link. Mỗi lần cập nhật lưu một mốc (ngày, các số), để so video ở cùng tuổi.

## 4. Xếp hạng

Theo `game` trong Soulprint:

| Game | Xếp theo |
|---|---|
| Trúng | khách, rồi follower tăng, rồi view |
| Rộng | view, rồi tỉ lệ chia sẻ (chia sẻ chia view) |
| Chưa chọn | view, kèm nhắc "chọn game trong Soulprint để xếp hạng đúng" |

- Video thiếu số nhập tay đứng sau các video có số, và được đánh dấu "chưa nhập".
- Video đăng chưa đủ 3 ngày được đánh dấu "còn mới" và không tính vào bảng gạch.
- Với game Trúng, cột view hiện mờ. Tài liệu gọi view sai đối tượng là "calo rỗng"; bảng vẫn cho xem nhưng không xếp theo nó.

## 5. Bảng gạch thắng và thua

Chia các video đã đủ số liệu thành nửa trên và nửa dưới theo thứ hạng ở §4. Với mỗi giá trị của các thuộc tính sau, code đếm số video ở nửa trên và nửa dưới:

- pillar, concept, giai đoạn phễu (từ thẻ);
- archetype của hook đã chọn, độ dài (từ dàn ý);
- từng gạch đã giữ và từng gạch đã làm lại (từ `keep`, `remix`);
- nguồn: từ dữ liệu hay tự nghĩ.

Hiển thị: "Concept So sánh: 4 video nửa trên, 1 video nửa dưới".

- **Dưới 10 video đủ số liệu:** bảng vẫn hiện, với dòng đầu "Mới có N video, chưa đủ để kết luận. Kallaway khuyên xem theo lô 10."
- Một giá trị được đề xuất **giữ** khi có ở ít nhất 3 video nửa trên và nhiều nhất 1 video nửa dưới; đề xuất **xem lại** khi ngược lại. Còn lại không gắn nhãn.
- Với từng video nửa dưới: liệt kê các thuộc tính của nó khác với các video nửa trên cùng pillar. Đây là gợi ý "gạch nào thua", để sửa đúng gạch đó thay vì bỏ cả format.

Bảng chẩn đoán mức kẹt view (khoảng 1K, 10K, 100K) của Kallaway hiện ở cuối như một gợi ý đọc thêm, ghi rõ "chỉ từ một bài đăng, không phải luật". App không tự gán video vào mức nào.

## 6. Đóng lô

Nút **Đóng lô** mở một bảng xác nhận gồm các đề xuất giữ và xem lại ở §5. Chủ app tick những dòng muốn mang sang, sửa chữ nếu cần. Kết quả lưu vào `learned` của lô và hiện ở đầu lô kế tiếp (giai đoạn 5 đã chừa chỗ). Video thắng nhất của lô có nút "Làm lại video này" tạo thẻ mới trong lô sau với các gạch giữ nguyên.

Đóng lô không khoá số liệu: vẫn cập nhật và sửa được sau đó.

## 7. Thành phần

- Không bảng mới: kết quả nằm trong cột `published` của `ideas`, cạnh JSON của thẻ (`url`, `platform`, `videoId`, `postedAt`, `snapshots[]`, `leads`, `followers`, `views` nhập tay, `error`); `learned` nằm trong `idea_batches`.
- `src/core/ideas/review.js` (thuần): xếp hạng theo game, chia nửa, đếm thuộc tính, luật giữ và xem lại, khác biệt của video thua.
- `src/core/report/review.js`: Markdown của một lô đã chấm.
- `src/features/ideas.js`: `attachVideo`, `refresh` (job `batch_refresh`), `review(batchId)`, `close(batchId, learned)`.
- Route dưới `/api/v1/ideas/batches/:id/…`.
- Web: tab Kết quả trong thẻ, `web/views/board-review.js`.

## 8. Lỗi và trường hợp biên

| Tình huống | App làm gì |
|---|---|
| Link không lấy được thông số (video riêng tư, đã xoá) | Giữ link, ghi lý do, cho nhập view bằng tay |
| Cùng một link gắn vào hai thẻ | Báo và không cho gắn lần hai |
| Số nhập tay âm hoặc không phải số | Không nhận, nói rõ |
| Lô có số video lẻ | Video ở giữa không thuộc nửa nào |
| Mọi video cùng một giá trị thuộc tính | Thuộc tính đó không hiện trong bảng gạch (không phân biệt được gì) |
| Game đổi sau khi đã chấm | Bảng xếp lại theo game mới; `learned` đã lưu giữ nguyên, ghi kèm game lúc đóng |

## 9. Test

- Core: xếp hạng ở cả ba trường hợp game; video thiếu số; video còn mới; chia nửa với số chẵn và lẻ; luật giữ và xem lại ở các mức biên; ngưỡng 10 video; khác biệt của video thua.
- Feature với nguồn giả: gắn link, cập nhật có mốc, link trùng, link lỗi, đóng lô mang `learned` sang lô sau.
- HTTP; web.

## 10. Thứ tự làm

1. Gắn link, số tự cập nhật, số nhập tay.
2. Xếp hạng và bảng gạch.
3. Đóng lô, "làm lại video này".

## 11. Điều chỉnh khi viết kế hoạch code

- **Kết quả nằm ở cột riêng `published`, không trong JSON của thẻ.** Phần làm sạch thẻ bỏ mọi trường lạ, nên để chung thì mỗi lần lưu thẻ sẽ xoá kết quả. Cùng cách với dàn ý ở giai đoạn 6.
- **Chấm lô là tab thứ hai của mục Bảng ý tưởng** trong menu, không phải một mục riêng.
- **Mỗi ngày giữ một mốc số liệu**: cập nhật hai lần trong ngày thì lần sau thay lần trước. Giữ tối đa 30 mốc.
- **"Làm lại video này" chỉ có sau khi đóng lô**, và thẻ mới vào lô đang mở. Thẻ làm lại có nguồn riêng (`redo`), giữ cả 7 gạch, tính là "từ video đã thắng", và câu 1 là "có".
- **Nhập view bằng tay** được khi link không lấy được số.
- **Đóng lại một lô đã đóng** chỉ thay các dòng mang sang, và ghi game ở lần lưu đó.
