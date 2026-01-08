# Frontend Module Guide

## Stack & Entry Points
- **Framework**: React 18 (Create React App). Rendering starts in `src/index.js`, which mounts `<App />`.
- **Styles**: Global styles live in `App.css` / `index.css`; component-specific styles sit next to components (e.g., `components/BettingQuestion.css`).
- **API Base**: All network calls use the relative base `/api`, relying on CRA proxy for local development.

## Major Screens inside `App.js`
1. **EntryScreen**: Accepts assessment codes and routes to join vs teacher report flows by calling `/api/assessment/check/:code`.
2. **QuestionUpload**: Handles CSV validation via `/api/questions/preview` (multipart POST using FormData).
3. **AssessmentSetup**: Sends validated questions + settings to `/api/assessment/create`, auto-generating student/teacher codes when not provided.
4. **GameScreen**: Core gameplay view.
   - Maintains `questionData`, `currentCoins`, `remainingTime`, `bets`, and `result` state.
   - `loadQuestion()` fetches `/question`, applies a flash animation, and keeps prior result visible until next question is ready.
   - `handleSubmit()` posts bets to `/submit`, handles skip/timeouts, and preloads the following question when not final.
   - `BettingQuestion` component encapsulates option selection + confidence slider; emits `onPlaceBet(optionId, amount)` which immediately triggers backend submission.
   - Result column remains rendered so students can review bet outcomes while the next prompt loads.
5. **StudentReport**: Fetches `/student/:studentId/report` after completion and displays persona, stats, and review topics. Provides PDF download via `/pdf` endpoint.
6. **TeacherReport**: Renders `/teacher/report` data with tabs (overview, students, questions) and supports PDF export.

## Component Relationships
- `App.js` holds navigation state (`view` enum) and passes handlers down to child screens. Avoid duplicating API calls outside this orchestrator.
- `BettingQuestion` receives plain props (question, remainingCoins, etc.) and remains stateless beyond local selection/confidence. Keep imports at the top-level to avoid bundler errors.
- Other UI pieces (forms, grids) live inline within `App.js`; consider extracting only when logic becomes complex, otherwise follow the existing single-file convention.

## State & Timing Patterns
- Assessment timer is global: `remainingTime` tracks seconds left and is decremented via an interval hook. Every submit payload includes `timeTaken` so the backend can subtract from the student’s remaining allotment.
- Bets are plain objects keyed by option letter. Ensure any new UI keeps them in sync with `currentCoins` and `remainingCoins` calculations (`totalBet = sum(bets)`).
- Result handling: `result` state is only cleared after `loadQuestion()` finishes the flash animation, so UI must tolerate simultaneous `result + loading` states.

## Dependencies & Commands
- Install/start: `npm install`, then `npm start` (Windows sets `PORT=3002`; use `npm run start:mac` on Unix-like systems if you want the same port).
- Build: `npm run build` (bundles assets into `frontend/build/` for deployment or to serve via backend/static host).
- External libs are limited to CRA defaults (`react`, `react-dom`, `react-scripts`). Any additional UI/utility library should be justified since the project aims to stay lightweight.

## Gotchas
- CRA proxy only works during `npm start`; for production you must serve frontend build via a static host or configure backend static serving manually.
- Keep `BettingQuestion.js` clean—accidental nested `import`/`export` statements have broken the build in the past.
- Because the backend is in-memory, refreshing during gameplay can orphan a student session; UX assumes both servers stay alive through an assessment run.
