import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateCredibility, canOfferCorrection, restrictCitations, supportsVerdict } from './analyzer.js'
import { isPrivateAddress } from './article.js'
import { analysisSchema } from './validation.js'
import { fetchClassifierSignal } from './classifier.js'
import { hashPassword, verifyPassword } from './auth.js'

test('password verification accepts the correct password and rejects incorrect or invalid hashes', async () => {
  const hash = await hashPassword('fixture-password')
  assert.notEqual(hash, 'fixture-password')
  assert.equal(await verifyPassword('fixture-password', hash), true)
  assert.equal(await verifyPassword('incorrect-password', hash), false)
  assert.equal(await verifyPassword('fixture-password', 'invalid'), false)
})

test('unverifiable claims do not create a false or true score', () => {
  assert.deepEqual(aggregateCredibility([{ verdict: 'unverifiable', confidence: 0 }]), {
    credibility_score: 0.5,
    label: 'insufficient_evidence',
  })
})

test('supported and refuted claims contribute in opposite directions', () => {
  assert.deepEqual(aggregateCredibility([
    { verdict: 'supported', confidence: 0.8 },
    { verdict: 'refuted', confidence: 0.8 },
  ]), { credibility_score: 0.5, label: 'mixed' })
})

test('a single high-confidence supported claim is likely true', () => {
  assert.deepEqual(aggregateCredibility([{ verdict: 'supported', confidence: 0.9 }]), {
    credibility_score: 0.95,
    label: 'likely_true',
  })
})

test('private and non-routable IP addresses are rejected for article URLs', () => {
  for (const address of ['127.0.0.1', '10.0.0.8', '172.20.1.2', '192.168.1.1', '::1', 'fe80::1', '2001:db8::1']) {
    assert.equal(isPrivateAddress(address), true, `${address} should not be fetched`)
  }
  assert.equal(isPrivateAddress('8.8.8.8'), false)
  assert.equal(isPrivateAddress('2606:4700:4700::1111'), false)
})

test('citations are limited to retrieved URLs and retain their stance', () => {
  const evidence = [{
    title: 'Retrieved',
    url: 'https://example.com/fact#section',
    snippet: 'Evidence',
    stance: 'context' as const,
    source_type: 'web_search' as const,
  }]
  assert.deepEqual(restrictCitations(evidence, [
    { url: 'https://example.com/fact', stance: 'refutes' },
    { url: 'https://fabricated.example/source', stance: 'supports' },
    { url: 'not a URL', stance: 'context' },
  ]), [{ ...evidence[0], stance: 'refutes' }])
})

test('verdicts require evidence with a matching stance', () => {
  const refutation = [{
    title: 'Fact check',
    url: 'https://factcheck.example/review',
    snippet: 'Refutes the claim',
    stance: 'refutes' as const,
    source_type: 'fact_check' as const,
  }]
  assert.equal(supportsVerdict('refuted', refutation), true)
  assert.equal(supportsVerdict('supported', refutation), false)
  assert.equal(supportsVerdict('mixed', refutation), false)
})

test('corrections require a refuted claim and two eligible source domains', () => {
  const evidence = [
    {
      title: 'Review one',
      url: 'https://review.example/check',
      snippet: 'Refutes the claim',
      stance: 'refutes' as const,
      source_type: 'fact_check' as const,
    },
    {
      title: 'Official record',
      url: 'https://health.gov.vn/record',
      snippet: 'Refutes the claim',
      stance: 'refutes' as const,
      source_type: 'official' as const,
    },
  ]
  assert.equal(canOfferCorrection('refuted', 'Corrected statement.', evidence), true)
  assert.equal(canOfferCorrection('supported', 'Corrected statement.', evidence), false)
  assert.equal(canOfferCorrection('refuted', '   ', evidence), false)
  assert.equal(canOfferCorrection('refuted', 'Corrected statement.', [evidence[0]]), false)
  assert.equal(canOfferCorrection('refuted', 'Corrected statement.', evidence.map((item) => ({
    ...item,
    source_type: 'web_search' as const,
  }))), false)
})

test('analysis requests accept public HTTP URLs and reject malformed or credentialed URLs', () => {
  const conversation_id = 'b401c53b-41cc-449a-8d61-52235409cb24'
  assert.equal(analysisSchema.safeParse({ type: 'url', content: 'https://example.com/article', conversation_id }).success, true)
  assert.equal(analysisSchema.safeParse({ type: 'url', content: 'file:///etc/passwd', conversation_id }).success, false)
  assert.equal(analysisSchema.safeParse({ type: 'url', content: 'not a valid url at all', conversation_id }).success, false)
  assert.equal(analysisSchema.safeParse({ type: 'url', content: 'https://user:pass@example.com/story', conversation_id }).success, false)
})

test('classifier service failures are non-fatal and valid signals are schema-checked', async () => {
  const unavailable = await fetchClassifierSignal(
    'test input that is long enough',
    'http://classifier.test',
    async () => new Response('', { status: 503 }),
  )
  assert.equal(unavailable, null)

  const failedConnection = await fetchClassifierSignal(
    'test input that is long enough',
    'http://classifier.test',
    async () => { throw new Error('offline') },
  )
  assert.equal(failedConnection, null)

  const signal = await fetchClassifierSignal(
    'test input that is long enough',
    'http://classifier.test',
    async () => Response.json({
      label: 'fake',
      confidence: 0.8,
      probabilities: { real: 0.2, fake: 0.8 },
      model_name: 'fixture',
      model_version: 'test',
      top_features: [],
    }),
  )
  assert.equal(signal?.label, 'fake')
  assert.equal(signal?.probabilities.fake, 0.8)
})
