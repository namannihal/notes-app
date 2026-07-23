# Technical Documentation — "Sthir" Notes
### A lightweight, offline-first, hierarchical note-taking app for UPSC prep

Version 1.0 | Author: [Your Name] | Status: Draft for build

---

## 1. Purpose & Scope

A personal, single-user note-taking system to replace Evernote for UPSC preparation. Optimized for structured, long-form study notes (like the PA 1.02 "Theories of State" style notes shown in your reference) with clean typography and hierarchy — not for quick capture, web clipping, or collaboration.

### 1.1 In Scope
- Hierarchical organization: **Stack → Notebook → Note**
- Rich text editing: bold, italic, underline, headings, serif/sans font toggle, bullet/numbered lists, blockquotes
- Table support (for comparison-style answers, common in UPSC prep)
- Light + Dark theme
- Responsive UI — usable on iPad (touch), Mac (trackpad/keyboard), and desktop browser (large screens), aspect-ratio aware
- Sync across devices (iPad, Mac, browser) via a backend + database
- Offline-first: full read/write while offline, auto-sync when back online

### 1.2 Explicitly Out of Scope (Non-Goals)
- Tags / labels
- Email-to-note, email clients, or any email integration
- Third-party integrations (calendar, Slack, Google Drive, etc.)
- Web clipper / browser extension
- Multi-user collaboration, sharing, comments
- Reminders/notifications
- OCR, handwriting, audio notes
- Search across attachments/images (basic text search only, see §7.5)

Keeping this list explicit matters — it's what keeps the system "lightweight" instead of organically regrowing into Evernote.

---

## 2. High-Level Architecture

Since you want **sync across devices** and **offline support**, this is not a purely local app — it needs an offline-first client with a background sync engine talking to a backend.

```
┌─────────────────────────────┐     ┌─────────────────────────────┐
│   Client (React PWA)        │     │   Client (React PWA)        │
│   - Mac browser / iPad      │     │   - Desktop browser         │
│   - IndexedDB (local store) │     │   - IndexedDB (local store) │
│   - Service Worker (offline)│     │   - Service Worker (offline)│
│   - Sync Engine             │     │   - Sync Engine             │
└──────────────┬───────────────┘     └──────────────┬───────────────┘
               │  HTTPS / REST (batched sync)        │
               └──────────────────┬───────────────────┘
                                   │
                        ┌──────────────────────┐
                        │   Backend API         │
                        │   Node.js + Express    │
                        │   (or Next.js API)     │
                        │   Auth (simple JWT)     │
                        └──────────┬──────────────┘
                                   │
                        ┌──────────────────────┐
                        │   PostgreSQL DB        │
                        │   (Stacks/Notebooks/   │
                        │    Notes, versioned)    │
                        └──────────────────────┘
```

**Why this shape:**
- **PWA (Progressive Web App)** instead of native apps for iPad/Mac — one codebase, works in any browser, installable to home screen on iPad, meets your "accessible from browser" requirement directly.
- **IndexedDB** as the local source of truth on each device — the app always reads/writes locally first (instant, works offline), then syncs.
- **PostgreSQL** because your data is genuinely hierarchical/relational (Stack → Notebook → Note) and you'll want reliable structured queries, not a document-store's flexibility you don't need.

---

## 3. Data Model

### 3.1 Entity Hierarchy

```
Stack (1) ──< Notebook (many) ──< Note (many)
```

- A **Stack** is a top-level grouping (e.g., "GS Paper 2", "GS Paper 3", "Optional Subject").
- A **Notebook** belongs to exactly one Stack (e.g., "Polity", "Governance").
- A **Note** belongs to exactly one Notebook (e.g., "1.02 — Theories of State").

No cross-linking, no notebook-in-multiple-stacks — keep it a strict tree. This matches Evernote's stack model but simpler (Evernote allows notes to live directly under a stack too; decide if you want that — recommend **not** allowing it, forcing every note into a notebook keeps the hierarchy predictable).

### 3.2 Schema (PostgreSQL)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,       -- used only for login, not "email features"
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,   -- manual ordering
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ                  -- soft delete, needed for sync
);

