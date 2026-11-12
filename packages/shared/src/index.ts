export type AnalysisStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type ClaimVerdict = 'supported' | 'refuted' | 'mixed' | 'unverifiable'

export type OverallLabel =
  | 'likely_true'
  | 'mixed'
  | 'likely_false'
  | 'insufficient_evidence'

export interface AnalysisInput {
  type: 'text' | 'url'
  content: string
}

export interface Evidence {
  title: string
  url: string
  snippet: string
  stance: 'supports' | 'refutes' | 'context'
  source_type: 'fact_check' | 'official' | 'trusted_press' | 'web_search' | 'encyclopedia'
}

export interface ClaimResult {
  text: string
  verdict: ClaimVerdict
  confidence: number
  reasoning: string
  correction: string | null
  evidence: Evidence[]
}

export interface ClassifierSignal {
  label: 'real' | 'fake'
  confidence: number
  probabilities: {
    real: number
    fake: number
  }
  model_name: string
  model_version: string
  top_features: Array<{
    feature: string
    direction: 'real' | 'fake'
  }>
}

export interface DatasetSample {
  id: string
  title: string
  text: string
  source: string
  dataset: string
  label: 'real' | 'fake'
  source_url?: string
}

export interface DatasetResult {
  method: 'match' | 'prediction' | 'unresolved'
  label: 'real' | 'fake' | null
  match: DatasetSample | null
  suggestions: DatasetSample[]
  classifier: ClassifierSignal | null
  follow_up?: {
    question: string | null
    status: 'ready' | 'unavailable' | 'not_needed'
  }
  /** Lớp 2: kết quả đối chiếu bằng chứng web bằng LLM (chỉ chạy khi không có mẫu khớp). */
  evidence_check?: {
    status: 'ready' | 'unavailable' | 'not_needed' | 'disabled'
    message: string | null
  }
  /** Nguồn của nhãn tổng: mẫu khớp, classifier, bằng chứng web, hoặc chưa kết luận. */
  overall_basis?: 'dataset' | 'classifier' | 'evidence' | 'none'
}

export interface AnalysisResult {
  id: string
  status: AnalysisStatus
  error_message?: string | null
  overall: {
    credibility_score: number
    label: OverallLabel
    summary: string
  }
  claims: ClaimResult[]
  source_assessment: {
    domain: string | null
    reputation: string
  }
  classifier_signal?: ClassifierSignal | null
  dataset_result?: DatasetResult | null
  disclaimer: string
}
