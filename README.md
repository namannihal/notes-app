# notes-app

**Sthir Notes** — an offline-first, hierarchical note-taking PWA (Stack → Notebook → Note) with rich text editing, inline images, PDF viewing, and cross-device sync.

## Structure

```
apps/
  web/   Next.js 15 (App Router, static export) + TipTap editor, Dexie (IndexedDB), Zustand, Tailwind v4
  api/   Express + Prisma + PostgreSQL, JWT auth, Azure Blob storage, ENEX import
```

## Local development

```bash
# API
cd apps/api
npm install
cp .env.example .env   # fill in your values
npm run prisma:push
npm run seed
npm run dev

# Web
cd apps/web
npm install
npm run dev
```

## Tech

- **Frontend:** Next.js (static export), React 18, TipTap, Dexie, Zustand, Tailwind CSS v4, shadcn/ui
- **Backend:** Node/Express, Prisma 6, PostgreSQL, bcrypt + JWT (httpOnly cookie), `@azure/storage-blob`
- **Sync:** local-first (IndexedDB) with background push/pull (last-write-wins)

> Deployment notes and environment values are kept out of version control.
