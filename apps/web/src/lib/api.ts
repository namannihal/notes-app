const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const TOKEN_KEY = 'sthir_token';
const REFRESH_KEY = 'sthir_refresh';

/** Bearer token kept in localStorage so auth works even when mobile browsers
 *  block the cross-site cookie. */
export function getAuthToken(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}
function setAuthToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}
function getRefreshToken(): string | null {
  return typeof localStorage !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
}
function setRefreshToken(token: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (token) localStorage.setItem(REFRESH_KEY, token);
  else localStorage.removeItem(REFRESH_KEY);
}
function storeTokens(res: { token?: string; refreshToken?: string }): void {
  if (res.token) setAuthToken(res.token);
  if (res.refreshToken) setRefreshToken(res.refreshToken);
}
function clearTokens(): void {
  setAuthToken(null);
  setRefreshToken(null);
}

export interface AuthUser {
  id: string;
  email: string;
  displayName?: string | null;
}

export interface SignupConfig {
  signupMode: 'open' | 'invite' | 'closed';
  inviteRequired: boolean;
  signupAvailable: boolean;
}

export interface SyncChange {
  entityType: 'bucket' | 'stack' | 'notebook' | 'note';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  version?: number;
  payload: Record<string, unknown>;
}

export interface PullResponse {
  buckets: ServerRecord[];
  stacks: ServerRecord[];
  notebooks: ServerRecord[];
  notes: ServerRecord[];
  attachments: ServerRecord[];
  serverTime: string;
}

export interface PushResponse {
  accepted: string[];
  conflicts: { id: string; serverCopy: ServerRecord }[];
  serverTime: string;
}

export interface UploadUrlResponse {
  attachmentId: string;
  storageKey: string;
  uploadUrl: string | null;
  alreadyExists: boolean;
}

/** A record as returned by the API (snake_case timestamps as ISO strings). */
export type ServerRecord = Record<string, unknown>;

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function rawRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = typeof body.error === 'string' ? body.error : message;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Access tokens are short-lived, so a 401 is usually just expiry rather than a
 * real sign-out. Shared across callers so a burst of parallel requests triggers
 * exactly one refresh instead of a stampede that would rotate the refresh token
 * repeatedly and invalidate itself.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const res = await rawRequest<AuthUser & { token?: string; refreshToken?: string }>(
        '/api/auth/refresh',
        { method: 'POST', body: JSON.stringify({ refreshToken: getRefreshToken() ?? undefined }) },
      );
      storeTokens(res);
      return true;
    } catch {
      clearTokens();
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers all observe this result.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();
  return refreshInFlight;
}

/** Endpoints that establish a session must never trigger a refresh attempt. */
const NO_REFRESH = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/config',
]);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await rawRequest<T>(path, init);
  } catch (e) {
    const pathOnly = path.split('?')[0];
    if (!(e instanceof ApiError) || e.status !== 401 || NO_REFRESH.has(pathOnly)) throw e;
    if (!(await refreshSession())) throw e;
    return rawRequest<T>(path, init);
  }
}

export const api = {
  isUnauthorized: (e: unknown) => e instanceof ApiError && e.status === 401,

  signupConfig: () => request<SignupConfig>('/api/auth/config'),
  me: () => request<AuthUser>('/api/auth/me'),
  login: async (email: string, password: string) => {
    const res = await request<AuthUser & { token?: string; refreshToken?: string }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
    );
    storeTokens(res);
    return { id: res.id, email: res.email, displayName: res.displayName } as AuthUser;
  },
  register: async (input: {
    email: string;
    password: string;
    displayName?: string;
    inviteCode?: string;
  }) => {
    const res = await request<AuthUser & { token?: string; refreshToken?: string }>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(input) },
    );
    storeTokens(res);
    return { id: res.id, email: res.email, displayName: res.displayName } as AuthUser;
  },
  logout: async () => {
    try {
      return await request<{ ok: true }>('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: getRefreshToken() ?? undefined }),
      });
    } finally {
      clearTokens();
    }
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await request<{ ok: true; token?: string; refreshToken?: string }>(
      '/api/auth/change-password',
      { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) },
    );
    // The server revokes every other session, and hands us a replacement pair.
    storeTokens(res);
    return { ok: true as const };
  },
  forgotPassword: (email: string) =>
    request<{ ok: true }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: async (token: string, password: string) => {
    const res = await request<AuthUser & { token?: string; refreshToken?: string }>(
      '/api/auth/reset-password',
      { method: 'POST', body: JSON.stringify({ token, password }) },
    );
    storeTokens(res);
    return { id: res.id, email: res.email } as AuthUser;
  },

  listActivity: () => request<{ days: { day: string; noteCount: number }[] }>('/api/activity'),
  recordActivity: (days: string[]) =>
    request<{ ok: true; recorded: number }>('/api/activity', {
      method: 'POST',
      body: JSON.stringify({ days }),
    }),

  pull: (since?: string) =>
    request<PullResponse>(`/api/sync/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`),
  push: (changes: SyncChange[]) =>
    request<PushResponse>('/api/sync/push', {
      method: 'POST',
      body: JSON.stringify({ changes }),
    }),

  requestUpload: (meta: {
    id?: string;
    noteId: string;
    filename: string;
    mimeType: string;
    byteSize: number;
    checksum: string;
    width?: number;
    height?: number;
    pageCount?: number;
  }) =>
    request<UploadUrlResponse>('/api/attachments/upload-url', {
      method: 'POST',
      body: JSON.stringify(meta),
    }),
  commitUpload: (id: string) =>
    request<{ ok: true }>(`/api/attachments/${id}/commit`, { method: 'POST' }),
  downloadUrl: (id: string) =>
    request<{ url: string; filename: string }>(`/api/attachments/${id}/download-url`),

  importEnex: (stackId: string, notebookTitle: string, xml: string) =>
    request<{ notebookId: string; notesImported: number; attachmentsImported: number }>(
      `/api/import/enex?stackId=${encodeURIComponent(stackId)}&notebookTitle=${encodeURIComponent(notebookTitle)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/xml' }, body: xml },
    ),
};

export { ApiError, BASE as API_BASE };
