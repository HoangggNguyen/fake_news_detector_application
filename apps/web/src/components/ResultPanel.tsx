import { useEffect, useRef, useState } from 'react'
import type { ClaimResult, ViewResult } from '../api/contract'
import { certainty, excerpt, LABEL_TEXT, percent, seconds, VERDICT_TEXT } from '../lib/format'
import { safeExternalUrl } from '../lib/validation'

interface Props {
  result: ViewResult
  onCheckAnother: () => void
  onEdit: () => void
}

export function ResultPanel({ result, onCheckAnother, onEdit }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [showInput, setShowInput] = useState(false)
  const label = LABEL_TEXT[result.label]

  // Đưa người dùng (và trình đọc màn hình) tới kết quả ngay khi có.
  useEffect(() => {
    headingRef.current?.focus()
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [result.id])

  return (
    <section className={`panel result-panel tone-${label.tone}`} aria-labelledby="result-title" aria-live="polite">
      <p className="form-label">KẾT QUẢ PHÂN TÍCH</p>
      <h2 id="result-title" ref={headingRef} tabIndex={-1}>
        {label.title}
      </h2>

      {result.fakeProbability !== null && <FakeProbability value={result.fakeProbability} />}
      {result.credibilityScore !== null && <CredibilityScore value={result.credibilityScore} />}

      {result.summary && <p className="result-summary">{result.summary}</p>}

      {result.claims.length > 0 && <ClaimList claims={result.claims} />}

      <dl className="result-meta">
        {result.modelName && (
          <div>
            <dt>Mô hình</dt>
            <dd>{result.modelName}</dd>
          </div>
        )}
        {result.sourceDomain && (
          <div>
            <dt>Nguồn</dt>
            <dd>
              {result.sourceDomain}
              {result.sourceReputation ? ` · uy tín: ${result.sourceReputation}` : ''}
            </dd>
          </div>
        )}
        <div>
          <dt>Thời gian xử lý</dt>
          <dd>{seconds(result.elapsedMs)}</dd>
        </div>
        <div>
          <dt>Đầu vào</dt>
          <dd>
            {result.input.type === 'url' ? 'Đường dẫn' : `${result.input.content.length.toLocaleString('vi-VN')} ký tự`}{' '}
            <button type="button" className="link-button" aria-expanded={showInput} onClick={() => setShowInput((v) => !v)}>
              {showInput ? 'Ẩn' : 'Xem lại'}
            </button>
          </dd>
        </div>
      </dl>
      {showInput && <blockquote className="input-preview">{result.input.content}</blockquote>}

      <p className="disclaimer" role="note">
        <strong>Lưu ý:</strong> {result.disclaimer}
      </p>

      <div className="result-actions">
        <button type="button" className="ghost-button" onClick={onEdit}>
          Sửa nội dung
        </button>
        <button type="button" className="submit-button" onClick={onCheckAnother}>
          Kiểm tra tin khác <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}

function FakeProbability({ value }: { value: number }) {
  const { level, note } = certainty(value)
  return (
    <div className="meter-block">
      <div className="meter-head">
        <span>Xác suất là tin giả</span>
        <strong>{percent(value)}</strong>
      </div>
      <div
        className="meter fake"
        role="meter"
        aria-label="Xác suất là tin giả"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-valuetext={percent(value)}
      >
        <span className="meter-rest" style={{ width: percent(1 - value) }} />
        <span className="meter-threshold" aria-hidden="true" />
      </div>
      <div className="meter-scale" aria-hidden="true">
        <span>Thật</span>
        <span>Ngưỡng 50%</span>
        <span>Giả</span>
      </div>
      <p className="certainty">
        Độ chắc chắn: <b>{level}</b>. {note}
      </p>
    </div>
  )
}

function CredibilityScore({ value }: { value: number }) {
  return (
    <div className="meter-block">
      <div className="meter-head">
        <span>Điểm tin cậy</span>
        <strong>{Math.round(value * 100)}/100</strong>
      </div>
      <div
        className="meter credibility"
        role="meter"
        aria-label="Điểm tin cậy"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
      >
        <span className="meter-rest" style={{ width: percent(1 - value) }} />
      </div>
      <div className="meter-scale" aria-hidden="true">
        <span>Không đáng tin</span>
        <span>Đáng tin</span>
      </div>
    </div>
  )
}

function ClaimList({ claims }: { claims: ClaimResult[] }) {
  return (
    <div className="claims">
      <p className="form-label">CÁC TUYÊN BỐ ({claims.length})</p>
      <ol>
        {claims.map((claim, index) => {
          const verdict = VERDICT_TEXT[claim.verdict]
          return (
            <li key={`${index}-${claim.text}`} className="claim">
              <div className="claim-head">
                <q>{excerpt(claim.text, 220)}</q>
                <span className={`badge tone-${verdict.tone}`}>{verdict.text}</span>
              </div>
              {claim.reasoning && <p className="claim-reason">{claim.reasoning}</p>}
              {claim.evidence.length > 0 && (
                <ul className="evidence">
                  {claim.evidence.map((item, i) => {
                    const href = safeExternalUrl(item.url)
                    return (
                      <li key={`${i}-${item.url}`}>
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer">
                            {item.title}
                          </a>
                        ) : (
                          <span>{item.title}</span>
                        )}
                        {item.snippet && <span className="evidence-snippet"> · {excerpt(item.snippet, 160)}</span>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
