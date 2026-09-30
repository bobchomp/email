import type { MessageSummary, Label } from "./gmail";

// How long a cached inbox listing is considered fresh before a background
// refresh is warranted — matches the periodic auto-refresh interval.
export const MESSAGES_MAX_AGE_MS = 60_000;

type CachedMessages = {
  messages: MessageSummary[];
  nextPageToken?: string;
  fetchedAt: number;
};

type CachedLabels = {
  labels: Label[];
  fetchedAt: number;
};

function readJSON<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // sessionStorage can throw in some private-browsing modes — fine to skip.
  }
}

export function messagesCacheKey(labelIds: string[] | undefined, query: string): string {
  return `mail:cache:messages:${labelIds ? labelIds.join(",") : "ALL"}:${query}`;
}

export function getCachedMessages(key: string): CachedMessages | null {
  return readJSON<CachedMessages>(key);
}

// Real fetch just completed — bumps the freshness clock.
export function setCachedMessages(
  key: string,
  data: { messages: MessageSummary[]; nextPageToken?: string }
): void {
  writeJSON(key, { ...data, fetchedAt: Date.now() } satisfies CachedMessages);
}

// Content changed locally (an optimistic star/read/archive/... edit) — keep
// the cache in sync without resetting the refresh clock, so a quick trip
// into a message and back still shows the edit instantly from cache.
export function patchCachedMessages(
  key: string,
  data: { messages: MessageSummary[]; nextPageToken?: string }
): void {
  const existing = getCachedMessages(key);
  writeJSON(key, { ...data, fetchedAt: existing?.fetchedAt ?? Date.now() } satisfies CachedMessages);
}

export function isFresh(fetchedAt: number, maxAgeMs: number = MESSAGES_MAX_AGE_MS): boolean {
  return Date.now() - fetchedAt < maxAgeMs;
}

const LABELS_CACHE_KEY = "mail:cache:labels";

export function getCachedLabels(): CachedLabels | null {
  return readJSON<CachedLabels>(LABELS_CACHE_KEY);
}

export function setCachedLabels(labels: Label[]): void {
  writeJSON(LABELS_CACHE_KEY, { labels, fetchedAt: Date.now() } satisfies CachedLabels);
}
