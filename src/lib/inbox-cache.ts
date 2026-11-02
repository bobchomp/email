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

// A message's read state changed (row action, or opened in the thread
// view): reflect it in every cached folder listing, not just the current
// one, so switching folders doesn't briefly show stale bold rows.
export function setReadInAllCachedMessages(ids: string[], read: boolean): void {
  const idSet = new Set(ids);
  let keys: string[] = [];
  try {
    keys = Object.keys(sessionStorage).filter((k) => k.startsWith("mail:cache:messages:"));
  } catch {
    return;
  }
  for (const key of keys) {
    const cached = getCachedMessages(key);
    if (!cached || !cached.messages.some((m) => idSet.has(m.id))) continue;
    writeJSON(key, {
      ...cached,
      messages: cached.messages.map((m) =>
        idSet.has(m.id)
          ? {
              ...m,
              unread: !read,
              labelIds: read
                ? m.labelIds.filter((l) => l !== "UNREAD")
                : Array.from(new Set([...m.labelIds, "UNREAD"])),
            }
          : m
      ),
    } satisfies CachedMessages);
  }
}

// Messages read while viewing the Unread folder. They stay listed (shown as
// read) until a manual refresh or a folder switch, even across background
// refreshes and a trip into the thread view and back.
const KEPT_READ_KEY = "mail:unreadKeptRead";

export function getKeptRead(): Set<string> {
  return new Set(readJSON<string[]>(KEPT_READ_KEY) ?? []);
}

export function addKeptRead(ids: string[]): void {
  writeJSON(KEPT_READ_KEY, [...new Set([...getKeptRead(), ...ids])]);
}

export function clearKeptRead(): void {
  try {
    sessionStorage.removeItem(KEPT_READ_KEY);
  } catch {
    // Nothing to clear.
  }
}

// The inbox URL (folder + search) a thread was opened from, so the thread
// view's Back/Archive/Trash return to the same list.
const RETURN_TO_KEY = "mail:returnTo";

export function setReturnTo(path: string): void {
  try {
    sessionStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    // Falls back to plain /inbox.
  }
}

export function getReturnTo(): string {
  try {
    const path = sessionStorage.getItem(RETURN_TO_KEY);
    // Only ever navigate back into the inbox page.
    if (path && /^\/inbox(\?|$)/.test(path)) return path;
  } catch {
    // Fall through.
  }
  return "/inbox";
}

const UNREAD_COUNT_KEY = "mail:unreadCount";

export function getCachedUnreadCount(): number | null {
  return readJSON<number>(UNREAD_COUNT_KEY);
}

export function setCachedUnreadCount(count: number): void {
  writeJSON(UNREAD_COUNT_KEY, count);
}

const LABEL_UNREAD_KEY = "mail:labelUnread";

export function getCachedLabelUnread(): Record<string, number> | null {
  return readJSON<Record<string, number>>(LABEL_UNREAD_KEY);
}

export function setCachedLabelUnread(counts: Record<string, number>): void {
  writeJSON(LABEL_UNREAD_KEY, counts);
}

const LABELS_CACHE_KEY = "mail:cache:labels";

export function getCachedLabels(): CachedLabels | null {
  return readJSON<CachedLabels>(LABELS_CACHE_KEY);
}

export function setCachedLabels(labels: Label[]): void {
  writeJSON(LABELS_CACHE_KEY, { labels, fetchedAt: Date.now() } satisfies CachedLabels);
}
