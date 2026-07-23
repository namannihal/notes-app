# Sthir Notes — API (Phase 2)

Node.js + Express + Prisma + PostgreSQL backend with single-account auth,
offline-sync endpoints, Azure Blob attachment storage (SAS URLs), and Evernote
(ENEX) import. See [`../../specs.md`](../../specs.md) for the full design.

## Endpoints

```
Auth
  POST   /api/auth/login          { email, password } → sets httpOnly cookie
  POST   /api/auth/logout
  GET    /api/auth/me

Stacks / Notebooks / Notes        CRUD (soft delete), filtered by user
  GET/POST/PATCH/DELETE /api/stacks[/:id]
  GET/POST/PATCH/DELETE /api/notebooks[/:id]?stackId=
  GET/POST/PATCH/DELETE /api/notes[/:id]?notebookId=
  GET    /api/notes/search?q=...   Postgres full-text over content_text

Sync
  GET    /api/sync/pull?since=<ISO>
  POST   /api/sync/push            { changes: [...] } → { accepted, conflicts }

Attachments (Azure Blob via SAS)
  POST   /api/attachments/upload-url     → { attachmentId, uploadUrl|null, alreadyExists }
  POST   /api/attachments/:id/commit
  GET    /api/attachments/:id/download-url
  DELETE /api/attachments/:id            (+ blob GC when unreferenced)

Import
  POST   /api/import/enex?stackId=&notebookTitle=   body: raw ENEX XML
```

## Local setup

```powershell
# 1. Start Postgres (from notes-app/)
docker compose up -d

# 2. Configure env
Copy-Item .env.example .env    # then edit values

# 3. Install + generate client
npm install
npm run prisma:generate

# 4. Create the database schema
npm run prisma:migrate

# 5. Seed your single account (uses SEED_EMAIL / SEED_PASSWORD)
npm run seed

# 6. Run
npm run dev
```

## Security notes
- Passwords hashed with bcrypt (cost 12); JWT in an httpOnly, SameSite=Lax cookie.
- All routes except `/api/auth/login` and `/api/health` require auth.
- Every query is scoped by `userId`.
- Attachment SAS URLs are short-lived (10 min); the Blob container is private.
- Uploads validated by MIME type + a 200 MB safety cap.
- Set `COOKIE_SECURE=true` and use HTTPS in production.

## ENEX import
The ENML → TipTap conversion is intentionally pragmatic (paragraphs, headings,
lists, and embedded images/PDFs). Complex tables are flattened to text for now
and can be enhanced later.
