'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import { summariseStreak, type StreakSummary } from '@/db/activity';

/** Live writing-streak summary, recomputed whenever a day is recorded. */
export function useStreak(): StreakSummary | undefined {
  return useLiveQuery(async () => {
    const rows = await db.activity.toArray();
    return summariseStreak(new Set(rows.map((r) => r.day)));
  }, []);
}
