'use client';

import { db } from './db';

/** Local calendar day as 'YYYY-MM-DD'. Local, not UTC, so "today" means the
 *  user's today — a note written at 11pm must not count towards tomorrow. */
export function localDay(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  // Noon avoids the DST edge where midnight ± 1 day lands on the same date.
  return localDay(new Date(y, m - 1, d + delta, 12));
}

/**
 * Marks today as written-on. Called from the editor's save path, so it runs on
 * nearly every keystroke burst — the early return keeps that to one IndexedDB
 * read once the day is already recorded.
 */
let lastRecorded: string | null = null;

export async function recordWritingDay(): Promise<void> {
  const day = localDay();
  if (lastRecorded === day) return;
  lastRecorded = day;

  const existing = await db.activity.get(day);
  if (existing) {
    await db.activity.update(day, { noteCount: existing.noteCount + 1 });
    return;
  }
  await db.activity.put({ day, noteCount: 1, _dirty: 1 });
}

export interface StreakSummary {
  current: number;
  longest: number;
  /** Oldest-first list of the last 7 local days and whether each was written on. */
  recent: { day: string; active: boolean }[];
  total: number;
  writtenToday: boolean;
}

/**
 * Derives the streak from a set of day keys. Pure and synchronous so it is
 * trivially testable and cheap to recompute on every activity change.
 */
export function summariseStreak(days: Set<string>, today = localDay()): StreakSummary {
  const yesterday = addDays(today, -1);

  // A streak stays alive until the end of tomorrow: if the user has not written
  // today yet, the run ending yesterday is still their current streak. Counting
  // from today only would show 0 all morning and feel punitive.
  let cursor = days.has(today) ? today : days.has(yesterday) ? yesterday : null;
  let current = 0;
  while (cursor && days.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  for (const day of days) {
    // Only walk forward from the start of a run, so this stays O(n) overall.
    if (days.has(addDays(day, -1))) continue;
    let run = 0;
    let c: string | null = day;
    while (c && days.has(c)) {
      run += 1;
      c = addDays(c, 1);
    }
    longest = Math.max(longest, run);
  }

  const recent = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    return { day, active: days.has(day) };
  });

  return { current, longest: Math.max(longest, current), recent, total: days.size, writtenToday: days.has(today) };
}