CREATE TABLE notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stack_id UUID NOT NULL REFERENCES stacks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_json JSONB NOT NULL,     -- rich text document (see §4.2)
  content_text TEXT,               -- plain-text extract, for search (see §7.5)
  version INTEGER NOT NULL DEFAULT 1,   -- optimistic concurrency
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_notes_notebook ON notes(notebook_id);
CREATE INDEX idx_notes_search ON notes USING GIN (to_tsvector('english', content_text));
```

Notes on design choices:
- **Soft deletes** (`deleted_at`) everywhere — hard deletes are dangerous to sync correctly (a device offline when something is hard-deleted has no way to learn about it). Purge soft-deleted rows after e.g. 30 days via a cron job.
- **`version` column** — used for conflict detection during sync (see §5.3).
- **`content_json` + `content_text`** — store the rich document as structured JSON (for the editor) and a flattened plain-text copy (for fast search), regenerated on every save.

### 3.3 Local (IndexedDB) Schema

Mirrors the server schema almost exactly, with sync metadata added:

```
stores: stacks, notebooks, notes, sync_queue

note record (local):
{
  id, notebook_id, user_id, title, content_json, content_text,
  version, position, created_at, updated_at, deleted_at,
  _dirty: boolean,        // has local unsynced changes
  _syncedAt: timestamp     // last successful sync
}

