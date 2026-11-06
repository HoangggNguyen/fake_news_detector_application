import { dateTime, excerpt, LABEL_TEXT, percent } from '../lib/format'
import type { HistoryEntry } from '../lib/history'

interface Props {
  entries: HistoryEntry[]
  disabled: boolean
  onSelect: (entry: HistoryEntry) => void
  onClear: () => void
}

export function HistoryList({ entries, disabled, onSelect, onClear }: Props) {
  if (entries.length === 0) return null

  return (
    <section className="history" aria-labelledby="history-title">
      <div className="history-head">
        <h2 id="history-title" className="form-label">
          ĐÃ KIỂM TRA GẦN ĐÂY
        </h2>
        <button type="button" className="link-button" onClick={onClear}>
          Xoá lịch sử
        </button>
      </div>
      <ul>
        {entries.map((entry) => {
          const label = LABEL_TEXT[entry.label] ?? LABEL_TEXT.insufficient_evidence
          const score =
            entry.fakeProbability !== null
              ? `${percent(entry.fakeProbability)} giả`
              : entry.credibilityScore !== null
                ? `${Math.round(entry.credibilityScore * 100)}/100`
                : ''
          return (
            <li key={entry.id}>
              <button type="button" onClick={() => onSelect(entry)} disabled={disabled} title="Đưa nội dung này vào ô nhập">
                <span className={`badge tone-${label.tone}`}>{label.short}</span>
                <span className="history-text">{excerpt(entry.input.content)}</span>
                <span className="history-meta">
                  {score}
                  {score && ' · '}
                  {dateTime(entry.createdAt)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="history-note">Lịch sử chỉ lưu trên trình duyệt này.</p>
    </section>
  )
}
