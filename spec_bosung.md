1. Phương pháp
Ap dụng quy trình học máy có giám sát cho bài toán phân loại văn bản nhị phân:
-Tiền xử lý: chuẩn hóa Unicode (NFC), chuyển chữ thường, thay URL và số bằng token, bỏ ký tự đặc biệt, khử trùng lặp.
-Biểu diễn văn bản: TF-IDF mức từ (n-gram 1–2) kết hợp TF-IDF mức ký tự (n-gram 2–4) để bền vững với lỗi chính tả, teencode.
-Mô hình: Multinomial Naive Bayes, Logistic Regression, Linear SVM, Random Forest; xử lý lệch lớp bằng class_weight.
-Đánh giá: kiểm định chéo phân tầng 5-fold với Accuracy, Precision, Recall, F1-score; ma trận nhầm lẫn trên tập hold-out 20%; kiểm thử với tin mới ngoài dữ liệu.
-Triển khai: lưu mô hình tốt nhất bằng joblib, xây dựng ứng dụng web Flask hiển thị nhãn và xác suất.
-Công cụ: Python, pandas, scikit-learn, matplotlib, Flask; quản lý tiến độ bằng WBS.
2. Dữ liệu
Nguồn dữ liệu: bộ VFND – Vietnamese Fake News Dataset (Hồ Quang Thành và cộng sự, 2019), công khai trên GitHub và Zenodo. Bộ dữ liệu gồm khoảng 226 bài báo điện tử và bài đăng mạng xã hội giai đoạn 2017–2019, được gán nhãn thật/giả dựa trên kiểm chứng chéo với nguồn tin chính thống; chủ đề đa dạng: xã hội, pháp luật, y tế, thể thao, kinh tế.
Cách thu thập: tải trực tiếp từ kho GitHub của nhóm tác giả, sử dụng tệp CSV gồm hai trường text (tiêu đề và nội dung) và label (0 = thật, 1 = giả). Không dùng trường tên miền để tránh mô hình học thuộc nguồn đăng. Bộ ReINTEL (VLSP 2020) được xem xét làm dữ liệu mở rộng.
Cách sử dụng: (1) phân tích khám phá để hiểu đặc điểm dữ liệu; (2) huấn luyện và so sánh mô hình bằng kiểm định chéo 5-fold; (3) huấn luyện mô hình cuối cùng trên toàn bộ dữ liệu để triển khai demo.
3. Đầu ra mong muốn đạt được
Kết thúc dự án, nhóm dự kiến có các sản phẩm sau:
-Bộ dữ liệu đã làm sạch và báo cáo EDA với các biểu đồ trực quan.
-Mô hình phân loại tin giả đạt Accuracy và F1-score từ 85% trở lên, kèm bảng so sánh các mô hình.
Ứng dụng web demo hoạt động ổn định, trả kết quả tức thì kèm xác suất.