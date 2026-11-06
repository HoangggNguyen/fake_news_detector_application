/**
 * Lỗi gọi API đã được phân loại, để giao diện hiển thị thông báo phù hợp
 * thay vì in nguyên văn lỗi kỹ thuật cho người dùng.
 */

export type ApiErrorKind =
  | 'aborted' // người dùng huỷ hoặc gửi yêu cầu mới
  | 'timeout' // quá thời gian chờ
  | 'network' // không kết nối được tới server
  | 'rate_limit' // HTTP 429
  | 'invalid_input' // HTTP 400 / 413 / 422
  | 'server' // HTTP 5xx hoặc mã lỗi khác
  | 'bad_response' // server trả về dữ liệu sai định dạng
  | 'analysis_failed' // pipeline báo status = failed

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number

  constructor(kind: ApiErrorKind, message: string, options?: { status?: number; cause?: unknown }) {
    super(message, { cause: options?.cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = options?.status
  }
}

export function isAbort(error: unknown): boolean {
  return error instanceof ApiError && error.kind === 'aborted'
}

const FRIENDLY: Record<ApiErrorKind, string> = {
  aborted: 'Đã huỷ yêu cầu.',
  timeout: 'Máy chủ phản hồi quá lâu. Vui lòng thử lại sau ít phút.',
  network: 'Không kết nối được tới máy chủ. Kiểm tra mạng hoặc backend đã được bật chưa.',
  rate_limit: 'Bạn gửi quá nhiều yêu cầu. Vui lòng đợi một phút rồi thử lại.',
  invalid_input: 'Nội dung gửi lên không hợp lệ.',
  server: 'Máy chủ gặp lỗi khi phân tích. Vui lòng thử lại.',
  bad_response: 'Máy chủ trả về kết quả không đúng định dạng.',
  analysis_failed: 'Quá trình phân tích thất bại. Vui lòng thử lại.',
}

/** Thông báo thân thiện; với lỗi đầu vào thì ưu tiên thông điệp server gửi về. */
export function toUserMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'invalid_input' && error.message) return error.message
    return FRIENDLY[error.kind]
  }
  return 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.'
}

/** Lỗi nào thì người dùng có thể bấm "Thử lại" ngay. */
export function isRetryable(error: unknown): boolean {
  return error instanceof ApiError && ['timeout', 'network', 'server', 'analysis_failed'].includes(error.kind)
}
