'use client';

import { useEffect, useRef, useState } from 'react';
import { runSync } from './engine';

export type SyncState = 'idle' | 'syncing' | 'error';

const INTERVAL_MS = 15_000;

/** Runs the sync cycle on mount, on an interval, on reconnect, and on foreground. */
export function useSync(enabled: boolean) {
  const [state, setState] = useState<SyncState>('idle');
  const [lastAt, setLastAt] = useState<number | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    async function tick() {
      if (busy.current || !navigator.onLine) return;
      busy.current = true;
      setState('syncing');
      try {
        await runSync();
        if (mounted) {
          setState('idle');
          setLastAt(Date.now());
        }
      } catch {
        if (mounted) setState('error');
      } finally {
        busy.current = false;
      }
    }

    void tick();
    const interval = setInterval(tick, INTERVAL_MS);
    const onOnline = () => void tick();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return { state, lastAt };
}
