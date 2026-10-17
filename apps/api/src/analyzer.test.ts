import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateCredibility, restrictCitations } from './analyzer.js'
import { isPrivateAddress } from './article.js'

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
  const evidence = [{ title: 'Retrieved', url: 'https://example.com/fact#section', snippet: 'Evidence', stance: 'context' as const }]
  assert.deepEqual(restrictCitations(evidence, [
    { url: 'https://example.com/fact', stance: 'refutes' },
    { url: 'https://fabricated.example/source', stance: 'supports' },
    { url: 'not a URL', stance: 'context' },
  ]), [{ ...evidence[0], stance: 'refutes' }])
})
