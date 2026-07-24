'use client';

import dynamic from 'next/dynamic';

// The whole app is client-only (IndexedDB, TipTap, pdf.js) — no SSR benefit for
// an offline-first PWA, and this avoids server-side access to browser APIs.
const AppShell = dynamic(() => import('@/components/app-shell').then((m) => m.AppShell), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
      Loading Slate…
    </div>
  ),
});

export default function Page() {
  return <AppShell />;
}
