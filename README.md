# Fake News Detector

Ứng dụng thử nghiệm giúp phân tích nội dung tin tức, tách các tuyên bố có thể kiểm chứng, tìm nguồn tham khảo và trình bày mức độ bằng chứng. Kết quả do AI tạo ra, có thể sai; ứng dụng không đưa ra nhãn đúng/sai tuyệt đối.

## Công nghệ

- Web: React, TypeScript, Vite, Tailwind CSS.
- API: Node.js, Express, MySQL; Redis/BullMQ là tùy chọn.
- LLM: Gemini, Groq hoặc Ollama, cấu hình qua API.
- Nguồn bằng chứng: Google Fact Check, Tavily; Wikipedia tiếng Việt là phương án dự phòng không cần API key.
- FastAPI phục vụ classifier TF-IDF tùy chọn. Tín hiệu classifier được hiển thị riêng, không thay kết luận dựa trên bằng chứng.

## Yêu cầu

- Node.js 20 trở lên.
- pnpm 10 trở lên.
- MySQL 8 trở lên, cài sẵn hoặc chạy bằng Docker Desktop.
- Redis chỉ cần khi bật BullMQ (`USE_BULLMQ=true`).
- Git để lấy mã nguồn. Python 3.11/3.12 chỉ cần khi huấn luyện/chạy AI service; web/API có thể chạy độc lập.

## Khởi động lần đầu

Mở terminal tại thư mục gốc của repository.

### 1. Cài dependency

```powershell
pnpm install
```

### 2. Tạo file cấu hình

Không ghi đè `.env` nếu file đã tồn tại.

PowerShell:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

macOS/Linux:

```bash
test -f .env || cp .env.example .env
```

Mở `.env` và cấu hình:

- `DATABASE_URL`: địa chỉ, tài khoản và database MySQL. Compose bên dưới tạo mặc định database `fakenews`, user `mysql`, password `mysql` trên cổng `3306`.
- `LLM_PROVIDER`: `gemini`, `groq` hoặc `ollama`.
- Với Gemini, điền `GEMINI_API_KEY`; với Groq, chọn `LLM_PROVIDER=groq` và điền `GROQ_API_KEY`. Không commit hoặc chia sẻ file `.env`.
- Với Ollama, chọn `LLM_PROVIDER=ollama`, chạy Ollama cục bộ và bảo đảm model trong `OLLAMA_MODEL` đã được cài.
- Các khóa `GOOGLE_FACTCHECK_API_KEY` và `TAVILY_API_KEY` là tùy chọn. Nếu không cấu hình, API thử tìm bằng Wikipedia tiếng Việt.

Nếu đã có MySQL cục bộ với tài khoản khác, sửa `DATABASE_URL` cho phù hợp. Không thay đổi mật khẩu hoặc dữ liệu của một MySQL hiện có chỉ để khớp giá trị mẫu.

### 3. Khởi động MySQL và Redis (Docker)

Cài và mở Docker Desktop trước, sau đó chạy:

```powershell
docker compose up -d mysql redis
```

Compose khởi tạo schema từ `apps/api/db/init.sql` khi tạo volume MySQL lần đầu. Nếu dùng MySQL đã cài sẵn thì không cần chạy container MySQL. Redis có thể để tắt khi `USE_BULLMQ=false`.

### 4. Chạy API và web

Mở hai terminal riêng ở thư mục gốc repository.

Terminal 1:

```powershell
pnpm dev:api
```

Terminal 2:

```powershell
pnpm dev:web
```

Mở giao diện tại <http://localhost:5173/>. Vite chuyển các request `/api` sang API tại `http://localhost:3000`.

## Sử dụng

1. Chọn **Văn bản** để dán nội dung hoặc **Đường dẫn** để nhập URL bài viết công khai.
2. Nhấn **Phân tích** và theo dõi tiến độ.
3. Xem điểm tổng quan, từng tuyên bố, lý giải và nguồn được trích dẫn. URL citation chỉ được chấp nhận nếu đã có trong kết quả truy xuất.
4. Mở **Lịch sử** để xem các phân tích của phiên trình duyệt hiện tại.

Phân tích thực tế cần MySQL kết nối được và một LLM provider khả dụng. URL bài viết phải truy cập công khai; địa chỉ nội bộ và nội dung tải vượt giới hạn sẽ bị từ chối.

## Kiểm tra

Kiểm tra API và dịch vụ lưu trữ:

```powershell
curl.exe -i http://localhost:3000/health
```

Khi MySQL kết nối thành công, API trả HTTP `200` và `database: "ok"`. Nếu trả HTTP `503`, kiểm tra `DATABASE_URL` và trạng thái MySQL.

Build toàn workspace và chạy test API:

```powershell
pnpm build
pnpm --filter @fake-news/api test
```

## Cấu hình tùy chọn

