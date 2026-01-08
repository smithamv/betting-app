# Backend Module Guide

## Stack & Runtime
- **Node + Express** (`server.js` is the single entry point) with `cors`, `body-parser`, and `multer` for HTTP plumbing.
- **State**: All assessments, students, and responses are stored in-memory (`assessments` object). Restarting the process wipes active sessions.
- **Primary dependencies**:
  - `csv-parse/sync`: Validates uploaded CSV question banks.
  - `multer` (memory storage): Accepts CSV uploads without touching disk.
  - `pdfkit`: Builds downloadable student/teacher PDF reports.
  - `uuid`: Generates assessment and student identifiers.

## Key Concepts & Helpers
- `generateCode()`: Uppercase alphanumeric code generator reused by both frontend and backend flows.
- `calculateSkipPenalty()`: Centralized 5% penalty logic (rounded to nearest 10); reuse this when introducing new timeouts or skip paths.
- `getPersona()` and `calculateKnowledgeScore()`: Convert accuracy/confidence metrics into persona labels and knowledge percentages. Reports rely on these helpers; editing them changes both student and teacher summaries.
- `validateQuestions()`: Ensures CSV rows contain required columns and sanitizes correct-answer data into `correct_answers` arrays.

## Route Groups
1. **CSV Utilities**
   - `GET /api/template`: Returns a starter CSV.
   - `POST /api/questions/preview`: Parses uploaded CSV, returns `parsedQuestions` + validation errors.
2. **Assessment Lifecycle**
   - `POST /api/assessment/create`: Accepts payload `{ name, questions, initialCoins, winMultiplier, totalDuration, studentCode?, teacherCode? }`. Normalizes question objects and registers both student + teacher code aliases in `assessments`.
   - `POST /api/assessment/join`: Validates student code, creates or reuses student object, seeds `remainingTime` with assessment-level duration.
   - `GET /api/assessment/check/:code`: Distinguishes teacher vs student codes for frontend routing.
3. **Gameplay**
   - `GET /api/assessment/:code/student/:id/question`: Returns next unanswered question plus current coins/time. If `remainingTime <= 0` or all questions answered, responds with `{ complete: true }`.
   - `POST /api/assessment/:code/student/:id/submit`: Handles bet evaluation, skip penalties, and timeout logic. Deducts `timeTaken` from `remainingTime`, computes winnings using `winMultiplier`, updates responses, and flags `isLastQuestion` when appropriate.
4. **Reports & PDFs**
   - `GET /api/assessment/:code/student/:id/report`: Aggregates student responses into persona, accuracy, knowledge score, etc.
   - `GET /api/assessment/:code/teacher/report`: Builds class-wide stats, per-student summaries, and per-question analysis (including misconception alerts when ≥30% answer incorrectly with high confidence).
   - `/pdf` variants (student + teacher) stream PDFKit documents using the same computed stats.

## Data Shapes
- **Assessment**: `{ studentCode, teacherCode, questions[], initialCoins, winMultiplier, totalDuration, students: { [studentId]: Student } }`.
- **Student**: `{ id, name, coins, currentQuestion, responses[], remainingTime }`; `responses` append metadata for each submit (bets, correctness flags, confidence).
- **Submit Payload**: `{ bets: {A: number, ...}, skipped: boolean, noAnswer: boolean, timeTaken: number }`.
- **Submit Response**: `results` object always includes `betResults`, `coinsWon`, `coinsLost`, `netChange`, `newTotal`, `correctAnswers`, `remainingTime`, `isLastQuestion`.

## Development Workflow
- Install deps once: `cd backend && npm install`.
- Run server: `npm start` (plain node) or `npm run dev` (nodemon auto-restart).
- Environment variables: only `PORT` is honored (defaults to 3001). CORS is wide open for local dev.
- Logging: errors are logged via `console.error` with descriptive prefixes; extend these when adding new routes to aid debugging.

## Extension Tips
- Keep new helpers pure and colocated near existing helper section for visibility.
- Since persistence is in-memory, any long-lived features (e.g., teacher dashboards) should consider serialization if you plan to evolve the project.
- When modifying response structures, coordinate with frontend components (`GameScreen`, reports) and update `scripts/smoke_test.js` to reflect new fields.
