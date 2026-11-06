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
}

export interface ClaimResult {
  text: string
  verdict: ClaimVerdict
  confidence: number
  reasoning: string
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

export interface AnalysisResult {
  id: string
  status: AnalysisStatus
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
  disclaimer: string
}
