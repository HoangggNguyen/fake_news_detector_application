/**
 * Gọi API của backend và quy mọi lỗi về thông báo tiếng Việt dễ hiểu.
 *
 * Trước đây mỗi lời gọi tự `response.json()`. Khi backend tắt, Vite proxy trả HTTP 500 với
 * body rỗng, nên `json()` ném lỗi kỹ thuật ("Unexpected end of JSON input") và người dùng
 * nhìn thấy nguyên câu đó. Helper này đọc body an toàn, có giới hạn thời gian chờ và luôn
 * trả về thông báo người dùng đọc được.
 */

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const DEFAULT_TIMEOUT_MS = 20_000

const UNREACHABLE = 'Không kết nối được tới máy chủ. Vui lòng kiểm tra backend đã được bật hoặc thử lại sau.'

function messageForStatus(status: number): string {
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  if (status === 404) return 'Không tìm thấy dữ liệu yêu cầu.'
  if (status === 413) return 'Nội dung gửi lên quá lớn.'
  if (status === 429) return 'Bạn gửi quá nhiều yêu cầu. Vui lòng đợi một chút rồi thử lại.'
  if (status >= 500) return `Máy chủ đang gặp sự cố (HTTP ${status}). Vui lòng thử lại sau.`
  return `Yêu cầu không thành công (HTTP ${status}).`
}

/** Đọc body JSON nếu có; body không phải JSON thì trả về null thay vì ném lỗi. */
async function readBody(response: Response): Promise<{ empty: boolean; json: unknown }> {
  const text = await response.text().catch(() => '')
  if (!text.trim()) return { empty: true, json: null }
  try {
    return { empty: false, json: JSON.parse(text) as unknown }
  } catch {
    return { empty: false, json: null }
  }
}

function serverMessage(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const value = (body as { error?: unknown }).error
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * Gửi yêu cầu và trả về body JSON khi thành công.
 * Lỗi mạng, quá thời gian chờ hoặc HTTP lỗi đều ném ApiError với thông điệp tiếng Việt.
 */
export async function apiRequest<T>(url: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: controller.signal })
  } catch {
    throw new ApiError(0, controller.signal.aborted
      ? 'Máy chủ phản hồi quá lâu. Vui lòng thử lại sau.'
      : UNREACHABLE)
  } finally {
    window.clearTimeout(timer)
  }

  const { empty, json } = await readBody(response)
  if (!response.ok) {
    // Proxy của Vite trả 500/502/503/504 với body rỗng khi backend không chạy.
    const backendDown = empty && [500, 502, 503, 504].includes(response.status)
    throw new ApiError(response.status, serverMessage(json) ?? (backendDown ? UNREACHABLE : messageForStatus(response.status)))
  }
  return (json ?? {}) as T
}

export function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof ApiError) return cause.message
  return fallback
}
