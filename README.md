# Fake News Detector

Ứng dụng thử nghiệm phân loại tin theo nhãn của hai bộ dữ liệu giả lập được cung cấp. Các nhãn và nguồn trong dữ liệu chỉ được coi là chuẩn trong môi trường test, không phải kết quả kiểm chứng sự kiện ngoài đời.

**Cảnh báo bảo mật:** Theo yêu cầu, bảng `users` lưu thêm mật khẩu nguyên văn trong `real_pass`, bên cạnh mật khẩu băm dùng để đăng nhập. Bất kỳ ai đọc được database hoặc bản sao lưu đều có thể xem mật khẩu. Chỉ sử dụng mật khẩu thử nghiệm riêng; không dùng mật khẩu thật và không triển khai công khai cấu hình này.

## Công nghệ

- Web: React, TypeScript, Vite, Tailwind CSS.
- API: Node.js, Express, MySQL; Redis/BullMQ là tùy chọn.
- Phân tích kết hợp hai lớp:
  1. **Lớp chính – dữ liệu + TF-IDF (FastAPI):** tra mẫu khớp trong dữ liệu train cục bộ; nếu không khớp, classifier TF-IDF chỉ đưa nhãn khi đủ độ dài và độ tin cậy ≥ ngưỡng đã chọn trên tập val (hiện 0,70; mặc định 0,9 nếu model chưa được hiệu chỉnh).
  2. **Lớp tham khảo – LLM + bằng chứng web (API Node.js):** chỉ chạy khi lớp chính không có mẫu khớp. LLM (`LLM_PROVIDER`: Gemini/Groq/Ollama) tách tuyên bố, tìm bằng chứng qua Google Fact Check, Tavily và Wikipedia tiếng Việt, rồi đánh giá từng tuyên bố chỉ dựa trên nguồn tìm được.
  Nhãn tổng ưu tiên mẫu khớp, sau đó tới dự đoán classifier; chỉ khi cả hai chưa kết luận mới dùng kết quả bằng chứng web (ghi rõ là tham khảo). Lỗi hoặc thiếu khóa ở lớp 2 không làm hỏng phân tích; giao diện hiển thị lý do. Tắt lớp 2 bằng `EVIDENCE_CHECK=false`. Groq vẫn có thể tạo một câu hỏi gợi ý cho nội dung không khớp.

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
- `GROQ_API_KEY` và tùy chọn `GROQ_MODEL`: bật câu hỏi tự nhiên khi không có mẫu khớp. Không commit hoặc chia sẻ file `.env`. Nếu thiếu khóa hoặc dịch vụ lỗi, giao diện thông báo phần diễn đạt không khả dụng và vẫn hiển thị kết quả tra cứu.

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

API gọi AI service tại `AI_SERVICE_URL` (mặc định `http://localhost:8000`). Service nạp các file train khi khởi động, và nạp model từ `ml/artifacts/classifier.joblib` nếu có. Mọi thư mục dataset đều tùy chọn (`vfnd_original` là bộ chính); thư mục thiếu chỉ ghi cảnh báo, service chỉ lỗi khi không có bộ nào. Cần khởi động lại AI service sau khi sửa dữ liệu train hoặc model. Nếu dataset bắt buộc hoặc service không sẵn sàng, phân tích thất bại thay vì âm thầm đổi sang tìm kiếm trên mạng.

## Sử dụng

1. Tạo tài khoản hoặc đăng nhập. Tài khoản dùng tên đăng nhập và mật khẩu; nút **Đăng xuất** thu hồi phiên đăng nhập hiện tại.
2. Tạo cuộc trò chuyện, chọn **Văn bản** hoặc **Đường dẫn**, rồi gửi nội dung. Các lần gửi tiếp theo thuộc cùng cuộc trò chuyện cho đến khi chọn **Cuộc trò chuyện mới**.
3. Nếu nội dung hoặc tiêu đề khớp mẫu train sau chuẩn hóa, xem nhãn và nguồn ghi trong mẫu giả lập. Nếu không khớp, classifier chỉ đưa dự đoán khi đủ độ dài và độ tin cậy đạt ngưỡng (hiện 0,70, chọn trên tập val với 33 mẫu); ngưỡng này không đảm bảo độ chính xác trên tin mới. Nếu chưa xác định, có thể xem tối đa ba mẫu gần giống; đây là gợi ý chứ không phải đính chính được xác minh. Mẫu trùng nhưng có nhãn trái nhau không được tự kết luận.
4. Chọn một cuộc trò chuyện ở sidebar hoặc **Xem tất cả** để xem lại các lượt gửi và kết quả. Sau khi đăng nhập, nút **Chuyển lịch sử cũ của trình duyệt này** chủ động gắn các phân tích cũ vào tài khoản; mỗi phân tích cũ thành một cuộc trò chuyện riêng.

