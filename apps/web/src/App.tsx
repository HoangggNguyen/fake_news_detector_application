import { useEffect, useState } from 'react'
import type { AnalysisResult } from '@fake-news/shared'

type InputMode = 'text' | 'url'
type PageView = 'compose' | 'progress' | 'result' | 'history'
type ProgressUpdate = { stage: string; message: string; progress: number }
type HistoryItem = {
  id: string
  status: string
  overall_score: number | null
  label: string | null
  input_type: InputMode
  url: string | null
  created_at: string
}

const verdictLabels: Record<string, string> = {
  supported: 'Có bằng chứng ủng hộ',
  refuted: 'Có bằng chứng phản bác',
  mixed: 'Bằng chứng trái chiều',
  unverifiable: 'Chưa đủ bằng chứng',
}

const resultLabels: Record<string, string> = {
  likely_true: 'Nghiêng về được hỗ trợ',
  mixed: 'Bằng chứng trái chiều',
  likely_false: 'Nghiêng về bị phản bác',
  insufficient_evidence: 'Chưa đủ bằng chứng',
}

function getBrowserSessionId(): string {
  const existing = window.localStorage.getItem('newsroom-session-id')
  if (existing) return existing
  const created = window.crypto.randomUUID()
  window.localStorage.setItem('newsroom-session-id', created)
  return created
}

