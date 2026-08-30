'use client';

import { useEffect, useMemo, useState } from 'react';
import { useStreak } from '@/hooks/useStreak';
import { quoteForDay } from '@/lib/quotes';
import { cn } from '@/lib/utils';

const SEEN_KEY = 'sthir-welcomed';

/** True once per browser session, so the threshold is a greeting, not a gate. */
export function shouldShowWelcome(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

function markWelcomed(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode */
  }
}

function greeting(hour: number): string {
  if (hour < 5) return 'Still awake';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

export function WelcomeScreen({ onEnter, name }: { onEnter: () => void; name?: string | null }) {
  const quote = useMemo(() => quoteForDay(), []);
  const streak = useStreak();
  const [leaving, setLeaving] = useState(false);
  // Mounted-gated so the entrance transition runs; without it the elements are
  // already in their final state on first paint and nothing animates.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function enter() {
    if (leaving) return;
    setLeaving(true);
    markWelcomed();
    // Matches the fade-out duration below; skipped for reduced-motion users
    // because the transition is suppressed for them anyway.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(onEnter, reduced ? 0 : 420);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        enter();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const hour = new Date().getHours();

  return (
    <div
      className={cn(
        'welcome-root relative flex h-dvh w-full flex-col items-center justify-center overflow-hidden px-6',
        'transition-opacity duration-[420ms] ease-out motion-reduce:transition-none',
        leaving ? 'opacity-0' : 'opacity-100',
      )}
    >
      {/* Layered, purely CSS atmosphere: two slow-drifting radial washes over a
          fine grain, plus a vignette. No images, so nothing to download. */}
      <div aria-hidden className="welcome-aurora welcome-aurora-a" />
      <div aria-hidden className="welcome-aurora welcome-aurora-b" />
      <div aria-hidden className="welcome-grain" />
      <div aria-hidden className="welcome-vignette" />

      <div
        className={cn(
          'relative z-10 flex max-w-2xl flex-col items-center text-center',
          'transition-all duration-700 ease-out motion-reduce:transition-none',
          shown && !leaving ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        )}
      >
        <p className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground">
          {greeting(hour)}
          {name ? `, ${name}` : ''}
        </p>

        <blockquote className="mt-8 font-serif text-2xl font-normal leading-[1.5] text-foreground sm:text-[2rem] sm:leading-[1.45]">
          <span className="text-muted-foreground/50">“</span>
          {quote.text}
          <span className="text-muted-foreground/50">”</span>
        </blockquote>
        <cite className="mt-5 text-sm not-italic text-muted-foreground">{quote.author}</cite>

        <div className="mt-10 h-px w-16 bg-border" />

        <button
          onClick={enter}
          autoFocus
          className={cn(
            'group mt-10 inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/60 px-7 py-3',
            'text-sm font-medium text-foreground backdrop-blur-sm transition-all duration-300',
            'hover:border-primary/40 hover:bg-background hover:shadow-[0_1px_24px_-8px] hover:shadow-primary/40',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          Begin writing
          <span
            aria-hidden
            className="transition-transform duration-300 group-hover:translate-x-0.5"
          >
            →
          </span>
        </button>

        {streak && streak.current > 0 && (
          <p className="mt-8 text-xs text-muted-foreground">
            {streak.current} day{streak.current === 1 ? '' : 's'} in a row
          </p>
        )}
      </div>

      <p className="absolute bottom-8 z-10 text-[11px] text-muted-foreground/60">
        Press Enter to continue
      </p>
    </div>
  );
}
