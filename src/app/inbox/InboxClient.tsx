"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MessageSummary, Label } from "@/lib/gmail";
import { apiFetch, ReconnectRequiredClientError } from "@/lib/api-client";
import ComposeModal from "./ComposeModal";

type FolderEntry = { key: string; label: string; labelIds?: string[]; color?: string | null };

// Shared with ThreadClient: lets arrow-key next/previous navigation follow
// whichever list (folder/search) the message was opened from.
export const THREAD_ORDER_KEY = "mail:threadOrder";

// Gmail's own sidebar order. "ALL" is synthetic (no labelIds = no filter)
// and always shown; everything else only shows once we know it actually
// exists (and isn't hidden) on the connected account.
const SYSTEM_LABEL_ORDER: { id: string; label: string; synthetic?: boolean }[] = [
  { id: "INBOX", label: "Inbox" },
  { id: "STARRED", label: "Starred" },
  { id: "IMPORTANT", label: "Important" },
  { id: "SENT", label: "Sent" },
  { id: "DRAFT", label: "Drafts" },
  { id: "ALL", label: "All Mail", synthetic: true },
  { id: "SPAM", label: "Spam" },
  { id: "TRASH", label: "Trash" },
];

// Shown before the real label list has loaded, so the sidebar isn't empty.
const DEFAULT_VISIBLE_IDS = new Set(["INBOX", "STARRED", "SENT", "TRASH"]);

function fromName(from: string): string {
  const match = from.match(/^"?([^"<]*)"?\s*(<.*>)?$/);
  const name = match?.[1]?.trim();
  return name || from;
}

