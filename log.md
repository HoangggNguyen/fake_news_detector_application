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

## 2026-11-07 - Evidence-backed corrections

- Read this log, `spec.md`, `README.md`, and the AI analyzer, API persistence, shared result types, and result UI. The primary evidence-checking flow was implemented; the supervised classifier remained a prototype blocked from independent validation by overlapping/unverified data.
- After the user approved the proposal, changed evidence retrieval to gather results from all configured providers, deduplicate URLs, label source types, and preserve provider failures in logs.
- Tightened verdicts so cited evidence must have a matching stance. Added a correction only for a refuted claim with refuting citations from at least two distinct fact-check or recognized government/education domains; otherwise the correction is null.
- Persisted correction/source metadata, updated the result contract and UI, updated the spec/README, and added a one-time migration for existing MySQL schemas.
- `pnpm --filter @fake-news/api test`: 9 passed. `pnpm build` from `fakeapp/`: passed for API, shared package, and web. `git diff --check`: passed.
- A root `pnpm build` from the parent workspace directory failed because that directory has no `package.json`; rerunning from `fakeapp/` succeeded.
- Did not make a live LLM/search request or apply the SQL migration to a database. Existing databases must run `apps/api/db/migrations/20261107_claim_corrections_and_evidence_sources.sql` once before starting the updated API.
- No new classifier training or real-world accuracy claim; independent evaluation remains blocked pending an authorized, non-overlapping dataset.

## 2026-11-07 - Add deduplicated news split to classifier training

- Inspected the user-provided `vfnd_dataset_deduplicated` README and aggregate CSV metadata with the AI-service virtual environment; did not print article text.
- Confirmed 20 total rows (10 real / 10 fake), with 14 train rows (7 per class), 3 validation rows, and 3 test rows. The source, rights, and labeling process are not independently verified.
- Verified with the project's loader that the new train split has no normalized text overlap with the existing train or its own validation/test splits.
- Added repeatable `--additional-train` and `--external` arguments. Training inputs now deduplicate across files and remove same-text conflicting-label rows. Kept val/test separate from training.
- Updated README, spec, WBS, and `.gitignore` so local news article files are not accidentally committed; added a regression test for cross-dataset deduplication/conflicts.
- AI-service tests: 11 passed. Retrained the ignored classifier artifacts from 80 existing unique rows plus 14 new train rows (94 total, 67 real / 27 fake). New validation and test each scored 3/3 with zero overlap removed; these tiny scores are not reliable evidence of generalization. Internal CV/holdout was also 100% and is not claimed as real-world accuracy.
- Selected model: Multinomial Naive Bayes; regenerated artifact's minimum input length is 55 words. FastAPI was not restarted, so an already-running process must be restarted to load the new artifact.

## 2026-11-07 - Fix analysis result endpoint 503

- Reproduced the reported request: API health was 200, but `GET /api/analyses/:id` returned a generic 503; the Vite proxy passed through the same response.
- Queried the configured database schema and confirmed `claims.correction` and `evidence.source_type` were missing, although the current result loader selects both columns.
- Applied only the additive migration columns to the configured MySQL database; existing rows were preserved. Verified both columns are present.
- Retested the supplied analysis ID with the supplied session ID through the API and Vite proxy: both returned HTTP 200. The stored analysis itself is `completed` with `insufficient_evidence` and no extracted claims; this is its saved analysis outcome, not a remaining HTTP error.
- `/health` remains HTTP 200 with database `ok`; `git diff --check` passes.

## 2026-11-07 - Start trained classifier with backend

- Confirmed the API already calls the optional FastAPI classifier through `AI_SERVICE_URL` (configured to `http://localhost:8000`); the newly trained `ml/artifacts/classifier.joblib` existed, but port 8000 had no listener.
- Added a VS Code `Debug AI Service` launch configuration using the AI-service venv and a `Debug Backend + AI` compound launch; documented the startup and readiness check.
- Started Uvicorn on `127.0.0.1:8000`. `/health` reports classifier `ready`; `/model/status` reports Multinomial Naive Bayes `tfidf-baseline-v1`.
- Sent a synthetic technical smoke-test input through `/predict`; inference returned a valid label and probability distribution. This verifies model loading/inference only, not news-classification accuracy.
- API/MySQL health remains `ok`. `launch.json` parses as JSON and `git diff --check` passes. The API process remains independently managed; use the VS Code compound configuration to start both processes together in future sessions.

