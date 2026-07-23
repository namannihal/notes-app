'use client';

import { create } from 'zustand';
import { api, ApiError, type AuthUser } from '@/lib/api';

type AuthStatus = 'checking' | 'authed' | 'anon' | 'offline';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  error: string | null;
  checkSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: 'checking',
  error: null,

  checkSession: async () => {
    try {
      const user = await api.me();
      set({ user, status: 'authed', error: null });
    } catch (e) {
      if (api.isUnauthorized(e)) {
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
    set({ user: null, status: 'anon' });
  },
}));