- `USE_BULLMQ=false`: chạy job trong tiến trình API, không cần Redis.
- Đổi thành `USE_BULLMQ=true` để dùng BullMQ; khi đó Redis trong `REDIS_URL` phải sẵn sàng.
- `RATE_LIMIT_PER_MIN`: số request tối đa mỗi phút cho các endpoint `/api`; mặc định là `10`.
- `GEMINI_MODEL`, `GROQ_MODEL`, `OLLAMA_MODEL`: tên model được gửi tới provider tương ứng.
- `PORT`: cổng API, mặc định `3000`.

## Huấn luyện classifier (tùy chọn)

Thư mục `apps/ai-service/vfnd_dataset_1000` do người dùng cung cấp; README gọi đây là VFND-Mini nhưng nguồn và quy trình gán nhãn chưa được xác minh độc lập. Nếu dùng bộ VFND chính thức từ tác giả, cần tuân theo yêu cầu liên hệ/ghi nguồn. Không dùng văn bản do LLM sinh làm nhãn chuẩn.

Kiểm tra split cho thấy 1.000 dòng chỉ có 80 nội dung duy nhất sau chuẩn hóa; 620 dòng trùng trong train, và mọi nội dung val/test đều đã xuất hiện trong train. Train unique có 60 nhãn thật/20 giả. Vì vậy không dùng val/test này làm external benchmark và không diễn giải 100% holdout/CV như độ chính xác trên tin mới. Raw data và zip đã được git-ignore.

CSV cần có cột `text`, `label` (`0=real`, `1=fake`) và có thể có `title` (được ghép với nội dung); cột domain nếu có sẽ bị bỏ qua. Tạo môi trường Python và cài dependencies:

Tiến độ và điều kiện chấp nhận được theo dõi trong [ml/WBS.md](ml/WBS.md).

```powershell
cd apps/ai-service
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt -r ..\..\ml\requirements.txt
```

Từ `apps/ai-service`, chạy huấn luyện và đánh giá:

```powershell
python -m app.train --input vfnd_dataset_1000\train.csv --output-dir ..\..\ml\artifacts
```

Đầu ra gồm cleaned CSV, EDA chart/JSON, bảng so sánh 4 mô hình, holdout metrics và `classifier.joblib` trong `ml/artifacts/` (đã gitignore). Chỉ thêm `--external` với tập độc lập, có quyền dùng và không trùng train; split val/test hiện có không đáp ứng điều kiện này. Mốc 85% là mục tiêu, không phải bảo đảm.

Chạy AI service từ `apps/ai-service`:

```powershell
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

`GET /health` vẫn hoạt động khi chưa có model; `POST /predict` trả `503` cho đến khi có artifact. API chính sẽ bỏ qua classifier nếu service/model chưa sẵn sàng và vẫn tiếp tục phân tích Groq.

## Endpoint chính

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| `GET` | `/health` | Trạng thái API và MySQL |
| `POST` | `/api/analyses` | Tạo phân tích từ văn bản hoặc URL |
| `GET` | `/api/analyses/:id` | Lấy kết quả |
| `GET` | `/api/analyses/:id/stream` | Theo dõi tiến độ qua SSE |
| `GET` | `/api/analyses` | Lịch sử theo browser session |
| `POST` | `/api/analyses/:id/feedback` | Gửi đánh giá kết quả |

AI service (chỉ có tín hiệu classifier khi đã train và nạp model):

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| `GET` | `/health` | Trạng thái FastAPI và classifier |
| `GET` | `/model/status` | Phiên bản model đang nạp |
| `POST` | `/predict` | Nhãn, xác suất và feature giải thích nếu model hỗ trợ |

Khi classifier chưa sẵn sàng, FastAPI vẫn health-check được và `/predict` trả `503`; API chính bỏ qua tín hiệu này, không đổi điểm credibility, và tiếp tục luồng phân tích Groq.

## Xử lý lỗi thường gặp

- **API health trả `503`:** API vẫn có thể đang chạy nhưng chưa kết nối được MySQL. Xác nhận service đang nghe cổng trong `DATABASE_URL`, database tồn tại và thông tin đăng nhập đúng.
- **`docker compose` không kết nối được:** mở Docker Desktop và chờ Docker Engine sẵn sàng; hoặc dùng MySQL cục bộ rồi cập nhật `DATABASE_URL`.
- **Thiếu khóa Gemini/Groq:** chọn provider tương ứng trong `LLM_PROVIDER` và điền khóa trong `.env`. Không gửi khóa vào terminal log, chat hoặc Git.
- **Không tải được URL:** chỉ URL HTTP(S) công khai được hỗ trợ; website có thể chặn bot hoặc không trả nội dung HTML/văn bản.
- **Port đã được sử dụng:** đổi `PORT` cho API; nếu đổi port web thì cập nhật proxy trong `apps/web/vite.config.ts`.

## Ghi chú về các phần đang phát triển

`apps/ai-service` hiện là FastAPI health stub; luồng phân tích đang gọi provider trực tiếp từ API Node.js. Classifier TF-IDF, embedding/vector search và triển khai production chưa được tích hợp. Tiến trình phát triển theo phiên được ghi trong [log.md](log.md); quy tắc tiếp tục ghi log nằm trong [spec.md](spec.md).