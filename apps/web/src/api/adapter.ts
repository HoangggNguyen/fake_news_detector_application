/**
 * Chuyển phản hồi thô của backend thành ViewResult.
 * Không tin dữ liệu từ mạng: kiểm tra kiểu lúc chạy, sai định dạng thì ném ApiError('bad_response').
 */

import { config } from '../config'
import type {
  AnalysisInput,
  AnalysisResult,
  ClaimResult,
  Evidence,
  OverallLabel,
  PredictResponse,
  ViewResult,
} from './contract'
import { ApiError } from './errors'

const DEFAULT_DISCLAIMER =
  'Kết quả do mô hình máy tính tạo ra và có thể sai. Hãy đối chiếu với nguồn tin chính thống trước khi tin hoặc chia sẻ.'

const OVERALL_LABELS: readonly OverallLabel[] = ['likely_true', 'mixed', 'likely_false', 'insufficient_evidence']
const VERDICTS: readonly ClaimResult['verdict'][] = ['supported', 'refuted', 'mixed', 'unverifiable']
const STANCES: readonly Evidence['stance'][] = ['supports', 'refutes', 'context']

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function bad(detail: string): never {
  throw new ApiError('bad_response', `Phản hồi không hợp lệ: ${detail}`)
}

interface Meta {
  input: AnalysisInput
  elapsedMs: number
  id?: string
}

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// ---------------------------------------------------------------- classifier

function normaliseLabel(raw: PredictResponse['label'] | undefined, probFake: number): 'fake' | 'real' {
  if (raw === 1 || raw === 'fake') return 'fake'
  if (raw === 0 || raw === 'real') return 'real'
  return probFake >= config.fakeThreshold ? 'fake' : 'real'
}

export function fromPredictResponse(raw: unknown, meta: Meta): ViewResult {
  if (!isObject(raw)) bad('không phải đối tượng JSON')
  if (!isProbability(raw.prob_fake)) bad('thiếu "prob_fake" hoặc không nằm trong [0, 1]')
  const label = raw.label
  if (label !== undefined && label !== 0 && label !== 1 && label !== 'fake' && label !== 'real') {
    bad('"label" phải là "fake" | "real" | 0 | 1')
  }

  const probFake = raw.prob_fake
  const binary = normaliseLabel(label, probFake)

  return {
    id: meta.id ?? makeId(),
    source: 'classifier',
    label: binary === 'fake' ? 'likely_false' : 'likely_true',
    fakeProbability: probFake,
    credibilityScore: null,
    summary: null,
    claims: [],
    sourceDomain: null,
    sourceReputation: null,
    modelName: optionalString(raw.model),
    disclaimer: DEFAULT_DISCLAIMER,
    input: meta.input,
    elapsedMs: meta.elapsedMs,
    createdAt: new Date().toISOString(),
  }
}

// ------------------------------------------------------------------ pipeline

function toEvidence(raw: unknown): Evidence | null {
  if (!isObject(raw)) return null
  const url = optionalString(raw.url)
  const title = optionalString(raw.title) ?? url
  if (!title) return null
  return {
    title,
    url: url ?? '',
    snippet: optionalString(raw.snippet) ?? '',
    stance: oneOf(raw.stance, STANCES) ? raw.stance : 'context',
  }
}

function toClaim(raw: unknown): ClaimResult | null {
  if (!isObject(raw)) return null
  const text = optionalString(raw.text)
  if (!text) return null
  return {
    text,
    verdict: oneOf(raw.verdict, VERDICTS) ? raw.verdict : 'unverifiable',
    confidence: isProbability(raw.confidence) ? raw.confidence : 0,
    reasoning: optionalString(raw.reasoning) ?? '',
    evidence: Array.isArray(raw.evidence)
      ? raw.evidence.map(toEvidence).filter((e): e is Evidence => e !== null)
      : [],
  }
}

/** Kiểm tra sơ bộ để client biết đây là AnalysisResult (dùng khi polling). */
export function readPipelineStatus(raw: unknown): { id: string; status: AnalysisResult['status'] } {
  if (!isObject(raw)) bad('không phải đối tượng JSON')
  const id = optionalString(raw.id)
  if (!id) bad('thiếu "id"')
  if (!oneOf(raw.status, ['pending', 'processing', 'completed', 'failed'] as const)) bad('"status" không hợp lệ')
  return { id, status: raw.status }
}

export function fromAnalysisResult(raw: unknown, meta: Meta): ViewResult {
  const { id } = readPipelineStatus(raw)
  const data = raw as Json
  const overall = data.overall
  if (!isObject(overall)) bad('thiếu "overall"')
  if (!isProbability(overall.credibility_score)) bad('"overall.credibility_score" không nằm trong [0, 1]')
  if (!oneOf(overall.label, OVERALL_LABELS)) bad('"overall.label" không hợp lệ')

  const source = isObject(data.source_assessment) ? data.source_assessment : {}

  return {
    id,
    source: 'pipeline',
    label: overall.label,
    fakeProbability: null,
    credibilityScore: overall.credibility_score,
    summary: optionalString(overall.summary),
    claims: Array.isArray(data.claims)
      ? data.claims.map(toClaim).filter((c): c is ClaimResult => c !== null)
      : [],
    sourceDomain: optionalString(source.domain),
    sourceReputation: optionalString(source.reputation),
    modelName: null,
    disclaimer: optionalString(data.disclaimer) ?? DEFAULT_DISCLAIMER,
    input: meta.input,
    elapsedMs: meta.elapsedMs,
    createdAt: new Date().toISOString(),
  }
}
