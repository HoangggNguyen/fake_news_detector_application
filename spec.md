# Fake News Detector: Spec

## Goal
Web app: user submits text or URL, gets a **credibility score** with per-claim evidence and sources. Output is a score with explanation, never an absolute true/false label. MVP targets Vietnamese, zero running cost (free tiers / open source).

## Scope
- In (MVP): text/URL input, content extraction, claim extraction, evidence retrieval, verdicts, source links, result cache, history per browser.
- Out (MVP): image/video/deepfake, extension, mobile app, accounts, payments.

## Architecture
```
web (React) --REST/SSE--> api (Node.js) --HTTP--> ai-service (Python FastAPI)
                           |-- MySQL                        |-- LLM provider
                           '-- Redis (cache, BullMQ)       |-- embeddings
                                                           '-- TF-IDF classifier
```
- web calls only api. api calls ai-service. No direct web-to-AI calls.
- ai-service is optional in MVP: if only using an LLM API, api can call it directly.
- Long analyses run async via BullMQ; progress via SSE.

## Repo layout (monorepo, pnpm workspaces)
```
apps/web          React + Vite + TypeScript + TanStack Query + Tailwind
apps/api          Node.js (Express or NestJS) + BullMQ
apps/ai-service   FastAPI, optional TF-IDF inference service loads joblib model
ml/               offline training, EDA, evaluation, and local artifacts (data git-ignored)
packages/shared   shared TS types/schemas
docs/spec.md
docker-compose.yml
```
Python deps managed separately (pyproject.toml). Deploy per app: Vercel (web), Render/Railway/Fly.io (api, ai-service), and a managed MySQL provider such as Railway or Aiven.

## Environment setup (agent runbook)

Run from repo root. Idempotent: skip steps already done. Stop and report on any failure; never invent secrets.

### Prerequisites (verify, do not install silently)
`python --version` (3.11 or 3.12), `node --version` (>=20), `pnpm --version`, `git --version`. Docker optional (MySQL/Redis).

### 1. Python env (ai-service + ml)
```bash
cd apps/ai-service
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
python -m pip install -U pip
pip install -r requirements.txt
```
Optional training deps (only for ml/):
```bash
cd ../../ml && pip install -r requirements.txt   # reuse the same venv
```

`apps/ai-service/requirements.txt`:
```
fastapi
uvicorn[standard]
pydantic-settings
python-dotenv
httpx
scikit-learn
scipy
numpy
joblib
underthesea
google-genai
groq
```
`ml/requirements.txt` (adds to the above):
```
pandas
jupyter
matplotlib
pytest
ruff
```
Optional, heavy (torch): `sentence-transformers` for local bge-m3 embeddings. Install only if embeddings run locally.

After first successful install: `pip freeze > requirements.lock`.

### 2. Node env
```bash
pnpm install        # from repo root, installs web, api, packages/shared
```

### 3. Config
```bash
cp .env.example .env
```
`.env.example` (leave keys empty, never commit `.env`):
```
# AI service
AI_SERVICE_URL=http://localhost:8000
MODEL_PATH=ml/artifacts/classifier.joblib
LLM_PROVIDER=gemini            # gemini | groq | ollama
GEMINI_API_KEY=
GROQ_API_KEY=
OLLAMA_URL=http://localhost:11434
# Evidence
GOOGLE_FACTCHECK_API_KEY=
TAVILY_API_KEY=
SEARXNG_URL=
# API
PORT=3000
DATABASE_URL=mysql://mysql:mysql@localhost:3306/fakenews
REDIS_URL=redis://localhost:6379
RATE_LIMIT_PER_MIN=10
```
Config is read via pydantic-settings (ai-service) and dotenv (api). After copying, list empty required keys to the user and ask them to fill in. Do not proceed to features that need a missing key.

### 4. Services (optional)
```bash
docker compose up -d mysql redis
```

