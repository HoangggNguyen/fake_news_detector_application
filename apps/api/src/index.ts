import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import cors from "cors";
import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { Queue, Worker } from "bullmq";
import { z } from "zod";
import type { RowDataPacket } from "mysql2";
import { pool } from "./db.js";
import { extractArticle } from "./article.js";
import { analysisSchema } from "./validation.js";
import { classifierSignalSchema } from "./classifier.js";
import { classifyDataset, datasetResultSchema } from "./dataset.js";
import { makeFollowUp } from "./conversation.js";
import { analyzeContent } from "./analyzer.js";
import {
  combineResults,
  runEvidenceCheck,
  shouldCheckEvidence,
  type EvidenceAnalysis,
} from "./hybrid.js";
import { authRouter, requireAuth, type AuthenticatedRequest } from "./auth.js";
import { publicMessage, UserFacingError } from "./errors.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const progressEvents = new EventEmitter();
progressEvents.setMaxListeners(100);
const aiServiceUrl = process.env.AI_SERVICE_URL ?? "http://localhost:8000";

const aiResultSchema = z.object({
  overall: z.object({
    credibility_score: z.number().min(0).max(1),
    label: z.enum([
      "likely_true",
      "mixed",
      "likely_false",
      "insufficient_evidence",
    ]),
    summary: z.string(),
  }),
  claims: z.array(
    z.object({
      text: z.string(),
      verdict: z.enum(["supported", "refuted", "mixed", "unverifiable"]),
      confidence: z.number().min(0).max(1),
      reasoning: z.string(),
      correction: z.string().nullable(),
      evidence: z.array(
        z.object({
          title: z.string(),
          url: z.string().url(),
          snippet: z.string(),
          stance: z.enum(["supports", "refutes", "context"]),
          source_type: z.enum([
            "fact_check",
            "official",
            "trusted_press",
            "web_search",
            "encyclopedia",
          ]),
        }),
      ),
    }),
  ),
  source_assessment: z.object({
    domain: z.string().nullable(),
    reputation: z.string(),
  }),
  classifier_signal: classifierSignalSchema.nullable().optional(),
  disclaimer: z.string(),
});

type AnalysisJob = { analysisId: string };
function getUserId(request: Request): string {
  return (request as AuthenticatedRequest).userId;
}

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    exposedHeaders: ["X-Session-Id"],
  }),
);
app.use(express.json({ limit: "110kb" }));
const sensitiveRequestLimit = rateLimit({
  windowMs: 60_000,
  limit: Number(process.env.RATE_LIMIT_PER_MIN ?? 10),
  standardHeaders: "draft-8",
  legacyHeaders: false,
});
// Chỉ giới hạn đăng nhập/đăng ký (POST); GET /api/auth/me chạy mỗi lần tải trang.
app.use("/api/auth", (request, response, next) => {
  if (request.method === "POST")
    return sensitiveRequestLimit(request, response, next);
  next();
});
app.use("/api/analyses", (request, response, next) => {
  if (request.method === "POST")
    return sensitiveRequestLimit(request, response, next);
  next();
});
app.use("/api", (request, response, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.get("origin");
    const allowed = process.env.WEB_ORIGIN ?? "http://localhost:5173";
    if (origin && origin !== allowed) {
      response.status(403).json({ error: "Nguồn yêu cầu không được phép." });
      return;
    }
  }
  next();
});
app.use("/api/auth", authRouter);

type ProgressPayload = { stage: string; message: string; progress: number };
/** Cập nhật gần nhất của mỗi phân tích, để luồng SSE mở lại giữa chừng không bắt đầu từ 0%. */
const lastProgress = new Map<string, ProgressPayload>();

function sendProgress(
  analysisId: string,
  stage: string,
  message: string,
  progress: number,
) {
  const payload = { stage, message, progress };
  if (progress >= 100) lastProgress.delete(analysisId);
  else lastProgress.set(analysisId, payload);
  progressEvents.emit(analysisId, payload);
}

