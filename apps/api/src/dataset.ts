import { z } from 'zod'
import { classifierSignalSchema } from './classifier.js'

const sampleSchema = z.object({
  id: z.string(), title: z.string(), text: z.string(), source: z.string(),
  dataset: z.string(), label: z.enum(['real', 'fake']),
})

export const datasetResultSchema = z.object({
  method: z.enum(['match', 'prediction', 'unresolved']),
  label: z.enum(['real', 'fake']).nullable(),
  match: sampleSchema.nullable(),
  suggestions: z.array(sampleSchema).max(3),
  classifier: classifierSignalSchema.nullable(),
})

export async function classifyDataset(content: string, baseUrl: string) {
  const response = await fetch(new URL('/dataset/classify', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: content }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) throw new Error(`Không thể phân loại theo dữ liệu giả lập (AI service: ${response.status}).`)
  return datasetResultSchema.parse(await response.json())
}
