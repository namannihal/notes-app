'use client';

import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Target of the emailed reset link. Deliberately its own route rather than a
 * modal on `/`: the link is opened cold, often on a different device, so it must
 * work without any prior client state.
 */
export default function ResetPasswordPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Read from the URL rather than a route param so the token never lands in a
    // Next.js prerender or a router cache key.
    setToken(new URLSearchParams(window.location.search).get('token'));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      setError('Those passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      // Replace so the token cannot be re-submitted from history.
      window.history.replaceState({}, '', '/reset-password');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="welcome-root relative flex h-dvh items-center justify-center p-4">
      <div aria-hidden className="welcome-aurora welcome-aurora-a" />
      <div aria-hidden className="welcome-vignette" />

      <div className="relative z-10 w-full max-w-sm rounded-2xl border bg-card/80 p-8 shadow-[var(--shadow-e3)] backdrop-blur-md">
        {done ? (
          <div className="space-y-4 text-center">
            <h1 className="font-serif text-xl font-medium">Password updated</h1>
            <p className="text-sm text-muted-foreground">
              You are signed in on this device. Everywhere else has been signed out.
            </p>
            <Button className="w-full" onClick={() => (window.location.href = '/')}>
              Open Slate
            </Button>
          </div>
        ) : token === null ? (
          <div className="space-y-4 text-center">
            <h1 className="font-serif text-xl font-medium">Link not valid</h1>
            <p className="text-sm text-muted-foreground">
              This page needs a reset link from your email. Request a new one from the sign-in
              screen.
            </p>
            <Button variant="outline" className="w-full" onClick={() => (window.location.href = '/')}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="space-y-1.5 text-center">
              <h1 className="font-serif text-xl font-medium">Choose a new password</h1>
              <p className="text-sm text-muted-foreground">At least 10 characters.</p>
            </div>
            <div className="mt-7 space-y-2.5">
              <Input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={10}
                autoFocus
                required
              />
              <Input
                type="password"
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={10}
                required
              />
            </div>
            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            <Button type="submit" className="mt-6 w-full" disabled={busy}>
              {busy ? 'Updating…' : 'Update password'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
