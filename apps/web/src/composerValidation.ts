/** Kiểm tra nội dung trong ô nhập để báo rõ lý do khi chưa gửi được. */

export const MIN_CONTENT_LENGTH = 10

/** Trả về lý do chưa gửi được, hoặc null nếu nội dung hợp lệ. Ô trống thì không báo lỗi. */
export function composerProblem(mode: 'text' | 'url', content: string): string | null {
  const value = content.trim()
  if (!value) return null

  if (mode === 'url') {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return 'Đường dẫn chưa hợp lệ. Ví dụ đúng: https://vnexpress.net/bai-viet'
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return 'Chỉ hỗ trợ đường dẫn bắt đầu bằng http:// hoặc https://'
    }
    if (url.username || url.password) {
      return 'Đường dẫn không được chứa tên đăng nhập hoặc mật khẩu.'
    }
    return null
  }

  if (value.length < MIN_CONTENT_LENGTH) {
    return `Cần ít nhất ${MIN_CONTENT_LENGTH} ký tự để phân tích (còn thiếu ${MIN_CONTENT_LENGTH - value.length}).`
  }
  return null
}
