# L4 — Theo dõi kênh / từ khoá (v1.1)

Lý do cần L4: lập lịch nền, máy trạng thái lần quét, chống quét trùng và báo trùng, sửa/tạm dừng khi đang có lần quét.

Thành phần: `jobs/scheduler.js` (tick 5 phút khi app chạy), `jobs/runner.js`, `features/tracking.js`, `core/tracking/diff.js`, bảng `tracked_targets`, `video_snapshots`, `channel_snapshots`, `alerts`, `desktop/notify`.

Ngưỡng mặc định (Cài đặt): tần suất 6 giờ; viral = video ≤ 7 ngày tuổi có `outlierScore ≥ 5` hoặc VPH ≥ 5× VPH trung vị video mới của kênh; tối đa 100 mục theo dõi.

---

## Flow 1 — Happy Path

```mermaid
flowchart TD
    %% Flow 1 — Happy Path
    Tick["scheduler tick (mỗi 5 phút)"] --> Due[("tracked_targets\nactive = 1 AND next_run_at ≤ now")]
    Due --> Slot["slot = floor(now / interval)"]
    Slot --> Enq["jobs.enqueue(track_scan,\nkey = target_id + slot)"]
    Enq --> Run["features/tracking.scan(target)"]
    Run --> Fetch["source.getChannelVideos(id, max 30)\n(+ getChannel: sub, tổng view)"]
    Fetch --> Snap[("INSERT video_snapshots (video_id, captured_at, views, title, thumb_hash)\nINSERT channel_snapshots")]
    Snap --> Prev[("snapshot trước của từng video")]
    Prev --> Diff["core/tracking/diff:\n- video mới\n- VPH giữa 2 snapshot\n- đổi tiêu đề / thumb_hash"]
    Diff --> Viral{"Đạt ngưỡng viral\nhoặc có thay đổi?"}
    Viral -->|Có| Alert[("alerts INSERT\n(target, video, type)")]
    Alert --> Notify["Thông báo hệ điều hành\n+ badge mục Cảnh báo"]
    Viral -->|Không| NoOp["không tạo cảnh báo"]
    Notify --> Next["next_run_at = now + interval\nlast_scan_at, last_status = ok"]
    NoOp --> Next
```

---

## Flow 2 — Error & Retry

```mermaid
flowchart TD
    %% Flow 2 — Error & Retry
    Scan["track_scan chạy"] --> R{"Kết quả"}
    R -->|ok| Ok["last_status = ok\nfail_count = 0"]
    R -->|"rate_limited / network"| Inc["fail_count += 1"]
    Inc --> Lim{"fail_count < 3?"}
    Lim -->|Có| Backoff["next_run_at = now + 30 phút × fail_count"]
    Lim -->|Không| Pause["last_status = error\nnext_run_at = now + interval × 2\nhiện cảnh báo trên màn Theo dõi"]
    R -->|"kênh không tồn tại / bị xoá"| Gone["active = 0, last_status = gone\ncảnh báo 'kênh không còn'"]
    R -->|source_changed| Global["dừng mọi track_scan đến khi probe ok\n(tránh đốt request vô ích)"]

    Budget["Nhiều mục đến hạn cùng lúc"] --> Cap{"> 20 lần quét / tick?"}
    Cap -->|Có| Spread["chỉ enqueue 20, phần còn lại\nnext_run_at += vài phút (giãn tải)"]
```

---

## Flow 3 — Idempotency & Concurrency

```mermaid
flowchart TD
    %% Flow 3 — Idempotency & Concurrency
    T1["Tick 10:00"] --> K1["key = target42 + slot 1234"]
    T2["Tick 10:05 (lần trước chưa xong)"] --> K2["key = target42 + slot 1234"]
    Manual["Người dùng bấm 'Quét ngay'"] --> K3["key = target42 + manual + phút hiện tại"]
    K1 --> U[("jobs UNIQUE(idempotency_key)")]
    K2 --> U
    K3 --> U
    U -->|"lần đầu"| Go["chạy"]
    U -->|"trùng"| Skip["bỏ qua"]

    Snap["Hai lần quét cùng video gần nhau"] --> PK[("video_snapshots PK (video_id, captured_at)\ncaptured_at làm tròn phút")]
    PK -->|trùng| Ignore["INSERT OR IGNORE"]

    Al["Video đạt viral ở nhiều lần quét"] --> UA[("alerts UNIQUE(target_id, video_id, type)")]
    UA -->|đã có| NoDup["không báo lại"]

    Same["Cùng kênh được theo dõi\ntừ 2 nơi (kênh + từ khoá)"] --> Share["snapshot dùng chung theo video_id\n(dữ liệu công khai)"]
```

---

## Flow 4 — Edge Cases

```mermaid
flowchart TD
    %% Flow 4 — Edge Cases

    %% Đổi tần suất
    Edit["Người dùng đổi tần suất 6h → 1h"] --> Upd[("tracked_targets.interval_min = 60")]
    Upd --> Recalc["next_run_at = min(next_run_at, now + 60 phút)"]
    Recalc --> Running["Lần quét đang chạy: chạy nốt (MVP)"]

    %% Tạm dừng / bỏ theo dõi
    PauseU["Tạm dừng"] --> Inactive["active = 0 → scheduler bỏ qua"]
    Inactive --> Pending["job queued của mục này → cancelled\njob running → chạy nốt, không tạo cảnh báo"]
    Unfollow["Bỏ theo dõi"] --> Soft["xoá tracked_target\ngiữ snapshot (dùng cho biểu đồ, dọn sau 90 ngày)"]

    %% App tắt lâu
    Off["App tắt 3 ngày"] --> Wake["Mở lại: nhiều mục quá hạn"]
    Wake --> Once["mỗi mục chỉ quét 1 lần (slot hiện tại)\nkhông chạy bù từng slot bị lỡ"]
    Once --> Gap["biểu đồ VPH hiện khoảng trống (không nội suy)"]

    %% Kênh mới chưa đủ dữ liệu
    New["Kênh < 3 video đủ 7 ngày"] --> NoBase["không tính viral theo outlier\nchỉ dùng VPH so video mới"]

    %% Lần quét đầu tiên
    First["Lần quét đầu của mục mới"] --> Baseline["chỉ ghi snapshot, KHÔNG báo\n(mọi video đều 'mới')"]

    %% Đổi thumbnail nhưng URL giữ nguyên
    Thumb["thumbnail URL giữ nguyên, ảnh đổi"] --> Hash["so thumb_hash (hash ảnh mqdefault)\nchỉ tải ảnh cho video ≤ 30 ngày"]

    %% Giới hạn
    Max["Thêm mục thứ 101"] --> Deny["từ chối, gợi ý bỏ bớt\n(giữ ≤ ~400 request/ngày)"]
```