### 5. Verify
```bash
cd apps/ai-service && python -c "import fastapi, sklearn, joblib, underthesea; print('ok')"
uvicorn app.main:app --port 8000 &   # then: curl localhost:8000/health
pnpm --filter api dev                 # api starts without errors
pnpm --filter web dev                 # web starts without errors
```

### Agent rules
- Always activate `.venv` before any Python command.
- Add `.venv/`, `.env`, `ml/data/`, `ml/artifacts/` to `.gitignore`.
- Do not download datasets or models without telling the user; report sizes first.
- Log each command and its result in a short summary at the end.
- Maintain the repository-root `log.md` across sessions. Append each session's date, goal, commands and results, files changed, and blockers/resolutions. Never record secret values.

## Stack
| Layer | Choice |
|---|---|
| LLM | Gemini / Groq / OpenRouter free tier, or Ollama local (Qwen, Gemma) |
| Evidence | Google Fact Check Tools API, SearXNG, Tavily/Brave free tier, Wikipedia API |
| Embeddings | bge-m3 or multilingual-e5 (local) |
| Vector DB | pgvector or Chroma |
| Classifier | scikit-learn: TF-IDF + Linear SVM / Logistic Regression / NB |
| VN tokenizer | underthesea or pyvi |

## Functional requirements
| ID | Requirement | Priority |
|---|---|---|
| F1 | Submit text or URL | High |
| F2 | Extract article content from URL (Readability) | High |
| F3 | Extract checkable claims with LLM | High |
| F4 | Retrieve evidence per claim (fact-check API, then web search) | High |
| F5 | LLM compares claim vs evidence, outputs verdict | High |
| F6 | Aggregate overall credibility score | High |
| F7 | Show cited sources with links | High |
| F8 | Domain reputation score | Medium |
| F9 | History per browser session | Medium |
| F10 | Cache by content hash / URL | Medium |
| F11 | Optional supervised TF-IDF fake/real classifier signal; does not decide evidence-based verdicts | Low |
| F12 | User feedback on results | Low | 

## Non-functional
- Latency: short article ~10-30s; async with progress for longer.
- Rate limit per IP to protect free-tier quotas.
- Security: block internal IPs (SSRF), cap response size, timeouts, sanitize input.
- Always show disclaimer: AI-generated, may be wrong.
- AI provider swappable behind one interface.
- Optional TF-IDF classifier failure must not block or alter the evidence-based analysis; display its label/probabilities as a separate model signal only.

## Pipeline
1. Input: extract content if URL.
2. Preprocess: clean, detect language, truncate.
3. Claims: LLM returns JSON list.
4. Evidence: per claim, fact-check API -> web search -> optional vector DB.
5. Verdict: LLM compares, may cite only retrieved URLs.
6. Source assessment: domain reputation of article and evidence.
7. Aggregate: overall score + summary.
8. Persist, cache, stream to client.

