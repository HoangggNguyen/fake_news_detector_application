import { z } from 'zod'

export const classifierSignalSchema = z.object({
  label: z.enum(['real', 'fake']),
  confidence: z.number().min(0).max(1),
  probabilities: z.object({ real: z.number().min(0).max(1), fake: z.number().min(0).max(1) }),
  model_name: z.string(),
  model_version: z.string(),
  top_features: z.array(z.object({ feature: z.string(), direction: z.enum(['real', 'fake']) })),
})

export type ClassifierSignal = z.infer<typeof classifierSignalSchema>

export async function fetchClassifierSignal(
  content: string,
  baseUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000',
  fetcher: typeof fetch = fetch,
): Promise<ClassifierSignal | null> {
  try {
    const response = await fetcher(new URL('/predict', baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: content }),
      signal: AbortSignal.timeout(1_500),
    })
    if (!response.ok) return null
    const parsed = classifierSignalSchema.safeParse(await response.json())
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}