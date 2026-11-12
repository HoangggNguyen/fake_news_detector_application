import { z } from 'zod'
import { classifierSignalSchema } from './classifier.js'
import { UserFacingError } from './errors.js'

const sampleSchema = z.object({
  id: z.string(), title: z.string(), text: z.string(), source: z.string(),
  dataset: z.string(), label: z.enum(['real', 'fake']),
  source_url: z.union([z.literal(''), z.url()]).optional(),
})

export const datasetResultSchema = z.object({
  method: z.enum(['match', 'prediction', 'unresolved']),
  label: z.enum(['real', 'fake']).nullable(),
  match: sampleSchema.nullable(),
  suggestions: z.array(sampleSchema).max(3),
  classifier: classifierSignalSchema.nullable(),
  classifier_skipped: z.object({
    reason: z.enum(['too_short', 'low_confidence', 'conflicting_matches', 'model_unavailable']),
    min_words: z.number().int().optional(),
    word_count: z.number().int().optional(),
  }).nullable().optional(),
  follow_up: z.object({
    question: z.string().nullable(),
    status: z.enum(['ready', 'unavailable', 'not_needed']),
  }).optional(),
  evidence_check: z.object({
    status: z.enum(['ready', 'unavailable', 'not_needed', 'disabled']),
    message: z.string().nullable(),
  }).optional(),
  overall_basis: z.enum(['dataset', 'classifier', 'evidence', 'none']).optional(),
})

export type DatasetResult = z.infer<typeof datasetResultSchema>

export async function classifyDataset(content: string, baseUrl: string) {
  const response = await fetch(new URL('/dataset/classify', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: content }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) {
    // Chi tiết kỹ thuật chỉ ghi log; người dùng nhận thông báo chung.
    console.error(`AI service /dataset/classify returned HTTP ${response.status}`)
    throw new UserFacingError('Bộ phân tích dữ liệu đang tạm thời chưa sẵn sàng.')
  }
  return datasetResultSchema.parse(await response.json())
}
