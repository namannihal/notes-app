const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const TOKEN_KEY = 'sthir_token';

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

export interface AuthUser {
  id: string;
  email: string;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

export const api = {
  isUnauthorized: (e: unknown) => e instanceof ApiError && e.status === 401,

  me: () => request<AuthUser>('/api/auth/me'),
  login: async (email: string, password: string) => {
    const res = await request<AuthUser & { token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.token) setAuthToken(res.token);
    return { id: res.id, email: res.email } as AuthUser;
  },
  logout: async () => {
    try {
      return await request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
    } finally {
      setAuthToken(null);
    }
  },
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
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
