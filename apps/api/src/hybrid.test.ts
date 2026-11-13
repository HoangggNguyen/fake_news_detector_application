import assert from 'node:assert/strict'
import test from 'node:test'
import type { DatasetResult } from './dataset.js'
import { combineResults, runEvidenceCheck, shouldCheckEvidence, type EvidenceAnalysis } from './hybrid.js'

const sample = { id: 'S1', title: 'Mẫu', text: 'Nội dung mẫu', source: 'Nguồn', dataset: 'fixture', label: 'real' as const }
const classifier = {
  label: 'fake' as const, confidence: 0.93, probabilities: { real: 0.07, fake: 0.93 },
  model_name: 'fixture', model_version: 'test', top_features: [],
}
const unresolved: DatasetResult = { method: 'unresolved', label: null, match: null, suggestions: [], classifier: null }
const evidence = (label: 'likely_true' | 'likely_false' | 'mixed' | 'insufficient_evidence', claims = 1): EvidenceAnalysis => ({
  overall: { credibility_score: label === 'likely_true' ? 0.9 : label === 'likely_false' ? 0.1 : 0.5, label, summary: 'Tóm tắt bằng chứng.' },
  claims: Array.from({ length: claims }, () => ({ text: 'Tuyên bố', verdict: 'supported' as const, confidence: 0.8, reasoning: 'Lý do', correction: null, evidence: [] })),
  source_assessment: { domain: null, reputation: 'unknown' },
  disclaimer: '',
})

test('evidence check is skipped for dataset matches and when disabled', () => {
  const matched: DatasetResult = { ...unresolved, method: 'match', label: 'real', match: sample }
  assert.equal(shouldCheckEvidence(matched, {})?.status, 'not_needed')
  assert.equal(shouldCheckEvidence(unresolved, { EVIDENCE_CHECK: 'false' })?.status, 'disabled')
  assert.equal(shouldCheckEvidence(unresolved, {}), null)
  assert.equal(shouldCheckEvidence({ ...unresolved, method: 'prediction', label: 'fake', classifier }, {}), null)
})

test('dataset match and classifier prediction stay the primary label over web evidence', () => {
  const matched: DatasetResult = { ...unresolved, method: 'match', label: 'real', match: sample }
  assert.deepEqual(
    { label: combineResults(matched, null).label, basis: combineResults(matched, null).basis },
    { label: 'likely_true', basis: 'dataset' },
  )
  const predicted: DatasetResult = { ...unresolved, method: 'prediction', label: 'fake', classifier }
  const overall = combineResults(predicted, evidence('likely_true'))
  assert.equal(overall.label, 'likely_false')
  assert.equal(overall.basis, 'classifier')
  assert.equal(overall.credibility_score, 0.07)
})

test('web evidence decides only when the dataset layer is unresolved', () => {
  const overall = combineResults(unresolved, evidence('likely_false'))
  assert.equal(overall.label, 'likely_false')
  assert.equal(overall.basis, 'evidence')
  assert.match(overall.summary, /tham khảo/)
  assert.equal(combineResults(unresolved, evidence('insufficient_evidence', 0)).basis, 'none')
  assert.equal(combineResults(unresolved, null).label, 'insufficient_evidence')
})

test('evidence failures are reported and do not fail the analysis', async () => {
  const { ConfigurationError } = await import('./analyzer.js')
  const missingKey = await runEvidenceCheck(async () => { throw new ConfigurationError('GEMINI_API_KEY is missing') })
  assert.equal(missingKey.check.status, 'unavailable')
  assert.match(missingKey.check.message ?? '', /chưa được bật/)
  assert.doesNotMatch(missingKey.check.message ?? '', /GEMINI_API_KEY/)
  assert.equal(missingKey.evidence, null)
  const outage = await runEvidenceCheck(async () => { throw new Error('LLM returned HTTP 503') })
  assert.match(outage.check.message ?? '', /tạm thời chưa dùng được/)
  assert.doesNotMatch(outage.check.message ?? '', /503/)
  const ok = await runEvidenceCheck(async () => evidence('mixed'))
  assert.equal(ok.check.status, 'ready')
  assert.equal(ok.evidence?.overall.label, 'mixed')
})

test('LLM calls retry on overload but not on client errors', async () => {
  const { withRetry, HttpStatusError } = await import('./analyzer.js')
  const noWait = { sleep: async () => undefined }
  let calls = 0
  assert.equal(await withRetry(async () => {
    calls++
    if (calls < 3) throw new HttpStatusError(503, 'overloaded')
    return 'ok'
  }, noWait), 'ok')
  assert.equal(calls, 3)
  calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw new HttpStatusError(404, 'missing model') }, noWait), /missing model/)
  assert.equal(calls, 1)
  calls = 0
  await assert.rejects(withRetry(async () => { calls++; throw new HttpStatusError(429, 'rate limited') }, noWait), /rate limited/)
  assert.equal(calls, 3)
})
