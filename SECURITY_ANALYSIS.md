# Security & Bug Analysis Report

**Date:** 2026-02-11
**App:** QUEST - Gamified Betting Assessment Platform
**Scope:** Full codebase review (backend/server.js, frontend/src/App.js, supporting files)

---

## Note: "Lesson Plan Generation"

There is **no lesson plan generation feature** in this codebase. This is a gamified betting assessment platform where students bet virtual coins on quiz answers. If you are referring to the **assessment creation flow** (CSV/ZIP upload → setup → code generation), the bugs documented below explain what breaks in that pipeline.

---

## CRITICAL BUGS (Will Break the App)

### 1. GameScreen crashes when `questionData` is null
**File:** `frontend/src/App.js:840`
**Severity:** CRITICAL

When the assessment completes, `questionData` is set to `null` (line 720-721), but the game header at line 840 unconditionally accesses `questionData.questionNumber` and `questionData.totalQuestions`. This throws `TypeError: Cannot read properties of null`.

The guard at line 845 only conditionally hides the question column — the header renders regardless.

**Fix:** Add a null check: `{questionData && <div className="progress">Q{questionData.questionNumber}/{questionData.totalQuestions}</div>}`

---

### 2. Result card references nonexistent backend fields
**File:** `frontend/src/App.js:911, 917`
**Severity:** CRITICAL

- Line 911: References `data.winnings` — backend returns `payout` and `profit`, never `winnings`
- Line 917: References `result.coinsWon` — backend returns `coinsReturned`, never `coinsWon`

These render as `undefined` in the results UI, making the result card display broken text.

**Fix:** Map to correct backend field names: `coinsReturned` instead of `coinsWon`, and `profit`/`lost` instead of `winnings`.

---

### 3. `result.correctAnswers` crashes on timeout
**File:** `frontend/src/App.js:923`
**Severity:** CRITICAL

When time expires, the backend response at `server.js:683-691` returns:
```json
{ "timeUp": true, "isLastQuestion": true, "newTotal": 500, "remainingTime": 0 }
```
No `correctAnswers` field is included. The frontend calls `.join(', ')` on `undefined`, crashing the app.

**Fix:** Default to empty array: `(result.correctAnswers || []).join(', ')`

---

### 4. `assessmentData` is null for students who join
**File:** `frontend/src/App.js:868`
**Severity:** HIGH

When a student joins an existing assessment (not creates one), `assessmentData` is never populated in the App state. The `GameScreen` component receives `assessmentData={null}`. Line 868 accesses `assessmentData.winMultiplier` which throws `TypeError: Cannot read properties of null`.

The fallback `|| 2` doesn't help because `null.winMultiplier` throws before the `||` is evaluated.

**Fix:** Use optional chaining: `(assessmentData?.winMultiplier) || 2`, or populate `assessmentData` from the join response.

---

### 5. ZIP upload hardcodes `multiple_correct: false`
**File:** `frontend/src/App.js:238`
**Severity:** HIGH

```javascript
multiple_correct: false  // hardcoded, ignores spreadsheet column
```

All questions uploaded via ZIP have `multiple_correct` forced to `false`, regardless of the actual value in the `questions.xlsx` spreadsheet. Multi-answer questions from ZIP uploads will silently behave as single-answer, producing incorrect scoring.

**Fix:** Parse the `multiple_correct` column from the spreadsheet data: `multiple_correct: (q.multiple_correct || '').toString().toLowerCase().trim() === 'yes'`

---

## SECURITY VULNERABILITIES

### 6. CRITICAL — ZIP Slip / Path Traversal
**File:** `backend/server.js:262`

```javascript
zip.extractAllTo(tmpDir, true);
```

`AdmZip.extractAllTo` does not validate entry paths against directory traversal. A malicious ZIP containing entries with paths like `../../etc/cron.d/malicious` can write arbitrary files outside the temp directory. This is a well-known vulnerability class (CVE-2018-1002200 pattern).

**Impact:** Arbitrary file write on the server. Could lead to remote code execution.

