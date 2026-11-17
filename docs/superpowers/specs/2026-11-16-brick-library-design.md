# Thư viện gạch: thiết kế

> Ngày: 2026-11-16 · Trạng thái: chờ duyệt · Phạm vi: giai đoạn 4 trong [kế hoạch tổng](../plans/2026-11-16-master-plan.md)
> Cần trước: lớp LLM (giai đoạn 1), Soulprint (giai đoạn 2). Nên có: giai đoạn 3 (lời thoại YouTube).
> Nguồn nội dung: Chương 2 và 4 của tài liệu Kallaway (outlier, 7 Lego bricks), skill `viral-content-analyst` (8 bước), 40 concept.

## 1. Mục đích

Kallaway dạy: mỗi tuần xem 25 đến 50 video đã thắng ở kênh nhỏ và vừa, ghi mỗi video thành các viên gạch, rồi giữ gạch thắng và làm lại gạch thua. Việc ghi tay này tốn nhiều giờ nên ít ai làm đều.

App đã biết video nào vượt kênh (màn Theo dõi). Giai đoạn này cho AI bóc hàng loạt các video đó thành gạch, lưu thành một thư viện lọc được, và tự đối chiếu video thắng với video thua của cùng kênh.

Thành công nghĩa là:
- Từ danh sách theo dõi, một lần bấm bóc được gạch cho các video vượt kênh mới.
- Mỗi viên gạch bấm vào thấy đoạn lời thoại hoặc comment làm căn cứ.
- Lọc thư viện theo pillar, concept, archetype, kênh, nền tảng.
- Với mỗi kênh, thấy gạch nào có ở video thắng mà vắng ở video thua, kèm số video.
- Màn chi tiết một video giống ảnh mẫu của chủ app: các tab Transcript, Idea Analysis, Hook, Storytelling Format, Visual Layout.

## 2. Phạm vi

**Có:**
1. Bảng `bricks` và job `brick_extract`.
2. Màn **Thư viện gạch** (`#/bricks`) trong nhóm Mổ xẻ: bảng, bộ lọc, chi tiết.
3. Nút bóc gạch ở màn Theo dõi và ở báo cáo Phân tích video.
4. Bảng đối chiếu thắng và thua theo kênh.
5. Đào sâu một video theo 8 bước của skill phân tích (job `video_deep_dive`).

**Không (cố ý):**
- Gạch về hình ảnh và âm thanh (Visual Format, Key Visuals, Audio). Chúng để trống tới khi giai đoạn 8 có kết quả; chủ app có thể tự gõ.
- Tìm kênh mới để theo dõi. Thư viện chỉ đọc các kênh đã có trong Theo dõi và các video chủ app tự đưa vào.
- Kết luận "vì sao viral". Thư viện ghi quan sát và đối chiếu; phần đào sâu ghi rõ là giả thiết.

## 3. Một video được bóc thành gì

| Nhóm | Trường | Ai điền | Căn cứ bắt buộc |
|---|---|---|---|
| Topic | `topic` (một câu), `pillar` (tên một pillar trong Soulprint, hoặc trống) | AI | đoạn lời thoại |
| Idea | `seed` (ý tưởng gốc, một câu), `angle` (góc không hiển nhiên) | AI | đoạn lời thoại |
| Niềm tin | `belief.common` (điều người ta đang tin), `belief.reality` (điều video chỉ ra) | AI | đoạn lời thoại |
| Sự thật chính | `facts` (tối đa 5 dòng) | AI | đoạn lời thoại |
| Concept | `concept` (một trong 40 concept), `extraConcepts` (tối đa 2) | AI | không |
| Hook | `hook.spoken` (nguyên văn 5 giây đầu) | **code** cắt theo mốc thời gian | chính nó |
| Hook | `hook.formula` (câu có ô trống kiểu `[chủ thể] … nhưng […]`), `hook.archetype` (một trong 6), `hook.category` (nhãn ngắn) | AI | `hook.spoken` |
| Story | `story.category`, `story.description`, `story.blocks` (mỗi khối: từ giây, tới giây, loại, tóm tắt) | AI chọn mốc theo số thứ tự đoạn lời thoại; **code** đổi ra giây | số thứ tự đoạn |
| Khán giả | số comment mỗi nhóm trong 5 nhóm của skill (đồng cảm, tranh cãi, hài hước, quan tâm nhân vật, nghi ngờ), kèm comment tiêu biểu | AI gắn nhóm cho từng comment; **code** đếm | id comment |
| Hợp kênh | `fit` (có, không, chưa rõ) theo câu lọc của Soulprint, kèm một dòng lý do | AI | không |
| Hình và tiếng | `visual.format`, `visual.keyVisuals`, `visual.audio` | trống (giai đoạn 8) hoặc chủ app gõ | |

