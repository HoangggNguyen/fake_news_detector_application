# Fake News Detector

Ứng dụng thử nghiệm phân loại tin theo nhãn của hai bộ dữ liệu giả lập được cung cấp. Các nhãn và nguồn trong dữ liệu chỉ được coi là chuẩn trong môi trường test, không phải kết quả kiểm chứng sự kiện ngoài đời.

**Cảnh báo bảo mật:** Theo yêu cầu, bảng `users` lưu thêm mật khẩu nguyên văn trong `real_pass`, bên cạnh mật khẩu băm dùng để đăng nhập. Bất kỳ ai đọc được database hoặc bản sao lưu đều có thể xem mật khẩu. Chỉ sử dụng mật khẩu thử nghiệm riêng; không dùng mật khẩu thật và không triển khai công khai cấu hình này.

## Công nghệ

- Web: React, TypeScript, Vite, Tailwind CSS.
- API: Node.js, Express, MySQL; Redis/BullMQ là tùy chọn.
- FastAPI đối chiếu dữ liệu train cục bộ và phục vụ classifier TF-IDF. Không gọi LLM hay tìm nguồn trên web để phân loại văn bản.

## Yêu cầu

- Node.js 20 trở lên.
- pnpm 10 trở lên.
- MySQL 8 trở lên, cài sẵn hoặc chạy bằng Docker Desktop.
- Redis chỉ cần khi bật BullMQ (`USE_BULLMQ=true`).
- Git để lấy mã nguồn. Python 3.11/3.12 và AI service cần thiết để phân loại.

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
- Không cần cấu hình khóa LLM hoặc tìm kiếm để phân loại theo dữ liệu giả lập. Không commit hoặc chia sẻ file `.env`.

Nếu đã có MySQL cục bộ với tài khoản khác, sửa `DATABASE_URL` cho phù hợp. Không thay đổi mật khẩu hoặc dữ liệu của một MySQL hiện có chỉ để khớp giá trị mẫu.

### 3. Khởi động MySQL và Redis (Docker)

Cài và mở Docker Desktop trước, sau đó chạy:

```powershell
docker compose up -d mysql redis
```

Compose khởi tạo schema từ `apps/api/db/init.sql` khi tạo volume MySQL lần đầu. Nếu dùng MySQL đã cài sẵn thì không cần chạy container MySQL. Redis có thể để tắt khi `USE_BULLMQ=false`.

Nếu đang dùng database đã được khởi tạo trước thay đổi này, chạy một lần các câu lệnh trong `apps/api/db/migrations/20261107_claim_corrections_and_evidence_sources.sql` bằng MySQL client trước khi khởi động API mới. Không chạy lại migration này trên cùng database.

Với database đã có schema trước tính năng tài khoản, chạy thêm một lần `apps/api/db/migrations/20261107_accounts_conversations.sql` sau migration trên. Migration bổ sung bảng tài khoản, phiên đăng nhập, hội thoại và các cột liên quan; không xóa lịch sử cũ. Database mới dùng `init.sql` đã có schema này và không cần chạy các migration đó.

Với database đã có, chạy `apps/api/db/migrations/003_dataset_results.sql` để bổ sung bảng lưu kết quả và gợi ý dữ liệu giả lập.

### 4. Chạy API và web

Mở ba terminal riêng ở thư mục gốc repository.

Terminal 1:

```powershell
pnpm dev:api
```

Terminal 2:

```powershell
pnpm dev:web
```

Terminal 3 (chạy AI classifier):

```powershell
Set-Location apps/ai-service
.\.venv\Scripts\Activate.ps1
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Giữ cả ba terminal đang chạy. AI service nạp model từ `ml/artifacts/classifier.joblib`; kiểm tra tại <http://localhost:8000/model/status>. Có thể dùng cấu hình **Debug Backend + AI** trong VS Code thay cho việc chạy API và AI service riêng.

Mở giao diện tại <http://localhost:5173/>. Vite chuyển các request `/api` sang API tại `http://localhost:3000`.

### Chạy model classifier cùng backend

API gọi AI service tại `AI_SERVICE_URL` (mặc định `http://localhost:8000`). Service nạp hai file train khi khởi động, và nạp model từ `ml/artifacts/classifier.joblib` nếu có. Cần khởi động lại AI service sau khi sửa dữ liệu train. Nếu dataset hoặc service không sẵn sàng, phân tích thất bại thay vì âm thầm đổi sang tìm kiếm trên mạng.

