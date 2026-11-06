import { useCallback, useRef, useState } from 'react'
import type { ViewResult } from './api/contract'
import { AnalysisForm, type InputType } from './components/AnalysisForm'
import { HistoryList } from './components/HistoryList'
import { ResultPanel } from './components/ResultPanel'
import { ErrorPanel, LoadingPanel } from './components/StatusPanels'
import { config } from './config'
import { COPY } from './content'
import { useAnalysis } from './hooks/useAnalysis'
import { addToHistory, clearHistory, loadHistory, type HistoryEntry } from './lib/history'
import { validateText, validateUrl } from './lib/validation'

export default function App() {
  const [inputType, setInputType] = useState<InputType>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const fieldRef = useRef<HTMLTextAreaElement>(null)

  const handleSuccess = useCallback((result: ViewResult) => {
    setHistory((current) => addToHistory(current, result))
  }, [])

  const analysis = useAnalysis(handleSuccess)
  const pending = analysis.status === 'pending'
  const copy = COPY[config.mode]

  const focusField = () => requestAnimationFrame(() => fieldRef.current?.focus())

  const handleSubmit = () => {
    const checked = inputType === 'text' ? validateText(text) : validateUrl(url)
    if (!checked.ok) {
      setValidationError(checked.message)
      return
    }
    setValidationError(null)
    analysis.submit(checked.value)
  }

  const handleRetry = () => {
    if (analysis.lastInput) analysis.submit(analysis.lastInput)
  }

  const handleTextChange = (value: string) => {
    setText(value)
    if (validationError) setValidationError(null)
  }

  const handleUrlChange = (value: string) => {
    setUrl(value)
    if (validationError) setValidationError(null)
  }

  const handleInputTypeChange = (type: InputType) => {
    setInputType(type)
    setValidationError(null)
  }

  const handleCheckAnother = () => {
    analysis.reset()
    setText('')
    setUrl('')
    setInputType('text')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    focusField()
  }

  const handleEdit = () => {
    analysis.reset()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    focusField()
  }

  const handleSelectHistory = (entry: HistoryEntry) => {
    analysis.reset()
    setValidationError(null)
    if (entry.input.type === 'url' && config.allowUrlInput) {
      setInputType('url')
      setUrl(entry.input.content)
    } else {
      setInputType('text')
      setText(entry.input.content)
      focusField()
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Newsroom, trang chủ">
          <span className="wordmark-mark">N.</span>
          <span>NEWSROOM <i>/ LAB</i></span>
        </a>
        {config.useMock ? (
          <span className="topbar-note mock-note" title="Kết quả không đến từ mô hình thật">
            <span className="live-dot" /> DỮ LIỆU GIẢ LẬP
          </span>
        ) : (
          <span className="topbar-note"><span className="live-dot" /> BẢN THỬ NGHIỆM</span>
        )}
      </header>

      <section className="workspace" aria-labelledby="page-title">
        <div className="intro">
          <p className="eyebrow">THÔNG TIN, ĐẶT TRONG NGỮ CẢNH</p>
          <h1 id="page-title">Đọc kỹ.<br /><em>Kiểm chứng.</em></h1>
          <p className="intro-copy">{copy.intro}</p>
        </div>

        <AnalysisForm
          inputType={inputType}
          onInputTypeChange={handleInputTypeChange}
          text={text}
          onTextChange={handleTextChange}
          url={url}
          onUrlChange={handleUrlChange}
          validationError={validationError}
          pending={pending}
          onSubmit={handleSubmit}
          onCancel={analysis.cancel}
          fieldRef={fieldRef}
        />

        {analysis.status === 'idle' && (
          <div className="workflow" aria-label="Quy trình phân tích">
            {copy.steps.map((step, index) => (
              <div key={step} className="workflow-item">
                {index > 0 && <b aria-hidden="true">/</b>}
                <div><span>0{index + 1}</span><p>{step}</p></div>
              </div>
            ))}
          </div>
        )}

        {pending && <LoadingPanel elapsedMs={analysis.elapsedMs} onCancel={analysis.cancel} />}
        {analysis.status === 'error' && analysis.error && <ErrorPanel error={analysis.error} onRetry={handleRetry} />}
        {analysis.status === 'success' && analysis.result && (
          <ResultPanel result={analysis.result} onCheckAnother={handleCheckAnother} onEdit={handleEdit} />
        )}

        <HistoryList
          entries={history}
          disabled={pending}
          onSelect={handleSelectHistory}
          onClear={() => setHistory(clearHistory())}
        />
      </section>

      <footer className="site-footer">
        <span>NEWSROOM / LAB · Nhóm 2 · INT14151</span>
        <span>AI có thể sai. Hãy kiểm tra nguồn độc lập.</span>
      </footer>
    </main>
  )
}