**Fix:** Validate each ZIP entry's path before extraction:
```javascript
const entries = zip.getEntries();
for (const entry of entries) {
  const resolvedPath = path.resolve(tmpDir, entry.entryName);
  if (!resolvedPath.startsWith(tmpDir)) {
    throw new Error('Malicious ZIP entry detected: ' + entry.entryName);
  }
}
zip.extractAllTo(tmpDir, true);
```

---

### 7. HIGH — HTTP Header Injection
**File:** `backend/server.js:1079, 1158`

```javascript
res.setHeader('Content-Disposition', `attachment; filename="${student.name}_report.pdf"`);
```

Student names and assessment names are injected directly into HTTP `Content-Disposition` headers without sanitization. A name containing `\r\n` characters could inject arbitrary HTTP headers (response splitting attack).

**Fix:** Sanitize filenames by removing non-alphanumeric characters:
```javascript
const safeName = student.name.replace(/[^a-zA-Z0-9_-]/g, '_');
res.setHeader('Content-Disposition', `attachment; filename="${safeName}_report.pdf"`);
```

---

### 8. HIGH — No Rate Limiting on Code Guessing
**File:** `backend/server.js:586`

Teacher codes follow a predictable format: `STUDENTCODE-TCH-XXXX` where XXXX is a random 4-digit number (only 9,000 possibilities: 1000-9999). No rate limiting exists on the `/api/assessment/check/:code` endpoint.

An attacker who knows the student code (which is shared publicly with students) can brute-force all 9,000 teacher code combinations in seconds and gain full access to all student data, grades, and reports.

**Fix:** Add rate limiting (e.g., `express-rate-limit`) and/or make teacher codes longer and less predictable.

---

### 9. HIGH — Wide-Open CORS
**File:** `backend/server.js:44`

```javascript
app.use(cors());
```

Allows any origin to make cross-origin requests to the API. In production, any malicious website can make requests to the API from a user's browser.

**Fix:** Restrict CORS to specific allowed origins:
```javascript
app.use(cors({ origin: ['https://yourdomain.com'] }));
```

---

### 10. MEDIUM — Denial of Service via Memory Exhaustion
**Files:** `backend/server.js:20-21, 46`

- Multer allows 100MB file uploads into memory (`memoryStorage()`)
- Body parser allows 50MB JSON bodies
- All assessment data (including base64-encoded images) stored in-memory in a JS object
- No limit on concurrent assessments, students, or file uploads

A few large ZIP uploads combined with many concurrent assessments will cause the Node.js process to run out of memory and crash.

**Fix:** Use disk-based storage for uploads, add per-IP rate limiting, cap max assessments, and set lower upload limits.

---

### 11. MEDIUM — No Input Validation on Assessment Creation
**File:** `backend/server.js:419-509`

The `/api/assessment/create` endpoint accepts:
- `initialCoins` with no minimum/maximum validation (can be 0, negative, or billions)
- `winMultiplier` with no bounds (can be 0, negative, or extremely large)
- `questions` array with no max length
- `name` with no max length

These can cause division-by-zero errors, unexpected scoring, or memory issues with very large payloads.

**Fix:** Add server-side validation with sensible bounds matching the frontend constraints.

---

## SUMMARY TABLE

| # | Severity | Type | Location | Issue |
|---|----------|------|----------|-------|
| 1 | CRITICAL | Bug | `App.js:840` | Null reference crash on game completion |
| 2 | CRITICAL | Bug | `App.js:911,917` | Undefined fields in result card |
| 3 | CRITICAL | Bug | `App.js:923` | `.join()` on undefined crashes on timeout |
| 4 | HIGH | Bug | `App.js:868` | Null `assessmentData` crashes for joining students |
| 5 | HIGH | Bug | `App.js:238` | ZIP `multiple_correct` always false |
| 6 | CRITICAL | Security | `server.js:262` | ZIP slip path traversal |
| 7 | HIGH | Security | `server.js:1079` | HTTP header injection |
| 8 | HIGH | Security | `server.js:586` | Teacher code brute-force (no rate limit) |
| 9 | HIGH | Security | `server.js:44` | Unrestricted CORS |
| 10 | MEDIUM | Security | `server.js:20,46` | Memory exhaustion DoS |
| 11 | MEDIUM | Security | `server.js:419` | Missing input validation |