## Sử dụng

1. Tạo tài khoản hoặc đăng nhập. Tài khoản dùng tên đăng nhập và mật khẩu; nút **Đăng xuất** thu hồi phiên đăng nhập hiện tại.
2. Tạo cuộc trò chuyện, chọn **Văn bản** hoặc **Đường dẫn**, rồi gửi nội dung. Các lần gửi tiếp theo thuộc cùng cuộc trò chuyện cho đến khi chọn **Cuộc trò chuyện mới**.
3. Nếu nội dung hoặc tiêu đề khớp mẫu train sau chuẩn hóa, xem nhãn và nguồn ghi trong mẫu giả lập. Nếu không khớp, classifier chỉ đưa dự đoán khi đủ độ dài và điểm tối thiểu 0,9; ngưỡng này là heuristic chưa hiệu chuẩn, không đảm bảo độ chính xác. Nếu chưa xác định, có thể xem tối đa ba mẫu gần giống; đây là gợi ý chứ không phải đính chính được xác minh. Mẫu trùng nhưng có nhãn trái nhau không được tự kết luận.
4. Chọn một cuộc trò chuyện ở sidebar hoặc **Xem tất cả** để xem lại các lượt gửi và kết quả. Sau khi đăng nhập, nút **Chuyển lịch sử cũ của trình duyệt này** chủ động gắn các phân tích cũ vào tài khoản; mỗi phân tích cũ thành một cuộc trò chuyện riêng.

Phân tích cần MySQL và AI service hoạt động. Chế độ URL vẫn tải nội dung URL do người dùng cung cấp; để không truy cập Internet, sử dụng chế độ văn bản. Địa chỉ nội bộ và nội dung tải vượt giới hạn sẽ bị từ chối.

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

Hai thư mục `apps/ai-service/vfnd_dataset_1000` và `apps/ai-service/vfnd_dataset_deduplicated` được người dùng mô tả là dữ liệu giả lập, với nhãn được chấp nhận làm chuẩn cho môi trường test. Chúng không chứng minh tính đúng sai của sự kiện thực tế. Các thư mục dữ liệu bị git-ignore; không đưa dữ liệu vào commit khi chưa xác nhận quyền sử dụng.

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
python -m app.train `
  --input vfnd_dataset_1000\train.csv `
  --additional-train vfnd_dataset_deduplicated\train.csv `
  --external vfnd_dataset_deduplicated\val.csv `
  --external vfnd_dataset_deduplicated\test.csv `
  --output-dir ..\..\ml\artifacts
```

`--input` và mỗi `--additional-train` được gộp sau chuẩn hóa; bản ghi trùng cùng nhãn chỉ giữ một, còn mọi nội dung trùng nhưng khác nhãn bị loại. `--external` có thể lặp lại; từng tập được báo cáo riêng và mẫu trùng với tập train bị loại trước khi tính điểm. Chỉ đưa dữ liệu có quyền sử dụng vào huấn luyện.

Với bộ mới, chỉ dùng 14 mẫu `train.csv`; giữ `val.csv` và `test.csv` làm hai lần đánh giá riêng, không dùng `vfnd_full_dedup.csv` để huấn luyện trong cùng lần chạy vì sẽ làm lộ nội dung của hai tập đánh giá. Mỗi tập đánh giá chỉ có 3 mẫu, nên số liệu của chúng rất thiếu ổn định và không phải bằng chứng về độ chính xác thực tế. Đầu ra gồm cleaned CSV, EDA chart/JSON, bảng so sánh 4 mô hình, holdout metrics, đánh giá từng tập ngoài và `classifier.joblib` trong `ml/artifacts/` (đã gitignore). Mốc 85% là mục tiêu, không phải bảo đảm.

Chạy AI service từ `apps/ai-service`:

```powershell
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

`GET /health` vẫn hoạt động khi chưa có model; `POST /predict` trả `503` cho đến khi có artifact. `POST /dataset/classify` cần dữ liệu train; khi thiếu model vẫn tra được mẫu chính xác nhưng không có dự đoán classifier.

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