## 2026-11-07 - Document AI service startup command

- Added the missing third PowerShell terminal command to the README: activate `apps/ai-service/.venv`, then launch `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`.
- Documented that all three services should remain running and linked the model readiness endpoint. The existing VS Code compound launch remains an alternative.
- Documentation-only change; no test run required.

## 2026-11-07 - Account conversations and evidence suggestions

- Added local registration/login/logout with scrypt password verification and database-backed HTTP-only login sessions. Per explicit user request, `users.real_pass` also stores the plaintext password; this is unsafe for real users or public deployment. No credentials were recorded in this log.
- Added account-owned conversations and per-conversation analysis history, ordered by an auto-incremented turn number. Each submission creates a separate turn even if the same content is sent again.
- Added an explicit browser-history import into the signed-in account; legacy analyses are not moved until requested, and each legacy analysis becomes its own conversation.
- Updated the UI to show conversation history and evidence-backed suggestions. Added a preferred-source Tavily query for Tuoi Tre, VnExpress and Thanh Nien, while retaining the requirement for refuting evidence and multiple eligible domains before suggesting a correction.
- Applied the additive account/conversation migration to the configured MySQL database after inspecting for existing tables/columns.
- `pnpm build` passed; `pnpm --filter @fake-news/api test` passed 10 tests. On an isolated temporary API process, integration checks passed for registration, password verification, separate-account authorization, ordered turns, explicit legacy import, logout and login. Temporary test records were removed and the helper process stopped.
- A second isolated API smoke check submitted two non-sensitive sample claims to the configured provider, waited for both analyses to complete, and confirmed both turns were persisted and returned in order. The temporary account and analyses were removed, and the helper process was stopped.
- Existing classifier accuracy and provenance limitations remain unchanged. Live editorial-source search and AI-generated correction quality have not been independently benchmarked.

## 2026-11-07 - Streamline history and inspect training example

- Replaced the duplicate history navigation buttons with a "Xem tất cả" action beneath recent conversations and removed the English disclaimer from the result view. The complete history and the Vietnamese source-check reminder remain available.
- The VFND_0991 training example has label 0 and names the government portal, but does not contain a specific source URL, decree number, or date. The classifier training pipeline does not use the source column as an evidence database.
- Verified that the supplied 10-word headline is rejected by the classifier's 55-word minimum. This does not by itself determine the separate evidence-based verdict.
- At the user's choice, removed the 1–5 feedback controls from the UI while retaining the existing backend endpoint and stored feedback. The /100 score and evidence-based verdict logic were not changed.
- `pnpm --filter @fake-news/web build` and `git diff --check` passed after the UI changes.

## 2026-11-07 - Simulated dataset classification

- Per user clarification, use both local train CSVs as simulated labeled data; do not call the web evidence/LLM pipeline for text classification. URL input still downloads the submitted URL. Validation/test splits remain outside the lookup.
- Match normalized titles or full text with number preservation; conflicting labels remain unresolved. Otherwise return up to three similar samples, with a classifier prediction only when its input length requirement and the uncalibrated 0.9 threshold are met. Sources are displayed as simulated metadata, not verified links.
- Persist lookup results in the additive `dataset_results` table and display matched/suggested samples in conversation history. The configured database migration was applied and verified.
- The deduplicated train CSV currently contains an incomplete VFND_0994 row (row 15); it is logged and skipped, without modifying the user's data.
- Python suite: 15 passed; API suite: 10 passed; API and web builds and Pylance syntax checks passed. An isolated temporary-account integration check verified the VFND_0991 real match, an unresolved similar input with suggestions, and saved conversation history; test data was removed. Restarted the AI service and verified both cases on the active service.

## 2026-11-07 - Conversational responses

