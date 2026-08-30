'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/useAuthStore';
import { api, type SignupConfig } from '@/lib/api';
import { quoteForDay } from '@/lib/quotes';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { title: string; subtitle: string; action: string }> = {
  signin: { title: 'Slate', subtitle: 'Sign in to sync your notes', action: 'Sign in' },
  signup: { title: 'Create your account', subtitle: 'A quiet place for long-form notes', action: 'Create account' },
  forgot: { title: 'Reset your password', subtitle: 'We will email you a link to choose a new one', action: 'Send reset link' },
};

export function LoginScreen() {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const error = useAuthStore((s) => s.error);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [config, setConfig] = useState<SignupConfig | null>(null);
  const quote = useMemo(() => quoteForDay(), []);

  useEffect(() => {
    // Best-effort: if the API is unreachable we simply hide the sign-up link
    // rather than offering an action that cannot succeed.
    api.signupConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  function switchTo(next: Mode) {
    setMode(next);
    setNotice(null);
    useAuthStore.setState({ error: null });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      if (mode === 'signin') {
        await login(email, password);
      } else if (mode === 'signup') {
        await register({
          email,
          password,
          displayName: displayName.trim() || undefined,
          inviteCode: inviteCode.trim() || undefined,
        });
      } else {
        await api.forgotPassword(email);
        // Deliberately unconditional: confirming whether the address exists
        // would let anyone enumerate accounts.
        setNotice('If that email has an account, a reset link is on its way.');
      }
    } catch {
      setNotice('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const copy = COPY[mode];

  return (
    <div className="welcome-root relative flex h-dvh items-center justify-center p-4">
      <div aria-hidden className="welcome-aurora welcome-aurora-a" />
      <div aria-hidden className="welcome-grain" />
      <div aria-hidden className="welcome-vignette" />

      <div className="relative z-10 w-full max-w-sm">
        <form
          onSubmit={onSubmit}
          className="rounded-2xl border bg-card/80 p-8 shadow-[var(--shadow-e3)] backdrop-blur-md"
        >
          <div className="space-y-1.5 text-center">
            <h1
              className={cn(
                'font-serif text-foreground',
                mode === 'signin' ? 'text-3xl font-semibold tracking-tight' : 'text-xl font-medium',
              )}
            >
              {copy.title}
            </h1>
            <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
          </div>

          <div className="mt-7 space-y-2.5">
            {mode === 'signup' && (
              <Input
                type="text"
                placeholder="Your name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            )}
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
            {mode !== 'forgot' && (
              <Input
                type="password"
                placeholder={mode === 'signup' ? 'Password (10+ characters)' : 'Password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                minLength={mode === 'signup' ? 10 : undefined}
                required
              />
            )}
            {mode === 'signup' && config?.inviteRequired && (
              <Input
                type="text"
                placeholder="Invite code"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
              />
            )}
          </div>

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          {notice && <p className="mt-4 text-sm text-muted-foreground">{notice}</p>}

          <Button type="submit" className="mt-6 w-full" disabled={busy}>
            {busy ? 'Working…' : copy.action}
          </Button>

          <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
            {mode === 'signin' ? (
              <>
                <button type="button" className="hover:text-foreground" onClick={() => switchTo('forgot')}>
                  Forgot password?
                </button>
                {config?.signupAvailable && (
                  <button type="button" className="hover:text-foreground" onClick={() => switchTo('signup')}>
                    Create an account
                  </button>
                )}
              </>
            ) : (
              <button type="button" className="hover:text-foreground" onClick={() => switchTo('signin')}>
                ← Back to sign in
              </button>
            )}
          </div>
        </form>

        {mode === 'signin' && (
          <figure className="mt-10 text-center">
            <blockquote className="font-serif text-sm leading-relaxed text-muted-foreground">
              {quote.text}
            </blockquote>
            <figcaption className="mt-2 text-xs text-muted-foreground/70">{quote.author}</figcaption>
          </figure>
        )}
      </div>
    </div>
  );
}
