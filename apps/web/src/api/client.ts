/**
 * Gọi backend. Mọi yêu cầu đều có giới hạn thời gian, có thể huỷ,
 * và mọi lỗi đều được quy về ApiError để giao diện xử lý thống nhất.
 */

import { config } from '../config'
import { fromAnalysisResult, fromPredictResponse, readPipelineStatus } from './adapter'
import type { AnalysisInput, PredictRequest, ViewResult } from './contract'
import { ApiError } from './errors'
import { mockAnalyze } from './mock'

const POLL_INTERVAL_MS = 1_500

interface Deadline {
  signal: AbortSignal
  timedOut: () => boolean
  dispose: () => void
}

/** Gộp tín hiệu huỷ của người dùng với bộ hẹn giờ timeout (không phụ thuộc AbortSignal.any). */
function createDeadline(parent: AbortSignal | undefined, timeoutMs: number): Deadline {
  const controller = new AbortController()
  let expired = false

  const onParentAbort = () => controller.abort(parent?.reason)
  if (parent?.aborted) controller.abort(parent.reason)
  else parent?.addEventListener('abort', onParentAbort, { once: true })

  const timer = setTimeout(() => {
    expired = true
    controller.abort(new DOMException('Timeout', 'TimeoutError'))
  }, timeoutMs)

  return {
    signal: controller.signal,
    timedOut: () => expired,
    dispose: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onParentAbort)
    },
  }
}

function abortError(deadline: Deadline, cause?: unknown): ApiError {
  return deadline.timedOut()
    ? new ApiError('timeout', 'Quá thời gian chờ', { cause })
    : new ApiError('aborted', 'Đã huỷ', { cause })
}

function sleep(ms: number, deadline: Deadline): Promise<void> {
  return new Promise((resolve, reject) => {
    if (deadline.signal.aborted) return reject(abortError(deadline))
    const timer = setTimeout(() => {
      deadline.signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError(deadline))
    }
    deadline.signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Lấy thông điệp lỗi từ body (FastAPI: detail, Express: message/error). */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null) {
      const record = body as Record<string, unknown>
      for (const key of ['detail', 'message', 'error']) {
        const value = record[key]
        if (typeof value === 'string' && value.trim()) return value.trim()
      }
    }
  } catch {
    // body không phải JSON: dùng thông điệp mặc định
  }
  return ''
}

async function requestJson(path: string, init: RequestInit, deadline: Deadline): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${config.apiBase}${path}`, {
      ...init,
      signal: deadline.signal,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch (cause) {
    if (deadline.signal.aborted) throw abortError(deadline, cause)
    throw new ApiError('network', 'Không kết nối được tới máy chủ', { cause })
  }

  if (!response.ok) {
    const message = await readErrorMessage(response)
    const { status } = response
    if (status === 429) throw new ApiError('rate_limit', message, { status })
    if (status === 400 || status === 413 || status === 422) throw new ApiError('invalid_input', message, { status })
    throw new ApiError('server', message || `HTTP ${status}`, { status })
  }

  try {
    return await response.json()
  } catch (cause) {
    if (deadline.signal.aborted) throw abortError(deadline, cause)
    throw new ApiError('bad_response', 'Phản hồi không phải JSON', { cause })
  }
}

async function analyzeWithClassifier(input: AnalysisInput, deadline: Deadline, startedAt: number) {
  const body: PredictRequest = { text: input.content }
  const raw = await requestJson('/predict', { method: 'POST', body: JSON.stringify(body) }, deadline)
  return fromPredictResponse(raw, { input, elapsedMs: performance.now() - startedAt })
}

async function analyzeWithPipeline(input: AnalysisInput, deadline: Deadline, startedAt: number) {
  let raw = await requestJson('/analyses', { method: 'POST', body: JSON.stringify(input) }, deadline)
  let { id, status } = readPipelineStatus(raw)

  // Phân tích dài chạy bất đồng bộ: hỏi lại định kỳ cho tới khi xong hoặc hết hạn.
  while (status === 'pending' || status === 'processing') {
    await sleep(POLL_INTERVAL_MS, deadline)
    raw = await requestJson(`/analyses/${encodeURIComponent(id)}`, { method: 'GET' }, deadline)
    ;({ id, status } = readPipelineStatus(raw))
  }

  if (status === 'failed') throw new ApiError('analysis_failed', 'Phân tích thất bại')
  return fromAnalysisResult(raw, { input, elapsedMs: performance.now() - startedAt })
}

/** Điểm vào duy nhất cho giao diện. */
export async function analyze(input: AnalysisInput, signal?: AbortSignal): Promise<ViewResult> {
  const deadline = createDeadline(signal, config.requestTimeoutMs)
  const startedAt = performance.now()
  try {
    if (config.useMock) return await mockAnalyze(input, deadline.signal, startedAt, deadline.timedOut)
    return config.mode === 'pipeline'
      ? await analyzeWithPipeline(input, deadline, startedAt)
      : await analyzeWithClassifier(input, deadline, startedAt)
  } finally {
    deadline.dispose()
  }
}
