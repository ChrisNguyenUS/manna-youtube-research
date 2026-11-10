# L4 — License desktop (v1.2)

Lý do cần L4: dịch vụ ngoài có lỗi (Lemon Squeezy License API), máy trạng thái kích hoạt, giới hạn số máy (đồng thời), chạy offline.

Thành phần: `license/service.js`, `license/verify.js`, bảng `license`, middleware `requireLicense` (chỉ chặn tạo job cào mới), màn **Kích hoạt**, Lemon Squeezy `/v1/licenses/activate | validate | deactivate`.

Trạng thái: `unlicensed → active → (grace → expired) | revoked`.
- `grace`: không kiểm tra được online quá 7 ngày, còn dùng tới ngày 14.
- `expired`/`revoked`: vẫn mở và xuất báo cáo cũ; không tạo job cào mới.

Instance id = UUID tạo một lần lúc cài, lưu ở `license.instance_id`.

---

## Flow 1 — Happy Path

```mermaid
flowchart TD
    %% Flow 1 — Happy Path
    Open["Mở app"] --> Read[("license: status?")]
    Read -->|unlicensed| Screen["Màn Kích hoạt"]
    Screen --> Enter["Dán key"]
    Enter --> Act["POST licenses/activate\n{license_key, instance_name = instance_id}"]
    Act -->|activated| Save[("license: key (keychain),\ninstance_ref, status = active,\nexpires_at, last_check_at = now")]
    Save --> Home["Tổng quan"]
    Read -->|active, last_check < 7 ngày| Home
    Read -->|active, last_check ≥ 7 ngày| Val["POST licenses/validate (nền, không chặn)"]
    Val -->|valid| Touch["last_check_at = now"]
    Touch --> Home
```

---

## Flow 2 — Error & Retry

```mermaid
flowchart TD
    %% Flow 2 — Error & Retry
    Call["activate / validate"] --> R{"Phản hồi"}
    R -->|"mạng lỗi / 5xx / timeout 10s"| Off{"Đang kích hoạt lần đầu?"}
    Off -->|Có| Msg["Báo: 'Không kết nối được máy chủ license,\nthử lại' + nút Thử lại"]
    Off -->|"Không (kiểm tra định kỳ)"| Grace{"now − last_check_at"}
    Grace -->|"< 7 ngày"| KeepActive["giữ active, thử lại lần mở sau"]
    Grace -->|"7–14 ngày"| ToGrace["status = grace\nbanner 'cần kết nối mạng'"]
    Grace -->|"> 14 ngày"| ToExpired["status = expired (tạm)\nkết nối lại → validate → active"]

    R -->|"key sai"| Bad["Báo: key không đúng"]
    R -->|"activation_limit đạt (2 máy)"| Limit["Báo: đã dùng trên 2 máy\nlink trang quản lý để huỷ máy cũ"]
    R -->|"expired / disabled (hoàn tiền)"| Rev["status = expired | revoked\nchỉ còn xem báo cáo cũ"]
    R -->|"429"| Wait["chờ 30s × lần thử, tối đa 3 lần"]
```

---

## Flow 3 — Idempotency & Concurrency

```mermaid
flowchart TD
    %% Flow 3 — Idempotency & Concurrency
    Dbl["Bấm Kích hoạt 2 lần"] --> Lock["license/service: 1 promise kích hoạt đang chạy\n(lần 2 dùng lại promise)"]
    Lock --> OneCall["chỉ 1 request activate"]

    Reinstall["Cài lại app trên cùng máy"] --> SameId{"instance_id còn?\n(dataDir giữ lại)"}
    SameId -->|Có| Reuse["validate với instance cũ — không tốn lượt máy"]
    SameId -->|"Không (xoá dữ liệu)"| NewAct["activate mới — tốn 1 lượt\n(khách tự huỷ máy cũ qua trang quản lý)"]

    Multi["Nhiều cửa sổ / tiến trình"] --> Single["Electron requestSingleInstanceLock()\nchỉ 1 tiến trình app"]
```

---

## Flow 4 — Edge Cases

```mermaid
flowchart TD
    %% Flow 4 — Edge Cases

    %% Hết hạn khi đang chạy job
    Exp["License hết hạn trong lúc job chạy"] --> Finish["job đang chạy chạy nốt\nmiddleware chỉ chặn job mới"]

    %% Đổi đồng hồ máy
    Clock["Người dùng chỉnh lùi đồng hồ"] --> Mono["lưu last_seen_at; nếu now < last_seen_at − 1 ngày\n→ buộc validate online"]

    %% Huỷ kích hoạt khi chuyển máy
    Move["Cài đặt → Huỷ kích hoạt máy này"] --> Deact["POST licenses/deactivate\nxoá key khỏi keychain, status = unlicensed"]

    %% Bản dev / cá nhân
    Dev["edition = dev (chạy từ source)"] --> NoLic["bỏ qua license hoàn toàn (config)"]

    %% Nâng cấp app
    Upd["Tự cập nhật bản mới"] --> Keep["license giữ nguyên (cùng dataDir)\nmigration DB chạy, backup trước"]

    %% Hoàn tiền
    Refund["Hoàn tiền trên Lemon Squeezy"] --> NextVal["lần validate sau → disabled → revoked"]
```
