# Development Log

Append a dated entry for every coding session. Record commands and outcomes, changed files, and blockers/resolutions. Never record secret values.

## 2026-10-12 - Base scaffold

- Read `spec.md`; verified Python 3.12.9, Node 22.18.0, pnpm 10.30.3, Git 2.49.0, Docker 28.3.2.
- Confirmed the initial workspace contained only `spec.md` and was not a Git repository at that time.
- Added pnpm workspace manifests, React/Vite/Tailwind web starter, Express API health route, FastAPI health route, shared TypeScript contracts, Docker Compose, and `.env.example`/`.gitignore`.
- `pnpm install`: succeeded; pnpm warned that dependency build scripts were ignored.
- `pnpm build`: succeeded for web, API, and shared package.
- Python setup attempt: failed because `python` resolved to `C:\msys64\ucrt64\bin\python.exe` without pip; an initial venv was created in the wrong folder and removed.
- Started the Vite and API dev servers; `GET http://localhost:3000/health` returned `{ "status": "ok", "service": "api" }`.

## 2026-10-17 - Functional analysis workflow

- Found the current branch `hoangnh01`; preserved the pre-existing `spec.md` edit changing the database URL to MySQL.
- Preserved the existing MySQL change in `spec.md`; aligned the MySQL driver, schema, Compose config, env template, and deployment/prerequisite notes.
- `pnpm install`: succeeded after changing to `mysql2`; dependencies installed for Express rate limiting, Readability extraction, and JSDOM.
- Added bounded HTML/text extraction with redirect checks, DNS validation, pinned public-IP requests, timeouts, and a 1 MB response cap.
- Added API routes for create, session history, result retrieval, SSE progress, feedback, per-minute rate limiting, and optional BullMQ. Without Redis, jobs run in-process.
- Added Gemini, Groq, and Ollama adapters; Google Fact Check, Tavily, and Wikipedia evidence lookup; restricted citations to retrieved URLs; added score aggregation.
- Added score, SSRF-address, and citation-integrity tests. `pnpm --filter @fake-news/api test`: 5 passed.
- Connected the web form to submit text/URL, display SSE progress, render score/claims/evidence/disclaimer, show session history, and submit feedback.
- `pnpm --filter @fake-news/web build`, `pnpm --filter @fake-news/api build`, and root `pnpm build`: succeeded. VS Code diagnostics reported no errors.
- `docker compose config --quiet`: succeeded. `docker compose up -d mysql redis`: blocked because Docker Desktop's Linux engine pipe was unavailable; no container started. A Windows `MySQL80` service is running on port 3306, but the template's development login was rejected; no credentials or database contents were changed.
- Created ignored `.env` from `.env.example` only when absent; no secret values were added.
- Started `pnpm dev:web` and `pnpm dev:api`. API returns 503 with MySQL unavailable; POST invalid input returned 400 and a valid-shaped POST returned the expected storage-unavailable 503.
- Browser check confirmed the page renders, supports URL/text mode, and has no horizontal overflow at 390px. A locator click timed out; dispatching the UI click events directly successfully submitted the form and displayed the API's MySQL-unavailable message.
- Final verification: root `pnpm build` succeeded; all 5 API tests passed; Docker Compose config validated; VS Code diagnostics reported no errors.
- Python AI service setup remains blocked: Windows resolves `python` to the MSYS interpreter without pip. The web/API currently use the direct-provider branch allowed by the spec; real analysis needs a configured LLM provider and reachable MySQL.

## 2026-10-17 - Vietnamese README

- Read the workspace scripts, `.env.example`, API/web package scripts, and Docker Compose configuration; did not read `.env`.
- Added `README.md` in Vietnamese with prerequisites, safe environment-file setup, MySQL/Redis options, web/API startup commands, usage, tests, endpoints, and troubleshooting.
- Verified all README-linked workspace paths exist, `git diff --check` passes, and VS Code reports no README errors.

## 2026-10-17 - Softer chat workspace UI

- Reviewed the existing React view and CSS, then reorganized the interface into a sidebar + conversation workspace with a responsive mobile drawer.
- Added recent-session navigation, a transcript-style user/assistant view for progress and results, and a bottom-aligned compact composer while preserving the existing API handlers.
- Changed typography to Nunito Sans with Lora accents and softened the sage/ivory palette, borders, and control shapes.
- `pnpm --filter @fake-news/web build`: succeeded. Playwright checks at desktop and 390px mobile found no horizontal overflow; drawer open state and bottom composer placement were verified.

## 2026-11-03 - Backend status and API verification

