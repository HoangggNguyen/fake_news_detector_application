import type { AnalysisInput } from '../api/contract'
import { config } from '../config'

export type ValidationResult = { ok: true; value: AnalysisInput } | { ok: false; message: string }

/** Chuẩn hoá giống bước tiền xử lý phía dữ liệu (NFC) và bỏ khoảng trắng thừa ở hai đầu. */
export function normaliseText(raw: string): string {
  return raw.normalize('NFC').trim()
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((token) => /\p{L}/u.test(token)).length
}

export function validateText(raw: string): ValidationResult {
  const text = normaliseText(raw)
  if (!text) return { ok: false, message: 'Vui lòng dán nội dung tin cần kiểm tra.' }
  if (text.length > config.maxChars) {
    return {
      ok: false,
      message: `Nội dung quá dài (${text.length.toLocaleString('vi-VN')} ký tự). Giới hạn là ${config.maxChars.toLocaleString('vi-VN')} ký tự.`,
    }
  }
  if (text.length < config.minChars || countWords(text) < config.minWords) {
    return {
      ok: false,
      message: `Nội dung quá ngắn để phân tích. Hãy dán ít nhất ${config.minChars} ký tự (khoảng ${config.minWords} từ), nên gồm cả tiêu đề và nội dung.`,
    }
  }
  return { ok: true, value: { type: 'text', content: text } }
}

export function validateUrl(raw: string): ValidationResult {
  const value = raw.trim()
  if (!value) return { ok: false, message: 'Vui lòng nhập đường dẫn bài viết.' }
  if (value.length > config.maxUrlLength) return { ok: false, message: 'Đường dẫn quá dài.' }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { ok: false, message: 'Đường dẫn không hợp lệ. Ví dụ đúng: https://example.com/bai-viet' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: 'Chỉ chấp nhận đường dẫn bắt đầu bằng http:// hoặc https://' }
  }
  return { ok: true, value: { type: 'url', content: url.toString() } }
}

/** Chỉ cho phép mở liên kết http(s) — chặn javascript:, data:… từ dữ liệu backend. */
export function safeExternalUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}