async function markFailed(analysisId: string, message: string) {
  await pool
    .execute("UPDATE analyses SET status = ?, error_message = ? WHERE id = ?", [
      "failed",
      message.slice(0, 500),
      analysisId,
    ])
    .catch(async (error: unknown) => {
      console.error(
        "Could not store failure reason (run migration 20261112?):",
        error instanceof Error ? error.message : error,
      );
      // Vẫn phải đánh dấu failed để giao diện không chờ mãi.
      await pool
        .execute("UPDATE analyses SET status = ? WHERE id = ?", [
          "failed",
          analysisId,
        ])
        .catch(() => undefined);
    });
  sendProgress(analysisId, "failed", message, 100);
}

async function processAnalysis(analysisId: string) {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT * FROM analyses WHERE id = ?",
      [analysisId],
    );
    const analysis = rows[0];
    if (!analysis) return;

    await pool.execute("UPDATE analyses SET status = ? WHERE id = ?", [
      "processing",
      analysisId,
    ]);
    sendProgress(analysisId, "extract", "Đang đọc nội dung bạn gửi", 10);
    let content = String(analysis.input_text);
    let sourceUrl: string | null = analysis.url ? String(analysis.url) : null;
    if (analysis.input_type === "url") {
      const extracted = await extractArticle(String(analysis.url)).catch(
        (error: unknown) => {
          if (error instanceof UserFacingError) throw error;
          console.warn(
            "Article download failed:",
            error instanceof Error ? error.message : error,
          );
          throw new UserFacingError(
            "Không tải được bài viết từ đường dẫn này. Bạn có thể dán trực tiếp nội dung bài.",
          );
        },
      );
      content = extracted.text;
      sourceUrl = extracted.url;
    }

    // Lớp 1: tra mẫu trong dữ liệu train + classifier TF-IDF (kết quả chính).
    sendProgress(
      analysisId,
      "dataset",
      "Đang so sánh với các tin đã có trong dữ liệu",
      25,
    );
    const datasetResult = await classifyDataset(content, aiServiceUrl).catch(
      (error: unknown) => {
        if (error instanceof UserFacingError) throw error;
        console.error(
          "AI service unreachable:",
          error instanceof Error ? error.message : error,
        );
        throw new UserFacingError(
          "Bộ phân tích dữ liệu đang tạm thời chưa sẵn sàng.",
        );
      },
    );

    // Lớp 2: tách tuyên bố + tìm bằng chứng web bằng LLM (tham khảo, chỉ khi chưa có mẫu khớp).
    let evidenceCheck = shouldCheckEvidence(datasetResult);
    let evidence: EvidenceAnalysis | null = null;
    if (!evidenceCheck) {
      sendProgress(
        analysisId,
        "evidence",
        "Chưa có tin trùng khớp trong dữ liệu, đang tìm nguồn trên Internet",
        45,
      );
      const outcome = await runEvidenceCheck(() =>
        analyzeContent(content, sourceUrl, (message, progress) =>
          sendProgress(analysisId, "evidence", message, progress),
        ),
      );
      evidenceCheck = outcome.check;
      evidence = outcome.evidence;
    }

    sendProgress(analysisId, "response", "Đang tổng hợp kết quả", 75);
    // Câu hỏi gợi ý của Groq mặc định TẮT: câu trả lời của người dùng không được ghép vào
    // phân tích trước, nên câu hỏi dễ gây hiểu lầm. Bật lại bằng FOLLOW_UP_QUESTION=true.
    const followUp =
      process.env.FOLLOW_UP_QUESTION === "true"
        ? await makeFollowUp(content, datasetResult)
        : { question: null, status: "not_needed" as const };
    const overall = combineResults(datasetResult, evidence);
    const result = aiResultSchema.parse({
      overall: {
        credibility_score: overall.credibility_score,
        label: overall.label,
        summary: overall.summary,
      },
      claims: evidence?.claims ?? [],
      classifier_signal: datasetResult.classifier,
      source_assessment: {
        domain: sourceUrl ? new URL(sourceUrl).hostname : null,
        reputation: "Chưa xác minh",
      },
      disclaimer: "",
    });
    sendProgress(analysisId, "save", "Sắp xong, đang lưu kết quả", 85);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        "UPDATE analyses SET status = ?, overall_score = ?, label = ?, overall_summary = ?, url = ? WHERE id = ?",
        [
          "completed",
          result.overall.credibility_score,
          result.overall.label,
          result.overall.summary,
          sourceUrl,
          analysisId,
        ],
      );
      await connection.execute(
        "INSERT INTO dataset_results (analysis_id, result) VALUES (?, ?)",
        [
          analysisId,
          JSON.stringify({
            ...datasetResult,
            follow_up: followUp,
            evidence_check: evidenceCheck,
            overall_basis: overall.basis,
          }),
        ],
      );
      for (const claim of result.claims) {
        const claimId = randomUUID();
        await connection.execute(
          "INSERT INTO claims (id, analysis_id, text, verdict, confidence, reasoning, correction) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            claimId,
            analysisId,
            claim.text,
            claim.verdict,
            claim.confidence,
            claim.reasoning,
            claim.correction,
          ],
        );
        for (const evidence of claim.evidence) {
          await connection.execute(
            "INSERT INTO evidence (id, claim_id, title, url, snippet, stance, source_domain, source_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              randomUUID(),
              claimId,
              evidence.title,
              evidence.url,
              evidence.snippet,
              evidence.stance,
              new URL(evidence.url).hostname,
              evidence.source_type,
            ],
          );
        }
      }
      if (result.classifier_signal) {
        try {
          await connection.execute(
            "INSERT INTO classifier_signals (analysis_id, label, confidence, real_probability, fake_probability, model_name, model_version, top_features) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
              analysisId,
              result.classifier_signal.label,
              result.classifier_signal.confidence,
              result.classifier_signal.probabilities.real,
              result.classifier_signal.probabilities.fake,
              result.classifier_signal.model_name,
              result.classifier_signal.model_version,
              JSON.stringify(result.classifier_signal.top_features),
            ],
          );
        } catch (error) {
          console.warn(
            "Classifier signal was not persisted:",
            error instanceof Error ? error.message : error,
          );
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    sendProgress(analysisId, "completed", "Đã phân tích xong", 100);
  } catch (error) {
    // Ghi đầy đủ lỗi vào log; người dùng chỉ thấy thông điệp đã viết sẵn.
    console.error(`Analysis ${analysisId} failed:`, error);
    await markFailed(analysisId, publicMessage(error));
  }
}

