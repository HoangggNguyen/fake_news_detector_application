import { useEffect, useRef, useState } from "react";
import type { AnalysisResult, DatasetSample } from "@fake-news/shared";
import { ApiError, apiRequest, errorMessage } from "./api";
import { composerProblem, MIN_CONTENT_LENGTH } from "./composerValidation";

type InputMode = "text" | "url";
type PageView = "compose" | "progress" | "result" | "history";
type ProgressUpdate = { stage: string; message: string; progress: number };
type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};
type User = { id: string; username: string };
type ConversationAnalysis = AnalysisResult & {
  input_content: string;
  input_type: InputMode;
};

/** Không nhận được cập nhật tiến trình trong khoảng này thì coi là kết nối theo dõi đã bị treo. */
const PROGRESS_STALL_MS = 90_000;

const verdictLabels: Record<string, string> = {
  supported: "Có bằng chứng ủng hộ",
  refuted: "Có bằng chứng phản bác",
  mixed: "Bằng chứng trái chiều",
  unverifiable: "Chưa đủ bằng chứng",
};

const resultLabels: Record<string, string> = {
  likely_true: "Phần lớn nguồn tìm được ủng hộ",
  mixed: "Bằng chứng trái chiều",
  likely_false: "Phần lớn nguồn tìm được bác bỏ",
  insufficient_evidence: "Chưa đủ bằng chứng",
};

/** Tên giai đoạn hiển thị dưới thanh tiến trình (máy chủ gửi mã tiếng Anh). */
const stageLabels: Record<string, string> = {
  pending: "Đang chờ",
  processing: "Đang xử lý",
  extract: "Chuẩn bị nội dung",
  dataset: "Đối chiếu dữ liệu",
  evidence: "Tìm nguồn trên Internet",
  response: "Tổng hợp kết quả",
  save: "Lưu kết quả",
  completed: "Hoàn tất",
  failed: "Chưa hoàn tất",
};

const evidenceTypeLabels: Record<string, string> = {
  fact_check: "Nguồn kiểm chứng thông tin",
  official: "Tên miền cơ quan / giáo dục",
  trusted_press: "Báo được ưu tiên đối chiếu",
  web_search: "Nguồn tìm kiếm trên web",
  encyclopedia: "Bách khoa tham khảo",
};

/** Vì sao lớp dữ liệu + mô hình chưa đưa ra nhãn, viết cho người dùng. */
function unresolvedReason(result: AnalysisResult): string {
  const skipped = result.dataset_result?.classifier_skipped;
  if (skipped?.reason === "too_short")
    return `Nội dung khá ngắn (${skipped.word_count ?? "?"} từ), trong khi mô hình chỉ học các bài từ ${skipped.min_words ?? 80} từ trở lên, nên chưa đánh giá cách viết.`;
  if (skipped?.reason === "low_confidence")
    return "Mô hình chưa đủ chắc chắn để dự đoán từ cách viết.";
  if (skipped?.reason === "conflicting_matches")
    return "Dữ liệu tham khảo có tin trùng nhưng được ghi nhận khác nhau.";
  if (skipped?.reason === "model_unavailable")
    return "Mô hình phân loại tạm thời chưa sẵn sàng.";
  return "";
}

