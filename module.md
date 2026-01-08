# Betting Assessment Platform — Module Overview

## System Architecture
- **Frontend (frontend/)**: React 18 SPA (Create React App) serving the entire UX from entry screen through teacher/student reports. Talks to backend via relative `/api` calls and expects CORS proxying during dev.
- **Backend (backend/server.js)**: Express server with in-memory storage for assessments, students, and responses. Handles CSV ingestion, lifecycle of assessments, betting math, personas, and PDF export.
- **Automation & Tooling (scripts/, START.*)**: Helper scripts for smoke testing (`scripts/smoke_test.js`) and convenience launchers (`START.bat`, `START.sh`) to run both services locally.

These modules communicate over HTTP. The backend is stateful (per-process), so both frontend dev server and smoke tests must target the same running instance.

## Data Flow at a Glance
1. **Assessment creation** (`/api/assessment/create`): Frontend sends parsed CSV questions and settings; backend normalizes questions, assigns codes, and caches assessment metadata.
2. **Student join** (`/api/assessment/join`): Frontend collects student name + code; backend returns `studentId`, `initialCoins`, and global `remainingTime`.
3. **Gameplay loop**:
   - Frontend calls `/question` to fetch the next prompt and current coins.
   - User interactions in `BettingQuestion` prepare payloads for `/submit` (bets vs skip/no-answer). Backend validates wagers, applies penalties, updates persona metrics, and streams back per-question results plus new totals.
   - Frontend keeps the last result visible while preloading the next question.
4. **Reports** (`/report`, `/teacher/report`, PDF endpoints): Backend aggregates stored responses, computes personas/knowledge scores, and returns summarized JSON; frontend renders via StudentReport/TeacherReport components.

## Build, Run, and Test
- **Backend**: `cd backend && npm install && npm start` (port 3001). Uses `nodemon` via `npm run dev` for hot reloads.
- **Frontend**: `cd frontend && npm install && npm start` (CRA defaults to 3000 but scripts pin to 3002 on Windows). `npm run build` from repo root chains backend + frontend installs before bundling the React app.
- **Smoke Test** (`scripts/smoke_test.js`): Requires backend running on 3001. Script programmatically exercises create → join → two submissions → report and logs each response.

## Key Files & Responsibilities
| Path | Purpose | Notes |
| --- | --- | --- |
| frontend/src/App.js | Single entry orchestrating entry, upload, setup, gameplay, and reports | Passes props into `BettingQuestion`, manages timers and result preloading |
| frontend/src/components/BettingQuestion.js | Casino-style betting UI | Emits `onPlaceBet` / `onSkip` callbacks |
| backend/server.js | All Express routes and business logic | Stores assessments in-memory; PDF generation via `pdfkit` |
| scripts/smoke_test.js | End-to-end sanity script | Ensure it's a single async IIFE hitting `/api` endpoints |
| START.bat / START.sh | Convenience launchers | Windows script sets PORT=3002 before CRA start |

## External Dependencies
- **Backend**: `express`, `cors`, `body-parser`, `multer`, `csv-parse` (CSV ingestion), `pdfkit` (PDF reports), `uuid` (IDs).
- **Frontend**: `react`, `react-dom`, `react-scripts` (CRA runtime/build).
- **Dev tooling**: `nodemon` for backend, CRA scripts for frontend.

## Collaboration Tips
- Backend state is per-process RAM; restarting server wipes assessments—plan tests accordingly.
- Maintain response shapes expected by frontend (`results.betResults`, `newTotal`, `remainingTime`, etc.) to avoid runtime regressions.
- Port conflicts are common; use `netstat -ano | findstr :3001`/`:3002` then `taskkill /PID <pid> /F` when servers refuse to start.
- Keep `scripts/smoke_test.js` minimal and free of nested IIFEs; it doubles as documentation for required API flows.