## Classifier training (ml/)
Progress is tracked in [`ml/WBS.md`](ml/WBS.md); mark data-derived deliverables complete only after running them on an authorized dataset.
Role: optional secondary dataset-classification signal; it never replaces evidence-based claim verdicts or changes `overall.credibility_score`.
- Data: accepts a user-provided, provenance-verified CSV (`text`, `label`; `0=real`, `1=fake`) with optional `title`, which is concatenated with body; ignore `domain`. The current `vfnd_dataset_1000` folder is labeled VFND-Mini in its README, but its source/labeling was not independently verified. The original VFND authors request contact before use; follow their permission/attribution terms. Do not treat LLM-generated text as benchmark ground truth.
- Preprocess: NFC normalize, lowercase, replace URL/number with tokens, strip special characters, remove empty/invalid rows, drop exact duplicate texts, and exclude texts with conflicting labels before splitting.
- Features: word TF-IDF (1-2 gram) combined with character TF-IDF (2-4 gram).
- Models: compare Multinomial Naive Bayes, Logistic Regression, calibrated Linear SVM, and Random Forest. Use balanced class weights where supported; Multinomial Naive Bayes uses uniform class priors (`fit_prior=false`).
- Evaluation: stratified 80/20 holdout; choose the model by stratified 5-fold CV on the training split only. Report accuracy, macro precision/recall/F1 and holdout confusion matrix. If an authorized external set is supplied, remove exact text overlaps before evaluating it.
- Outputs: cleaned CSV, EDA JSON/chart, model comparison CSV, training report, and best pipeline serialized with joblib under ignored `ml/artifacts/`.
- Serving: retain FastAPI (confirmed choice; do not add Flask). `/predict` returns a model label and probabilities when an artifact exists. If unavailable, the evidence/Groq pipeline continues and omits the classifier signal. The UI labels this output as a secondary model signal, not a truth verdict.
- The 85% accuracy/F1 figure is a target, not a guaranteed result. Report whether it is achieved on holdout/external data; do not train on or tune against the holdout.
- Deduplicate across train/validation/test before reporting metrics. If no independent test examples remain, mark external validation blocked and do not claim real-world performance.
- Known limits: small/biased dataset, no deep semantics, source/topic drift, and weak out-of-distribution performance.

## Result format
```json
{
  "id": "uuid",
  "status": "completed",
  "overall": {"credibility_score": 0.32, "label": "likely_false", "summary": "..."},
  "claims": [{
    "text": "...", "verdict": "refuted", "confidence": 0.8, "reasoning": "...",
    "evidence": [{"title": "...", "url": "...", "snippet": "...", "stance": "refutes"}]
  }],
  "classifier_signal": {"label": "fake", "confidence": 0.78, "probabilities": {"real": 0.22, "fake": 0.78}, "model_name": "Linear SVM", "model_version": "tfidf-baseline-v1", "top_features": []},
  "source_assessment": {"domain": "example.com", "reputation": "unknown"},
  "disclaimer": "AI-generated, verify independently."
}
```
- Claim verdict: `supported | refuted | mixed | unverifiable`
- Overall label: `likely_true | mixed | likely_false | insufficient_evidence`

## API
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/analyses | Create analysis (text or url) |
| GET | /api/analyses/:id | Get result |
| GET | /api/analyses/:id/stream | SSE progress |
| GET | /api/analyses | History (per session) |
| POST | /api/analyses/:id/feedback | Submit feedback |

Optional AI-service endpoints: `GET /health`, `GET /model/status`, and `POST /predict` (classifier signal only).

## Data model
- analyses: id, input_type, input_text, url, content_hash, status, overall_score, label, created_at
- claims: id, analysis_id, text, verdict, confidence, reasoning
- evidence: id, claim_id, title, url, snippet, stance, source_domain
- classifier_signals: analysis_id, label, confidence, real_probability, fake_probability, model_name, model_version, top_features
- domains: domain, reputation_score, notes, updated_at
- feedback: id, analysis_id, rating, comment

## UI
Home (input + examples) -> progress (step status) -> result (score, claims, evidence, disclaimer) -> history.

## Key risks
- LLM fabricates sources: allow citing only retrieved URLs; verify they exist.
- Quota exhaustion: cache, rate limit, fallback provider/local model.
- No evidence for fresh news: return `insufficient_evidence`.
- Misread results: show score and disclaimer, not absolute labels.

## Evaluation
Benchmarks: ViFactCheck, VLSP 2020 ReINTEL, LIAR, FakeNewsNet. Metrics: accuracy, macro-F1, citation correctness, latency, rate-limit hits, share of `unverifiable`.

## Roadmap
1. MVP: text/URL, claims, evidence, verdicts, sources.
2. Domain reputation, cache, history, rate limit.
3. TF-IDF + SVM signal, benchmark.
4. Multilingual, media analysis, extension.

## Open questions
- Vietnamese only or multilingual?
- Main LLM provider: Gemini, Groq, or local?
- Public deployment or demo/thesis only?
