import type { FormEvent, KeyboardEvent, RefObject } from 'react'
import { config } from '../config'
import { COPY, EXAMPLES } from '../content'

export type InputType = 'text' | 'url'

interface Props {
  inputType: InputType
  onInputTypeChange: (type: InputType) => void
  text: string
  onTextChange: (value: string) => void
  url: string
  onUrlChange: (value: string) => void
  validationError: string | null
  pending: boolean
  onSubmit: () => void
  onCancel: () => void
  fieldRef: RefObject<HTMLTextAreaElement | null>
}

export function AnalysisForm(props: Props) {
  const { inputType, text, url, validationError, pending } = props
  const charCount = text.normalize('NFC').trim().length
  const tooLong = charCount > config.maxChars
  const errorId = 'form-error'

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!pending) props.onSubmit()
  }

  // Ctrl/Cmd + Enter để gửi nhanh.
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !pending) {
      event.preventDefault()
      props.onSubmit()
    }
  }

  return (
    <form className="analysis-form" onSubmit={handleSubmit} noValidate aria-busy={pending}>
      <div className="form-topline">
        <span className="form-label">BẮT ĐẦU PHÂN TÍCH</span>
        {config.allowUrlInput && (
          <div className="mode-switch" role="group" aria-label="Loại đầu vào">
            <button type="button" aria-pressed={inputType === 'text'} onClick={() => props.onInputTypeChange('text')} disabled={pending}>
              Văn bản
            </button>
            <button type="button" aria-pressed={inputType === 'url'} onClick={() => props.onInputTypeChange('url')} disabled={pending}>
              Đường dẫn
            </button>
          </div>
        )}
      </div>

      {inputType === 'text' ? (
        <textarea
          ref={props.fieldRef}
          aria-label="Nội dung cần kiểm chứng"
          aria-invalid={validationError ? true : undefined}
          aria-describedby={validationError ? errorId : undefined}
          placeholder="Dán tiêu đề và nội dung bài viết bạn muốn kiểm tra..."
          rows={7}
          value={text}
          onChange={(event) => props.onTextChange(event.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={pending}
          spellCheck={false}
        />
      ) : (
        <input
          aria-label="Đường dẫn bài viết"
          aria-invalid={validationError ? true : undefined}
          aria-describedby={validationError ? errorId : undefined}
          type="url"
          inputMode="url"
          placeholder="https://example.com/bai-viet"
          value={url}
          onChange={(event) => props.onUrlChange(event.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={pending}
        />
      )}

      {validationError && (
        <p className="field-error" id={errorId} role="alert">
          {validationError}
        </p>
      )}

      {inputType === 'text' && !pending && (
        <div className="examples" aria-label="Ví dụ">
          <span>Thử ví dụ:</span>
          {EXAMPLES.map((example) => (
            <button key={example.label} type="button" className="chip" onClick={() => {
                props.onTextChange(example.text)
                props.fieldRef.current?.focus()
              }}>
              {example.label}
            </button>
          ))}
        </div>
      )}

      <div className="form-footer">
        <span>
          {inputType === 'text' ? (
            <>
              <span className={tooLong ? 'counter over' : 'counter'}>
                {charCount.toLocaleString('vi-VN')} / {config.maxChars.toLocaleString('vi-VN')} ký tự
              </span>
              <span className="hint"> · Ctrl + Enter để gửi</span>
            </>
          ) : (
            COPY[config.mode].footerHint
          )}
        </span>
        <div className="form-actions">
          {pending ? (
            <button type="button" className="ghost-button" onClick={props.onCancel}>
              Huỷ
            </button>
          ) : (
            (text || url) && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => (inputType === 'text' ? props.onTextChange('') : props.onUrlChange(''))}
              >
                Xoá
              </button>
            )
          )}
          <button className="submit-button" type="submit" disabled={pending}>
            {pending ? 'Đang phân tích…' : 'Kiểm tra'}
            {!pending && <span aria-hidden="true">→</span>}
          </button>
        </div>
      </div>
    </form>
  )
}
