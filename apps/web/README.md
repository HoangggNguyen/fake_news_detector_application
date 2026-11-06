# apps/web: Giao diện (FE)

Người phụ trách: Phan Tuyết Trinh (K24DTCN541). Công nghệ: React 19, TypeScript, Vite, TanStack Query.

## Chạy thử

Yêu cầu: Node ≥ 20 và pnpm. Chạy các lệnh từ **thư mục gốc repo**:

```bash
pnpm install
pnpm dev:web:mock   # dữ liệu giả lập, không cần backend  -> http://localhost:5173
pnpm dev:web        # gọi backend thật qua /api (proxy sang http://localhost:3000)
pnpm --filter @fake-news/web build   # kiểm tra kiểu + build production
```

Khi đang chạy dữ liệu giả lập, góc trên bên phải hiện nhãn **DỮ LIỆU GIẢ LẬP** để không bị nhầm khi demo.

## Cấu hình (`apps/web/.env.local`, xem `.env.example`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_API_MODE` | `classifier` | `classifier`: theo Kế hoạch (nhãn + xác suất). `pipeline`: theo spec.md (điểm tin cậy + tuyên bố + bằng chứng, có nhập URL) |
| `VITE_USE_MOCK` | `false` | `true` thì dùng dữ liệu giả lập |
| `VITE_API_BASE` | `/api` | Tiền tố API |
| `VITE_REQUEST_TIMEOUT_MS` | 30000 / 120000 | Thời gian chờ tối đa |
| `VITE_MIN_CHARS` | `50` | Độ dài tối thiểu, nên khớp ngưỡng loại văn bản ngắn ở bước tiền xử lý |

## Hợp đồng API (phần backend cần làm)

### Chế độ `classifier` (mặc định, theo Kế hoạch dự án)

`POST /api/predict`, mỗi lần gửi đúng một văn bản:

```jsonc
// request
{ "text": "Tiêu đề và nội dung bài viết..." }
// response 200
{ "label": 1, "prob_fake": 0.87, "model": "LinearSVC" }
```

- `prob_fake` (bắt buộc): số trong khoảng [0, 1].
- `label` (không bắt buộc): `1`/`"fake"` hoặc `0`/`"real"`, giống quy ước của VFND. Nếu thiếu, FE dùng ngưỡng 0.5.
- `model` (không bắt buộc): tên mô hình, hiển thị ở phần kết quả.

Hiện API Node mới có `/health`. Để FE chạy thật, cần thêm route `POST /api/predict` ở `apps/api`, chuyển tiếp sang `POST {AI_SERVICE_URL}/predict` của ai-service (FastAPI nạp `model.joblib`). Hoặc nếu nhóm dùng Flask một tầng như Kế hoạch, chỉ cần Flask có `POST /api/predict` chạy ở cổng 3000.

### Chế độ `pipeline` (theo spec.md)

`POST /api/analyses` với body `AnalysisInput` → trả về `AnalysisResult` (`packages/shared`). Nếu `status` là `pending` hoặc `processing`, FE tự hỏi lại `GET /api/analyses/:id` mỗi 1,5 giây cho tới khi `completed` hoặc `failed`.

### Mã lỗi FE xử lý

| HTTP | FE hiển thị |
|---|---|
| 400 / 413 / 422 | Thông điệp trong `detail`, `message` hoặc `error` của body (nên viết tiếng Việt) |
| 429 | Gửi quá nhiều yêu cầu |
| 5xx | Lỗi máy chủ, có nút Thử lại |
| Không kết nối được / quá thời gian | Thông báo tương ứng, có nút Thử lại |
| 200 nhưng sai định dạng | "Máy chủ trả về kết quả không đúng định dạng" |

## Chức năng

- Nhập văn bản (và URL ở chế độ pipeline), chuẩn hoá NFC, kiểm tra trống/quá ngắn/quá dài, URL chỉ chấp nhận http(s).
- Ví dụ mẫu để demo nhanh, đếm ký tự, gửi bằng Ctrl + Enter.
- Trạng thái đang xử lý có đồng hồ đếm và nút Huỷ. Gửi yêu cầu mới thì yêu cầu cũ tự huỷ.
- Kết quả: nhãn, thanh xác suất có vạch ngưỡng 50%, độ chắc chắn, tên mô hình, thời gian xử lý, xem lại đầu vào, lưu ý "AI có thể sai". Ở chế độ pipeline có thêm điểm tin cậy, tuyên bố và bằng chứng; link chỉ mở được nếu là http(s).
- Lịch sử 10 lần kiểm tra gần nhất, lưu trong trình duyệt.
- Giao diện co giãn theo màn hình điện thoại, hỗ trợ bàn phím và trình đọc màn hình (aria-live, role="meter").

## Giả lập lỗi để kiểm thử (chỉ khi `VITE_USE_MOCK=true`)

Thêm một trong các mã sau vào cuối nội dung: `[mock:network]`, `[mock:timeout]`, `[mock:500]`, `[mock:429]`, `[mock:422]`, `[mock:bad]`.

## Cấu trúc

```
src/
  config.ts            đọc biến môi trường
  content.ts           chữ theo chế độ, ví dụ mẫu
  api/contract.ts      kiểu dữ liệu và hợp đồng API
  api/adapter.ts       kiểm tra và chuẩn hoá phản hồi -> ViewResult
  api/client.ts        fetch có timeout, huỷ, polling, phân loại lỗi
  api/errors.ts        ApiError và thông báo tiếng Việt
  api/mock.ts          backend giả lập
  hooks/useAnalysis.ts quản lý một lượt phân tích
  lib/                 validation, history (localStorage), format
  components/          AnalysisForm, StatusPanels, ResultPanel, HistoryList
```
