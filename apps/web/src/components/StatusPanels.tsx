import { isRetryable, toUserMessage } from '../api/errors'
import { config } from '../config'
import { COPY } from '../content'
import { seconds } from '../lib/format'

/** Trạng thái đang xử lý. Không giả lập % tiến độ vì backend không báo tiến độ thật. */
export function LoadingPanel({ elapsedMs, onCancel }: { elapsedMs: number; onCancel: () => void }) {
  const steps = COPY[config.mode].steps
  const slow = elapsedMs > (config.mode === 'pipeline' ? 30_000 : 10_000)

  return (
    <section className="panel loading-panel" aria-live="polite" aria-label="Đang phân tích">
      <div className="loading-head">
        <span className="spinner" aria-hidden="true" />
        <div>
          <p className="panel-title">Đang phân tích nội dung…</p>
          <p className="panel-sub">Đã chờ {seconds(elapsedMs)}</p>
        </div>
      </div>
      <ol className="loading-steps">
        {steps.map((step, index) => (
          <li key={step} style={{ animationDelay: `${index * 0.35}s` }}>
            <span>0{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
      {slow && (
        <p className="panel-note">
          Lâu hơn bình thường một chút.{' '}
          <button type="button" className="link-button" onClick={onCancel}>
            Huỷ yêu cầu
          </button>
        </p>
      )}
    </section>
  )
}

export function ErrorPanel({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <section className="panel error-panel" role="alert">
      <p className="panel-title">Không thể phân tích</p>
      <p className="panel-sub">{toUserMessage(error)}</p>
      {isRetryable(error) && (
        <button type="button" className="ghost-button" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </section>
  )
}
