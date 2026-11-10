import type { DatasetResult } from './dataset.js'
import type { analyzeContent } from './analyzer.js'

export type EvidenceAnalysis = Awaited<ReturnType<typeof analyzeContent>>

export type EvidenceCheck = {
  status: 'ready' | 'unavailable' | 'not_needed' | 'disabled'
  message: string | null
}

export type OverallResult = {
  credibility_score: number
  label: 'likely_true' | 'mixed' | 'likely_false' | 'insufficient_evidence'
  summary: string
  basis: 'dataset' | 'classifier' | 'evidence' | 'none'
}

/**
 * Lớp 1 (dataset + TF-IDF) là kết quả chính. Lớp 2 (LLM + bằng chứng web) chỉ chạy
 * khi lớp 1 không tìm thấy mẫu khớp, và có thể tắt bằng EVIDENCE_CHECK=false.
 */
export function shouldCheckEvidence(result: DatasetResult, env: NodeJS.ProcessEnv = process.env): EvidenceCheck | null {
  if (result.method === 'match') {
    return { status: 'not_needed', message: 'Đã có mẫu khớp trong dữ liệu tham khảo.' }
  }
  if ((env.EVIDENCE_CHECK ?? 'true').toLowerCase() === 'false') {
    return { status: 'disabled', message: 'Đối chiếu bằng chứng web đang tắt (EVIDENCE_CHECK=false).' }
  }
  return null
}

export async function runEvidenceCheck(
  run: () => Promise<EvidenceAnalysis>,
): Promise<{ check: EvidenceCheck; evidence: EvidenceAnalysis | null }> {
  try {
    const evidence = await run()
    return { check: { status: 'ready', message: null }, evidence }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định.'
    console.warn('Evidence check unavailable:', message)
    return { check: { status: 'unavailable', message: `Không thể đối chiếu bằng chứng web: ${message}` }, evidence: null }
  }
}

export function combineResults(dataset: DatasetResult, evidence: EvidenceAnalysis | null): OverallResult {
  if (dataset.method === 'match' && dataset.label) {
    return {
      credibility_score: dataset.label === 'real' ? 1 : 0,
      label: dataset.label === 'real' ? 'likely_true' : 'likely_false',
      summary: 'Thông tin này khớp với nội dung trong dữ liệu tham khảo.',
      basis: 'dataset',
    }
  }
  if (dataset.method === 'prediction' && dataset.label && dataset.classifier) {
    return {
      credibility_score: dataset.classifier.probabilities.real,
      label: dataset.label === 'real' ? 'likely_true' : 'likely_false',
      summary: evidence?.claims.length
        ? 'Dự đoán từ classifier TF-IDF; kèm kết quả đối chiếu bằng chứng web để tham khảo.'
        : 'Dự đoán từ classifier TF-IDF; chưa có mẫu khớp chính xác.',
      basis: 'classifier',
    }
  }
  if (evidence && evidence.overall.label !== 'insufficient_evidence') {
    return {
      credibility_score: evidence.overall.credibility_score,
      label: evidence.overall.label,
      summary: `Theo đối chiếu bằng chứng web (tham khảo): ${evidence.overall.summary}`,
      basis: 'evidence',
    }
  }
  return {
    credibility_score: 0.5,
    label: 'insufficient_evidence',
    summary: evidence?.overall.summary ?? 'Chưa tìm được mẫu khớp hoặc bằng chứng đủ rõ để kết luận.',
    basis: 'none',
  }
}
