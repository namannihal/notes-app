import Dexie, { type Table } from 'dexie';
import type { Attachment, BlobRecord, Bucket, Note, Notebook, Stack } from './types';

/**
 * Local source of truth (offline-first). Mirrors the server schema with the
 * binary blob store kept separate from note/attachment metadata so large files
 * never bloat the record indexes.
 */
export class SthirDB extends Dexie {
  buckets!: Table<Bucket, string>;
  stacks!: Table<Stack, string>;
  notebooks!: Table<Notebook, string>;
  notes!: Table<Note, string>;
  attachments!: Table<Attachment, string>;
  blobs!: Table<BlobRecord, string>;

  constructor() {
    super('sthir');
    this.version(1).stores({
      stacks: 'id, position',
      notebooks: 'id, stackId, position',
      notes: 'id, notebookId, position, updatedAt',
      attachments: 'id, noteId, checksum',
      blobs: 'checksum, pinned, lastAccessed',
    });
    this.version(2).stores({
      notes: 'id, notebookId, position, updatedAt, pinned',
    });
    this.version(3).stores({
      buckets: 'id, position',
      stacks: 'id, position, bucketId',
    });
  }
}

export const db = new SthirDB();
