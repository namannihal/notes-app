# Sthir Notes — Web (Phase 1)

Offline-first, local-only note-taking PWA. React + Vite + TipTap + Dexie
(IndexedDB). See [`../../specs.md`](../../specs.md) for the full design.

## Phase 1 scope (this build)
- Stack → Notebook → Note hierarchy, stored locally in IndexedDB (Dexie)
- Rich text editor (TipTap): bold/italic/underline/strike, H1–H3, lists,
  blockquote, tables, text alignment, highlight, serif/sans font toggle
- Embedded images (stored as local blobs, deduped by SHA-256 checksum)
- Inline **read-only** PDF viewer (pdf.js)
- Light/dark theme (persisted per device)
- Responsive three-pane layout (desktop → iPad → phone)
- Installable PWA with offline app shell

Not yet implemented (later phases): backend, sync, Azure Blob storage,
ENEX import, full-text search, drag-to-reorder, export.

## Develop

```powershell
npm install
npm run dev
```

## Build

```powershell
npm run build
npm run preview
```
