/** Nội dung chữ phụ thuộc chế độ API, gom một chỗ để dễ sửa. */

import type { ApiMode } from './config'

export const COPY: Record<
  ApiMode,
  { intro: string; steps: [string, string, string]; footerHint: string }
> = {
  classifier: {
    intro:
      'Dán tiêu đề và nội dung một bài báo hoặc bài đăng tiếng Việt. Mô hình học máy sẽ ước lượng xác suất đó là tin giả để bạn sàng lọc trước khi kiểm chứng.',
    steps: ['Tiền xử lý văn bản', 'Trích xuất TF-IDF', 'Phân loại thật / giả'],
    footerHint: 'Tiếng Việt · Mô hình TF-IDF + học máy',
  },
  pipeline: {
    intro:
      'Xem xét từng tuyên bố, đối chiếu bằng chứng và lần theo nguồn trích dẫn. Không có nhãn đúng sai tuyệt đối.',
    steps: ['Tách tuyên bố', 'Tìm bằng chứng', 'Đọc kết quả'],
    footerHint: 'Tiếng Việt · Đối chiếu bằng chứng',
  },
}

/**
 * Ví dụ minh hoạ do nhóm tự viết (không phải tin thật), giúp demo nhanh.
 * Thay bằng mẫu lấy từ tập kiểm thử của nhóm nếu muốn.
 */
export const EXAMPLES: { label: string; text: string }[] = [
  {
    label: 'Tin giật gân',
    text:
      'SỐC!!! Chỉ cần uống nước chanh nóng mỗi sáng là chữa khỏi 100% bệnh ung thư, bác sĩ giấu kín bí mật này suốt nhiều năm. Hãy chia sẻ ngay cho người thân trước khi bài viết bị xoá!',
  },
  {
    label: 'Tin thông báo',
    text:
      'Sở Giao thông vận tải thành phố thông báo điều chỉnh tạm thời lộ trình một số tuyến xe buýt từ ngày 15/11 để phục vụ thi công cầu vượt. Hành khách có thể tra cứu lộ trình mới trên trang thông tin chính thức của Sở hoặc gọi tổng đài hỗ trợ.',
  },
  {
    label: 'Tin mập mờ',
    text:
      'Nhiều người dân phản ánh giá xăng sẽ tăng mạnh vào tuần tới, một số cây xăng đã bắt đầu hạn chế bán. Cơ quan quản lý chưa đưa ra thông báo chính thức về đợt điều chỉnh giá sắp tới.',
  },
]
