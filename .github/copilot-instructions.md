# Copilot / AI Agent Instructions — Betting Assessment App

Purpose
- Give AI coding agents the minimal, high-value context to be immediately productive in this repo.

Big picture
- Monorepo-like layout with a small Express backend (backend/server.js) and a CRA React frontend (frontend/).
- Backend serves API on port 3001. Frontend dev server normally on 3000 (CRA may auto-shift to 3002).
- Main flows: create assessment -> students join via `studentCode` -> students fetch questions and submit bets -> backend returns per-question result and updated coin totals.

Key files & entry points
- backend/server.js — express API routes: /api/assessment/create, /api/assessment/join, /api/assessment/:code/student/:id/question, /submit, /report, /template, /health.
- frontend/src/App.js — single-file app controller. Contains entry, setup, GameScreen, question load/submit logic, assessment-level timer handling.
- frontend/src/components/BettingQuestion.js — betting UI (single-option slider UI). Be careful: this file was edited multiple times; keep it single-component, top-level imports only.
- scripts/smoke_test.js — end-to-end smoke test used to create → join → question → submit → report flows. Useful for automated validation.
- START.bat / START.sh — convenience scripts to start both servers; inspect before editing.

Run & debug (developer workflow)
- Start backend: `node backend/server.js` (listens on 3001). If you see EADDRINUSE, run `netstat -ano | findstr :3001` and kill the offending PID with `taskkill /PID <pid> /F`.
- Start frontend (dev): `cd frontend && npm start` (CRA). If CRA asks to run on another port, allow it or set `PORT=3000` before starting.
- Build frontend for production: `npm run build` from repo root (configured in root package.json to run frontend build).
- Run smoke test (after backend is running): `node scripts/smoke_test.js`.

API payloads & conventions
- Create assessment (`POST /api/assessment/create`): expects { name, questions, initialCoins, winMultiplier, totalDuration (seconds), studentCode, teacherCode }.
- Join (`POST /api/assessment/join`): body { code, studentName } returns { studentId, remainingTime, initialCoins }.
- Question fetch: `GET /api/assessment/:code/student/:studentId/question` returns question object with `options` array of { id, text } and flags like `multipleCorrect`.
- Submit (`POST /api/assessment/:code/student/:studentId/submit`): body { bets: { A:0, B:0, ... }, skipped: boolean, noAnswer: boolean, timeTaken: seconds } — response includes `results` with `betResults`, `coinsWon`, `coinsLost`, `newTotal`, `isLastQuestion`.

Frontend patterns & gotchas
- `frontend/src/App.js` orchestrates state: `assessmentData`, `questionData`, `result`, `remainingTime`, `currentCoins`. Prefer updating those through the established helpers (`loadQuestion()`, `handleSubmit()` in App.js) rather than reimplementing submission flows.
- `BettingQuestion` is used as a single-bet slider UI that calls `onPlaceBet(optionId, amount)` or `onSkip()`. Keep props and method names consistent with App.js usage.
- Watch out for accidental duplicated imports or nested module content (seen in `BettingQuestion.js` previously). Always ensure imports are at file top level.

Backend patterns & gotchas
- Backend keeps assessment-level timer (`totalDuration`) and per-student `remainingTime` on join. Submissions deduct `timeTaken` and may finalize the session.
- When modifying endpoints, keep response shapes stable — frontend expects fields like `studentId`, `studentCode`, `results`, `newTotal`, and boolean `isLastQuestion`.

Automation & testing
- `scripts/smoke_test.js` is the canonical e2e script — keep it as a single async IIFE. Run it to validate end-to-end changes.
- Use `npm run build` then `node scripts/smoke_test.js` for a deterministic test against the built frontend/backends if you prefer (some CI setups use this sequence).

Common fixes agents should try first
- Syntax/import errors in frontend: inspect `frontend/src/components/**` for accidental nested `import`/`export` statements. Fix by ensuring a single top-level component export.
- Port conflicts: check `netstat -ano | findstr :3001` and `:3000` and kill lingering Node processes.
- Corrupted scripts: if `scripts/smoke_test.js` has duplicated content or markdown fences, replace with a single clean async IIFE.

Developer conventions
- Keep changes small and targeted — repo is primarily educational/demo code; avoid broad refactors.
- Do not add license headers or change public APIs without coordinating — tests and frontend assume stable response shapes.
- Use the existing UI flows in `App.js` when adding features; don't bypass `loadQuestion()`/`setResult()` logic.

Where to look first when you start
- `frontend/src/App.js` — to understand UI flows and where to wire changes.
- `backend/server.js` — to understand API semantics and where server-side timers and coin math live.
- `scripts/smoke_test.js` — for an executable spec of the end-to-end flow.

If something is unclear
- Ask for clarification and include failing console output or the exact request/response payloads. For runtime issues cite ports, Node version and exact command used.

— End of instructions
