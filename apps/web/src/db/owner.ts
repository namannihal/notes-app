'use client';

import { db } from './db';
import { resetSyncCursor } from '@/sync/engine';

/**
 * The local IndexedDB holds exactly one account's data. Now that the app is
 * multi-account we have to know whose it is: signing in as a different user on
 * the same browser previously left the old account's buckets, stacks and notes
 * in place, so they showed up in the new session and were then pushed to the
 * new account on the next sync.
 */
const OWNER_KEY = 'sthir-db-owner';

export function getDbOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

/** Drops every local record and the sync cursor, so the next pull is a full one. */
export async function clearLocalData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.buckets, db.stacks, db.notebooks, db.notes, db.attachments, db.blobs, db.activity],
    async () => {
      await Promise.all([
        db.buckets.clear(),
        db.stacks.clear(),
        db.notebooks.clear(),
        db.notes.clear(),
        db.attachments.clear(),
        db.blobs.clear(),
        db.activity.clear(),
      ]);
    },
  );
  resetSyncCursor();
}

/**
 * Binds the local database to `userId`, wiping it first if it currently belongs
 * to someone else. Must be awaited before any sync cycle starts, otherwise the
 * previous owner's dirty rows get pushed into the new account.
 */
export async function ensureDbOwner(userId: string): Promise<void> {
  const current = getDbOwner();
  if (current === userId) return;
  if (current !== null) await clearLocalData();
  try {
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    /* private mode — worst case we re-check next load */
  }
}

/**
 * Called on sign-out. Keeps the data on disk (so the app still works offline for
 * the same user when they sign back in) but always drops the cursor, because a
 * stale cursor makes the next pull incremental and silently skips a backfill.
 */
export function releaseDbOwner(): void {
  resetSyncCursor();
}