Phân tích cần MySQL và AI service hoạt động. Chế độ URL vẫn tải nội dung URL do người dùng cung cấp; để không truy cập Internet, dùng chế độ văn bản, đặt `EVIDENCE_CHECK=false` và không cấu hình khóa Groq. Địa chỉ nội bộ và nội dung tải vượt giới hạn sẽ bị từ chối.

Với nội dung không khớp, tối đa 80.000 ký tự đầu (bao gồm nội dung trích từ URL) được gửi tới LLM để tách tuyên bố, các tuyên bố được gửi tới dịch vụ tìm kiếm đã cấu hình, và tối đa 4.000 ký tự được gửi tới Groq để tạo câu hỏi nếu có khóa. Không gửi thông tin nhạy cảm. Kết quả bằng chứng web là tham khảo, do LLM tổng hợp và có thể sai; nhãn từ mẫu khớp hoặc classifier luôn được ưu tiên. Giao diện không hiển thị điểm, và tên nguồn trong dữ liệu chưa chứng minh sự tồn tại của bài báo thực tế.

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
- `EVIDENCE_CHECK=true` (mặc định): bật lớp đối chiếu bằng chứng web khi không có mẫu khớp; cần khóa của `LLM_PROVIDER` và nên có `TAVILY_API_KEY` và/hoặc `GOOGLE_FACTCHECK_API_KEY`. Đặt `false` để chỉ dùng dữ liệu + TF-IDF.
- `RATE_LIMIT_PER_MIN`: số request tối đa mỗi phút cho các endpoint `/api`; mặc định là `10`.
- `GEMINI_MODEL`, `GROQ_MODEL`, `OLLAMA_MODEL`: tên model được gửi tới provider tương ứng.
- `PORT`: cổng API, mặc định `3000`.

## Huấn luyện classifier (tùy chọn)

### Dữ liệu chính: VFND gốc

