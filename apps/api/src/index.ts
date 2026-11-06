import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import cors from 'cors'
import express, { type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { Queue, Worker } from 'bullmq'
import { z } from 'zod'
import type { RowDataPacket } from 'mysql2'
import { pool } from './db.js'
import { extractArticle } from './article.js'
import { analyzeContent } from './analyzer.js'
import { analysisSchema } from './validation.js'
import { classifierSignalSchema, fetchClassifierSignal } from './classifier.js'

const app = express()
const port = Number(process.env.PORT ?? 3000)
const progressEvents = new EventEmitter()
progressEvents.setMaxListeners(100)
const aiServiceUrl = process.env.AI_SERVICE_URL ?? 'http://localhost:8000'

const aiResultSchema = z.object({
  overall: z.object({
    credibility_score: z.number().min(0).max(1),
    label: z.enum(['likely_true', 'mixed', 'likely_false', 'insufficient_evidence']),
    summary: z.string(),
  }),
  claims: z.array(z.object({
    text: z.string(),
    verdict: z.enum(['supported', 'refuted', 'mixed', 'unverifiable']),
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    evidence: z.array(z.object({
      title: z.string(),
      url: z.string().url(),
      snippet: z.string(),
      stance: z.enum(['supports', 'refutes', 'context']),
    })),
  })),
  source_assessment: z.object({ domain: z.string().nullable(), reputation: z.string() }),
  classifier_signal: classifierSignalSchema.nullable().optional(),
  disclaimer: z.string(),
})

type AnalysisJob = { analysisId: string }
type SessionRequest = Request & { sessionId: string }

function getSessionId(request: Request): string {
  return (request as unknown as SessionRequest).sessionId
}

app.use(cors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173', exposedHeaders: ['X-Session-Id'] }))
app.use(express.json({ limit: '110kb' }))
app.use((request, response, next) => {
  const suppliedId = request.header('x-session-id') ?? request.query.sessionId
  const sessionId = typeof suppliedId === 'string' && /^[a-zA-Z0-9-]{16,128}$/.test(suppliedId)
    ? suppliedId
    : randomUUID()
  ;(request as SessionRequest).sessionId = sessionId
  response.setHeader('X-Session-Id', sessionId)
  next()
})
app.use('/api', rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_PER_MIN ?? 10),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}))

function sendProgress(analysisId: string, stage: string, message: string, progress: number) {
  progressEvents.emit(analysisId, { stage, message, progress })
}

async function processAnalysis(analysisId: string) {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT * FROM analyses WHERE id = ?', [analysisId])
    const analysis = rows[0]
    if (!analysis) return

    await pool.execute('UPDATE analyses SET status = ? WHERE id = ?', ['processing', analysisId])
    sendProgress(analysisId, 'extract', 'Đang chuẩn bị nội dung', 10)
    let content = String(analysis.input_text)
    let sourceUrl: string | null = analysis.url ? String(analysis.url) : null
    if (analysis.input_type === 'url') {
      const extracted = await extractArticle(String(analysis.url))
      content = extracted.text
      sourceUrl = extracted.url
    }

    sendProgress(analysisId, 'evidence', 'Đang tìm bằng chứng và đối chiếu tuyên bố', 35)
    const [analysisResult, styleSignal] = await Promise.all([
      analyzeContent(content, sourceUrl),
      fetchClassifierSignal(content, aiServiceUrl),
    ])
    const result = aiResultSchema.parse({ ...analysisResult, classifier_signal: styleSignal })
    sendProgress(analysisId, 'save', 'Đang lưu kết quả', 85)

    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.execute(
        'UPDATE analyses SET status = ?, overall_score = ?, label = ?, overall_summary = ?, url = ? WHERE id = ?',
        ['completed', result.overall.credibility_score, result.overall.label, result.overall.summary, sourceUrl, analysisId],
      )
      for (const claim of result.claims) {
        const claimId = randomUUID()
        await connection.execute(
          'INSERT INTO claims (id, analysis_id, text, verdict, confidence, reasoning) VALUES (?, ?, ?, ?, ?, ?)',
          [claimId, analysisId, claim.text, claim.verdict, claim.confidence, claim.reasoning],
        )
        for (const evidence of claim.evidence) {
          await connection.execute(
            'INSERT INTO evidence (id, claim_id, title, url, snippet, stance, source_domain) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [randomUUID(), claimId, evidence.title, evidence.url, evidence.snippet, evidence.stance, new URL(evidence.url).hostname],
          )
        }
      }
      if (result.classifier_signal) {
        try {
          await connection.execute(
            'INSERT INTO classifier_signals (analysis_id, label, confidence, real_probability, fake_probability, model_name, model_version, top_features) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              analysisId,
              result.classifier_signal.label,
              result.classifier_signal.confidence,
              result.classifier_signal.probabilities.real,
              result.classifier_signal.probabilities.fake,
              result.classifier_signal.model_name,
              result.classifier_signal.model_version,
              JSON.stringify(result.classifier_signal.top_features),
            ],
          )
        } catch (error) {
          console.warn('Classifier signal was not persisted:', error instanceof Error ? error.message : error)
        }
      }
      await connection.commit()
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
    sendProgress(analysisId, 'completed', 'Phân tích hoàn tất', 100)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Phân tích thất bại.'
    await pool.execute('UPDATE analyses SET status = ? WHERE id = ?', ['failed', analysisId]).catch(() => undefined)
    sendProgress(analysisId, 'failed', message, 100)
  }
}

