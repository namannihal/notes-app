import Dexie, { type Table } from 'dexie';
import type {
  ActivityDay,
  Attachment,
  BlobRecord,
  Bucket,
  Note,
  Notebook,
  Stack,
} from './types';

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
  activity!: Table<ActivityDay, string>;

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
    // v4: writing-streak day log. Keyed by 'YYYY-MM-DD' so a day can only be
    // recorded once, which makes the streak idempotent under repeated syncs.
    this.version(4)
      .stores({
        activity: 'day, _dirty',
      })
      .upgrade(async (tx) => {
        // Backfill `position` on any bucket that predates it. Dexie's orderBy
        // walks the index, and IndexedDB omits records whose indexed property is
        // undefined — such a bucket would be invisible in the sidebar forever.
        const buckets = tx.table('buckets');
        const all = await buckets.toArray();
        await Promise.all(
          all
            .filter((b) => typeof b.position !== 'number')
            .map((b, i) => buckets.update(b.id, { position: i })),
        );
      });
  }
}

export const db = new SthirDB();