let analysisQueue: Queue<AnalysisJob> | undefined;
let analysisWorker: Worker<AnalysisJob> | undefined;
if (process.env.USE_BULLMQ === "true") {
  const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  const connection = {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: decodeURIComponent(redisUrl.username) || undefined,
    password: decodeURIComponent(redisUrl.password) || undefined,
    db: Number(redisUrl.pathname.slice(1) || 0),
    maxRetriesPerRequest: null,
    ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
  };
  analysisQueue = new Queue<AnalysisJob>("analyses", { connection });
  analysisWorker = new Worker<AnalysisJob>(
    "analyses",
    (job) => processAnalysis(job.data.analysisId),
    { connection },
  );
}

function dispatchAnalysis(analysisId: string) {
  if (analysisQueue) {
    void analysisQueue
      .add("analyze", { analysisId }, { jobId: analysisId })
      .catch(async (error: unknown) => {
        console.error("Could not enqueue analysis in Redis:", error);
        await markFailed(analysisId, "Hệ thống đang quá tải.");
      });
  } else {
    void processAnalysis(analysisId);
  }
}

async function getAnalysis(analysisId: string, userId: string) {
  const [analysisRows] = await pool.execute<RowDataPacket[]>(
    "SELECT a.id, a.status, a.error_message, a.overall_score, a.label, a.overall_summary, a.url, a.input_type, a.input_text, a.created_at FROM analyses a JOIN conversations c ON c.id = a.conversation_id WHERE a.id = ? AND c.user_id = ?",
    [analysisId, userId],
  );
  const analysis = analysisRows[0];
  if (!analysis) return null;

  const [claimRows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, text, verdict, confidence, reasoning, correction FROM claims WHERE analysis_id = ?",
    [analysisId],
  );
  const claims = await Promise.all(
    claimRows.map(async (claim) => {
      const [evidenceRows] = await pool.execute<RowDataPacket[]>(
        "SELECT title, url, snippet, stance, source_type FROM evidence WHERE claim_id = ?",
        [claim.id],
      );
      return { ...claim, evidence: evidenceRows };
    }),
  );
  const [datasetRows] = await pool.execute<RowDataPacket[]>(
    "SELECT result FROM dataset_results WHERE analysis_id = ?",
    [analysisId],
  );
  const datasetResult = datasetRows[0]
    ? datasetResultSchema.parse(
        typeof datasetRows[0].result === "string"
          ? JSON.parse(datasetRows[0].result)
          : datasetRows[0].result,
      )
    : null;
  let styleSignal = null;
  try {
    const [signalRows] = await pool.execute<RowDataPacket[]>(
      "SELECT label, confidence, real_probability, fake_probability, model_name, model_version, top_features FROM classifier_signals WHERE analysis_id = ?",
      [analysisId],
    );
    if (signalRows[0]) {
      styleSignal = {
        label: signalRows[0].label,
        confidence: signalRows[0].confidence,
        probabilities: {
          real: signalRows[0].real_probability,
          fake: signalRows[0].fake_probability,
        },
        model_name: signalRows[0].model_name,
        model_version: signalRows[0].model_version,
        top_features:
          typeof signalRows[0].top_features === "string"
            ? JSON.parse(signalRows[0].top_features)
            : signalRows[0].top_features,
      };
    }
  } catch {
    // Older databases may not yet have the optional classifier table.
  }
  return {
    id: analysis.id,
    status: analysis.status,
    error_message:
      analysis.status === "failed"
        ? (analysis.error_message ?? "Đã có lỗi trong lúc phân tích.")
        : null,
    overall:
      analysis.overall_score === null
        ? null
        : {
            credibility_score: analysis.overall_score,
            label: analysis.label,
            summary: analysis.overall_summary,
          },
    source_url: analysis.url,
    input_type: analysis.input_type,
    input_content: analysis.input_text || analysis.url,
    created_at: analysis.created_at,
    claims,
    classifier_signal: styleSignal,
    dataset_result: datasetResult,
    source_assessment: {
      domain: analysis.url ? new URL(String(analysis.url)).hostname : null,
      reputation: "unknown",
    },
    disclaimer: "AI có thể sai. Hãy kiểm tra nguồn độc lập.",
  };
}

