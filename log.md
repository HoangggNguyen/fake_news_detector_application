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