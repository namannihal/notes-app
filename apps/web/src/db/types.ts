import type { JSONContent } from '@tiptap/react';

export type EntityType = 'stack' | 'notebook' | 'note';

export interface Stack {
  id: string;
  title: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** Local-only: has unsynced changes. */
  _dirty?: boolean;
}

export interface Notebook {
  id: string;
  stackId: string;
  title: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** Local-only: has unsynced changes. */
  _dirty?: boolean;
}

export interface Note {
  id: string;
  notebookId: string;
  title: string;
  /** ProseMirror/TipTap document. */
  contentJson: JSONContent;
  /** Flattened plain text, used for search. */
  contentText: string;
  /** Optimistic-concurrency version, bumped on every save. */
  version: number;
  position: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** Local-only sync metadata (unused until Phase 2). */
  _dirty?: boolean;
  _syncedAt?: number | null;
}

export type AttachmentKind = 'image' | 'pdf';

export interface Attachment {
  id: string;
  noteId: string;
  kind: AttachmentKind;
  filename: string;
  mimeType: string;
  byteSize: number;
  /** SHA-256 of the bytes; content-addresses the blob store (dedupe). */
  checksum: string;
  width?: number;
  height?: number;
  pageCount?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  /** Local-only: bytes not yet uploaded to the server. */
  _uploaded?: boolean;
}

/** Binary bytes, keyed by checksum so identical files are stored once. */
export interface BlobRecord {
  checksum: string;
  blob: Blob;
  /** Pinned blobs are exempt from LRU eviction (Phase 2+). */
  pinned: boolean;
  lastAccessed: number;
}
