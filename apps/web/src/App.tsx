import { useState } from 'react'

type InputMode = 'text' | 'url'

export default function App() {
  const [mode, setMode] = useState<InputMode>('text')

  return (
    <main className="page-shell">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="Newsroom, trang chủ">
          <span className="wordmark-mark">N.</span>
          <span>NEWSROOM <i>/ LAB</i></span>
        </a>
        <span className="topbar-note"><span className="live-dot" /> BẢN THỬ NGHIỆM</span>
      </header>

      <section className="workspace" aria-labelledby="page-title">
        <div className="intro">
          <p className="eyebrow">THÔNG TIN, ĐẶT TRONG NGỮ CẢNH</p>
          <h1 id="page-title">Đọc kỹ.<br /><em>Kiểm chứng.</em></h1>
          <p className="intro-copy">
            Xem xét từng tuyên bố, đối chiếu bằng chứng và lần theo nguồn trích dẫn.
            Không có nhãn đúng sai tuyệt đối.
          </p>
        </div>

        <form className="analysis-form" onSubmit={(event) => event.preventDefault()}>
          <div className="form-topline">
            <span className="form-label">BẮT ĐẦU PHÂN TÍCH</span>
            <div className="mode-switch" role="group" aria-label="Loại đầu vào">
              <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Văn bản</button>
              <button type="button" aria-pressed={mode === 'url'} onClick={() => setMode('url')}>Đường dẫn</button>
            </div>
          </div>
          {mode === 'text' ? (
            <textarea aria-label="Nội dung cần kiểm chứng" placeholder="Dán bài viết hoặc thông tin bạn muốn kiểm chứng..." rows={7} />
          ) : (
            <input aria-label="Đường dẫn bài viết" type="url" placeholder="https://example.com/bai-viet" />
          )}
          <div className="form-footer">
            <span>Tiếng Việt · Pipeline đang được thiết lập</span>
            <button className="submit-button" type="submit" disabled>Chưa khả dụng</button>
          </div>
        </form>

        <div className="workflow" aria-label="Quy trình phân tích">
          <div><span>01</span><p>Tách tuyên bố</p></div>
          <b aria-hidden="true">/</b>
          <div><span>02</span><p>Tìm bằng chứng</p></div>
          <b aria-hidden="true">/</b>
          <div><span>03</span><p>Đọc kết quả</p></div>
        </div>
      </section>

      <footer className="site-footer">
        <span>NEWSROOM / LAB</span>
        <span>AI có thể sai. Hãy kiểm tra nguồn độc lập.</span>
      </footer>
    </main>
  )
}
