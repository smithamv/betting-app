# Scripts Module Guide

## Directory Contents
- `scripts/smoke_test.js`: Node script that exercises the end-to-end API flow (health → create → join → fetch question → submit answers → fetch report).
- Root-level helpers (`START.bat`, `START.sh`): Convenience launchers that boot backend and frontend together. While not stored inside `scripts/`, they complement the automation story and should stay in sync with smoke-test expectations.

## Smoke Test Details
- **Runtime**: Requires Node 18+ so that `fetch` is available globally. Run via `node scripts/smoke_test.js` from repo root.
- **Prerequisite**: Backend server must already be running on `http://localhost:3001` because the script calls `/api/...` endpoints directly.
- **Flow**:
  1. `GET /api/health` — fails fast if backend unavailable.
  2. `POST /api/assessment/create` — seeds a two-question assessment with default settings.
  3. `POST /api/assessment/join` — joins as "Tester" and captures `studentId`.
  4. `GET /question` → `POST /submit` — answers the first question with a winning bet.
  5. `GET /question` → `POST /submit` — skips the second question to cover penalty logic.
  6. `GET /report` — ensures results can be retrieved after completion.
- **Logging**: Uses a helper `log(label, obj)` to pretty-print each API response. Tailor this if you add extra assertions or need automated verification (e.g., exit code based on response fields).
- **Common Edits**: When API payloads change, update the `createPayload`, per-question submission shapes, and any success criteria. Keep the script as a single async IIFE to avoid nested invocations and syntax errors.

## START Scripts
- `START.bat`: Windows batch file that typically opens two terminals or sequential commands to start backend (`node backend/server.js`) and frontend (`cd frontend && npm start`, forcing `PORT=3002`).
- `START.sh`: POSIX shell equivalent; make executable via `chmod +x START.sh` before running (`./START.sh`).
- Ensure these scripts reference the correct ports and commands whenever backend/frontend package scripts change, so newcomers can rely on them for local setup.

## Extending Automation
- For CI or richer local validation, consider expanding `scripts/` with additional Node scripts (e.g., load-testing, report generation). Follow the same pattern: dependency-light, plain async functions, top-level `await` via IIFE.
- If you add scripts that mutate backend state, document any cleanup requirements (remember the backend is in-memory, so restarting Node is the quickest reset mechanism).
