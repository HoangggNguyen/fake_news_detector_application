import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { analyze } from '../api/client'
import type { AnalysisInput, ViewResult } from '../api/contract'
import { isAbort } from '../api/errors'

export type AnalysisStatus = 'idle' | 'pending' | 'success' | 'error'

/**
 * Quản lý một lượt phân tích:
 * - gửi yêu cầu mới thì tự huỷ yêu cầu cũ (tránh kết quả cũ ghi đè kết quả mới);
 * - rời trang thì huỷ yêu cầu đang chạy;
 * - huỷ chủ động thì quay về trạng thái ban đầu, không hiện như lỗi.
 */
export function useAnalysis(onSuccess?: (result: ViewResult) => void) {
  const controllerRef = useRef<AbortController | null>(null)
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  const mutation = useMutation<ViewResult, Error, AnalysisInput>({
    mutationFn: (input) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      return analyze(input, controller.signal)
    },
    retry: false,
    onSuccess: (result) => onSuccessRef.current?.(result),
  })

  useEffect(() => () => controllerRef.current?.abort(), [])

  // mutate/reset của TanStack Query ổn định giữa các lần render.
  const { mutate, reset: resetMutation } = mutation
  const submit = useCallback((input: AnalysisInput) => mutate(input), [mutate])

  /** Huỷ yêu cầu đang chạy hoặc xoá kết quả, quay về trạng thái ban đầu. */
  const reset = useCallback(() => {
    controllerRef.current?.abort()
    controllerRef.current = null
    resetMutation()
  }, [resetMutation])

  // Đồng hồ đếm thời gian chờ, chỉ chạy khi đang xử lý.
  const [elapsedMs, setElapsedMs] = useState(0)
  useEffect(() => {
    if (!mutation.isPending) return
    const startedAt = Date.now()
    setElapsedMs(0)
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 250)
    return () => clearInterval(timer)
  }, [mutation.isPending, mutation.submittedAt])

  const aborted = mutation.isError && isAbort(mutation.error)
  const status: AnalysisStatus = aborted ? 'idle' : mutation.status

  return {
    status,
    result: mutation.data ?? null,
    error: status === 'error' ? mutation.error : null,
    lastInput: mutation.variables ?? null,
    elapsedMs,
    submit,
    cancel: reset,
    reset,
  }
}
