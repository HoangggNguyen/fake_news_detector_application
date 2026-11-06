/**
 * Backend giả để làm và kiểm thử giao diện khi backend thật chưa sẵn sàng.
 * Chỉ chạy khi VITE_USE_MOCK=true. KHÔNG phải mô hình thật: điểm số được tính
 * bằng vài quy tắc đơn giản (từ giật gân, dấu chấm than, chữ in hoa) cho có tính quyết định.
 *
 * Mã giả lập lỗi (gõ vào nội dung để thử giao diện báo lỗi):
 *   [mock:network]  [mock:timeout]  [mock:500]  [mock:429]  [mock:422]  [mock:bad]
 */

import { config } from '../config'
import { fromAnalysisResult, fromPredictResponse } from './adapter'
import type { AnalysisInput, AnalysisResult, PredictResponse, ViewResult } from './contract'
import { ApiError } from './errors'

const LATENCY_MS = 1_200

const SENSATIONAL = [
  'sốc', 'chấn động', 'khẩn cấp', 'cảnh báo', 'chia sẻ ngay', 'lan truyền', 'bí mật',
  'sự thật', 'không thể tin', '100%', 'chữa khỏi', 'thần dược', 'tin nóng', 'đừng bỏ lỡ',
]

function wait(ms: number, signal: AbortSignal, timedOut: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const fail = () =>
      reject(timedOut() ? new ApiError('timeout', 'Quá thời gian chờ') : new ApiError('aborted', 'Đã huỷ'))
    if (signal.aborted) return fail()
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      fail()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function scoreFake(text: string): number {
  const lower = text.toLowerCase()
  const hits = SENSATIONAL.filter((word) => lower.includes(word)).length
  const exclaims = Math.min((text.match(/!/g) ?? []).length, 6)
  const letters = text.replace(/[^\p{L}]/gu, '')
  const upperRatio = letters ? letters.replace(/[^\p{Lu}]/gu, '').length / letters.length : 0
  const raw = 0.12 + hits * 0.16 + exclaims * 0.05 + Math.max(0, upperRatio - 0.08) * 1.2
  return Math.round(Math.min(0.97, Math.max(0.03, raw)) * 1000) / 1000
}

function simulateFailure(content: string): void {
  if (content.includes('[mock:network]')) throw new ApiError('network', 'Mock: lỗi mạng')
  if (content.includes('[mock:500]')) throw new ApiError('server', 'Mock: HTTP 500', { status: 500 })
  if (content.includes('[mock:429]')) throw new ApiError('rate_limit', '', { status: 429 })
  if (content.includes('[mock:422]'))
    throw new ApiError('invalid_input', 'Văn bản sau tiền xử lý quá ngắn để phân loại.', { status: 422 })
}

function mockPipeline(input: AnalysisInput, probFake: number): AnalysisResult {
  const credibility = Math.round((1 - probFake) * 100) / 100
  const label = credibility >= 0.65 ? 'likely_true' : credibility <= 0.35 ? 'likely_false' : 'mixed'
  const firstSentence = input.content.split(/(?<=[.!?])\s+/)[0]?.slice(0, 180) ?? input.content
  return {
    id: crypto.randomUUID(),
    status: 'completed',
    overall: {
      credibility_score: credibility,
      label,
      summary: 'Dữ liệu giả lập: tóm tắt sẽ do pipeline thật sinh ra.',
    },
    claims: [
      {
        text: firstSentence,
        verdict: label === 'likely_false' ? 'refuted' : label === 'likely_true' ? 'supported' : 'unverifiable',
        confidence: Math.abs(credibility - 0.5) * 2,
        reasoning: 'Dữ liệu giả lập để dựng giao diện.',
        evidence: [
          { title: 'Nguồn ví dụ', url: 'https://example.com/nguon-vi-du', snippet: 'Đoạn trích ví dụ.', stance: 'context' },
        ],
      },
    ],
    source_assessment: { domain: null, reputation: 'unknown' },
    disclaimer: 'Dữ liệu giả lập: chưa kết nối backend thật.',
  }
}

export async function mockAnalyze(
  input: AnalysisInput,
  signal: AbortSignal,
  startedAt: number,
  timedOut: () => boolean,
): Promise<ViewResult> {
  // [mock:timeout]: chờ tới khi bộ hẹn giờ thật của client huỷ yêu cầu.
  await wait(input.content.includes('[mock:timeout]') ? config.requestTimeoutMs + 5_000 : LATENCY_MS, signal, timedOut)
  simulateFailure(input.content)

  const probFake = scoreFake(input.content)
  const meta = { input, elapsedMs: performance.now() - startedAt }

  if (input.content.includes('[mock:bad]')) return fromPredictResponse({ prob_fake: 'cao' }, meta)

  if (config.mode === 'pipeline') return fromAnalysisResult(mockPipeline(input, probFake), meta)

  const response: PredictResponse = {
    label: probFake >= config.fakeThreshold ? 1 : 0,
    prob_fake: probFake,
    model: 'Mock (không phải mô hình thật)',
  }
  return fromPredictResponse(response, meta)
}