app.get("/health", (_request, response) => {
  void pool
    .query("SELECT 1")
    .then(() => {
      response.json({ status: "ok", service: "api", database: "ok" });
    })
    .catch(() => {
      response
        .status(503)
        .json({ status: "degraded", service: "api", database: "unavailable" });
    });
});

app.use("/api", requireAuth);

app.get("/api/conversations", async (request, response) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      // Bỏ qua cuộc trò chuyện rỗng: web tạo cuộc trò chuyện trước rồi mới lưu nội dung,
      // nên nếu bước lưu thất bại sẽ còn sót một "Cuộc trò chuyện mới" không có lượt nào.
      "SELECT c.id, c.title, c.created_at, c.updated_at FROM conversations c WHERE c.user_id = ? AND EXISTS (SELECT 1 FROM analyses a WHERE a.conversation_id = c.id) ORDER BY c.updated_at DESC, c.id DESC",
      [getUserId(request)],
    );
    response.json({ conversations: rows });
  } catch (error) {
    console.error(
      "Loading conversations failed:",
      error instanceof Error ? error.message : error,
    );
    response.status(503).json({ error: "Không thể tải cuộc trò chuyện." });
  }
});

app.post("/api/conversations", async (request, response) => {
  try {
    const id = randomUUID();
    await pool.execute(
      "INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)",
      [id, getUserId(request), "Cuộc trò chuyện mới"],
    );
    response.status(201).json({ id, title: "Cuộc trò chuyện mới" });
  } catch (error) {
    console.error(
      "Creating conversation failed:",
      error instanceof Error ? error.message : error,
    );
    response.status(503).json({ error: "Không thể tạo cuộc trò chuyện." });
  }
});

