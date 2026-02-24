const API_BASE = import.meta.env.VITE_API_URL || "";

async function api<T> (path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const apiClient = {
  get: <T>(path: string) => api<T>(path),
  post: <T>(path: string, body?: unknown) =>
    api<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    api<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    api<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string, body?: unknown) =>
    api<void>(path, { method: "DELETE", ...(body && { body: JSON.stringify(body) }) }),
  deleteWithResponse: <T>(path: string, body?: unknown) =>
    api<T>(path, { method: "DELETE", ...(body && { body: JSON.stringify(body) }) }),
};