Sáu archetype: Fortune Teller, Experimenter, Teacher, Magician, Investigator, Contrarian. Loại khối: hook, lock-in, body, rehook, cta, khác. Tên 40 concept là một danh sách cố định trong code; phần giải thích từng concept nằm trong file kiến thức.

Quy tắc kiểm đầu ra, như ở 5W1H: giá trị ngoài danh sách bị bỏ; số thứ tự đoạn lời thoại và id comment không tồn tại bị bỏ; trường bắt buộc có căn cứ mà mất hết căn cứ thì để trống và đánh dấu "AI không dẫn được căn cứ".

Video không có lời thoại vẫn được bóc từ tiêu đề, mô tả và comment, với nhãn "không có lời thoại"; các trường Hook nguyên văn và Story để trống.

## 4. Đầu vào và job

### 4.1 Lấy video từ đâu

- **Từ Theo dõi:** nút "Bóc gạch video vượt kênh". App lấy các video có điểm vượt kênh từ ngưỡng trở lên trong lần quét gần nhất của các kênh được chọn, bỏ video đã có trong thư viện. Tuỳ chọn "kèm video dưới trung vị để đối chiếu" thêm tối đa 5 video điểm thấp nhất mỗi kênh.
- **Từ Phân tích video:** nút "Bóc gạch" trên một báo cáo, dùng luôn lời thoại và comment đã lưu, không tải lại.
- **Dán link:** ô dán link ngay trên màn Thư viện.

Ngưỡng là ô "Vượt kênh từ mấy lần thì đưa vào thư viện" trong Cài đặt, mặc định bằng ngưỡng video nổi bật hiện có (3). Kallaway gợi ý bắt đầu từ 5.

### 4.2 Job `brick_extract`

Với mỗi video (tối đa 50 mỗi lần, 3 video song song):
1. Lấy lời thoại: dùng bản đã lưu nếu có, không thì tải (TikTok 1 đến 2 giây; YouTube theo giai đoạn 3).
2. Lấy tối đa 30 comment được chú ý nhất **đã có** trong app. Không tự thu comment mới; có tuỳ chọn "thu thêm 100 comment mỗi video".
3. Một lần gọi model tổng hợp, kèm đoạn Soulprint (pillars, câu lọc) và file kiến thức concept.
4. Kiểm đầu ra, lưu vào bảng.

Một video lỗi (không tải được, model lỗi hai lần) được ghi lý do và không làm hỏng lô. Huỷ job giữ lại các video đã xong. Báo cáo của job ghi số video, số token, số tiền.

Ước tính: mỗi video khoảng 5.000 token vào (phần kiến thức được cache), 1.000 token ra; 50 video là vài cent với model Flash. Đây là ước tính, sẽ đo ở lần chạy thật đầu tiên.

## 5. Màn Thư viện gạch

### 5.1 Bảng

Cột: video (ảnh, tiêu đề, link), kênh, nền tảng, vượt kênh (số lần), topic, pillar, concept, archetype, hook nguyên văn, hợp kênh. Lọc theo từng cột phân loại, tìm theo chữ, sắp theo điểm vượt kênh hoặc ngày. Chọn nhiều dòng để xuất Markdown hoặc bóc lại.

### 5.2 Chi tiết một video

Theo ảnh mẫu: thanh tab, một khung, nhãn chữ hoa nhỏ.

| Tab | Nội dung |
|---|---|
| Transcript | Lời thoại có mốc thời gian; các khối Story tô nền nhạt theo loại |
| Idea Analysis | TOPIC, IDEA SEED, UNIQUE ANGLE, COMMON BELIEF, CONTRARIAN REALITY, CORE FACTS, CONCEPT (chip) |
| Hook | CATEGORY (chip), ARCHETYPE (chip), FORMULA (in nghiêng), SPOKEN HOOK (in nghiêng) |
| Storytelling Format | CATEGORY (chip), DESCRIPTION, các khối theo thời gian |
| Visual Layout | Trống kèm ghi chú "chờ thử nghiệm cho model xem video", và ba ô tự gõ |
| Khán giả | Năm nhóm comment với số đếm; bấm ra comment |
| Đào sâu | Kết quả 8 bước, hoặc nút chạy |

Mỗi trường do AI viết có nút "căn cứ" mở đúng đoạn lời thoại. Chủ app sửa được mọi trường; trường đã sửa tay mang dấu và không bị ghi đè khi bóc lại.