app.post("/api/conversations/import-legacy", async (request, response) => {
  const parsed = z
    .object({ browser_id: z.string().regex(/^[a-zA-Z0-9-]{16,128}$/) })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Mã lịch sử cũ không hợp lệ." });
    return;
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT id, input_type, input_text, url FROM analyses WHERE session_id = ? AND conversation_id IS NULL FOR UPDATE",
      [parsed.data.browser_id],
    );
    for (const row of rows) {
      const conversationId = randomUUID();
      const content = String(row.input_text || row.url || "");
      await connection.execute(
        "INSERT INTO conversations (id, user_id, title) VALUES (?, ?, ?)",
        [
          conversationId,
          getUserId(request),
          content.slice(0, 180) || "Phân tích cũ",
        ],
      );
      await connection.execute(
        "UPDATE analyses SET conversation_id = ? WHERE id = ? AND conversation_id IS NULL",
        [conversationId, row.id],
      );
    }
    await connection.commit();
    response.json({ imported: rows.length });
  } catch (error) {
    await connection.rollback();
    console.error(
      "Importing history failed:",
      error instanceof Error ? error.message : error,
    );
    response.status(503).json({ error: "Không thể chuyển lịch sử cũ." });
  } finally {
    connection.release();
  }
});

app.get("/api/conversations/:id", async (request, response) => {
  try {
    const [conversation] = await pool.execute<RowDataPacket[]>(
      "SELECT id, title FROM conversations WHERE id = ? AND user_id = ?",
      [request.params.id, getUserId(request)],
    );
    if (!conversation[0]) {
      response.status(404).json({ error: "Không tìm thấy cuộc trò chuyện." });
      return;
    }
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM analyses WHERE conversation_id = ? ORDER BY turn_order ASC",
      [request.params.id],
    );
    const analyses = await Promise.all(
      rows.map((row) => getAnalysis(String(row.id), getUserId(request))),
    );
    response.json({ conversation: conversation[0], analyses });
  } catch (error) {
    console.error(
      "Loading conversation failed:",
      error instanceof Error ? error.message : error,
    );
    response.status(503).json({ error: "Không thể tải cuộc trò chuyện." });
  }
});

app.post("/api/analyses", async (request, response) => {
  const parsed = analysisSchema.safeParse(request.body);
  if (!parsed.success) {
    response
      .status(400)
      .json({
        error: "Dữ liệu đầu vào không hợp lệ.",
        details: parsed.error.flatten(),
      });
    return;
  }

  const { type, content, conversation_id: conversationId } = parsed.data;
  try {
    const [owned] = await pool.execute<RowDataPacket[]>(
      "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
      [conversationId, getUserId(request)],
    );
    if (!owned[0]) {
      response.status(404).json({ error: "Không tìm thấy cuộc trò chuyện." });
      return;
    }
    const analysisId = randomUUID();
    await pool.execute(
      "INSERT INTO analyses (id, session_id, conversation_id, input_type, input_text, url, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        analysisId,
        getUserId(request),
        conversationId,
        type,
        content,
        type === "url" ? content : null,
        "pending",
      ],
    );
    await pool.execute(
      "UPDATE conversations SET title = IF(title = 'Cuộc trò chuyện mới', ?, title), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?",
      [content.slice(0, 180), conversationId, getUserId(request)],
    );
    response.status(202).json({ id: analysisId, status: "pending" });
    dispatchAnalysis(analysisId);
  } catch (error) {
    console.error(
      "Creating analysis failed (check DATABASE_URL / MySQL):",
      error instanceof Error ? error.message : error,
    );
    response.status(503).json({
      error: "Hệ thống chưa lưu được yêu cầu. Vui lòng thử lại sau ít phút.",
    });
  }
});

app.get("/api/analyses", async (request, response) => {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT a.id, a.status, a.overall_score, a.label, a.input_type, a.url, a.created_at FROM analyses a JOIN conversations c ON c.id = a.conversation_id WHERE c.user_id = ? ORDER BY a.created_at DESC LIMIT 50",
      [getUserId(request)],
    );
    response.json({ analyses: rows });
  } catch {
    response.status(503).json({ error: "Không thể tải lịch sử." });
  }
});

