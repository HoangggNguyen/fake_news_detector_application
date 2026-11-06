/**
 * Cấu hình FE, đọc một lần từ biến môi trường của Vite (VITE_*).
 * Mọi giá trị đều có mặc định an toàn để app chạy được khi thiếu file .env.
 */

export type ApiMode = 'classifier' | 'pipeline'

function readMode(raw: string | undefined): ApiMode {
  return raw === 'pipeline' ? 'pipeline' : 'classifier'
}

function readPositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw)
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function readBase(raw: string | undefined): string {
  const base = (raw ?? '').trim() || '/api'
  return base.replace(/\/+$/, '')
}

const mode = readMode(import.meta.env.VITE_API_MODE)

export const config = Object.freeze({
  mode,
  useMock: import.meta.env.VITE_USE_MOCK === 'true',
  apiBase: readBase(import.meta.env.VITE_API_BASE),
  // Pipeline (LLM + tìm bằng chứng) chậm hơn nhiều so với mô hình TF-IDF.
  requestTimeoutMs: readPositiveInt(
    import.meta.env.VITE_REQUEST_TIMEOUT_MS,
    mode === 'pipeline' ? 120_000 : 30_000,
  ),
  /** Nhập theo đường dẫn chỉ có ý nghĩa khi backend có bước tải bài viết (pipeline). */
  allowUrlInput: mode === 'pipeline',
  minChars: readPositiveInt(import.meta.env.VITE_MIN_CHARS, 50),
  maxChars: 20_000,
  minWords: 8,
  maxUrlLength: 2_048,
  /** Ngưỡng phân loại khi backend chỉ trả xác suất mà không trả nhãn. */
  fakeThreshold: 0.5,
  historyLimit: 10,
})
