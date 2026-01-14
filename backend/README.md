# Backend: Database & ZIP Upload Notes

This backend supports optional Postgres persistence for question data processed from ZIP uploads.

Quick setup

- Install dependencies in the `backend` folder (from repo root):

```powershell
cd backend
npm install
```

- Provide a Postgres connection via `DATABASE_URL` env var (e.g., `postgres://user:pass@host:5432/dbname`).

- Run migrations (using your migration tool). A scaffolded SQL migration lives in `backend/migrations/1680000000000_add_question_images.sql`.

- Start the server:

```powershell
# from repo root
node backend/server.js
```

Notes

- If `DATABASE_URL` is not set the ZIP upload endpoint `/api/questions/upload_zip` will process and return questions with base64 image data but will not persist them to the database.

- Confirm DB connectivity with: `/api/db/health`.

- `sharp` has native bindings; on Windows you may need build tools (Windows Build Tools / VS Build Tools) available for `npm install` to succeed.

Security & limits

- The ZIP upload enforces a 50MB max upload size and validates image file extensions. Avoid running this on untrusted public endpoints without additional hardening.