export default function InboxClient({
  accountEmail,
}: {
  accountEmail: string | null;
}) {
  const router = useRouter();
  const [folder, setFolder] = useState<FolderEntry>({
    key: "INBOX",
    label: "Inbox",
    labelIds: ["INBOX"],
  });
  const [labels, setLabels] = useState<Label[]>([]);
  const [labelsLoaded, setLabelsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [reconnectNeeded, setReconnectNeeded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ labels: Label[] }>("/api/gmail/labels")
      .then((data) => {
        setLabels(data.labels);
        setLabelsLoaded(true);
      })
      .catch((err) => {
        if (err instanceof ReconnectRequiredClientError) setReconnectNeeded(true);
        setLabelsLoaded(true);
      });
  }, []);

  const systemFolders: FolderEntry[] = SYSTEM_LABEL_ORDER.filter(
    (s) =>
      s.synthetic ||
      (labelsLoaded ? labels.some((l) => l.id === s.id) : DEFAULT_VISIBLE_IDS.has(s.id))
  ).map((s) => ({
    key: s.id,
    label: s.label,
    labelIds: s.id === "ALL" ? undefined : [s.id],
  }));

  const userLabels: FolderEntry[] = labels
    .filter((l) => l.type === "user")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((l) => ({ key: l.id, label: l.name, labelIds: [l.id], color: l.color }));

  const load = useCallback(
    async (opts: { append?: boolean; pageToken?: string } = {}) => {
      setLoading(true);
      if (!opts.append) setSelected(new Set());
      try {
        const params = new URLSearchParams();
        if (folder.labelIds) params.set("labelIds", folder.labelIds.join(","));
        if (query) params.set("q", query);
        if (opts.pageToken) params.set("pageToken", opts.pageToken);

        const data = await apiFetch<{
          messages: MessageSummary[];
          nextPageToken?: string;
        }>(`/api/gmail/messages?${params.toString()}`);

        setMessages((prev) =>
          opts.append ? [...prev, ...data.messages] : data.messages
        );
        setNextPageToken(data.nextPageToken);
      } catch (err) {
        if (err instanceof ReconnectRequiredClientError) {
          setReconnectNeeded(true);
        } else {
          setActionError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        setLoading(false);
      }
    },
    [folder, query]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-change
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, query]);

  // Record the order threads appear in this list so the thread view can
  // step to the next/previous one with the arrow keys.
  useEffect(() => {
    try {
      const order = Array.from(new Set(messages.map((m) => m.threadId)));
      sessionStorage.setItem(THREAD_ORDER_KEY, JSON.stringify(order));
    } catch {
      // Best-effort — sessionStorage can throw in some private-browsing modes.
    }
  }, [messages]);

  // Infinite scroll: fetch the next page automatically once the sentinel
  // at the bottom of the list scrolls into view, instead of a manual button.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!sentinel || !root || !nextPageToken) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          load({ append: true, pageToken: nextPageToken });
        }
      },
      { root, rootMargin: "400px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextPageToken, loading, load]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runAction(
    ids: string[],
    action:
      | "markRead"
      | "markUnread"
      | "star"
      | "unstar"
      | "archive"
      | "unarchive"
      | "trash"
      | "untrash"
  ) {
    setActionError(null);
    try {
      await Promise.all(
        ids.map((id) =>
          apiFetch(`/api/gmail/messages/${id}`, {
            method: "PATCH",
            body: JSON.stringify({ action }),
          })
        )
      );
      setSelected(new Set());
      load();
    } catch (err) {
      if (err instanceof ReconnectRequiredClientError) {
        setReconnectNeeded(true);
      } else {
        setActionError(err instanceof Error ? err.message : "Action failed");
      }
    }
  }

  async function deleteForever(ids: string[]) {
    if (!confirm(`Permanently delete ${ids.length} message(s)? This cannot be undone in Gmail.`)) {
      return;
    }
    setActionError(null);
    try {
      await Promise.all(
        ids.map((id) => apiFetch(`/api/gmail/messages/${id}`, { method: "DELETE" }))
      );
      setSelected(new Set());
      load();
    } catch (err) {
      if (err instanceof ReconnectRequiredClientError) {
        setReconnectNeeded(true);
      } else {
        setActionError(err instanceof Error ? err.message : "Delete failed");
      }
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/unlock";
  }

  if (reconnectNeeded) {
    return (
      <div className="flex flex-1 items-center justify-center bg-paper px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-semibold text-body">
            Google connection expired
          </h1>
          <p className="mt-2 text-sm text-muted">
            This happens roughly every 7 days for an unverified app. Reconnect
            to keep going — your PIN and settings stay the same.
          </p>
          <a
            href="/connect?reason=expired"
            className="mt-4 inline-block rounded-full bg-ink text-white px-5 py-2.5 font-medium"
          >
            Reconnect Google
          </a>
        </div>
      </div>
    );
  }

  function NavButton({ f }: { f: FolderEntry }) {
    const isActive = folder.key === f.key;
    return (
      <button
        onClick={() => setFolder(f)}
        className={`flex items-center gap-2.5 text-left px-3 py-2 rounded-lg text-sm truncate ${
          isActive
            ? "bg-white text-ink-deep font-medium shadow-sm"
            : "text-muted hover:bg-white/60 hover:text-body"
        }`}
      >
        {f.color !== undefined && (
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ background: f.color ?? "var(--color-line)" }}
          />
        )}
        <span className="truncate">{f.label}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 bg-paper">
      {composeOpen && (
        <ComposeModal onClose={() => setComposeOpen(false)} onSent={() => load()} />
      )}

      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-surface-2 flex flex-col p-4 gap-4 overflow-y-auto">
        <button
          onClick={() => setComposeOpen(true)}
          className="rounded-full bg-ink hover:bg-ink-deep text-white font-medium py-2.5 px-4 transition-colors"
        >
          Compose
        </button>

        <nav className="flex flex-col gap-1">
          {systemFolders.map((f) => (
            <NavButton key={f.key} f={f} />
          ))}
        </nav>

        {userLabels.length > 0 && (
          <div>
            <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
              Labels
            </p>
            <nav className="flex flex-col gap-1">
              {userLabels.map((f) => (
                <NavButton key={f.key} f={f} />
              ))}
            </nav>
          </div>
        )}

        <div className="mt-auto text-xs text-muted flex flex-col gap-2">
          {accountEmail && <span className="truncate">{accountEmail}</span>}
          <a
            href="/api/auth/google/start"
            title="Re-does Google sign-in now so the ~7-day unverified-app connection doesn't lapse"
            className="text-left hover:text-body"
          >
            Refresh connection
          </a>
          <button onClick={logout} className="text-left hover:text-body">
            Lock
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col bg-surface">
        <div className="flex items-center gap-3 p-3 border-b border-line">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(searchInput);
            }}
            className="flex-1"
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search mail"
              className="w-full rounded-full bg-surface-2 px-4 py-2 text-sm outline-none text-body placeholder:text-muted focus:ring-1 focus:ring-ink"
            />
          </form>
          <button
            onClick={() => load()}
            className="text-sm text-muted hover:text-body"
          >
            Refresh
          </button>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-4 px-3 py-2 border-b border-line bg-surface-2 text-sm">
            <span className="text-muted">{selected.size} selected</span>
            <button onClick={() => runAction([...selected], "archive")} className="text-ink hover:text-ink-deep hover:underline">
              Archive
            </button>
            <button onClick={() => runAction([...selected], "trash")} className="text-ink hover:text-ink-deep hover:underline">
              Trash
            </button>
            <button onClick={() => runAction([...selected], "markRead")} className="text-ink hover:text-ink-deep hover:underline">
              Mark read
            </button>
            <button onClick={() => runAction([...selected], "markUnread")} className="text-ink hover:text-ink-deep hover:underline">
              Mark unread
            </button>
            {folder.key === "TRASH" && (
              <button
                onClick={() => deleteForever([...selected])}
                className="text-seal-deep hover:underline"
              >
                Delete forever
              </button>
            )}
          </div>
        )}

        {actionError && (
          <p className="px-3 py-2 text-sm text-seal-deep">{actionError}</p>
        )}

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
          {loading && messages.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted">No messages</p>
          ) : (
            <ul>
              {messages.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5 border-b border-line cursor-pointer hover:bg-surface-2"
                  onClick={() => router.push(`/thread/${m.threadId}`)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(m.id)}
                    className="accent-ink"
                  />
                  {m.unread ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-ink shrink-0" aria-hidden />
                  ) : (
                    <span className="w-1.5 shrink-0" aria-hidden />
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      runAction([m.id], m.starred ? "unstar" : "star");
                    }}
                    className={m.starred ? "text-seal" : "text-line hover:text-seal-deep"}
                    aria-label="star"
                  >
                    ★
                  </button>
                  <span
                    className={`w-40 shrink-0 truncate text-sm ${
                      m.unread ? "font-semibold text-body" : "text-muted"
                    }`}
                  >
                    {fromName(m.from)}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm">
                    <span className={m.unread ? "font-semibold text-body" : "text-muted"}>
                      {m.subject}
                    </span>
                    <span className="text-muted"> — {m.snippet}</span>
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-muted">
                    {m.date ? new Date(m.date).toLocaleDateString() : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {nextPageToken && (
            <div ref={sentinelRef} className="p-4 text-center text-sm text-muted">
              {loading && messages.length > 0 ? "Loading more…" : ""}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
