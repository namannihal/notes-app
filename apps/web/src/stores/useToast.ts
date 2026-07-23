'use client';

import { create } from 'zustand';

export type ToastType = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, type?: ToastType) => void;
  dismiss: (id: string) => void;
}

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  push: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a toast from non-component code (callbacks, stores). */
export const toast = (message: string, type: ToastType = 'info') =>
  useToast.getState().push(message, type);
