# L4 — Job nền & cào dữ liệu YouTube

Áp dụng cho mọi tác vụ cào: `video_search`, `channel_search`, `channel_analysis`, `research`, `research_comments`, `comments`, `idea_check`, `keyword_score`, `keywords`, `track_scan`.
Lý do cần L4: xử lý nền, dịch vụ ngoài có lỗi (YouTube 429/5xx/đổi định dạng), chống chạy trùng, máy trạng thái job.

Thành phần: `jobs/runner.js`, bảng `jobs`, `sources/innertube/client.js` (giới hạn đồng thời + backoff), `features/*`, bảng `records`.

---

## Flow 1 — Happy Path

```mermaid
flowchart TD
    %% Flow 1 — Happy Path
    UI["web: POST /api/v1/jobs\n{kind, params}"] --> Val{"validate(schema of kind)"}
    Val -->|ok| Key["idempotency_key =\nhash(workspace, kind, params chuẩn hoá)"]
    Key --> Ins[("jobs INSERT\nstatus = queued")]
    Ins --> Resp["202 {id}"]
    Ins --> Pick["runner: lấy job queued\n(tối đa 2 job chạy cùng lúc)"]
    Pick --> Run["status = running\nstarted_at = now"]
    Run --> Feat["features/<kind>(params, ctx)\nctx = {progress, signal, budget}"]
    Feat --> Src["source.* qua client\n(semaphore 4, nghỉ ~200ms)"]
    Src --> YT["YouTube youtubei/v1"]
    YT -->|200| Parse["adapter chuẩn hoá → Video/Channel/Comment"]
    Parse --> Cache[("cache: channels, channel_videos, video_details")]
    Parse --> Core["core: metrics, analysis"]
    Core --> Rec[("records INSERT\nschema_version = latest")]
    Rec --> Ok["jobs: status = succeeded\nrecord_id, finished_at"]
    UI2["web: GET /api/v1/jobs/:id mỗi 0,7s"] --> Ok
    Ok --> Load["web: GET /api/v1/records/:id"]
```

---

## Flow 2 — Error & Retry

```mermaid
flowchart TD
    %% Flow 2 — Error & Retry
    Req["client.call(endpoint)"] --> Resp{"Kết quả"}
    Resp -->|200| Parse{"Parse được?"}
    Parse -->|Có| Done["trả dữ liệu"]
    Parse -->|"Không (thiếu trường bắt buộc)"| Changed["SourceChangedError\nghi request_log + probe cờ đỏ"]
    Changed --> FailJob["job: status = failed\nerror.code = source_changed"]

    Resp -->|"429 / 5xx / timeout 20s / lỗi mạng"| Retry{"attempt < 4?"}
    Retry -->|Có| Back["chờ delay×(0,5–1,5) + attempt²×1,5s"]
    Back --> Req
    Retry -->|Không| Fail["RequestFailedError"]
    Fail --> Optional{"Bước này bắt buộc?"}
    Optional -->|"Không (About panel, likes, CC count, 1 khu vực trong toàn cầu)"| Skip["bỏ qua bước, ghi warning vào record"]
    Optional -->|Có| FailJob2["job: status = failed\nerror.code = rate_limited | network"]

    Resp -->|"4xx khác"| Fatal["Lỗi không thử lại\n(vd 400 tham số sai)"] --> FailJob3["job: failed, error.code = internal"]

    Budget{"ctx.budget.requests vượt trần?"} -->|Có| Stop["dừng giữa chừng\nlưu kết quả một phần + warning"]
    Stop --> Partial["job: succeeded (partial = true)"]

    FailJob --> UIerr["web: thông báo + nút Chạy lại"]
    FailJob2 --> UIerr
```

Quy ước:
- Lỗi đếm vào `request_log`; màn trạng thái hiện tỉ lệ lỗi 1 giờ gần nhất.
- 3 job liên tiếp `rate_limited` → runner tạm dừng nhận job mới 5 phút và hiện banner "YouTube đang giới hạn".
- `source_changed` không thử lại (thử lại vô ích); probe hằng ngày phát hiện sớm.

---

## Flow 3 — Idempotency & Concurrency

```mermaid
flowchart TD
    %% Flow 3 — Idempotency & Concurrency
    A["Tab A: Tìm 'kể chuyện' (1 năm, VN)"] --> KA["key = h(local, video_search, params)"]
    B["Tab B / bấm 2 lần: cùng tham số"] --> KB["key giống hệt"]
    KA --> U[("jobs: UNIQUE(idempotency_key)\nWHERE status IN (queued, running)")]
    KB --> U
    U -->|"ghi trước thắng"| New["job mới → chạy"]
    U -->|"trùng"| Same["trả id job đang chạy\n(không tạo job thứ 2)"]

    Same --> Shared["Cả hai tab theo dõi cùng job"]

    C["Hai job khác nhau cùng cần kênh X"] --> CacheRead[("channels X\nfetched_at còn hạn?")]
    CacheRead -->|còn| UseCache["dùng cache, 0 request"]
    CacheRead -->|hết| InFlight{"Map in-flight có X?"}
    InFlight -->|Có| Await["chờ promise đang chạy\n(gộp request)"]
    InFlight -->|Không| Fetch["gọi YouTube, lưu cache\nINSERT OR REPLACE"]

    D["Ghi cache song song"] --> Upsert[("INSERT OR REPLACE theo id YouTube\nlast-write-wins — dữ liệu công khai, chấp nhận")]
```

Ghi chú:
- Chuẩn hoá params trước khi băm: sắp xếp khoá, trim, lowercase từ khoá, bỏ trường mặc định.
- Job đã `succeeded` không chặn chạy lại (người dùng muốn số mới) — chỉ chặn trùng khi đang chạy.
- Bộ gộp request in-flight nằm trong adapter (`sources/innertube`), không ở feature.

---

## Flow 4 — Edge Cases

```mermaid
flowchart TD
    %% Flow 4 — Edge Cases

    %% Huỷ
    Cancel["Người dùng bấm Huỷ"] --> Flag[("jobs.cancel_requested = 1")]
    Flag --> Check["feature kiểm tra ctx.signal giữa các bước\n(sau mỗi trang kết quả / mỗi kênh)"]
    Check --> Cancelled["status = cancelled\nkhông lưu record"]

    %% Tắt app giữa chừng
    Quit["App tắt khi job đang running"] --> Boot["Lần mở sau: runner khởi động"]
    Boot --> Mark["running → interrupted"]
    Mark --> Offer["web: 'Bị gián đoạn' + nút Chạy lại (cùng params)"]

    %% Kết quả rỗng
    Empty["YouTube trả 0 video"] --> Save["vẫn lưu record (videos = [])\nwarning: 'không có kết quả'"]
    Save --> Hint["web: gợi ý đổi từ khoá / khu vực"]

    %% Video bị xoá / riêng tư khi enrich
    Gone["player/next báo UNPLAYABLE / không tồn tại"] --> Keep["giữ số liệu từ trang tìm kiếm\nbỏ ngày chính xác"]

    %% Comment bị tắt
    Off["Video tắt comment"] --> Disabled["comments = [], disabled = true\nkhông tính là lỗi"]

    %% Đổi cài đặt khi job chạy
    Settings["Đổi concurrency / khu vực khi job đang chạy"] --> Snapshot["job dùng snapshot config lúc bắt đầu\n(config mới áp cho job sau)"]

    %% Record cũ
    Old["Mở record schema_version cũ"] --> Up["store/upgrades chạy bước v→latest trong RAM"]
    Up --> View["web nhận dữ liệu bản mới nhất"]
```
