/**
 * Hợp đồng dữ liệu giữa FE và backend.
 *
 * - Chế độ `classifier` (theo Kế hoạch dự án): POST {apiBase}/predict
 *     request : { "text": "..." }
 *     response: { "label": "fake" | "real" | 1 | 0, "prob_fake": 0.87, "model"?: "LinearSVC" }
 *
 * - Chế độ `pipeline` (theo spec.md): POST {apiBase}/analyses, GET {apiBase}/analyses/:id
 *     request : AnalysisInput   (packages/shared)
 *     response: AnalysisResult  (packages/shared)
 *
 * Toàn bộ giao diện chỉ đọc `ViewResult`; adapter.ts chịu trách nhiệm chuyển đổi.
 */

import type { AnalysisInput, ClaimResult, OverallLabel } from '@fake-news/shared'

export type { AnalysisInput, AnalysisResult, ClaimResult, Evidence, OverallLabel } from '@fake-news/shared'

export interface PredictRequest {
  text: string
}

export interface PredictResponse {
  /** VFND dùng 0 = thật, 1 = giả; chấp nhận cả dạng chuỗi. */
  label?: 'fake' | 'real' | 0 | 1
  /** Xác suất là tin giả, trong khoảng [0, 1]. */
  prob_fake: number
  model?: string
}

/** Dữ liệu chuẩn hoá mà mọi thành phần giao diện sử dụng. */
export interface ViewResult {
  id: string
  source: 'classifier' | 'pipeline'
  label: OverallLabel
  /** Chỉ có ở chế độ classifier. */
  fakeProbability: number | null
  /** Chỉ có ở chế độ pipeline (0 = không đáng tin, 1 = rất đáng tin). */
  credibilityScore: number | null
  summary: string | null
  claims: ClaimResult[]
  sourceDomain: string | null
  sourceReputation: string | null
  modelName: string | null
  disclaimer: string
  input: AnalysisInput
  elapsedMs: number
  createdAt: string
}