let analysisQueue: Queue<AnalysisJob> | undefined
let analysisWorker: Worker<AnalysisJob> | undefined
if (process.env.USE_BULLMQ === 'true') {
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379')
  const connection = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: decodeURIComponent(redisUrl.username) || undefined,
    password: decodeURIComponent(redisUrl.password) || undefined,
    db: Number(redisUrl.pathname.slice(1) || 0),
    maxRetriesPerRequest: null,
    ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
  }
  analysisQueue = new Queue<AnalysisJob>('analyses', { connection })
  analysisWorker = new Worker<AnalysisJob>('analyses', (job) => processAnalysis(job.data.analysisId), { connection })
}

function dispatchAnalysis(analysisId: string) {
  if (analysisQueue) {
    void analysisQueue.add('analyze', { analysisId }, { jobId: analysisId }).catch(async () => {
      await pool.execute('UPDATE analyses SET status = ? WHERE id = ?', ['failed', analysisId]).catch(() => undefined)
      sendProgress(analysisId, 'failed', 'Không thể đưa phân tích vào hàng đợi Redis.', 100)
    })
  } else {
    void processAnalysis(analysisId)
  }
}

async function getAnalysis(analysisId: string, sessionId: string) {
  const [analysisRows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, status, overall_score, label, overall_summary, url, input_type, created_at FROM analyses WHERE id = ? AND session_id = ?',
    [analysisId, sessionId],
  )
  const analysis = analysisRows[0]
  if (!analysis) return null

  const [claimRows] = await pool.execute<RowDataPacket[]>(
    'SELECT id, text, verdict, confidence, reasoning FROM claims WHERE analysis_id = ?',
    [analysisId],
  )
  const claims = await Promise.all(claimRows.map(async (claim) => {
    const [evidenceRows] = await pool.execute<RowDataPacket[]>(
      'SELECT title, url, snippet, stance FROM evidence WHERE claim_id = ?',
      [claim.id],
    )
    return { ...claim, evidence: evidenceRows }
  }))
  let styleSignal = null
  try {
    const [signalRows] = await pool.execute<RowDataPacket[]>(
      'SELECT label, confidence, real_probability, fake_probability, model_name, model_version, top_features FROM classifier_signals WHERE analysis_id = ?',
      [analysisId],
    )
    if (signalRows[0]) {
      styleSignal = {
        label: signalRows[0].label,
        confidence: signalRows[0].confidence,
        probabilities: { real: signalRows[0].real_probability, fake: signalRows[0].fake_probability },
        model_name: signalRows[0].model_name,
        model_version: signalRows[0].model_version,
        top_features: typeof signalRows[0].top_features === 'string'
          ? JSON.parse(signalRows[0].top_features)
          : signalRows[0].top_features,
      }
    }
  } catch {
    // Older databases may not yet have the optional classifier table.
  }
  return {
    id: analysis.id,
    status: analysis.status,
    overall: analysis.overall_score === null ? null : {
      credibility_score: analysis.overall_score,
      label: analysis.label,
      summary: analysis.overall_summary,
    },
    source_url: analysis.url,
    input_type: analysis.input_type,
    created_at: analysis.created_at,
    claims,
    classifier_signal: styleSignal,
    source_assessment: { domain: analysis.url ? new URL(String(analysis.url)).hostname : null, reputation: 'unknown' },
    disclaimer: 'AI-generated, may be wrong. Verify independently.',
  }
}

app.get('/health', (_request, response) => {
  void pool.query('SELECT 1').then(() => {
    response.json({ status: 'ok', service: 'api', database: 'ok' })
  }).catch(() => {
    response.status(503).json({ status: 'degraded', service: 'api', database: 'unavailable' })
  })
})

