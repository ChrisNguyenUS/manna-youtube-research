# Thử nghiệm: cho model xem và nghe video

> Ngày: 2026-11-16 · Trạng thái: đã duyệt, có [kế hoạch thử](../plans/2026-11-17-video-watch-spike.md) · Phạm vi: giai đoạn 8 trong [kế hoạch tổng](../plans/2026-11-16-master-plan.md)
> Đây là thử nghiệm, không phải tính năng. Kết quả là một bản báo cáo; code viết ra là code tạm và không giữ lại.

## Câu hỏi cần trả lời

1. App có tải được file video TikTok và YouTube về máy không, mất bao lâu, có cần đăng nhập không?
2. Gửi một video 30 đến 60 giây cho model qua OpenRouter tốn bao nhiêu token và bao nhiêu tiền? Có giới hạn dung lượng hay độ dài nào không?
3. Model rẻ có mô tả đúng hình ảnh không: số người, bối cảnh, chữ trên màn hình, số cảnh và nhịp chuyển cảnh, góc quay?
4. Model có nghe được tiếng không: có nhạc nền hay không, giọng nam hay nữ, giọng thật hay giọng máy, có hiệu ứng âm thanh không? Có hiểu lời nói tiếng Việt không?

## Cách thử

- 5 video TikTok tiếng Việt do chủ app chọn, khác nhau về kiểu: quay mặt nói, có chữ lớn trên màn hình, nhiều cảnh cắt nhanh, có nhạc nền, lồng tiếng máy.
- Chủ app viết trước, cho từng video, đáp án của khoảng 10 câu hỏi cụ thể (ví dụ "có mấy người", "chữ đầu tiên trên màn hình là gì", "có nhạc nền không").
- Chạy bốn model: MiMo V2.6 Flash (nhận hình và tiếng), GLM 5.3 Flash (chỉ nhận hình), Qwen 3.8 Omni Flash (nhận hình và tiếng) và Gemini 3.1 Flash Lite (nhận hình và tiếng, làm mốc so). Cùng một bộ 11 câu hỏi, trả lời theo JSON.
- So câu trả lời với đáp án, đếm số câu đúng theo từng nhóm: hình, chữ trên màn hình, nhịp cảnh, âm thanh.
- Ghi số token, số tiền, thời gian cho mỗi video.

Việc tải file video chỉ làm trên 5 video này, lưu ở thư mục tạm, xoá sau khi thử.

## Kết quả và quyết định

| Nếu | Thì |
|---|---|
| Tải được, model đúng từ 8 trên 10 câu về hình, chi phí dưới 1 cent mỗi video | Viết spec đưa gạch Visual Format và Key Visuals vào thư viện gạch |
| Thêm: model đúng phần âm thanh | Thêm gạch Audio |
| Không tải được ổn định, hoặc model sai nhiều | Ba gạch đó để chủ app tự gõ; ghi lại lý do và ngày thử để thử lại khi có model mới |
| Tải được nhưng đắt | Chỉ chạy khi chủ app bấm cho từng video, không chạy theo lô |

Các ngưỡng trên là mức mình đề xuất để ra quyết định; chủ app chỉnh trước khi thử.

## Chi phí và thời gian

Một buổi. Tiền gọi model ước tính dưới 0,5 USD cho 5 video và 2 model; con số thật là một trong những thứ thử nghiệm phải đo.