function displayTitle(title: string): string {
  return title
    .replace(/\s*\((?:Mẫu|Cập nhật đợt|Cảnh báo mẫu)\s*#\d+\)\s*$/i, "")
    .trim();
}

/** Rút gọn văn bản dài (bài báo dán vào) để không chiếm hết màn hình, có nút xem thêm. */
function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 420;
  return (
    <>
      <p className={long && !open ? "clamped-text" : undefined}>{text}</p>
      {long && (
        <button
          type="button"
          className="text-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "Thu gọn" : "Xem thêm"}
        </button>
      )}
    </>
  );
}

/** Nút tài khoản ở chân sidebar; bấm để mở menu (chuyển lịch sử cũ, đăng xuất). */
function AccountMenu({
  username,
  onImport,
  onLogout,
}: {
  username: string;
  onImport: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div className="account" ref={rootRef}>
      {open && (
        <div className="account-menu" role="menu" aria-label="Tài khoản">
          <button
            type="button"
            role="menuitem"
            title="Gắn các phân tích cũ trên trình duyệt này vào tài khoản"
            onClick={choose(onImport)}
          >
            Chuyển lịch sử cũ
          </button>
          <button
            type="button"
            role="menuitem"
            className="account-menu-danger"
            onClick={choose(onLogout)}
          >
            Đăng xuất
          </button>
        </div>
      )}
      <button
        type="button"
        className="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="account-avatar" aria-hidden="true">
          {username.charAt(0).toLocaleUpperCase("vi-VN")}
        </span>
        <span className="account-name">{username}</span>
        <svg
          className="account-chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

function SampleContent({ sample }: { sample: DatasetSample }) {
  const sourceUrl = sample.source_url;
  const safeUrl =
    sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null;
  return (
    <>
      <ExpandableText text={sample.text} />
      <p>
        Nguồn:{" "}
        {safeUrl ? (
          <a href={safeUrl} target="_blank" rel="noopener noreferrer">
            {sample.source} ↗
          </a>
        ) : (
          <>{sample.source}</>
        )}
      </p>
    </>
  );
}

function ClaimsList({ claims }: { claims: AnalysisResult["claims"] }) {
  return (
    <div className="claims-list">
      {claims.map((claim, index) => (
        <article className="claim-item" key={`${claim.text}-${index}`}>
          <div className="claim-heading">
            <span className="claim-index">
              Ý {index + 1}
            </span>
            <span className={`verdict verdict-${claim.verdict}`}>
              {verdictLabels[claim.verdict] ?? claim.verdict}
            </span>
          </div>
          <h2>{claim.text}</h2>
          <p>{claim.reasoning}</p>
          {claim.verdict === "refuted" && claim.correction && (
            <aside
              className="correction-panel"
              aria-label="Thông tin đã chỉnh sửa theo nguồn"
            >
              <strong>Theo các nguồn đối chiếu, thông tin đúng có thể là:</strong>
              <p>{claim.correction}</p>
            </aside>
          )}
          {claim.verdict === "refuted" && !claim.correction && (
            <p>Chưa đủ nguồn phù hợp để đề xuất thông tin đã chỉnh sửa.</p>
          )}
          {claim.evidence.length > 0 && (
            <ul className="evidence-list">
              {claim.evidence.map((evidence) => (
                <li key={evidence.url}>
                  <a href={evidence.url} target="_blank" rel="noreferrer">
                    {evidence.title} <span aria-hidden="true">↗</span>
                  </a>
                  <span className="evidence-type">
                    {evidenceTypeLabels[evidence.source_type] ??
                      "Nguồn tham khảo"}
                  </span>
                  <p>{evidence.snippet}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      ))}
    </div>
  );
}

function EvidenceSection({ result }: { result: AnalysisResult }) {
  const check = result.dataset_result?.evidence_check;
  if (!check || check.status === "not_needed") return null;
  return (
    <section className="evidence-section" aria-label="Nguồn trên Internet">
      <p className="message-kicker">NGUỒN TRÊN INTERNET · THAM KHẢO</p>
      {check.status === "ready" && (
        <>
          <p>
            {result.claims.length
              ? `Hệ thống phân tích nội dung, trích xuất các thông tin chính và kiểm tra mức độ trùng khớp với các nguồn trực tuyến.`
              : "Không xác định được những thông tin có thể kiểm tra tính đúng sai từ nội dung này."}
          </p>
          {result.claims.length > 0 ? <ClaimsList claims={result.claims} /> : null}
          <p>
            Đây là nội dung do AI tổng hợp từ các nguồn trực tuyến. Hãy tham
            khảo thông tin từ các trang web gốc để xác minh tính chính xác.
          </p>
        </>
      )}
      {check.status !== "ready" && (
        <p>
          {check.message ??
            "Chức năng tìm nguồn trên Internet tạm thời chưa dùng được."}
        </p>
      )}
    </section>
  );
}

function getBrowserSessionId(): string {
  const existing = window.localStorage.getItem("newsroom-session-id");
  if (existing) return existing;
  const created = window.crypto.randomUUID();
  window.localStorage.setItem("newsroom-session-id", created);
  return created;
}

export default function App() {
  const [mode, setMode] = useState<InputMode>("text");
  const [view, setView] = useState<PageView>("compose");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [conversationId, setConversationId] = useState("");
  const [content, setContent] = useState("");
  const [submittedContent, setSubmittedContent] = useState("");
  const [analysisId, setAnalysisId] = useState("");
  const [progress, setProgress] = useState<ProgressUpdate>({
    stage: "pending",
    message: "Đang chờ xử lý",
    progress: 0,
  });
  const [results, setResults] = useState<ConversationAnalysis[]>([]);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [error, setError] = useState("");
  // Thông báo thành công/trung tính (thay cho hộp alert).
  const [notice, setNotice] = useState("");
  // Thông báo trung tính tự tắt sau 5 giây (lỗi thì giữ lại để người dùng kịp đọc).
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  // Phân tích đã thất bại hẳn (khác với mất kết nối theo dõi): nút sẽ là "Gửi lại".
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const [submittedMode, setSubmittedMode] = useState<InputMode>("text");
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Tăng giá trị này để mở lại kết nối theo dõi tiến trình (nút "Kiểm tra lại").
  const [progressAttempt, setProgressAttempt] = useState(0);
  const problem = composerProblem(mode, content);
  const canSubmit =
    !busy &&
    !(view === "progress" && !error) &&
    content.trim().length >= MIN_CONTENT_LENGTH &&
    !problem;

  async function loadHistory() {
    const body = await apiRequest<{ conversations?: Conversation[] }>(
      "/api/conversations",
    );
    setHistory(body.conversations ?? []);
  }

  async function loadConversation(id: string) {
    const body = await apiRequest<{ analyses?: ConversationAnalysis[] }>(
      `/api/conversations/${id}`,
    );
    setConversationId(id);
    setNotice("");
    const analyses = body.analyses ?? [];
    const active = analyses.find(
      (item) => item.status === "pending" || item.status === "processing",
    );
    setResults(
      active ? analyses.filter((item) => item.id !== active.id) : analyses,
    );
    if (active) {
      setSubmittedContent(active.input_content);
      setSubmittedMode(active.input_type);
      setAnalysisFailed(false);
      setAnalysisId(active.id);
      setProgress({
        stage: active.status,
        message: "Đang xử lý phân tích",
        progress: 10,
      });
      setView("progress");
    } else {
      setAnalysisId("");
      setView("result");
    }
  }

  useEffect(() => {
    void apiRequest<{ user?: User }>("/api/auth/me")
      .then(async (body) => {
        if (!body.user) throw new Error("missing user");
        setUser(body.user);
        await loadHistory();
      })
      .catch((cause: unknown) => {
        // 401 nghĩa là chưa đăng nhập: hiện form đăng nhập, không báo lỗi.
        if (cause instanceof ApiError && cause.status === 401) return;
        setError(errorMessage(cause, "Không thể xác thực."));
      })
      .finally(() => setAuthLoading(false));
  }, []);

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = await apiRequest<{ user?: User }>(`/api/auth/${authMode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!body.user) throw new Error("missing user");
      setUser(body.user);
      setPassword("");
      await loadHistory();
    } catch (cause) {
      setError(errorMessage(cause, "Không thể đăng nhập."));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      setUser(null);
      setResults([]);
      setHistory([]);
      setConversationId("");
      setView("compose");
    } catch (cause) {
      setError(errorMessage(cause, "Không thể đăng xuất."));
    }
  }

  async function importHistory() {
    try {
      const body = await apiRequest<{ imported?: number }>(
        "/api/conversations/import-legacy",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ browser_id: getBrowserSessionId() }),
        },
      );
      await loadHistory();
      const imported = body.imported ?? 0;
      setError("");
      setNotice(
        imported > 0
          ? `Đã chuyển ${imported} phân tích cũ vào tài khoản.`
          : "Trình duyệt này không có phân tích cũ để chuyển.",
      );
    } catch (cause) {
      setError(errorMessage(cause, "Không thể chuyển lịch sử."));
    }
  }

  useEffect(() => {
    if (view !== "progress" || !analysisId) return;
    const stream = new EventSource(`/api/analyses/${analysisId}/stream`);
    let finished = false;
    let stallTimer = 0;

    const finish = () => {
      finished = true;
      window.clearTimeout(stallTimer);
      stream.close();
    };

    // Phân tích thất bại hẳn: hiện lý do và đưa nội dung về ô nhập để gửi lại không cần dán.
    const showFailure = (reason?: string | null) => {
      setAnalysisFailed(true);
      setMode(submittedMode);
      setContent(submittedContent);
      setError(
        `Chưa phân tích được nội dung này: ${(reason ?? "đã có lỗi trong lúc phân tích").replace(/\.$/, "")}. Bạn có thể gửi lại.`,
      );
    };

    const openResult = () => {
      void loadConversation(conversationId)
        .then(loadHistory)
        .catch((cause: unknown) =>
          setError(errorMessage(cause, "Không tải được kết quả.")),
        );
    };

    // Kết nối theo dõi bị đứt hoặc im lặng quá lâu: hỏi trực tiếp trạng thái phân tích
    // thay vì để người dùng đứng mãi ở màn hình tiến trình.
    const recover = (reason: string) => {
      if (finished) return;
      finish();
      void apiRequest<{ status?: string; error_message?: string | null }>(
        `/api/analyses/${analysisId}`,
      )
        .then((analysis) => {
          if (analysis.status === "completed") openResult();
          else if (analysis.status === "failed")
            showFailure(analysis.error_message);
          else setError(reason);
        })
        .catch((cause: unknown) => setError(errorMessage(cause, reason)));
    };

    const resetStallTimer = () => {
      window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(
        () =>
          recover(
            'Lâu rồi chưa nhận được tin từ hệ thống. Bấm "Kiểm tra lại" để xem kết quả.',
          ),
        PROGRESS_STALL_MS,
      );
    };
    resetStallTimer();

    stream.addEventListener("progress", (event) => {
      resetStallTimer();
      try {
        setProgress(
          JSON.parse((event as MessageEvent<string>).data) as ProgressUpdate,
        );
      } catch {
        // Bỏ qua gói tin tiến trình sai định dạng, giữ trạng thái hiện tại.
      }
    });
    // Máy chủ gửi "ping" mỗi 5 giây khi vẫn đang xử lý (ví dụ chờ LLM).
    stream.addEventListener("ping", resetStallTimer);
    stream.addEventListener("complete", () => {
      finish();
      openResult();
    });
    stream.addEventListener("analysis-error", (event) => {
      finish();
      let message: string | undefined;
      try {
        message = (
          JSON.parse((event as MessageEvent<string>).data) as {
            message?: string;
          }
        ).message;
      } catch {
        message = undefined;
      }
      showFailure(message);
    });
    // EventSource tự kết nối lại khi mạng chập chờn; chỉ xử lý khi trình duyệt đã bỏ cuộc (CLOSED).
    stream.onerror = () => {
      if (stream.readyState === EventSource.CLOSED) {
        recover(
          'Mất kết nối khi theo dõi tiến trình. Bấm "Kiểm tra lại" để xem kết quả.',
        );
      }
    };
    return () => {
      finished = true;
      window.clearTimeout(stallTimer);
      stream.close();
    };
    // submittedContent/submittedMode chỉ được đọc khi thất bại, không cần mở lại luồng khi chúng đổi.
  }, [analysisId, conversationId, view, progressAttempt]);

  async function submitAnalysis(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (busy) return;
    const submitted = content.trim();
    if (
      submitted.length < MIN_CONTENT_LENGTH ||
      composerProblem(mode, submitted)
    )
      return;
    setBusy(true);
    setError("");
    setNotice("");
    setAnalysisFailed(false);
    try {
      let activeConversation = conversationId;
      if (!activeConversation) {
        const created = await apiRequest<{ id?: string }>(
          "/api/conversations",
          { method: "POST" },
        );
        if (!created.id) throw new Error("missing conversation id");
        activeConversation = created.id;
        setConversationId(activeConversation);
      }
      const body = await apiRequest<{ id?: string; status?: string }>(
        "/api/analyses",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            type: mode,
            content: submitted,
            conversation_id: activeConversation,
          }),
        },
      );
      if (!body.id) throw new Error("missing analysis id");
      setSubmittedContent(submitted);
      setSubmittedMode(mode);
      setContent("");
      setAnalysisId(body.id);
      if (body.status === "completed") {
        await loadConversation(activeConversation);
      } else {
        setProgress({
          stage: "pending",
          message: "Đã nhận nội dung, đang bắt đầu phân tích",
          progress: 2,
        });
        setView("progress");
      }
    } catch (cause) {
      setError(errorMessage(cause, "Không tạo được yêu cầu phân tích."));
    } finally {
      setBusy(false);
    }
  }

  function handleComposerKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.altKey ||
      event.nativeEvent.isComposing ||
      event.repeat
    )
      return;
    event.preventDefault();
    if (canSubmit) void submitAnalysis();
  }

  async function showHistory() {
    setError("");
    setNotice("");
    setView("history");
    try {
      await loadHistory();
    } catch (cause) {
      setError(errorMessage(cause, "Không tải được lịch sử."));
    }
  }

  if (authLoading)
    return <main className="auth-page">Đang kiểm tra phiên đăng nhập...</main>;
  if (!user)
    return (
      <main className="auth-page">
        <form
          className="auth-card"
          onSubmit={(event) => void submitAuth(event)}
        >
          <p className="eyebrow">NEWSROOM / LAB</p>
          <h1>{authMode === "login" ? "Đăng nhập" : "Tạo tài khoản"}</h1>
          <label>
            Tên đăng nhập
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              minLength={3}
              maxLength={80}
              pattern="[a-zA-Z0-9_.\-]+"
              required
              autoComplete="username"
              aria-describedby={
                authMode === "register" ? "username-rule" : undefined
              }
            />
            {authMode === "register" && (
              <small id="username-rule" className="field-hint">
                3–80 ký tự: chữ không dấu, số và . _ -
              </small>
            )}
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              required
              autoComplete={
                authMode === "login" ? "current-password" : "new-password"
              }
              aria-describedby={
                authMode === "register" ? "password-rule" : undefined
              }
            />
            {authMode === "register" && (
              <small id="password-rule" className="field-hint">
                Mật khẩu từ 8 ký tự trở lên
              </small>
            )}
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="submit-button" type="submit" disabled={busy}>
            {authMode === "login" ? "Đăng nhập" : "Đăng ký"}
          </button>
          <button
            type="button"
            onClick={() => {
              setError("");
              setAuthMode(authMode === "login" ? "register" : "login");
            }}
          >
            {authMode === "login"
              ? "Tạo tài khoản mới"
              : "Đã có tài khoản? Đăng nhập"}
          </button>
        </form>
      </main>
    );

  return (
    <main className={`page-shell ${sidebarOpen ? "sidebar-visible" : ""}`}>
      <aside className="sidebar">
        <a className="wordmark" href="/" aria-label="Newsroom, trang chủ">
          <span className="wordmark-mark">N.</span>
          <span>
            NEWSROOM <i>/ LAB</i>
          </span>
        </a>
        <button
          className="new-chat-button"
          type="button"
          onClick={() => {
            setView("compose");
            setConversationId("");
            setResults([]);
            setContent("");
            setError("");
            setNotice("");
            setAnalysisFailed(false);
            setSidebarOpen(false);
          }}
        >
          <span aria-hidden="true">+</span> Cuộc trò chuyện mới
        </button>
        <p className="sidebar-section-label">GẦN ĐÂY</p>
        <div className="sidebar-history">
          {history.slice(0, 8).map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                setSidebarOpen(false);
                void loadConversation(item.id).catch((cause: unknown) =>
                  setError(errorMessage(cause, "Không tải được kết quả.")),
                );
              }}
            >
              <span>{item.title}</span>
            </button>
          ))}
          {history.length === 0 && <p>Chưa có cuộc trò chuyện</p>}
        </div>
        <button
          className={`sidebar-link ${view === "history" ? "sidebar-link-active" : ""}`}
          type="button"
          onClick={() => {
            void showHistory();
            setSidebarOpen(false);
          }}
        >
          Xem tất cả
        </button>
        <AccountMenu
          username={user.username}
          onImport={() => void importHistory()}
          onLogout={() => void logout()}
        />
      </aside>
      {sidebarOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Đóng thanh điều hướng"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Chỉ hiện ở màn hình ≤ 900px, nơi sidebar bị giấu thành ngăn kéo. */}
      <header className="topbar">
        <button
          className="menu-button"
          type="button"
          aria-label="Mở thanh điều hướng"
          aria-expanded={sidebarOpen}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          ☰
        </button>
        <span className="topbar-title">
          {view === "history" ? "Lịch sử kiểm chứng" : "NEWSROOM / LAB"}
        </span>
      </header>

      <section
        className={`workspace ${view === "compose" ? "workspace-compose" : ""}`}
        aria-labelledby="page-title"
      >
        {view === "compose" && (
          <>
            <div className="intro welcome-block">
              <p className="eyebrow">NEWSROOM / LAB</p>
              <h1 id="page-title">Kiểm chứng thông tin</h1>
              <p className="intro-copy">
                Dán đoạn tin hoặc đường dẫn bài viết. Hệ thống sẽ đối chiếu với
                dữ liệu đã học và tìm nguồn trên Internet để bạn tham khảo.
              </p>
            </div>
            <div className="workflow" aria-label="Quy trình phân tích">
              <div>
                <span>01</span>
                <p>Đọc thông tin</p>
              </div>
              <b aria-hidden="true">/</b>
              <div>
                <span>02</span>
                <p>Đối chiếu dữ liệu &amp; bằng chứng web</p>
              </div>
              <b aria-hidden="true">/</b>
              <div>
                <span>03</span>
                <p>Đọc kết quả</p>
              </div>
            </div>
          </>
        )}

        {(view === "result" || view === "progress") && (
          <div className="chat-transcript">
            {results.map((result) => (
              <section
                key={result.id}
                className="result-view"
                aria-label="Lượt hội thoại"
              >
                <article className="chat-message user-message">
                  <span className="message-avatar user-avatar">Bạn</span>
                  <div className="message-body">
                    <ExpandableText
                      text={
                        result.input_content || "Nội dung đã gửi để phân tích"
                      }
                    />
                  </div>
                </article>
                <article className="chat-message assistant-message">
                  <span className="message-avatar assistant-avatar">N.</span>
                  <div className="message-body result-message-body">
                    {result.status === "completed" && result.overall ? (
                      <>
                        {result.dataset_result ? (
                          <>
                            <p className="result-summary">
                              {result.dataset_result.method === "match"
                                ? `Đã tìm thấy tin trùng khớp trong dữ liệu tham khảo, nơi tin này được ghi nhận là ${result.dataset_result.label === "real" ? "tin thật" : "tin giả"}.`
                                : result.dataset_result.method === "prediction"
                                  ? `Cách viết của nội dung này giống các ${result.dataset_result.label === "real" ? "tin thật" : "tin giả"} mà mô hình đã học. Đây là dự đoán, chưa phải kết luận đã kiểm chứng.`
                                  : result.dataset_result.overall_basis ===
                                      "evidence"
                                    ? `Chưa có tin trùng khớp trong dữ liệu tham khảo. ${unresolvedReason(result)} Theo các nguồn tìm được trên Internet: ${(resultLabels[result.overall.label] ?? result.overall.label).toLocaleLowerCase("vi-VN")}. Kết quả chỉ để tham khảo.`
                                    : `Chưa đủ căn cứ để xác định nội dung này là tin thật hay tin giả. ${unresolvedReason(result)}`}
                            </p>

                            {/* Câu hỏi gợi ý của Groq không còn hiển thị: hệ thống không dùng câu trả lời
                                của người dùng (mỗi lần gửi được phân tích độc lập), nên thay bằng hướng dẫn cố định. */}
                            {result.dataset_result.method === "unresolved" && (
                              <p className="result-hint">
                                Để kiểm tra kỹ hơn, bạn có thể dán toàn văn bài
                                viết (từ{" "}
                                {result.dataset_result.classifier_skipped
                                  ?.min_words ?? 80}{" "}
                                từ) hoặc đường dẫn bài gốc ở ô bên dưới. Mỗi
                                lần gửi được phân tích riêng, không ghép với
                                tin trước.
                              </p>
                            )}

                            {result.dataset_result.match && (
                              <section
                                className="correction-panel"
                                aria-label="Nội dung tham khảo"
                              >
                                <strong>Nội dung tham khảo</strong>
                                <p>
                                  {displayTitle(
                                    result.dataset_result.match.title,
                                  )}
                                </p>
                                <SampleContent
                                  sample={result.dataset_result.match}
                                />
                              </section>
                            )}
                            {!!result.dataset_result?.suggestions.length && (
                              <section
                                className="correction-panel"
                                aria-label="Tin gợi ý"
                              >
                                <strong>Bạn có thể muốn xem thêm:</strong>
                                {result.dataset_result.suggestions.map(
                                  (sample) => (
                                    <article
                                      key={`${sample.dataset}-${sample.id}`}
                                    >
                                      <p>
                                        {displayTitle(sample.title)} —{" "}
                                        {sample.label === "real"
                                          ? "được ghi nhận là tin thật"
                                          : "được ghi nhận là tin giả"}
                                      </p>
                                      <SampleContent sample={sample} />
                                    </article>
                                  ),
                                )}
                              </section>
                            )}
                            <EvidenceSection result={result} />
                          </>
                        ) : (
                          <>
                            <p className="result-label">
                              {resultLabels[result.overall.label] ??
                                result.overall.label}
                            </p>
                            <p className="result-summary">
                              {result.overall.summary}
                            </p>
                            {result.source_assessment.domain && (
                              <p className="source-assessment">
                                Nguồn bài viết:{" "}
                                <strong>
                                  {result.source_assessment.domain}
                                </strong>{" "}
                                · Uy tín: {result.source_assessment.reputation}
                              </p>
                            )}
                            <ClaimsList claims={result.claims} />
                          </>
                        )}
                      </>
                    ) : (
                      <p>
                        {result.status === "failed"
                          ? `Chưa phân tích được nội dung này: ${(result.error_message ?? "đã có lỗi trong lúc phân tích").replace(/\.$/, "")}. Bạn có thể gửi lại.`
                          : "Đang xử lý phân tích."}
                      </p>
                    )}
                  </div>
                </article>
              </section>
            ))}

            {view === "progress" && (
              <section className="state-panel" aria-live="polite">
                <article className="chat-message user-message">
                  <span className="message-avatar user-avatar">Bạn</span>
                  <div className="message-body">
                    <ExpandableText text={submittedContent} />
                  </div>
                </article>
                <article className="chat-message assistant-message">
                  <span className="message-avatar assistant-avatar">N.</span>
                  <div className="message-body">
                    <p className="message-kicker">
                      ĐANG KIỂM CHỨNG · {progress.progress}%
                    </p>
                    <p>{progress.message}</p>
                    <progress
                      className="progress-bar"
                      max="100"
                      value={progress.progress}
                    />
                    <div className="progress-meta">
                      <span>{stageLabels[progress.stage] ?? "Đang xử lý"}</span>
                      <span>{progress.progress}%</span>
                    </div>
                    {error && (
                      <p className="error-message" role="alert">
                        {error}
                      </p>
                    )}
                    {error && analysisFailed && (
                      <button
                        className="retry-button"
                        type="button"
                        disabled={busy}
                        onClick={() => void submitAnalysis()}
                      >
                        Gửi lại
                      </button>
                    )}
                    {error && !analysisFailed && (
                      <button
                        className="retry-button"
                        type="button"
                        onClick={() => {
                          setError("");
                          setProgressAttempt((value) => value + 1);
                        }}
                      >
                        Kiểm tra lại
                      </button>
                    )}
                  </div>
                </article>
              </section>
            )}
          </div>
        )}

        {view === "history" && (
          <section className="history-view" aria-labelledby="page-title">
            <h1 id="page-title">
              Lịch sử <em>kiểm chứng</em>
            </h1>
            {history.length ? (
              <ul className="history-list">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() =>
                        void loadConversation(item.id).catch((cause: unknown) =>
                          setError(
                            errorMessage(cause, "Không tải được kết quả."),
                          ),
                        )
                      }
                    >
                      <span className="history-type">{item.title}</span>
                      <time>
                        {new Date(item.created_at).toLocaleString("vi-VN")}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="intro-copy">
                Chưa có cuộc trò chuyện nào trong tài khoản này.
              </p>
            )}
          </section>
        )}

        {view !== "history" && (
          <form
            className="analysis-form"
            onSubmit={(event) => void submitAnalysis(event)}
          >
            <div className="form-topline">
              <span className="form-label">
                {view === "compose"
                  ? "BẮT ĐẦU PHÂN TÍCH"
                  : view === "progress"
                    ? "ĐANG PHÂN TÍCH"
                    : "GỬI TIN TIẾP THEO"}
              </span>
              <div
                className="mode-switch"
                role="group"
                aria-label="Loại đầu vào"
              >
                <button
                  type="button"
                  aria-pressed={mode === "text"}
                  onClick={() => setMode("text")}
                >
                  Văn bản
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "url"}
                  onClick={() => setMode("url")}
                >
                  Đường dẫn
                </button>
              </div>
            </div>
            {mode === "text" ? (
              <textarea
                aria-label="Nội dung cần kiểm chứng"
                placeholder={
                  view === "result"
                    ? "Dán tin tiếp theo cần kiểm chứng..."
                    : "Dán bài viết hoặc thông tin bạn muốn kiểm chứng..."
                }
                rows={3}
                maxLength={100_000}
                required
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                disabled={busy || (view === "progress" && !error)}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? "composer-problem" : undefined}
              />
            ) : (
              <input
                aria-label="Đường dẫn bài viết"
                type="url"
                placeholder="https://example.com/bai-viet"
                required
                value={content}
                onChange={(event) => setContent(event.target.value)}
                disabled={busy || (view === "progress" && !error)}
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? "composer-problem" : undefined}
              />
            )}
            {problem && (
              <p
                className="composer-hint"
                id="composer-problem"
                aria-live="polite"
              >
                {problem}
              </p>
            )}
            <div className="form-footer">
              <button
                className="submit-button"
                type="submit"
                disabled={!canSubmit}
              >
                {busy ? "Đang gửi..." : "Phân tích"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </form>
        )}

        {error && view !== "progress" && (
          <div className="error-message dismissible" role="alert">
            <span>{error}</span>
            <button
              type="button"
              className="dismiss-button"
              aria-label="Đóng thông báo"
              onClick={() => setError("")}
            >
              ×
            </button>
          </div>
        )}
        {notice && !error && (
          <div className="notice-message dismissible" role="status">
            <span>{notice}</span>
            <button
              type="button"
              className="dismiss-button"
              aria-label="Đóng thông báo"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
      </section>

      <footer className="site-footer">
        <span>NEWSROOM / LAB</span>
        <span>AI có thể sai. Hãy kiểm tra nguồn độc lập.</span>
      </footer>
    </main>
  );
}