app.get("/api/analyses/:id", async (request, response) => {
  try {
    const result = await getAnalysis(request.params.id, getUserId(request));
    if (!result) {
      response.status(404).json({ error: "Không tìm thấy phân tích." });
      return;
    }
    response.json(result);
  } catch {
    response.status(503).json({ error: "Không thể tải kết quả." });
  }
});

app.get("/api/analyses/:id/stream", async (request, response) => {
  const userId = getUserId(request);
  let rows: RowDataPacket[];
  try {
    [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT a.id, a.status FROM analyses a JOIN conversations c ON c.id = a.conversation_id WHERE a.id = ? AND c.user_id = ?",
      [request.params.id, userId],
    );
  } catch {
    response.status(503).end();
    return;
  }
  if (!rows[0]) {
    response.status(404).end();
    return;
  }

  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  const analysisId = request.params.id;
  const send = (event: string, payload: unknown) =>
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  const onProgress = (payload: { stage?: string; progress?: number }) => {
    send("progress", payload);
    if (payload.progress === 100) {
      if (payload.stage === "completed") send("complete", { id: analysisId });
      if (payload.stage === "failed") send("analysis-error", payload);
      response.end();
    }
  };
  progressEvents.on(analysisId, onProgress);
  send(
    "progress",
    lastProgress.get(analysisId) ?? {
      stage: rows[0].status,
      message: "Đang chờ cập nhật",
      progress: 0,
    },
  );
  if (["completed", "failed"].includes(String(rows[0].status))) {
    onProgress({ stage: String(rows[0].status), progress: 100 });
  }
  const heartbeat = setInterval(() => {
    // Sự kiện "ping" thật (không phải dòng comment) để web biết máy chủ vẫn đang xử lý,
    // kể cả khi một lần gọi LLM kéo dài hơn bộ đếm chờ phía trình duyệt.
    send("ping", { at: Date.now() });
    void pool
      .execute<RowDataPacket[]>(
        "SELECT a.status FROM analyses a JOIN conversations c ON c.id = a.conversation_id WHERE a.id = ? AND c.user_id = ?",
        [analysisId, userId],
      )
      .then(([currentRows]) => {
        const status = String(currentRows[0]?.status ?? "");
        if (status === "completed" || status === "failed")
          onProgress({ stage: status, progress: 100 });
      })
      .catch(() => undefined);
  }, 5_000);
  response.on("close", () => {
    clearInterval(heartbeat);
    progressEvents.off(analysisId, onProgress);
  });
});

app.post("/api/analyses/:id/feedback", async (request, response) => {
  const parsed = z
    .object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(2000).optional(),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Đánh giá phải từ 1 đến 5." });
    return;
  }
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      "SELECT a.id FROM analyses a JOIN conversations c ON c.id = a.conversation_id WHERE a.id = ? AND c.user_id = ?",
      [request.params.id, getUserId(request)],
    );
    if (!rows[0]) {
      response.status(404).json({ error: "Không tìm thấy phân tích." });
      return;
    }
    await pool.execute(
      "INSERT INTO feedback (id, analysis_id, rating, comment) VALUES (?, ?, ?, ?)",
      [
        randomUUID(),
        request.params.id,
        parsed.data.rating,
        parsed.data.comment ?? null,
      ],
    );
    response.status(201).json({ status: "received" });
  } catch {
    response.status(503).json({ error: "Không thể lưu đánh giá." });
  }
});

app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: (error?: unknown) => void,
  ) => {
    const type =
      typeof error === "object" && error !== null && "type" in error
        ? String((error as { type?: unknown }).type)
        : "";
    if (type === "entity.too.large") {
      response
        .status(413)
        .json({ error: "Nội dung quá dài. Vui lòng rút gọn rồi gửi lại." });
      return;
    }
    if (type === "entity.parse.failed") {
      response
        .status(400)
        .json({ error: "Dữ liệu gửi lên không đúng định dạng." });
      return;
    }
    console.error("Unhandled request error:", error);
    response
      .status(500)
      .json({ error: "Máy chủ gặp lỗi. Vui lòng thử lại sau ít phút." });
  },
);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  if (analysisWorker) console.log("BullMQ analysis worker enabled");
});

process.on("SIGTERM", () => {
  void analysisQueue?.close();
  void analysisWorker?.close();
  void pool.end();
});
