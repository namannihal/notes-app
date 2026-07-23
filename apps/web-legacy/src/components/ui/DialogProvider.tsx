import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

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

// eslint-disable-next-line react-refresh/only-export-components
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
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback((result: unknown) => {
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
          requestAnimationFrame(() => inputRef.current?.select());
        }),
      confirm: (opts) =>
        new Promise((resolve) => {
          resolver.current = resolve as (v: unknown) => void;
          setState({ kind: 'confirm', opts });
        }),
    }),
    [],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {state && (
        <div className="dialog-overlay" onMouseDown={() => close(state.kind === 'prompt' ? null : false)}>
          <div className="dialog-card" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="dialog-title">{state.opts.title}</h3>

            {state.kind === 'prompt' ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  close(value.trim() ? value.trim() : null);
                }}
              >
                {state.opts.label && <label className="dialog-label">{state.opts.label}</label>}
                <input
                  ref={inputRef}
                  className="dialog-input"
                  value={value}
                  placeholder={state.opts.placeholder}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                />
                <div className="dialog-actions">
                  <button type="button" className="btn btn--ghost" onClick={() => close(null)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn--primary">
                    {state.opts.confirmText ?? 'Save'}
                  </button>
                </div>
              </form>
            ) : (
              <>
                {state.opts.message && <p className="dialog-message">{state.opts.message}</p>}
                <div className="dialog-actions">
                  <button type="button" className="btn btn--ghost" onClick={() => close(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`btn ${state.opts.danger ? 'btn--danger' : 'btn--primary'}`}
                    onClick={() => close(true)}
                  >
                    {state.opts.confirmText ?? 'Confirm'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}
