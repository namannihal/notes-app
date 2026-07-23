const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface AuthUser {
  id: string;
  email: string;
}

export interface SyncChange {
  entityType: 'stack' | 'notebook' | 'note';
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  version?: number;
  payload: Record<string, unknown>;
}

export interface PullResponse {
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
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
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
  login: (email: string, password: string) =>
    request<AuthUser>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
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
};

export { ApiError, BASE as API_BASE };