export default function App() {
  const [mode, setMode] = useState<InputMode>('text')
  const [view, setView] = useState<PageView>('compose')
  const [sessionId] = useState(getBrowserSessionId)
  const [content, setContent] = useState('')
  const [submittedContent, setSubmittedContent] = useState('')
  const [analysisId, setAnalysisId] = useState('')
  const [progress, setProgress] = useState<ProgressUpdate>({ stage: 'pending', message: 'Đang chờ xử lý', progress: 0 })
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function loadResult(id: string) {
    const response = await fetch(`/api/analyses/${id}`, { headers: { 'X-Session-Id': sessionId } })
    const body = await response.json() as AnalysisResult & { error?: string }
    if (!response.ok) throw new Error(body.error ?? 'Không tải được kết quả.')
    setResult(body)
    setAnalysisId(id)
    setView('result')
  }

  useEffect(() => {
    if (view !== 'progress' || !analysisId) return
    const stream = new EventSource(`/api/analyses/${analysisId}/stream?sessionId=${encodeURIComponent(sessionId)}`)
    stream.addEventListener('progress', (event) => {
      setProgress(JSON.parse((event as MessageEvent<string>).data) as ProgressUpdate)
    })
    stream.addEventListener('complete', () => {
      stream.close()
      void loadResult(analysisId).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Không tải được kết quả.'))
    })
    stream.addEventListener('analysis-error', (event) => {
      stream.close()
      const detail = JSON.parse((event as MessageEvent<string>).data) as { message?: string }
      setError(detail.message ?? 'Phân tích thất bại.')
    })
    return () => stream.close()
  }, [analysisId, sessionId, view])

  async function submitAnalysis(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submitted = content.trim()
    setBusy(true)
    setError('')
    setResult(null)
    setFeedbackSent(false)
    try {
      const response = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Session-Id': sessionId },
        body: JSON.stringify({ type: mode, content: submitted }),
      })
      const body = await response.json() as { id?: string; status?: string; error?: string }
      if (!response.ok || !body.id) throw new Error(body.error ?? 'Không tạo được yêu cầu phân tích.')
      setSubmittedContent(submitted)
      setContent('')
      setAnalysisId(body.id)
      if (body.status === 'completed') {
        await loadResult(body.id)
      } else {
        setProgress({ stage: 'pending', message: 'Đã nhận nội dung, đang xếp lịch phân tích', progress: 2 })
        setView('progress')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không kết nối được API.')
    } finally {
      setBusy(false)
    }
  }

  async function showHistory() {
    setError('')
    setView('history')
    try {
      const response = await fetch('/api/analyses', { headers: { 'X-Session-Id': sessionId } })
      const body = await response.json() as { analyses?: HistoryItem[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Không tải được lịch sử.')
      setHistory(body.analyses ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được lịch sử.')
    }
  }

  async function sendFeedback(rating: number) {
    if (!analysisId) return
    const response = await fetch(`/api/analyses/${analysisId}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Session-Id': sessionId },
      body: JSON.stringify({ rating }),
    })
    if (response.ok) setFeedbackSent(true)
    else setError('Chưa lưu được đánh giá.')
  }

  return (
    <main className={`page-shell ${sidebarOpen ? 'sidebar-visible' : ''}`}>
      <aside className="sidebar">
        <a className="wordmark" href="/" aria-label="Newsroom, trang chủ">
          <span className="wordmark-mark">N.</span><span>NEWSROOM <i>/ LAB</i></span>
        </a>
        <button className="new-chat-button" type="button" onClick={() => { setView('compose'); setResult(null); setContent(''); setError(''); setSidebarOpen(false) }}>
          <span aria-hidden="true">+</span> Cuộc trò chuyện mới
        </button>
        <button className={`sidebar-link ${view === 'history' ? 'sidebar-link-active' : ''}`} type="button" onClick={() => { void showHistory(); setSidebarOpen(false) }}>
          <span aria-hidden="true">◷</span> Lịch sử
        </button>
        <p className="sidebar-section-label">GẦN ĐÂY</p>
        <div className="sidebar-history">
          {history.slice(0, 8).map((item) => <button type="button" key={item.id} onClick={() => {
            setSidebarOpen(false)
            void loadResult(item.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Không tải được kết quả.'))
          }}>
            <span>{item.input_type === 'url' ? item.url : 'Phân tích văn bản'}</span>
            <small>{item.status === 'completed' && item.overall_score !== null ? `${Math.round(item.overall_score * 100)} / 100` : item.status}</small>
          </button>)}
          {history.length === 0 && <p>Chưa có cuộc trò chuyện</p>}
        </div>
        <p className="sidebar-bottom">AI có thể sai. Luôn mở và kiểm tra nguồn gốc.</p>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Đóng thanh điều hướng" onClick={() => setSidebarOpen(false)} />}
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-expanded={sidebarOpen}>☰</button>
        <span className="topbar-title">{view === 'history' ? 'Lịch sử phân tích' : 'Không gian kiểm chứng'}</span>
        <nav className="topbar-actions" aria-label="Điều hướng chính">
          <button type="button" onClick={() => { setView('compose'); setError('') }}>Phân tích mới</button>
          <button type="button" onClick={() => void showHistory()}>Lịch sử</button>
        </nav>
      </header>

      <section className="workspace" aria-labelledby="page-title">
        {view === 'compose' && <>
          <div className="intro welcome-block">
            <p className="eyebrow">NEWSROOM / LAB</p>
            <h1 id="page-title">Mình cùng<br /><em>kiểm chứng nhé.</em></h1>
            <p className="intro-copy">Gửi một đoạn tin hoặc đường dẫn. Mình sẽ lần theo từng tuyên bố và nguồn bằng chứng.</p>
          </div>
          <form className="analysis-form" onSubmit={(event) => void submitAnalysis(event)}>
            <div className="form-topline">
              <span className="form-label">BẮT ĐẦU PHÂN TÍCH</span>
              <div className="mode-switch" role="group" aria-label="Loại đầu vào">
                <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Văn bản</button>
                <button type="button" aria-pressed={mode === 'url'} onClick={() => setMode('url')}>Đường dẫn</button>
              </div>
            </div>
            {mode === 'text' ? (
              <textarea aria-label="Nội dung cần kiểm chứng" placeholder="Dán bài viết hoặc thông tin bạn muốn kiểm chứng..." rows={3} maxLength={100_000} required value={content} onChange={(event) => setContent(event.target.value)} />
            ) : (
              <input aria-label="Đường dẫn bài viết" type="url" placeholder="https://example.com/bai-viet" required value={content} onChange={(event) => setContent(event.target.value)} />
            )}
            <div className="form-footer">
              <span>{mode === 'text' ? `${content.length.toLocaleString('vi-VN')} / 100.000 ký tự` : 'Chỉ hỗ trợ bài viết HTTP(S) công khai'}</span>
              <button className="submit-button" type="submit" disabled={busy || content.trim().length < 10}>
                {busy ? 'Đang gửi...' : 'Phân tích'} <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
          <div className="workflow" aria-label="Quy trình phân tích">
            <div><span>01</span><p>Tách tuyên bố</p></div><b aria-hidden="true">/</b>
            <div><span>02</span><p>Tìm bằng chứng</p></div><b aria-hidden="true">/</b>
            <div><span>03</span><p>Đọc kết quả</p></div>
          </div>
        </>}

        {view === 'progress' && <section className="state-panel chat-transcript" aria-live="polite">
          <article className="chat-message user-message"><span className="message-avatar user-avatar">Bạn</span><div className="message-body"><p>{submittedContent}</p></div></article>
          <article className="chat-message assistant-message"><span className="message-avatar assistant-avatar">N.</span><div className="message-body">
            <p className="message-kicker">ĐANG KIỂM CHỨNG · {progress.progress}%</p><p>{progress.message}</p>
            <progress className="progress-bar" max="100" value={progress.progress} />
            <div className="progress-meta"><span>{progress.stage}</span><span>{progress.progress}%</span></div>
            {error && <p className="error-message" role="alert">{error}</p>}
          </div></article>
        </section>}

        {view === 'result' && result && <section className="result-view chat-transcript" aria-labelledby="page-title">
          <article className="chat-message user-message"><span className="message-avatar user-avatar">Bạn</span><div className="message-body"><p>{submittedContent || 'Nội dung đã gửi để phân tích'}</p></div></article>
          <article className="chat-message assistant-message"><span className="message-avatar assistant-avatar">N.</span><div className="message-body result-message-body">
          <div className="result-heading">
            <div><p className="eyebrow">KẾT QUẢ PHÂN TÍCH</p><h1 id="page-title">Đánh giá<br /><em>có căn cứ.</em></h1></div>
            <div className="score-block"><strong>{Math.round(result.overall.credibility_score * 100)}</strong><span>/ 100</span><progress max="1" value={result.overall.credibility_score} /></div>
          </div>
          <p className="result-label">{resultLabels[result.overall.label] ?? result.overall.label}</p>
          <p className="result-summary">{result.overall.summary}</p>
          {result.source_assessment.domain && <p className="source-assessment">Nguồn bài viết: <strong>{result.source_assessment.domain}</strong> · Uy tín: {result.source_assessment.reputation}</p>}
          <div className="claims-list">
            {result.claims.map((claim, index) => <article className="claim-item" key={`${claim.text}-${index}`}>
              <div className="claim-heading"><span className="claim-index">{String(index + 1).padStart(2, '0')}</span><span className={`verdict verdict-${claim.verdict}`}>{verdictLabels[claim.verdict] ?? claim.verdict}</span></div>
              <h2>{claim.text}</h2>
              <p>{claim.reasoning}</p>
              <span className="confidence">Độ tin cậy đánh giá {Math.round(claim.confidence * 100)}%</span>
              {claim.evidence.length > 0 && <ul className="evidence-list">{claim.evidence.map((evidence) => <li key={evidence.url}>
                <a href={evidence.url} target="_blank" rel="noreferrer">{evidence.title} <span aria-hidden="true">↗</span></a>
                <p>{evidence.snippet}</p>
              </li>)}</ul>}
            </article>)}
          </div>
          <div className="disclaimer">{result.disclaimer}</div>
          <div className="feedback-row">
            <span>{feedbackSent ? 'Cảm ơn bạn đã phản hồi.' : 'Kết quả này hữu ích không?'}</span>
            {!feedbackSent && <div>{[1, 2, 3, 4, 5].map((rating) => <button type="button" key={rating} onClick={() => void sendFeedback(rating)} aria-label={`Đánh giá ${rating} trên 5`}>{rating}</button>)}</div>}
          </div>
          </div></article>
        </section>}

        {view === 'history' && <section className="history-view" aria-labelledby="page-title">
          <p className="eyebrow">PHIÊN TRÌNH DUYỆT NÀY</p><h1 id="page-title">Lịch sử<br /><em>kiểm chứng.</em></h1>
          {history.length ? <ul className="history-list">{history.map((item) => <li key={item.id}>
            <button type="button" onClick={() => void loadResult(item.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Không tải được kết quả.'))}>
              <span className="history-type">{item.input_type === 'url' ? item.url : 'Văn bản'}</span>
              <span>{item.status === 'completed' && item.overall_score !== null ? `${Math.round(item.overall_score * 100)} / 100` : item.status}</span>
              <time>{new Date(item.created_at).toLocaleString('vi-VN')}</time>
            </button>
          </li>)}</ul> : <p className="intro-copy">Chưa có phân tích nào trong phiên trình duyệt này.</p>}
        </section>}

        {error && view !== 'progress' && <p className="error-message" role="alert">{error}</p>}
      </section>

      <footer className="site-footer">
        <span>NEWSROOM / LAB</span>
        <span>AI có thể sai. Hãy kiểm tra nguồn độc lập.</span>
      </footer>
    </main>
  )
}
