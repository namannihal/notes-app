'use client';

import { create } from 'zustand';
import { api, ApiError, type AuthUser } from '@/lib/api';
import { ensureDbOwner, releaseDbOwner } from '@/db/owner';

type AuthStatus = 'checking' | 'authed' | 'anon' | 'offline';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  checkSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (input: {
    email: string;
    password: string;
    displayName?: string;
    inviteCode?: string;
  }) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'checking',
  error: null,

  checkSession: async () => {
    try {
      const user = await api.me();
      // Must complete before `authed` is published: the sync loop starts as soon
      // as it is, and would otherwise push the previous account's rows.
      await ensureDbOwner(user.id);
      set({ user, status: 'authed', error: null });
    } catch (e) {
      if (api.isUnauthorized(e)) {
        // The session is genuinely gone. Drop the sync cursor so signing back in
        // does a full pull instead of an incremental one from a stale position.
        releaseDbOwner();
        set({ user: null, status: 'anon' });
      } else {
        // Server unreachable (offline / not deployed): work locally.
        set({ user: null, status: 'offline' });
      }
    }
  },

  login: async (email, password) => {
    try {
      const user = await api.login(email, password);
      await ensureDbOwner(user.id);
      set({ user, status: 'authed', error: null });
      return true;
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : 'Could not reach the server. Try again.';
      set({ error: message });
      return false;
    }
  },

  register: async (input) => {
    try {
      const user = await api.register(input);
      await ensureDbOwner(user.id);
      set({ user, status: 'authed', error: null });
      return true;
    } catch (e) {
      const message =
        e instanceof ApiError ? e.message : 'Could not reach the server. Try again.';
      set({ error: message });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    releaseDbOwner();
    set({ user: null, status: 'anon', error: null });
  },
}));
