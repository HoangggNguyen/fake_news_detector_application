import { useEffect, useState } from 'react'
import type { AnalysisResult, DatasetSample } from '@fake-news/shared'

type InputMode = 'text' | 'url'
type PageView = 'compose' | 'progress' | 'result' | 'history'
type ProgressUpdate = { stage: string; message: string; progress: number }
type Conversation = {
  id: string
  title: string
  created_at: string
  updated_at: string
}
type User = { id: string; username: string }
type ConversationAnalysis = AnalysisResult & { input_content: string; input_type: InputMode }

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

const evidenceTypeLabels: Record<string, string> = {
  fact_check: 'Nguồn kiểm chứng thông tin',
  official: 'Tên miền cơ quan / giáo dục',
  trusted_press: 'Báo được ưu tiên đối chiếu',
  web_search: 'Nguồn tìm kiếm trên web',
  encyclopedia: 'Bách khoa tham khảo',
}

function displayTitle(title: string): string {
  return title.replace(/\s*\((?:Mẫu|Cập nhật đợt|Cảnh báo mẫu)\s*#\d+\)\s*$/i, '').trim()
}

/** Rút gọn văn bản dài (bài báo dán vào) để không chiếm hết màn hình, có nút xem thêm. */
function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 420
  return <>
    <p className={long && !open ? 'clamped-text' : undefined}>{text}</p>
    {long && <button type="button" className="text-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      {open ? 'Thu gọn' : 'Xem thêm'}
    </button>}
  </>
}

function SampleContent({ sample }: { sample: DatasetSample }) {
  const sourceUrl = sample.source_url
  const safeUrl = sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null
  return <>
    {!safeUrl && <p>Nội dung và nguồn do dữ liệu cung cấp, chưa được kiểm chứng.</p>}
    <ExpandableText text={sample.text} />
    <p>Nguồn: {safeUrl
      ? <a href={safeUrl} target="_blank" rel="noopener noreferrer">{sample.source} ↗</a>
      : <>{sample.source} (chưa xác minh)</>}</p>
  </>
}

function ClaimsList({ claims }: { claims: AnalysisResult['claims'] }) {
  return <div className="claims-list">
    {claims.map((claim, index) => <article className="claim-item" key={`${claim.text}-${index}`}>
      <div className="claim-heading"><span className="claim-index">{String(index + 1).padStart(2, '0')}</span><span className={`verdict verdict-${claim.verdict}`}>{verdictLabels[claim.verdict] ?? claim.verdict}</span></div>
      <h2>{claim.text}</h2>
      <p>{claim.reasoning}</p>
      {claim.verdict === 'refuted' && claim.correction && <aside className="correction-panel" aria-label="Thông tin đã chỉnh sửa theo nguồn">
        <strong>Thông tin này có thể chưa chính xác. Có phải bạn muốn hỏi:</strong>
        <p>{claim.correction}</p>
      </aside>}
      {claim.verdict === 'refuted' && !claim.correction && <p>Chưa đủ nguồn phù hợp để đề xuất thông tin đã chỉnh sửa.</p>}
      {claim.evidence.length > 0 && <ul className="evidence-list">{claim.evidence.map((evidence) => <li key={evidence.url}>
        <a href={evidence.url} target="_blank" rel="noreferrer">{evidence.title} <span aria-hidden="true">↗</span></a>
        <span className="evidence-type">{evidenceTypeLabels[evidence.source_type] ?? 'Nguồn tham khảo'}</span>
        <p>{evidence.snippet}</p>
      </li>)}</ul>}
    </article>)}
  </div>
}

function EvidenceSection({ result }: { result: AnalysisResult }) {
  const check = result.dataset_result?.evidence_check
  if (!check || check.status === 'not_needed') return null
  return <section className="evidence-section" aria-label="Đối chiếu bằng chứng web">
    <p className="message-kicker">ĐỐI CHIẾU BẰNG CHỨNG WEB · THAM KHẢO</p>
    {check.status === 'ready' && <>
      <p>{result.claims.length
        ? `${result.claims.length} tuyên bố được tách và đối chiếu với nguồn trên web.`
        : 'Không tách được tuyên bố có thể kiểm chứng từ nội dung này.'}</p>
      {result.claims.length > 0 && <ClaimsList claims={result.claims} />}
      <p>Phần này do LLM tổng hợp từ kết quả tìm kiếm, có thể sai. Hãy mở và đọc nguồn gốc.</p>
    </>}
    {check.status !== 'ready' && <p>{check.message ?? 'Đối chiếu bằng chứng web hiện không khả dụng.'}</p>}
  </section>
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
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [conversationId, setConversationId] = useState('')
  const [content, setContent] = useState('')
  const [submittedContent, setSubmittedContent] = useState('')
  const [analysisId, setAnalysisId] = useState('')
  const [progress, setProgress] = useState<ProgressUpdate>({ stage: 'pending', message: 'Đang chờ xử lý', progress: 0 })
  const [results, setResults] = useState<ConversationAnalysis[]>([])
  const [history, setHistory] = useState<Conversation[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  async function loadHistory() {
    const response = await fetch('/api/conversations')
    const body = await response.json() as { conversations?: Conversation[]; error?: string }
    if (!response.ok) throw new Error(body.error ?? 'Không tải được lịch sử.')
    setHistory(body.conversations ?? [])
  }

  async function loadConversation(id: string) {
    const response = await fetch(`/api/conversations/${id}`)
    const body = await response.json() as { analyses?: ConversationAnalysis[]; error?: string }
    if (!response.ok) throw new Error(body.error ?? 'Không tải được kết quả.')
    setConversationId(id)
    const analyses = body.analyses ?? []
    const active = analyses.find((item) => item.status === 'pending' || item.status === 'processing')
    setResults(active ? analyses.filter((item) => item.id !== active.id) : analyses)
    if (active) {
      setSubmittedContent(active.input_content)
      setAnalysisId(active.id)
      setProgress({ stage: active.status, message: 'Đang xử lý phân tích', progress: 10 })
      setView('progress')
    } else {
      setAnalysisId('')
      setView('result')
    }
  }

  useEffect(() => {
    void fetch('/api/auth/me').then(async (response) => {
      if (response.status === 401) return
      const body = await response.json() as { user?: User; error?: string }
      if (!response.ok || !body.user) throw new Error(body.error ?? 'Không thể xác thực.')
      setUser(body.user)
      await loadHistory()
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Không thể xác thực.'))
      .finally(() => setAuthLoading(false))
  }, [])

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const body = await response.json() as { user?: User; error?: string }
      if (!response.ok || !body.user) throw new Error(body.error ?? 'Không thể đăng nhập.')
      setUser(body.user)
      setPassword('')
      await loadHistory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đăng nhập.')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) throw new Error('Không thể đăng xuất.')
      setUser(null)
      setResults([])
      setHistory([])
      setConversationId('')
      setView('compose')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể đăng xuất.')
    }
  }

  async function importHistory() {
    try {
      const response = await fetch('/api/conversations/import-legacy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ browser_id: getBrowserSessionId() }),
      })
      const body = await response.json() as { imported?: number; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Không thể chuyển lịch sử.')
      await loadHistory()
      window.alert(`Đã chuyển ${body.imported ?? 0} phân tích cũ.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể chuyển lịch sử.')
    }
  }

  useEffect(() => {
    if (view !== 'progress' || !analysisId) return
    const stream = new EventSource(`/api/analyses/${analysisId}/stream`)
    stream.addEventListener('progress', (event) => {
      setProgress(JSON.parse((event as MessageEvent<string>).data) as ProgressUpdate)
    })
    stream.addEventListener('complete', () => {
      stream.close()
      void loadConversation(conversationId).then(loadHistory)
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Không tải được kết quả.'))
    })
    stream.addEventListener('analysis-error', (event) => {
      stream.close()
      const detail = JSON.parse((event as MessageEvent<string>).data) as { message?: string }
      setError(detail.message ?? 'Phân tích thất bại.')
    })
    return () => stream.close()
  }, [analysisId, conversationId, view])

  async function submitAnalysis(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (busy) return
    const submitted = content.trim()
    if (submitted.length < 10) return
    setBusy(true)
    setError('')
    try {
      let activeConversation = conversationId
      if (!activeConversation) {
        const create = await fetch('/api/conversations', { method: 'POST' })
        const created = await create.json() as { id?: string; error?: string }
        if (!create.ok || !created.id) throw new Error(created.error ?? 'Không tạo được cuộc trò chuyện.')
        activeConversation = created.id
        setConversationId(activeConversation)
      }
      const response = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: mode, content: submitted, conversation_id: activeConversation }),
      })
      const body = await response.json() as { id?: string; status?: string; error?: string }
      if (!response.ok || !body.id) throw new Error(body.error ?? 'Không tạo được yêu cầu phân tích.')
      setSubmittedContent(submitted)
      setContent('')
      setAnalysisId(body.id)
      if (body.status === 'completed') {
        await loadConversation(activeConversation)
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

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.altKey || event.nativeEvent.isComposing || event.repeat) return
    event.preventDefault()
    if (!busy && !(view === 'progress' && !error) && content.trim().length >= 10) {
      void submitAnalysis()
    }
  }

  async function showHistory() {
    setError('')
    setView('history')
    try {
      await loadHistory()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được lịch sử.')
    }
  }

  if (authLoading) return <main className="auth-page">Đang kiểm tra phiên đăng nhập...</main>
  if (!user) return <main className="auth-page">
    <form className="auth-card" onSubmit={(event) => void submitAuth(event)}>
      <p className="eyebrow">NEWSROOM / LAB</p>
      <h1>{authMode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h1>
      <label>Tên đăng nhập
        <input value={username} onChange={(event) => setUsername(event.target.value)} minLength={3} maxLength={80} required autoComplete="username" />
      </label>
      <label>Mật khẩu
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={128} required autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} />
      </label>
      {error && <p className="error-message" role="alert">{error}</p>}
      <button className="submit-button" type="submit" disabled={busy}>{authMode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</button>
      <button type="button" onClick={() => { setError(''); setAuthMode(authMode === 'login' ? 'register' : 'login') }}>
        {authMode === 'login' ? 'Tạo tài khoản mới' : 'Đã có tài khoản? Đăng nhập'}
      </button>
    </form>
  </main>

  return (
    <main className={`page-shell ${sidebarOpen ? 'sidebar-visible' : ''}`}>
      <aside className="sidebar">
        <a className="wordmark" href="/" aria-label="Newsroom, trang chủ">
          <span className="wordmark-mark">N.</span><span>NEWSROOM <i>/ LAB</i></span>
        </a>
        <button className="new-chat-button" type="button" onClick={() => { setView('compose'); setConversationId(''); setResults([]); setContent(''); setError(''); setSidebarOpen(false) }}>
          <span aria-hidden="true">+</span> Cuộc trò chuyện mới
        </button>
        <p className="sidebar-section-label">GẦN ĐÂY</p>
        <div className="sidebar-history">
          {history.slice(0, 8).map((item) => <button type="button" key={item.id} onClick={() => {
            setSidebarOpen(false)
            void loadConversation(item.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Không tải được kết quả.'))
          }}>
            <span>{item.title}</span>
          </button>)}
          {history.length === 0 && <p>Chưa có cuộc trò chuyện</p>}
        </div>
        <button className={`sidebar-link ${view === 'history' ? 'sidebar-link-active' : ''}`} type="button" onClick={() => { void showHistory(); setSidebarOpen(false) }}>
          Xem tất cả
        </button>
        <div className="sidebar-bottom">
          <p>Đăng nhập: {user.username}</p>
          <button type="button" onClick={() => void importHistory()}>Chuyển lịch sử cũ của trình duyệt này</button>
          <button type="button" onClick={() => void logout()}>Đăng xuất</button>
          <p>AI có thể sai. Luôn mở và kiểm tra nguồn gốc.</p>
        </div>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" aria-label="Đóng thanh điều hướng" onClick={() => setSidebarOpen(false)} />}
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-expanded={sidebarOpen}>☰</button>
        <span className="topbar-title">{view === 'history' ? 'Lịch sử phân tích' : 'Không gian kiểm chứng'}</span>
        <nav className="topbar-actions" aria-label="Điều hướng chính">
          <button type="button" onClick={() => { setView('compose'); setConversationId(''); setResults([]); setError('') }}>Phân tích mới</button>
        </nav>
      </header>

      <section className={`workspace ${view === 'compose' ? 'workspace-compose' : ''}`} aria-labelledby="page-title">
        {view === 'compose' && <>
          <div className="intro welcome-block">
            <p className="eyebrow">NEWSROOM / LAB</p>
            <h1 id="page-title">Mình cùng<br /><em>kiểm chứng nhé.</em></h1>
            <p className="intro-copy">Gửi một thông tin hoặc chủ đề, mình sẽ tìm nội dung liên quan để cùng bạn xem xét.</p>
          </div>
          <div className="workflow" aria-label="Quy trình phân tích">
            <div><span>01</span><p>Đọc thông tin</p></div><b aria-hidden="true">/</b>
            <div><span>02</span><p>Đối chiếu dữ liệu &amp; bằng chứng web</p></div><b aria-hidden="true">/</b>
            <div><span>03</span><p>Đọc kết quả</p></div>
          </div>
        </>}

        {(view === 'result' || view === 'progress') && <div className="chat-transcript">
        {results.map((result) => <section key={result.id} className="result-view" aria-label="Lượt hội thoại">
          <article className="chat-message user-message"><span className="message-avatar user-avatar">Bạn</span><div className="message-body"><ExpandableText text={result.input_content || 'Nội dung đã gửi để phân tích'} /></div></article>
          <article className="chat-message assistant-message"><span className="message-avatar assistant-avatar">N.</span><div className="message-body result-message-body">
          {result.status === 'completed' && result.overall ? <>
          {result.dataset_result ? <>
          <p className="result-summary">{result.dataset_result.method === 'match'
            ? `Mình tìm thấy nội dung trùng khớp. Theo dữ liệu tham khảo, thông tin này được gắn nhãn ${result.dataset_result.label === 'real' ? 'tin thật' : 'tin giả'}.`
            : result.dataset_result.method === 'prediction'
              ? `Mô hình dự đoán thông tin này nghiêng về ${result.dataset_result.label === 'real' ? 'tin thật' : 'tin giả'}, nhưng mình chưa tìm thấy nội dung trùng khớp để đối chiếu.`
              : result.dataset_result.overall_basis === 'evidence'
                ? `Mình chưa tìm thấy nội dung khớp trong dữ liệu tham khảo. Kết quả đối chiếu bằng chứng trên web (chỉ để tham khảo): ${resultLabels[result.overall.label] ?? result.overall.label}.`
                : 'Mình chưa tìm thấy nội dung đủ khớp để kết luận thông tin này là thật hay giả.'}</p>
          {result.dataset_result.follow_up?.question && <p>{result.dataset_result.follow_up.question}</p>}
          {result.dataset_result.follow_up?.status === 'unavailable' && <p>Phần hỗ trợ diễn đạt hiện không khả dụng. Bạn có thể gửi thêm nội dung cụ thể để mình xem xét.</p>}
          {result.dataset_result.match && <section className="correction-panel" aria-label="Nội dung tham khảo">
            <strong>Nội dung tham khảo</strong>
            <p>{displayTitle(result.dataset_result.match.title)}</p>
            <SampleContent sample={result.dataset_result.match} />
          </section>}
          {!!result.dataset_result?.suggestions.length && <section className="correction-panel" aria-label="Tin gợi ý">
            <strong>Bạn có thể muốn xem thêm:</strong>
            {result.dataset_result.suggestions.map((sample) => <article key={`${sample.dataset}-${sample.id}`}>
              <p>{displayTitle(sample.title)} — {sample.label === 'real' ? 'nhãn tin thật' : 'nhãn tin giả'}</p>
              <SampleContent sample={sample} />
            </article>)}
          </section>}
          {!result.dataset_result.suggestions.length && <p>Mình chưa tìm thấy tin liên quan phù hợp để gợi ý thêm.</p>}
          <EvidenceSection result={result} />
          </> : <>
          <p className="result-label">{resultLabels[result.overall.label] ?? result.overall.label}</p>
          <p className="result-summary">{result.overall.summary}</p>
          {result.source_assessment.domain && <p className="source-assessment">Nguồn bài viết: <strong>{result.source_assessment.domain}</strong> · Uy tín: {result.source_assessment.reputation}</p>}
          <ClaimsList claims={result.claims} />
          </>}
          </> : <p>{result.status === 'failed' ? 'Phân tích thất bại.' : 'Đang xử lý phân tích.'}</p>}
          </div></article>
        </section>)}

        {view === 'progress' && <section className="state-panel" aria-live="polite">
          <article className="chat-message user-message"><span className="message-avatar user-avatar">Bạn</span><div className="message-body"><ExpandableText text={submittedContent} /></div></article>
          <article className="chat-message assistant-message"><span className="message-avatar assistant-avatar">N.</span><div className="message-body">
            <p className="message-kicker">ĐANG KIỂM CHỨNG · {progress.progress}%</p><p>{progress.message}</p>
            <progress className="progress-bar" max="100" value={progress.progress} />
            <div className="progress-meta"><span>{progress.stage}</span><span>{progress.progress}%</span></div>
            {error && <p className="error-message" role="alert">{error}</p>}
          </div></article>
        </section>}
        </div>}

        {view === 'history' && <section className="history-view" aria-labelledby="page-title">
          <p className="eyebrow">TÀI KHOẢN NÀY</p><h1 id="page-title">Lịch sử<br /><em>kiểm chứng.</em></h1>
          {history.length ? <ul className="history-list">{history.map((item) => <li key={item.id}>
            <button type="button" onClick={() => void loadConversation(item.id).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Không tải được kết quả.'))}>
              <span className="history-type">{item.title}</span>
              <time>{new Date(item.created_at).toLocaleString('vi-VN')}</time>
            </button>
          </li>)}</ul> : <p className="intro-copy">Chưa có cuộc trò chuyện nào trong tài khoản này.</p>}
        </section>}

        {view !== 'history' && <form className="analysis-form" onSubmit={(event) => void submitAnalysis(event)}>
          <div className="form-topline">
            <span className="form-label">{view === 'compose' ? 'BẮT ĐẦU PHÂN TÍCH' : view === 'progress' ? 'ĐANG PHÂN TÍCH' : 'GỬI TIN TIẾP THEO'}</span>
            <div className="mode-switch" role="group" aria-label="Loại đầu vào">
              <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Văn bản</button>
              <button type="button" aria-pressed={mode === 'url'} onClick={() => setMode('url')}>Đường dẫn</button>
            </div>
          </div>
          {mode === 'text' ? (
            <textarea
              aria-label="Nội dung cần kiểm chứng"
              placeholder={view === 'result' ? 'Dán tin tiếp theo cần kiểm chứng...' : 'Dán bài viết hoặc thông tin bạn muốn kiểm chứng...'}
              rows={3}
              maxLength={100_000}
              required
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              disabled={busy || (view === 'progress' && !error)}
            />
          ) : (
            <input
              aria-label="Đường dẫn bài viết"
              type="url"
              placeholder="https://example.com/bai-viet"
              required
              value={content}
              onChange={(event) => setContent(event.target.value)}
              disabled={busy || (view === 'progress' && !error)}
            />
          )}
          <div className="form-footer">
            <span className="composer-meta">
              {mode === 'text'
                ? <><span>{content.length.toLocaleString('vi-VN')} / 100.000 ký tự</span><span className="composer-keys"> · Enter gửi · Alt+Enter xuống dòng</span></>
                : <span>Chỉ hỗ trợ bài viết HTTP(S) công khai</span>}
              <span className="composer-privacy">Nội dung chưa khớp dữ liệu có thể được gửi tới LLM và dịch vụ tìm kiếm để đối chiếu bằng chứng.</span>
            </span>
            <button className="submit-button" type="submit" disabled={busy || (view === 'progress' && !error) || content.trim().length < 10}>
              {busy ? 'Đang gửi...' : 'Phân tích'} <span aria-hidden="true">↗</span>
            </button>
          </div>
        </form>}

        {error && view !== 'progress' && <p className="error-message" role="alert">{error}</p>}
      </section>

      <footer className="site-footer">
        <span>NEWSROOM / LAB</span>
        <span>AI có thể sai. Hãy kiểm tra nguồn độc lập.</span>
      </footer>
    </main>
  )
}
