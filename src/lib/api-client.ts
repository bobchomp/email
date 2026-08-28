export class ReconnectRequiredClientError extends Error {
  constructor() {
    super("reconnect_required");
  }
}

export async function apiFetch<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (res.status === 401) {
    window.location.href = "/unlock";
    throw new Error("locked");
  }

  if (res.status === 409) {
    const data = await res.json().catch(() => ({}));
    if (data.error === "reconnect_required") {
      throw new ReconnectRequiredClientError();
    }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Request failed (${res.status})`);
  }

  return res.json();
}
