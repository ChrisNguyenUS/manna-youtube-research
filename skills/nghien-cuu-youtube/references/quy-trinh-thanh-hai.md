# Quy trình làm YouTube bằng AI — Thanh Hải (Learn AI)

Nguồn: video "Full Quy Trình Làm YouTube Bằng AI 2026 Từ A–Z" (https://www.youtube.com/watch?v=WI29qBvzUXI, 3 giờ 20 phút) và tài liệu tác giả để ở mô tả video. Bản tóm tắt do mình viết lại, giữ phần liên quan tới nghiên cứu. Phần nghiên cứu trong video: 06:26 → 01:14:04 (tìm chủ đề, tìm key, dùng AI hỗ trợ nghiên cứu, chốt chủ đề và format).

## Bước 1 — Tìm chủ đề (ngách)

- Chọn chủ đề bạn thích, quan tâm hoặc hiểu biết.
- Tìm và xem video có **định dạng đơn giản, dễ làm**, làm được.
- Like, subscribe kênh liên quan, tải lại trang chủ để YouTube gợi ý thêm.
- **Ưu tiên kênh nhiều view nhưng ít sub**, đặc biệt **video mới trong năm nay có lượt xem tốt**. Lưu lại kênh và video tiềm năng.

Tiêu chí chọn: hợp thời gian · hợp tài chính · duy trì lâu dài · bạn thích/hiểu cơ bản · hợp kỹ năng hiện tại.

→ Trong app: **Tìm kênh** (lọc "Nhiều view, ít sub", "Tuổi kênh ≤ 1 năm", "Đăng gần nhất 30 ngày"), **Nghiên cứu chủ đề** tab "Kênh nhỏ đang thắng", nút **Lưu** → **Đã lưu**.

## Bước 2 — Tìm format thắng

- Tìm format đã thành công ở lĩnh vực A, **áp dụng hoặc biến tấu sang lĩnh vực B**.
- Ưu tiên **nội dung cũ làm lại với góc nhìn mới**.
- Áp cách trình bày đang thịnh hành (hook, nhịp dựng, hình ảnh, kể chuyện).
- Dùng AI gợi ý tiêu đề/ý tưởng, rồi **tìm trên YouTube xem đã có ai làm format mình muốn test chưa**.

→ Trong app: **Phân tích kênh** (video nổi bật ≥ 3× trung vị), **Kiểm tra ý tưởng** (đo nhu cầu và độ cạnh tranh cho từng ý tưởng), **Từ khoá người xem gõ**.

## Bước 3 — Phân tích kịch bản viral

- Thu thập **10 kịch bản/video viral** của đối thủ cùng lĩnh vực.
- Phân tích: hook, bố cục, cách kể chuyện, nhịp nội dung, CTA.
- Tổng hợp thành **framework** chiến thắng → prompt viết kịch bản chỉ cần nhập tiêu đề.
- Phân tích style ảnh để có prompt ảnh/nhân vật cố định.

→ Trong app: chọn 10 video vượt kênh nhất ở Nghiên cứu chủ đề / Phân tích kênh. App chưa lấy transcript (YouTube chặn lấy phụ đề tự động khi không đăng nhập); muốn phân tích kịch bản thì mở video → "Hiện bản chép lời" → copy cho Claude.

## Bước 4–6 — Sản xuất (ngoài phạm vi app)

Giọng đọc (ElevenLabs/Vbee) → phụ đề SRT (CapCut) → gộp SRT thành câu 5–8 giây → prompt ảnh mỗi block SRT với STYLE CỐ ĐỊNH → tạo ảnh/video → dựng.

## Bước 7 — Đăng & test kênh

- AI viết tiêu đề, mô tả, hashtag, từ khoá từ SRT; điền đủ mọi mục khi đăng.
- Thumbnail: phân tích thumbnail đối thủ + nội dung kịch bản → AI tạo bản tối ưu.
- **Đăng 10 video để test kênh.**

Đánh giá:

| Tình huống | Làm gì |
|---|---|
| Không có lượt hiển thị (impressions) | Đăng thêm 10 video để xác nhận |
| 20 video vẫn không có đề xuất | Nhiều khả năng sai chủ đề → quay lại Bước 1 |
| Có đề xuất nhưng CTR hoặc thời gian xem thấp | Tối ưu thumbnail, tiêu đề, hook mở đầu |
| Có đề xuất, chỉ số tốt nhưng view vẫn thấp | Tiếp tục đăng đều để YouTube thu thêm dữ liệu |
