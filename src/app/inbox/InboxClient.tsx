"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MessageSummary } from "@/lib/gmail";
import { apiFetch, ReconnectRequiredClientError } from "@/lib/api-client";
import ComposeModal from "./ComposeModal";

type Folder = { key: string; label: string; labelIds?: string[] };

const FOLDERS: Folder[] = [
  { key: "inbox", label: "Inbox", labelIds: ["INBOX"] },
  { key: "starred", label: "Starred", labelIds: ["STARRED"] },
  { key: "sent", label: "Sent", labelIds: ["SENT"] },
  { key: "trash", label: "Trash", labelIds: ["TRASH"] },
  { key: "all", label: "All Mail" },
];

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
  const [folder, setFolder] = useState<Folder>(FOLDERS[0]);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [composeOpen, setComposeOpen] = useState(false);
  const [reconnectNeeded, setReconnectNeeded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-black px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Google connection expired
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            This happens roughly every 7 days for an unverified app. Reconnect
            to keep going — your PIN and settings stay the same.
          </p>
          <a
            href="/connect?reason=expired"
            className="mt-4 inline-block rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-5 py-2.5 font-medium"
          >
            Reconnect Google
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 bg-zinc-50 dark:bg-black">
      {composeOpen && (
        <ComposeModal onClose={() => setComposeOpen(false)} onSent={() => load()} />
      )}

      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-black/10 dark:border-white/10 flex flex-col p-4 gap-4">
        <button
          onClick={() => setComposeOpen(true)}
          className="rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium py-2.5 px-4"
        >
          Compose
        </button>
        <nav className="flex flex-col gap-1">
          {FOLDERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFolder(f)}
              className={`text-left px-3 py-2 rounded-lg text-sm ${
                folder.key === f.key
                  ? "bg-zinc-200 dark:bg-zinc-800 font-medium text-zinc-900 dark:text-zinc-50"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              }`}
            >
              {f.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto text-xs text-zinc-400 flex flex-col gap-2">
          {accountEmail && <span className="truncate">{accountEmail}</span>}
          <button onClick={logout} className="text-left hover:text-zinc-700 dark:hover:text-zinc-200">
            Lock
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-3 p-3 border-b border-black/10 dark:border-white/10">
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
              className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-900 px-4 py-2 text-sm outline-none text-zinc-900 dark:text-zinc-50"
            />
          </form>
          <button
            onClick={() => load()}
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Refresh
          </button>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-black/10 dark:border-white/10 text-sm">
            <span className="text-zinc-500">{selected.size} selected</span>
            <button onClick={() => runAction([...selected], "archive")} className="hover:underline">
              Archive
            </button>
            <button onClick={() => runAction([...selected], "trash")} className="hover:underline">
              Trash
            </button>
            <button onClick={() => runAction([...selected], "markRead")} className="hover:underline">
              Mark read
            </button>
            <button onClick={() => runAction([...selected], "markUnread")} className="hover:underline">
              Mark unread
            </button>
            {folder.key === "trash" && (
              <button
                onClick={() => deleteForever([...selected])}
                className="hover:underline text-red-600 dark:text-red-400"
              >
                Delete forever
              </button>
            )}
          </div>
        )}

        {actionError && (
          <p className="px-3 py-2 text-sm text-red-600 dark:text-red-400">{actionError}</p>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading && messages.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-400">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="p-6 text-center text-sm text-zinc-400">No messages</p>
          ) : (
            <ul>
              {messages.map((m) => (
                <li
                  key={m.id}
                  className={`flex items-center gap-3 px-3 py-2.5 border-b border-black/5 dark:border-white/5 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
                    m.unread ? "bg-white dark:bg-zinc-950" : "bg-zinc-50/50 dark:bg-black"
                  }`}
                  onClick={() => router.push(`/thread/${m.threadId}`)}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(m.id)}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      runAction([m.id], m.starred ? "unstar" : "star");
                    }}
                    className={m.starred ? "text-amber-400" : "text-zinc-300 dark:text-zinc-700"}
                    aria-label="star"
                  >
                    ★
                  </button>
                  <span
                    className={`w-40 shrink-0 truncate text-sm ${
                      m.unread ? "font-semibold text-zinc-900 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400"
                    }`}
                  >
                    {fromName(m.from)}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm">
                    <span
                      className={
                        m.unread
                          ? "font-semibold text-zinc-900 dark:text-zinc-50"
                          : "text-zinc-700 dark:text-zinc-300"
                      }
                    >
                      {m.subject}
                    </span>
                    <span className="text-zinc-400"> — {m.snippet}</span>
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-zinc-400">
                    {m.date ? new Date(m.date).toLocaleDateString() : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {nextPageToken && (
            <div className="p-4 text-center">
              <button
                onClick={() => load({ append: true, pageToken: nextPageToken })}
                disabled={loading}
                className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 disabled:opacity-40"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