- Read this log, the API/pipeline/security/data-model sections of `spec.md`, and only the related API entrypoint, analyzer, URL extractor, schema, package scripts, and tests.
- Git after the user's `git pull origin dev`: clean worktree on branch `hoangnh01`.
- API checklist against spec:
	- [x] F1 text/URL input API and request validation.
	- [x] F2 Readability extraction with redirect, content-size, timeout, and public-IP protections.
	- [~] F3-F5 LLM claim extraction, evidence retrieval, and citation-constrained verdicts are implemented for Gemini/Groq/Ollama but need a configured provider for a live run.
	- [x] F6 credibility aggregation and insufficient-evidence behavior; unit tested.
	- [x] F7 result/evidence persistence and source links are implemented; MySQL persistence is not verified against a connected database.
	- [ ] F8 domain reputation; result remains `unknown` and the `domains` table is not populated.
	- [x] F9 browser-session history routes.
	- [~] F10 content-hash cache lookup is implemented within a browser session; not tested with a live DB.
	- [ ] F11 TF-IDF classifier integration/training.
	- [x] F12 feedback route.
	- [x] Rate limit, SSRF checks, response-size/time caps, and disclaimer are implemented.
	- [~] BullMQ support is optional and disabled by default; Redis-backed execution was not run.
	- [ ] MySQL and LLM end-to-end integration remains blocked by local database credentials/provider configuration.
- Added API-boundary URL validation: reject malformed, non-HTTP(S), and credential-bearing URLs before queuing work.
- `pnpm --filter @fake-news/api test`: 6 passed. `pnpm --filter @fake-news/api build`: passed.
- Live API smoke test: invalid `file://` URL -> HTTP 400; credential-bearing URL -> HTTP 400; `/health` -> HTTP 503 because MySQL is unavailable. No valid analysis was submitted, so no database record or provider quota was used.
- `docker compose config --quiet`: passed. Docker/MySQL and provider integrations were not started or exercised.

## 2026-11-03 - Groq provider check

- Confirmed the configured Groq model ID against the authenticated model catalog; the `.env` value was missing the `qwen/` namespace.
- Updated only `GROQ_MODEL` in ignored `.env`; did not read back, print, or copy the API key.
- Called `analyzeContent` through the backend Groq adapter with a minimal greeting: succeeded with zero claims and `insufficient_evidence`.
- Restarted `pnpm dev:api` so it loads the corrected setting. The API listens on port 3000; `/health` remains HTTP 503 because MySQL credentials are still unavailable.

## 2026-11-03 - MySQL and Groq API integration

- Updated only the local `DATABASE_URL` account to the user's requested `root/root`; left all provider keys untouched.
- Restarted the API; health changed to HTTP 200 with `database: ok`.
- The database existed but contained no tables. Applied `apps/api/db/init.sql` (idempotent `CREATE TABLE IF NOT EXISTS` statements); confirmed 5 tables and an empty history.
- Submitted one short greeting through `POST /api/analyses` with a dedicated test session. SSE completed; `GET /api/analyses/:id` returned a persisted Groq result with zero claims and `insufficient_evidence` as expected.
- Repeated the same request and received `cached: true`; history returned the single completed test analysis. No second Groq request was made.

## 2026-11-03 - Supervised classifier and FastAPI integration

- Preserved the user's pre-existing edits in `spec.md`, `.env`, `.vscode/launch.json`, and other worktree files; chose the user's confirmed FastAPI direction rather than adding Flask.
- Reviewed `spec_bosung.md`, the classifier/FastAPI sections of `spec.md`, and only the relevant AI-service/API/UI files.
- Researched VFND metadata without downloading data. The CSV README describes 226-row `text,label` and 223-row `text,domain,label` variants, labels `0=Real`, `1=Fake`; the dataset README asks users to contact its authors before use. Did not download the data or claim benchmark performance.
- Configured an isolated Windows CPython 3.13.3 venv because the advertised Python 3.11 launcher path was missing and MSYS Python could not install binary wheels. This validates the dev environment only; project support metadata remains 3.11/3.12.
- Installed the service/ML dependencies in that venv and wrote the ignored `apps/ai-service/requirements.lock`; no packages were installed globally.
- Added `ml/requirements.txt`; created an offline pipeline for NFC normalization, URL/number token replacement, punctuation cleanup, invalid/conflicting/duplicate row handling, word/character TF-IDF, four-model comparison, stratified 80/20 holdout, stratified 5-fold train-only CV, metrics, EDA, joblib export, and optional external evaluation with overlap removal.
- Added FastAPI model loading, health/model-status reporting, and `/predict` probabilities/features. Missing artifact leaves health available and returns 503 from `/predict`.
- Added the Express optional classifier call, separate MySQL `classifier_signals` table and result contract/UI. A missing/unavailable classifier is ignored; the Groq evidence score/verdict is not changed.
- Applied the idempotent API schema to the local MySQL database; the classifier-signals table is present.
- Tests use synthetic fixture strings only: 8 Python tests pass (cleaning, split/evaluation/export/EDA, external overlap, FastAPI missing/loaded model); 7 API tests pass (including classifier outage fallback).
- Root `pnpm build` passes. Docker Compose config is valid. FastAPI `/health`=200, `/model/status` reports unavailable and `/predict`=503 without a trained artifact; Express/MySQL `/health`=200.
- No real news data was downloaded, no trained model/artifact or real benchmark report was produced, and the 85% target is unverified. Next data step requires author permission or a user-provided licensed dataset in `ml/data/`.
- Final process check after restart: Express/MySQL `/health`=200; FastAPI `/health`=200 with classifier `unavailable`; `/model/status` reports no artifact. The active runtime is ready for prediction once an authorized dataset is used to train and export the artifact.