Bộ dữ liệu chính là VFND gốc ([thanhhocse96/vfnd-vietnamese-fake-news-datasets](https://github.com/thanhhocse96/vfnd-vietnamese-fake-news-datasets), GPL-3.0; tác giả đề nghị liên hệ trước khi dùng và trích dẫn: *Ho Quang Thanh and ninh-pm-se, Zenodo, 27-Feb-2019*). Tải và chuyển đổi một lần, từ thư mục gốc repository:

```powershell
git clone --depth 1 https://github.com/thanhhocse96/vfnd-vietnamese-fake-news-datasets.git <thư-mục-tạm>\vfnd
apps\ai-service\.venv\Scripts\python.exe -I ml\prepare_vfnd.py --source <thư-mục-tạm>\vfnd --output apps\ai-service\vfnd_original
```

Script đọc `CSV/vn_news_226_tlfr.csv` (226 dòng → 225 mẫu duy nhất), lấy domain từ `vn_news_223_tdlfr.csv`, rồi chia phân tầng 70/15/15 với seed 42: train 159 (87 thật/72 giả), val 33 và test 33 (mỗi tập 18 thật/15 giả). Val/test **không trùng** nội dung với train. Thư mục `vfnd_original/` bị git-ignore. Cột `domain` gần như lộ nhãn (ví dụ `tinvn.info`) và không được dùng khi huấn luyện.

Kết quả model `tfidf-vfnd-original-v4` (Logistic Regression được chọn qua CV 5-fold; train = VFND train + 4 mẫu tài chính):

| Đánh giá | Số mẫu | Accuracy | Macro F1 |
|---|---|---|---|
| CV 5-fold (trung bình) | 163 | 0,908 | 0,904 |
| Holdout 20% | 33 | 0,909 | 0,909 |
| VFND val (độc lập) | 33 | 0,788 | 0,785 |
| VFND test (độc lập) | 33 | 0,848 | 0,848 |

Tập val/test chỉ có 33 mẫu nên sai số lớn (mỗi mẫu ≈ 3 điểm phần trăm). **Ngưỡng kết luận.** Với ngưỡng mặc định 0,9, classifier không kết luận mẫu test nào (độ tin cậy cao nhất ≈ 0,8). Ngưỡng được chọn lại bằng `python -m app.tune_threshold --val vfnd_original/val.csv --test vfnd_original/test.csv` theo quy tắc cố định trước: trên **val**, chọn ngưỡng thấp nhất (0,50–0,95, bước 0,05) mà model kết luận ≥ 5 mẫu và đúng ≥ 90% trên các mẫu đó; không đạt thì giữ 0,9. Ngưỡng được ghi vào `classifier.joblib` (`decision_threshold`); báo cáo ở `ml/artifacts/threshold_report.json`. Phải chạy lại lệnh này mỗi khi train lại.

| Ngưỡng (val) | 0,50 | 0,55 | 0,60 | 0,65 | **0,70** | 0,75 | ≥ 0,80 |
|---|---|---|---|---|---|---|---|
| Số mẫu kết luận / 33 | 32 | 29 | 24 | 21 | **12** | 5 | 0 |
| Đúng trên số kết luận | 78,1% | 82,8% | 87,5% | 85,7% | **91,7%** | 100% | – |

Ngưỡng chọn: **0,70**. Đánh giá **một lần** trên test: kết luận 11/33 tin (độ phủ 33%), đúng 10/11 (**90,9%**); 22 tin còn lại trả "chưa xác định" và chuyển sang lớp bằng chứng web. Với 11 mẫu, khoảng tin cậy của 90,9% còn rất rộng.

### Dữ liệu giả lập cũ (tùy chọn)

AI service nạp phần train của mọi thư mục có sẵn trong `vfnd_original`, `vfnd_dataset_1000`, `vfnd_dataset_deduplicated`, `vfnd_dataset_10000_full`, `finance_data`; thư mục thiếu chỉ ghi cảnh báo. Ba thư mục `apps/ai-service/vfnd_dataset_1000`, `apps/ai-service/vfnd_dataset_deduplicated` và `apps/ai-service/vfnd_dataset_10000_full` được người dùng mô tả là dữ liệu giả lập, với nhãn được chấp nhận làm chuẩn cho môi trường test. Chúng không chứng minh tính đúng sai của sự kiện thực tế; URL và các tuyên bố xác thực trong bộ 10.000 chưa được kiểm chứng. Các thư mục dữ liệu bị git-ignore; không đưa dữ liệu vào commit khi chưa xác nhận quyền sử dụng.

`apps/ai-service/finance_data/train.csv` bổ sung bốn bản tóm tắt viết lại từ nguồn công khai về vàng, xăng dầu, ngoại tệ và chứng khoán, mỗi bản có đường dẫn gốc và thời điểm cụ thể. Chúng là thông tin lịch sử, không phải báo giá hiện tại. Cả bốn mẫu đều được nguồn hỗ trợ; chưa có mẫu tin giả được kiểm chứng trong bộ tài chính này. Ứng dụng hiển thị toàn bộ bản tóm tắt đã lưu, không sao chép toàn văn bài báo nguồn.

Kiểm tra split cho thấy 1.000 dòng chỉ có 80 nội dung duy nhất sau chuẩn hóa; 620 dòng trùng trong train, và mọi nội dung val/test đều đã xuất hiện trong train. Train unique có 60 nhãn thật/20 giả. Vì vậy không dùng val/test này làm external benchmark và không diễn giải 100% holdout/CV như độ chính xác trên tin mới. Raw data và zip đã được git-ignore.

Bộ 10.000 có 7.000 dòng train, còn 20 mẫu sau chuẩn hóa; cả val và test đều trùng nội dung train, nên không dùng hai split đó làm đánh giá độc lập. Trong nội dung có các cụm từ lộ nhãn như “tin giả”, làm kết quả đánh giá dễ bị thổi phồng. Cột `url` của bộ này không được tự động biến thành liên kết nguồn đã kiểm chứng; văn bản gốc vẫn được giữ nguyên.

CSV cần có cột `text`, `label` (`0=real`, `1=fake`) và có thể có `title` (được ghép với nội dung); cột domain nếu có sẽ bị bỏ qua. Tạo môi trường Python và cài dependencies:

Tiến độ và điều kiện chấp nhận được theo dõi trong [ml/WBS.md](ml/WBS.md).

```powershell
cd apps/ai-service
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt -r ..\..\ml\requirements.txt
```

Từ `apps/ai-service`, chạy huấn luyện và đánh giá trên VFND gốc:

```powershell
python -m app.train `
  --input vfnd_original\train.csv `
  --additional-train finance_data\train.csv `
  --external vfnd_original\val.csv `
  --external vfnd_original\test.csv `
  --output-dir ..\..\ml\artifacts
```

Lệnh cũ cho các bộ giả lập (chỉ khi có các thư mục đó):

```powershell
python -m app.train `
  --input vfnd_dataset_1000\train.csv `
  --additional-train vfnd_dataset_deduplicated\train.csv `
  --additional-train finance_data\train.csv `
  --additional-train vfnd_dataset_10000_full\train.csv `
  --external vfnd_dataset_deduplicated\val.csv `
  --external vfnd_dataset_deduplicated\test.csv `
  --output-dir ..\..\ml\artifacts
```

`--input` và mỗi `--additional-train` được gộp sau chuẩn hóa; từng file có thể chỉ chứa một nhãn nhưng toàn bộ dữ liệu huấn luyện sau khi gộp phải có cả hai nhãn. Bản ghi trùng cùng nhãn chỉ giữ một, còn mọi nội dung trùng nhưng khác nhãn bị loại. `--external` có thể lặp lại; từng tập được báo cáo riêng và mẫu trùng với tập train bị loại trước khi tính điểm. Chỉ đưa dữ liệu có quyền sử dụng vào huấn luyện.

Với bộ `vfnd_dataset_deduplicated`, file `train.csv` có 14 dòng nhưng hiện một dòng không đầy đủ và bị loại; giữ `val.csv` và `test.csv` làm hai lần đánh giá riêng, không dùng `vfnd_full_dedup.csv` để huấn luyện trong cùng lần chạy vì sẽ làm lộ nội dung của hai tập đánh giá. Mỗi tập đánh giá chỉ có 3 mẫu, nên số liệu của chúng rất thiếu ổn định và không phải bằng chứng về độ chính xác thực tế hay chất lượng phân loại tài chính. Đầu ra gồm cleaned CSV, EDA chart/JSON, bảng so sánh 4 mô hình, holdout metrics, đánh giá từng tập ngoài và `classifier.joblib` trong `ml/artifacts/` (đã gitignore). Mốc 85% là mục tiêu, không phải bảo đảm.

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

Khi classifier chưa sẵn sàng, FastAPI vẫn health-check được và `/predict` trả `503`; `/dataset/classify` vẫn tra được mẫu khớp nhưng không có dự đoán classifier; khi không khớp, API chuyển sang lớp đối chiếu bằng chứng web.

## Xử lý lỗi thường gặp

- **API health trả `503`:** API vẫn có thể đang chạy nhưng chưa kết nối được MySQL. Xác nhận service đang nghe cổng trong `DATABASE_URL`, database tồn tại và thông tin đăng nhập đúng.
- **`docker compose` không kết nối được:** mở Docker Desktop và chờ Docker Engine sẵn sàng; hoặc dùng MySQL cục bộ rồi cập nhật `DATABASE_URL`.
- **Thiếu khóa Gemini/Groq:** chọn provider tương ứng trong `LLM_PROVIDER` và điền khóa trong `.env`. Không gửi khóa vào terminal log, chat hoặc Git.
- **Không tải được URL:** chỉ URL HTTP(S) công khai được hỗ trợ; website có thể chặn bot hoặc không trả nội dung HTML/văn bản.
- **Port đã được sử dụng:** đổi `PORT` cho API; nếu đổi port web thì cập nhật proxy trong `apps/web/vite.config.ts`.

## Ghi chú về các phần đang phát triển

Luồng kết hợp (dữ liệu + TF-IDF làm lớp chính, LLM + bằng chứng web làm lớp tham khảo) đã được tích hợp. Embedding/vector search và triển khai production chưa được tích hợp; chất lượng của lớp bằng chứng web chưa được đánh giá độc lập. Tiến trình phát triển theo phiên được ghi trong [log.md](log.md); quy tắc tiếp tục ghi log nằm trong [spec.md](spec.md).