- Removed news scores and model probability panels from the UI; dataset outcomes now use conversational text, source metadata marked unverified, and related items when available. Legacy results remain readable without scores.
- TF-IDF lookup now also returns related items for exact matches. No new classifier training was performed.
- For inputs without an exact match, Groq may generate one follow-up question; it cannot change the dataset label or sources. A missing key, invalid output, or provider error is displayed explicitly and does not erase the local result. Question status is stored alongside dataset results.
- Documented that unmatched input, including extracted URL content, can be transmitted to Groq. No fabricated links are shown.
- Focused AI tests and API tests passed; API/web builds passed. Local integration used a temporary account to verify an exact match, the gold topic, Groq follow-up, and persisted conversation history; temporary records and test services were removed. The browser mock check could not be completed.

## 2026-11-07 - Financial data and full content

- Added four original summaries of publicly sourced historical information, one each for gold, petroleum, exchange rates and securities, with source URLs and clear time context. The new finance dataset contains only supported examples; no fake financial labels were invented.
- The lookup and saved result schema retain source URLs; matched and suggested items display their full stored text and link to a source when one exists. Older items without URLs remain readable and are marked unverified.
- Fixed loading numeric 0/1 labels when incomplete CSV rows cause pandas to infer floats, and allowed single-class training inputs only when the merged training set still contains both labels. One incomplete existing dataset row is excluded.
- Re-trained classifier `tfidf-baseline-v2` on 97 cleaned samples, including the four financial summaries. Logistic Regression was selected. Each existing external set has only three examples and contains no independent financial benchmark; measured results do not establish financial-domain accuracy. Previous artifacts were backed up in session storage.
- AI tests: 18 passed; API tests: 12 passed; API and web builds passed. FastAPI TestClient returned relevant source-linked records for each of the four topics. Browser-level rendering was not verified; an attempted component test runner was incompatible with the current JSX configuration and was not retained.

## VFND 10,000 dataset integration

- Added the supplied `vfnd_dataset_10000_full/train.csv` to local lookup and training without modifying the dataset. Its 7,000 training rows normalize to 20 distinct samples (10 per label); validation/test contents overlap train and are not independent benchmarks. Label-revealing language in the data also limits meaningful generalization.
- Normalized category and sample-number title decorations for matching and deduplication while retaining numeric differences and unresolved conflicting labels. Existing datasets remain usable if the optional new dataset is absent, with a warning.
- Preserved full article text but did not promote the new dataset's unverified `url` column to a verified source link. The UI identifies content and sources without linked provenance as unverified.
- Re-trained `tfidf-baseline-v3` on 117 cleaned examples from all four datasets; Multinomial Naive Bayes was selected. Each older external validation/test set contains only three examples, so its metrics do not establish real-world accuracy. Previous artifacts were backed up in session storage.
- AI tests: 21 passed; API tests: 12 passed; web build passed. FastAPI TestClient verified the final artifact, all 20 new records by original title, normalized title and body, and the four existing finance suggestions. No services were listening on ports 8000, 3000 or 5173 at the final check; no browser test was performed.
## 2026-11-09 - Hybrid dataset + evidence analysis

- Combined both analysis approaches. Layer 1 (primary): dataset lookup + TF-IDF classifier via AI service, unchanged. Layer 2 (reference): the existing LLM claim-extraction and web-evidence pipeline (`analyzeContent`) now runs when Layer 1 has no exact match; disable with `EVIDENCE_CHECK=false`.
- Added `apps/api/src/hybrid.ts` (`shouldCheckEvidence`, `runEvidenceCheck`, `combineResults`). Overall label priority: dataset match → classifier prediction → web evidence (marked as reference) → unresolved. Layer 2 errors are stored as `evidence_check` in `dataset_results.result` and shown in the UI; they do not fail the analysis. No database migration needed (JSON column).
- UI shows dataset result first, then a "Đối chiếu bằng chứng web · tham khảo" section with claims, verdicts and source links. Shared types extended with `evidence_check` and `overall_basis`.
- `pnpm build` passed; API tests: 16 passed (4 new hybrid tests). No live end-to-end run: the local `.env` has no LLM/Tavily/Fact Check keys, and the dataset folders and `ml/artifacts/classifier.joblib` are absent on this machine. Python tests not run (`pytest` missing from the venv).
