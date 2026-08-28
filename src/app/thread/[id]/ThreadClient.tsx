"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MessageDetail } from "@/lib/gmail";
import { apiFetch, ReconnectRequiredClientError } from "@/lib/api-client";
import ComposeModal, { ComposePrefill } from "../../inbox/ComposeModal";

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}

export default function ThreadClient({ threadId }: { threadId: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyPrefill, setReplyPrefill] = useState<ComposePrefill | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ messages: MessageDetail[] }>(
        `/api/gmail/thread/${threadId}`
      );
      setMessages(data.messages);
      // Mark the thread's messages as read, mirroring Gmail's own behavior.
      const unread = data.messages.filter((m) => m.unread);
      await Promise.all(
        unread.map((m) =>
          apiFetch(`/api/gmail/messages/${m.id}`, {
            method: "PATCH",
            body: JSON.stringify({ action: "markRead" }),
          })
        )
      );
    } catch (err) {
      if (err instanceof ReconnectRequiredClientError) {
        window.location.href = "/connect?reason=expired";
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to load thread");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional fetch-on-mount
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  async function act(id: string, action: "star" | "unstar" | "archive" | "trash") {
    try {
      await apiFetch(`/api/gmail/messages/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      if (action === "archive" || action === "trash") {
        router.push("/inbox");
      } else {
        load();
      }
    } catch (err) {
      if (err instanceof ReconnectRequiredClientError) {
        window.location.href = "/connect?reason=expired";
      }
    }
  }

  function openReply(m: MessageDetail) {
    setReplyPrefill({
      to: extractEmail(m.from),
      subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
      threadId: m.threadId,
      inReplyTo: m.messageIdHeader,
      references: [m.references, m.messageIdHeader].filter(Boolean).join(" "),
    });
  }

  if (loading) {
    return <p className="p-6 text-center text-sm text-zinc-400">Loading…</p>;
  }
  if (error) {
    return <p className="p-6 text-center text-sm text-red-500">{error}</p>;
  }

  const last = messages[messages.length - 1];

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-zinc-50 dark:bg-black">
      {replyPrefill && (
        <ComposeModal
          prefill={replyPrefill}
          onClose={() => setReplyPrefill(null)}
          onSent={load}
        />
      )}

      <div className="flex items-center gap-3 p-3 border-b border-black/10 dark:border-white/10">
        <button
          onClick={() => router.push("/inbox")}
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Back
        </button>
        <h1 className="flex-1 min-w-0 truncate font-medium text-zinc-900 dark:text-zinc-50">
          {last?.subject}
        </h1>
        {last && (
          <div className="flex gap-3 text-sm text-zinc-500">
            <button onClick={() => act(last.id, last.starred ? "unstar" : "star")}>
              {last.starred ? "★ Starred" : "☆ Star"}
            </button>
            <button onClick={() => act(last.id, "archive")}>Archive</button>
            <button onClick={() => act(last.id, "trash")} className="text-red-600 dark:text-red-400">
              Trash
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className="rounded-xl border border-black/10 dark:border-white/10 bg-white dark:bg-zinc-950 p-4"
          >
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <div className="min-w-0">
                <p className="font-medium text-zinc-900 dark:text-zinc-50 truncate">{m.from}</p>
                <p className="text-xs text-zinc-400 truncate">To: {m.to}</p>
              </div>
              <span className="text-xs text-zinc-400 shrink-0">
                {m.date ? new Date(m.date).toLocaleString() : ""}
              </span>
            </div>

            {m.body.html ? (
              <iframe
                sandbox=""
                srcDoc={m.body.html}
                className="w-full border-0"
                style={{ height: 400 }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800 dark:text-zinc-200">
                {m.body.text || m.snippet}
              </pre>
            )}

            <button
              onClick={() => openReply(m)}
              className="mt-3 text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              Reply
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