## 2026-11-03 - VS Code API debugger

- Confirmed there was no existing `.vscode` configuration to preserve.
- Added `.vscode/launch.json` with a `Debug API` launch target using Node's `tsx` import, API package working directory, root `.env`, and source maps.
- VS Code diagnostics for the launch configuration: no errors.
- After observing the integrated-terminal launcher expand `.env` values into the shell command, switched the debugger console to `internalConsole` to avoid echoing secrets in PowerShell command history/output.
- The user reported the debugger exited silently. Diagnosed an existing tsx API listener already bound to port 3000. Removed the redundant `envFile` (the API loads root `.env` itself) and changed output to `integratedTerminal` so startup errors are visible without expanding secrets into a shell command.

## 2026-11-03 - Classifier contract and WBS reconciliation

- Renamed the API result field to `classifier_signal` so the result contract describes the supervised fake/real signal rather than implying clickbait-only detection.
- Added top weighted feature explanations for Logistic Regression and calibrated Linear SVM, displayed separately from the evidence-based credibility result.
- Aligned F11, result format, and data model in `spec.md`; added training instructions to `README.md` and the phase/status WBS in `ml/WBS.md`.
- Pylance diagnostics found typing gaps around sklearn transformer typing and metric dictionaries; added explicit casts/annotations without changing runtime behavior. Rechecked diagnostics: no errors.
- Final verification: root `pnpm build` passes, 7 API tests pass, 8 Python tests pass, and FastAPI/Express smoke checks match the no-model fallback.
- Full data-derived outputs remain pending author permission or a user-supplied licensed dataset. No real news data or trained model was downloaded/generated.

## 2026-11-05 - User-supplied VFND-Mini prototype

- The user supplied `apps/ai-service/vfnd_dataset_1000` and asked that it be used for training. Inspected README/CSV metadata and aggregate counts; did not print raw article text.
- Dataset README labels it VFND-Mini, 1,000 rows, 50/50 by raw row count. Provenance/labeling was not independently verified.
- Pylance/pandas stats: train 700 rows -> 80 normalized unique texts (620 duplicate rows), unique labels 60 real / 20 fake; val and test each have the same 80 unique texts as train, with no label conflicts. Therefore val/test provide zero independent samples after overlap removal.
- Trained only from `train.csv` after dedupe; selected Multinomial Naive Bayes. Internal CV and 16-row holdout both score 100%, but this is a tiny/repetitive dataset and is not accepted as a valid 85% benchmark claim.
- Generated ignored artifacts: `classifier.joblib` (260,637 bytes), cleaned CSV, EDA JSON/PNG, model comparison CSV, and training report.
- Live predict initially labeled a short greeting as fake (about 73%). Added a training-length abstention floor; after title+body ingestion, the final floor is 102 words. Retrained and confirmed `/predict` returns 422 for a 5-word input. Through Express, the same short input completed Groq analysis and returned `classifier_signal: null`.
- FastAPI reports the model available after restart; Express/MySQL health is 200. Raw dataset files and ZIP are git-ignored.
- README/spec/WBS now state that the supplied splits are not independent and provenance is unverified. A separate provenance-verified dataset is required for a real external benchmark.
- Loader combines the optional `title` with `text`; rerunning the train split retains 80 unique texts (60 real/20 fake), now 102-120 words after combination. Artifact regenerated and FastAPI reloaded; short sample still abstains with HTTP 422.
- After reloading the title-aware artifact, a short phrase submitted through Express completed via Groq and the saved result had `classifier_signal: null`; the primary result was `insufficient_evidence`. FastAPI/MySQL health checks both returned 200.