### 5.3 Đối chiếu thắng và thua

Chọn một kênh có ít nhất 3 video thắng và 3 video thua trong thư viện. Với mỗi giá trị của concept, archetype, loại story và loại hook, code đếm: có ở mấy video thắng, mấy video thua.

Một giá trị được đánh dấu **"có thể là cốt lõi"** khi nó có ở ít nhất 60% video thắng, nhiều nhất 20% video thua, và ít nhất 3 video thắng. Bảng luôn hiện số đếm thô, và ghi rõ đây là đối chiếu trên vài video, không phải chứng minh.

## 6. Đào sâu một video (8 bước)

Job `video_deep_dive`, một lần gọi model tổng hợp, kèm file kiến thức `analyst.md` (cắt từ skill `viral-content-analyst` của chủ app) và gạch đã bóc. Kết quả lưu cùng dòng của video, gồm các phần: điểm ấn tượng, hình thức, nội dung theo mốc 3 giây, 10 giây, 30 giây và kết, comment, nhận định (4 câu hỏi), giả thiết "bỏ đi thì sao", đúc kết cốt lõi và bổ trợ, công thức triển khai, tự phản biện.

- Phần hình thức chỉ viết điều biết được từ lời thoại, chú thích và số liệu; còn lại ghi "chưa có dữ liệu", đúng luật của skill.
- Bước chứng minh cấp 2 dùng bảng đối chiếu ở §5.3 nếu kênh đó đủ video.
- Phần đúc kết và công thức được **code** soát theo danh sách từ cấm của skill. Có vi phạm thì gọi model viết lại đúng các câu đó một lần; vẫn còn thì hiện kèm đánh dấu.
- Xuất Markdown.

## 7. Thành phần

- `src/store/sqlite/migrations/007_bricks.sql`: bảng `bricks (workspace_id, platform, video_id, channel_ref, meta JSON, data JSON, edited JSON, deep_dive JSON, model, analyzed_at, schema_version)`, khoá chính `(workspace_id, platform, video_id)`.
- `src/store/sqlite/repos/bricks.js`.
- `src/core/bricks/`: `schema.js` (danh sách concept, archetype, loại khối; làm sạch), `extract.js` (dựng request, kiểm đầu ra, đổi mốc), `compare.js` (đếm và luật 60/20/3), `deep-dive.js` (request, kiểm, soát từ cấm).
- `src/core/report/bricks.js`: Markdown.
- `src/features/bricks.js`: `extract` (job), `list`, `get`, `update`, `compare(channel)`, `deepDive` (job).
- Route dưới `/api/v1/bricks`.
- Web: `web/views/bricks.js`, component chi tiết dùng lại các lớp `fw-*`; nút ở `follows.js` và ở component `video-analysis`.
- Cài đặt: `bricksMinScore`.
- File kiến thức: `analyst.md`.

## 8. Lỗi và trường hợp biên

| Tình huống | App làm gì |
|---|---|
| Soulprint chưa có pillars | Vẫn bóc; `pillar` và `fit` trống, màn nhắc điền Soulprint |
| Chưa có API key | Nút bóc gạch báo và dẫn tới Cài đặt; thư viện đã có vẫn xem được |
| Video đã có trong thư viện | Bỏ qua, trừ khi chọn "bóc lại"; trường sửa tay được giữ |
| Lời thoại rất dài (video YouTube dài) | Chỉ gửi 20 phút đầu, ghi rõ; Story chỉ tính trên phần đã gửi |
| Model trả mốc ngoài lời thoại | Bỏ khối đó |
| Kênh chưa đủ video để đối chiếu | Bảng nói còn thiếu mấy video thắng hoặc thua |

## 9. Test

- Core: làm sạch gạch (giá trị ngoài danh sách, căn cứ sai), đổi số thứ tự đoạn ra giây, hook nguyên văn do code cắt, luật 60/20/3 ở các mức biên, soát từ cấm.
- Feature với LLM giả và nguồn giả: bóc một lô, một video lỗi, huỷ giữa chừng, bóc lại giữ trường sửa tay, video không lời thoại.
- HTTP: các route, xuất Markdown.
- Store: migration 007.
- Web: tên các tab đúng như ảnh mẫu, nút ở Theo dõi.
- Kiểm trong trình duyệt bằng model giả.

## 10. Thứ tự làm

1. Bảng, core `schema` và `extract`, job từ một báo cáo Phân tích video.
2. Màn Thư viện: bảng, lọc, chi tiết.
3. Bóc từ Theo dõi, tuỳ chọn video đối chiếu, bảng thắng và thua.
4. Đào sâu 8 bước.
