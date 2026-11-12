/**
 * Lỗi có thông điệp đã viết sẵn cho người dùng. Mọi lỗi khác (lỗi thư viện, mạng, SQL...)
 * chỉ được ghi vào log, người dùng nhận thông báo chung.
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

export const GENERIC_FAILURE = 'Đã có lỗi trong lúc phân tích.'

export function publicMessage(error: unknown, fallback = GENERIC_FAILURE): string {
  return error instanceof UserFacingError ? error.message : fallback
}