app.post('/api/analyses', async (request, response) => {
  const parsed = analysisSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: 'Dữ liệu đầu vào không hợp lệ.', details: parsed.error.flatten() })
    return
  }

  const sessionId = getSessionId(request)
  const { type, content } = parsed.data
  const contentHash = createHash('sha256').update(`${type}:${content}`).digest('hex')
  try {
    const [cachedRows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM analyses WHERE session_id = ? AND content_hash = ? AND status = ? LIMIT 1',
      [sessionId, contentHash, 'completed'],
    )
    if (cachedRows[0]) {
      response.json({ id: cachedRows[0].id, status: 'completed', cached: true })
      return
    }
    const analysisId = randomUUID()
    await pool.execute(
      'INSERT INTO analyses (id, session_id, input_type, input_text, url, content_hash, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [analysisId, sessionId, type, type === 'text' ? content : '', type === 'url' ? content : null, contentHash, 'pending'],
    )
    response.status(202).json({ id: analysisId, status: 'pending' })
    dispatchAnalysis(analysisId)
  } catch {
    response.status(503).json({ error: 'Cơ sở dữ liệu chưa sẵn sàng. Kiểm tra DATABASE_URL và MySQL.' })
  }
})

app.get('/api/analyses', async (request, response) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, status, overall_score, label, input_type, url, created_at FROM analyses WHERE session_id = ? ORDER BY created_at DESC LIMIT 50',
      [(request as SessionRequest).sessionId],
    )
    response.json({ analyses: rows })
  } catch {
    response.status(503).json({ error: 'Không thể tải lịch sử khi cơ sở dữ liệu chưa sẵn sàng.' })
  }
})

app.get('/api/analyses/:id', async (request, response) => {
  try {
    const result = await getAnalysis(request.params.id, getSessionId(request))
    if (!result) {
      response.status(404).json({ error: 'Không tìm thấy phân tích.' })
      return
    }
    response.json(result)
  } catch {
    response.status(503).json({ error: 'Không thể tải kết quả.' })
  }
})

app.get('/api/analyses/:id/stream', async (request, response) => {
  const sessionId = getSessionId(request)
  let rows: RowDataPacket[]
  try {
    ;[rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id, status FROM analyses WHERE id = ? AND session_id = ?',
      [request.params.id, sessionId],
    )
  } catch {
    response.status(503).end()
    return
  }
  if (!rows[0]) {
    response.status(404).end()
    return
  }

  response.setHeader('Content-Type', 'text/event-stream')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('Connection', 'keep-alive')
  response.flushHeaders()
  const analysisId = request.params.id
  const send = (event: string, payload: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
  const onProgress = (payload: { stage?: string; progress?: number }) => {
    send('progress', payload)
    if (payload.progress === 100) {
      if (payload.stage === 'completed') send('complete', { id: analysisId })
      if (payload.stage === 'failed') send('analysis-error', payload)
      response.end()
    }
  }
  progressEvents.on(analysisId, onProgress)
  send('progress', { stage: rows[0].status, message: 'Đang chờ cập nhật', progress: 0 })
  if (['completed', 'failed'].includes(String(rows[0].status))) {
    onProgress({ stage: String(rows[0].status), progress: 100 })
  }
  const heartbeat = setInterval(() => {
    response.write(': keep-alive\n\n')
    void pool.execute<RowDataPacket[]>(
      'SELECT status FROM analyses WHERE id = ? AND session_id = ?',
      [analysisId, sessionId],
    ).then(([currentRows]) => {
      const status = String(currentRows[0]?.status ?? '')
      if (status === 'completed' || status === 'failed') onProgress({ stage: status, progress: 100 })
    }).catch(() => undefined)
  }, 5_000)
  response.on('close', () => {
    clearInterval(heartbeat)
    progressEvents.off(analysisId, onProgress)
  })
})

app.post('/api/analyses/:id/feedback', async (request, response) => {
  const parsed = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().max(2000).optional() }).safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({ error: 'Đánh giá phải từ 1 đến 5.' })
    return
  }
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM analyses WHERE id = ? AND session_id = ?',
      [request.params.id, getSessionId(request)],
    )
    if (!rows[0]) {
      response.status(404).json({ error: 'Không tìm thấy phân tích.' })
      return
    }
    await pool.execute(
      'INSERT INTO feedback (id, analysis_id, rating, comment) VALUES (?, ?, ?, ?)',
      [randomUUID(), request.params.id, parsed.data.rating, parsed.data.comment ?? null],
    )
    response.status(201).json({ status: 'received' })
  } catch {
    response.status(503).json({ error: 'Không thể lưu đánh giá.' })
  }
})

app.use((error: unknown, _request: Request, response: Response, _next: (error?: unknown) => void) => {
  response.status(400).json({ error: error instanceof Error ? error.message : 'Lỗi máy chủ.' })
})

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
  if (analysisWorker) console.log('BullMQ analysis worker enabled')
})

process.on('SIGTERM', () => {
  void analysisQueue?.close()
  void analysisWorker?.close()
  void pool.end()
})
