/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `classifier` (Kế hoạch: nhãn + xác suất) hoặc `pipeline` (spec: điểm tin cậy + tuyên bố + bằng chứng). */
  readonly VITE_API_MODE?: string
  /** `true` để dùng dữ liệu giả, không cần backend. */
  readonly VITE_USE_MOCK?: string
  /** Tiền tố API, mặc định `/api` (Vite proxy sang http://localhost:3000). */
  readonly VITE_API_BASE?: string
  readonly VITE_REQUEST_TIMEOUT_MS?: string
  readonly VITE_MIN_CHARS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