sync_queue record:
{
  id, entity_type: 'note'|'notebook'|'stack',
  entity_id, operation: 'create'|'update'|'delete',
  payload, created_at
}
```

Use **Dexie.js** as a wrapper over IndexedDB — raw IndexedDB is painful; Dexie gives you a clean, promise-based, typed API.

---

## 4. Editor

### 4.1 Library Choice

Use **TipTap** (built on ProseMirror). Reasoning:
- Gives you bold/italic/underline/headings/lists/blockquote/tables out of the box via extensions
- Outputs a clean JSON document model (perfect for `content_json`)
- Font-family switching (serif/sans) is a trivial custom "mark" extension
- Table extension (`@tiptap/extension-table`) supports exactly the tabular format you referenced in your UPSC note example

Avoid Draft.js (unmaintained), Slate (lower-level, more work), or a plain `contenteditable` (fragile, reinvents the wheel).

### 4.2 Content Document Shape (ProseMirror JSON, simplified example)

```json
{
  "type": "doc",
  "content": [
    { "type": "heading", "attrs": { "level": 1 }, "content": [{ "type": "text", "text": "Q1. Distinguishing features of Liberal theory of state" }] },
    { "type": "paragraph", "content": [
      { "type": "text", "marks": [{"type": "bold"}], "text": "individual rights, freedom" },
      { "type": "text", "text": " and limited government intervention." }
    ]},
    { "type": "orderedList", "content": [
      { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Focus on Individual Rights and Freedom" }] }] }
    ]},
    { "type": "table", "content": [
      { "type": "tableRow", "content": [
        { "type": "tableCell", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Classical Liberalism" }] }] },
        { "type": "tableCell", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Minimal state" }] }] }
      ]}
    ]}
  ]
}
```

### 4.3 Toolbar Feature Set (MVP)

| Feature | Extension |
|---|---|
| Bold / Italic / Underline / Strikethrough | `@tiptap/starter-kit` |
| Headings (H1–H3) | `@tiptap/starter-kit` |
| Font family toggle (Serif / Sans) | Custom `TextStyle` + `FontFamily` extension |
| Bullet & numbered lists | `@tiptap/starter-kit` |
| Blockquote | `@tiptap/starter-kit` |
| Tables (add/remove row/col) | `@tiptap/extension-table` + row/header/cell |
| Text alignment | `@tiptap/extension-text-align` |
| Highlight / text color (optional, low priority) | `@tiptap/extension-highlight` |

---

## 5. Offline-First Sync Engine

This is the most technically important part of the system, so it gets its own section.

### 5.1 Core Principle

**Local-first writes.** Every keystroke/save writes to IndexedDB immediately (instant UX, works offline). A background sync process pushes/pulls changes to/from the server whenever a connection is available. The UI never blocks on network.

### 5.2 Sync Flow

```
1. User edits a note → saved to IndexedDB, marked _dirty = true,
   an entry pushed to sync_queue.
2. Debounced autosave (~1s after typing stops) writes to IndexedDB.
3. Sync Engine (runs every N seconds + on 'online' event + on app foreground):
     a. If offline → skip, retry later.
     b. PUSH: send all sync_queue entries to POST /api/sync/push
     c. PULL: request GET /api/sync/pull?since=<lastSyncTimestamp>
     d. Merge server changes into IndexedDB (see conflict handling below).
     e. Clear successfully-synced sync_queue entries.
4. Service Worker caches app shell (HTML/JS/CSS) so the app loads
   even with zero connectivity.
```

### 5.3 Conflict Resolution

Since this is single-user across multiple devices (not multi-user collab), conflicts are rare (e.g., editing the same note offline on both iPad and Mac, then reconnecting both). Use a simple, predictable strategy:

- **Version-based optimistic concurrency**: client sends `version` with every update.
- Server rejects if `incoming.version !== current.version`, returns the current server copy with a `409 Conflict`.
- Client strategy on conflict: **Last-Write-Wins by `updated_at`**, but keep the losing version as a recoverable local backup (`notes_conflict_backup` table) for 7 days, so you never silently lose text. Optionally surface a small "conflict version saved" toast rather than a merge UI — full CRDT-based merging (e.g., Yjs) is overkill for a single-user app and adds significant complexity; skip it.

### 5.4 API Endpoints for Sync

```
POST /api/sync/push
  body: { changes: [{ entity_type, entity_id, operation, payload, version }] }
  returns: { accepted: [...ids], conflicts: [{ id, server_copy }] }

GET /api/sync/pull?since=<ISO timestamp>
  returns: { stacks: [...], notebooks: [...], notes: [...], deletions: [...] }
```

Pull is timestamp-based (`updated_at > since`), which naturally also picks up soft-deletes.

---

## 6. API Design (REST)

```
Auth
  POST   /api/auth/login
  POST   /api/auth/logout
  GET    /api/auth/me

Stacks
  GET    /api/stacks
  POST   /api/stacks
  PATCH  /api/stacks/:id
  DELETE /api/stacks/:id        (soft delete)

Notebooks
  GET    /api/stacks/:stackId/notebooks
  POST   /api/notebooks
  PATCH  /api/notebooks/:id
  DELETE /api/notebooks/:id

Notes
  GET    /api/notebooks/:notebookId/notes
  GET    /api/notes/:id
  POST   /api/notes
  PATCH  /api/notes/:id
  DELETE /api/notes/:id
  GET    /api/notes/search?q=...

Sync
  POST   /api/sync/push
  GET    /api/sync/pull
```

Since this is single-user, you can skip building a permissions/roles system entirely — every row just has `user_id`, and every query filters `WHERE user_id = req.user.id`.

---

## 7. UI/UX Specification

### 7.1 Layout — Three-Pane, Aspect-Ratio Aware

```
┌───────────┬─────────────────┬───────────────────────────┐
│  Stacks &  │  Note list       │  Editor                    │
│  Notebooks │  (in selected     │  (title + rich text)       │
│  (tree)    │   notebook)       │                             │
└───────────┴─────────────────┴───────────────────────────┘
```

- **Large screens (Mac / desktop browser, width > 1024px):** all 3 panes visible.
- **iPad landscape (768–1024px):** 2 panes (tree collapses into a slide-over triggered by a hamburger icon); note list + editor visible.
- **iPad portrait / narrow (< 768px):** 1 pane at a time, stack-based navigation (tree → list → editor), like Mail.app on iPhone.

Use CSS Grid with `grid-template-columns` driven by container queries (`@container`) rather than only viewport media queries — this makes each pane itself responsive if you ever resize a window on Mac, not just the whole page. Fall back to standard media queries for broad breakpoints if container query support is a concern.

### 7.2 Theme (Light/Dark)

Use CSS custom properties, toggled via a `data-theme="dark"` attribute on `<html>`, persisted in `localStorage` (device-level preference, not synced — you may want different themes on different devices).

```css
:root[data-theme="light"] {
  --bg: #ffffff;
  --bg-secondary: #f7f7f5;
  --text: #1a1a1a;
  --text-secondary: #6b6b6b;
  --border: #e5e5e3;
  --accent: #2563eb;
}
:root[data-theme="dark"] {
  --bg: #1a1a1a;
  --bg-secondary: #242424;
  --text: #e8e8e6;
  --text-secondary: #a0a0a0;
  --border: #333333;
  --accent: #5b8def;
}
```

Default to `prefers-color-scheme` on first load, then let the manual toggle override.

### 7.3 Typography

- Sans default: Inter or system-ui stack.
- Serif option (per your requirement, for reading-heavy notes): "Source Serif 4" or "Georgia" fallback.
- Font toggle applies **per note** (stored as a mark in `content_json`), not global — matches how you'd actually use it (e.g., serif for essay-style answers, sans for quick factual notes).

### 7.4 Touch vs Pointer

- iPad: toolbar buttons ≥ 44×44px touch targets (Apple HIG minimum), table row/col add handles enlarged on touch.
- Mac/desktop: support standard keyboard shortcuts (⌘B, ⌘I, ⌘K etc. via TipTap's built-in keymap).

### 7.5 Search

Simple, since you excluded tags: a single search box that queries `content_text` (plain-text extract) using Postgres full-text search server-side when online, and a simple substring/fuzzy match (e.g., via **Fuse.js**) against the local IndexedDB copy when offline. No need for a dedicated search index like Elasticsearch at this scale (a few hundred to low thousands of notes).

---

## 8. Tech Stack Summary

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | React + Vite | Fast dev loop, PWA plugin support |
| Editor | TipTap (ProseMirror) | Rich text + tables out of the box |
| Local storage | IndexedDB via Dexie.js | Offline-first source of truth |
| State management | Zustand or React Context | App is simple enough not to need Redux |
| Styling | CSS Modules or Tailwind + CSS variables | Theme via variables either way |
| PWA/offline shell | Vite PWA plugin (Workbox under the hood) | Service worker, installable app |
| Backend | Node.js + Express (or Next.js API routes if you want one repo) | Simple REST, matches your React comfort |
| Database | PostgreSQL | Relational hierarchy + full-text search |
| ORM | Prisma | Type-safe schema matching §3.2 directly |
| Auth | JWT (access + refresh token), bcrypt for password hashing | Simple, no third-party auth needed for single-user |
| Hosting (backend + DB) | Fly.io / Railway / a $5 VPS + Docker | Cheap, low-maintenance for single-user load |
| Hosting (frontend) | Vercel / Netlify (static + PWA) | Free tier is plenty |

---

## 9. Project Structure

```
notes-app/
├── apps/
│   ├── web/                      # React PWA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Tree/         # Stack/Notebook sidebar
│   │   │   │   ├── NoteList/
│   │   │   │   └── Editor/       # TipTap wrapper + toolbar
│   │   │   ├── db/                # Dexie schema + queries
│   │   │   ├── sync/              # Sync engine
│   │   │   ├── stores/            # Zustand stores
│   │   │   ├── styles/            # theme.css, variables
│   │   │   └── App.tsx
│   │   └── vite.config.ts
│   └── api/                       # Node/Express backend
│       ├── src/
│       │   ├── routes/            # stacks.ts, notebooks.ts, notes.ts, sync.ts, auth.ts
│       │   ├── prisma/schema.prisma
│       │   └── server.ts
├── docker-compose.yml              # postgres + api for local dev
└── README.md
```

---

## 10. Build Roadmap

**Phase 1 — Local-only MVP (no backend)**
- CRUD for Stack/Notebook/Note in IndexedDB only
- TipTap editor with bold/italic/headings/lists/tables/font toggle
- Light/dark theme
- Responsive 3-pane layout
- *Goal: usable, deployed as a static PWA, single device.*

**Phase 2 — Backend + Sync**
- Postgres schema, Prisma, Express API
- JWT auth (just you — one user account)
- Sync engine (push/pull, version-based conflict handling)
- Deploy backend + DB

**Phase 3 — Polish**
- Full-text search (online + offline)
- Keyboard shortcuts, drag-to-reorder stacks/notebooks/notes
- Export note to PDF/Markdown (handy for revision printouts)
- Conflict-backup recovery UI

---

## 11. Security Notes (lightweight, since single-user)

- Passwords hashed with bcrypt; never store plaintext.
- JWT access token short-lived (~15 min), refresh token in httpOnly cookie.
- All API routes require auth except `/api/auth/login`.
- HTTPS only in production (Let's Encrypt via host, or automatic on Vercel/Fly).
- No need for rate limiting/roles/audit logs beyond basics — this is not a multi-tenant system.

---

## 12. Explicit Simplifications vs. Evernote (for reference)

| Evernote has | This app has |
|---|---|
| Tags | — (excluded) |
| Email-to-note | — (excluded) |
| Web clipper | — (excluded) |
| Third-party integrations | — (excluded) |
| Notebook stacks + loose notebooks | Strict 3-level hierarchy only |
| Complex sharing/collab | Single user, no sharing |
| Real-time multi-device collab (CRDT) | Last-write-wins with backup, sufficient for one person |
| Native apps (Win/Mac/iOS/Android) | One responsive PWA for all screens |

---

*End of spec. Next step, if you want: I can scaffold the actual Phase 1 codebase (React + TipTap + Dexie, local-only) as a starting repo.*
