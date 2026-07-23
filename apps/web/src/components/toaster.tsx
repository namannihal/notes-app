'use client';

import { X } from 'lucide-react';
import { useToast } from '@/stores/useToast';
import { cn } from '@/lib/utils';

/** Renders transient toast notifications in the bottom-right corner. */
export function Toaster() {
  const toasts = useToast((s) => s.toasts);
  const dismiss = useToast((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex max-w-[92vw] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto flex w-80 max-w-[92vw] items-start gap-2 rounded-md px-3 py-2 text-sm shadow-lg',
            t.type === 'error'
              ? 'bg-destructive text-destructive-foreground'
              : t.type === 'success'
                ? 'bg-primary text-primary-foreground'
                : 'bg-foreground text-background',
          )}
        >
          <span className="flex-1">{t.message}</span>
          <button
            type="button"
            title="Dismiss"
            onClick={() => dismiss(t.id)}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
