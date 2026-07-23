'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

interface PromptOptions {
  title: string;
  label?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
}

interface DialogApi {
  prompt: (opts: PromptOptions) => Promise<string | null>;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}

type State =
  | { kind: 'prompt'; opts: PromptOptions }
  | { kind: 'confirm'; opts: ConfirmOptions }
  | null;

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [value, setValue] = useState('');
  const resolver = useRef<((v: unknown) => void) | null>(null);

  const settle = useCallback((result: unknown) => {
    resolver.current?.(result);
    resolver.current = null;
    setState(null);
    setValue('');
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      prompt: (opts) =>
        new Promise((resolve) => {
          resolver.current = resolve as (v: unknown) => void;
          setValue(opts.defaultValue ?? '');
          setState({ kind: 'prompt', opts });
        }),
      confirm: (opts) =>
        new Promise((resolve) => {
          resolver.current = resolve as (v: unknown) => void;
          setState({ kind: 'confirm', opts });
        }),
    }),
    [],
  );

  const open = state !== null;

  function onOpenChange(next: boolean) {
    if (!next) settle(state?.kind === 'prompt' ? null : false);
  }

  return (
    <DialogContext.Provider value={api}>
      {children}
      <Dialog open={open} onOpenChange={onOpenChange}>
        {state && (
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{state.opts.title}</DialogTitle>
            </DialogHeader>

            {state.kind === 'prompt' ? (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  settle(value.trim() ? value.trim() : null);
                }}
              >
                {state.opts.label && (
                  <label className="text-xs text-muted-foreground">{state.opts.label}</label>
                )}
                <Input
                  value={value}
                  placeholder={state.opts.placeholder}
                  autoFocus
                  onChange={(e) => setValue(e.target.value)}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => settle(null)}>
                    Cancel
                  </Button>
                  <Button type="submit">{state.opts.confirmText ?? 'Save'}</Button>
                </DialogFooter>
              </form>
            ) : (
              <>
                {state.opts.message && (
                  <p className="text-sm text-muted-foreground">{state.opts.message}</p>
                )}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => settle(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant={state.opts.danger ? 'destructive' : 'default'}
                    onClick={() => settle(true)}
                  >
                    {state.opts.confirmText ?? 'Confirm'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        )}
      </Dialog>
    </DialogContext.Provider>
  );
}
