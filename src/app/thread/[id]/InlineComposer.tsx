"use client";

import { useEffect, useRef, useState } from "react";
import type { MessageDetail } from "@/lib/gmail";
import { apiFetch, ReconnectRequiredClientError } from "@/lib/api-client";
import {
  buildRecipients,
  buildSubject,
  quoteMessage,
  forwardBody,
  type ComposeMode,
} from "@/lib/reply-compose";

const MODE_LABEL: Record<ComposeMode, string> = {
  reply: "Reply",
  replyAll: "Reply all",
  forward: "Forward",
};

export default function InlineComposer({
  mode,
  message,
  selfEmail,
  onClose,
  onSent,
}: {
  mode: ComposeMode;
  message: MessageDetail;
  selfEmail: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const initial = buildRecipients(mode, message, selfEmail);
  const initialBody =
    "\n\n" + (mode === "forward" ? forwardBody(message) : quoteMessage(message));

  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [ccVisible, setCcVisible] = useState(!!initial.cc);
  const [body, setBody] = useState(initialBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(0, 0);
    el.scrollTop = 0;
  }, []);

  async function send() {
    if (!to || sending) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch("/api/gmail/send", {
        method: "POST",
        body: JSON.stringify({
          to,
          cc: cc || undefined,
          subject: buildSubject(mode, message.subject),
          text: body,
          threadId: mode === "forward" ? undefined : message.threadId,
          inReplyTo: mode === "forward" ? undefined : message.messageIdHeader,
          references:
            mode === "forward"
              ? undefined
              : [message.references, message.messageIdHeader].filter(Boolean).join(" "),
        }),
      });
      onSent();
      onClose();
    } catch (err) {
      if (err instanceof ReconnectRequiredClientError) {
        window.location.href = "/connect?reason=expired";
        return;
      }
      setError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3 flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {MODE_LABEL[mode]}
      </p>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted w-8 shrink-0">To</span>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Recipient"
          className="flex-1 min-w-0 border-b border-line bg-transparent py-1.5 outline-none text-sm text-body placeholder:text-muted"
        />
        {!ccVisible && (
          <button
            onClick={() => setCcVisible(true)}
            className="text-xs text-muted hover:text-body shrink-0"
          >
            + Cc
          </button>
        )}
      </div>

      {ccVisible && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted w-8 shrink-0">Cc</span>
          <input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Cc"
            className="flex-1 min-w-0 border-b border-line bg-transparent py-1.5 outline-none text-sm text-body placeholder:text-muted"
          />
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={12}
        className="bg-transparent py-2 outline-none text-sm resize-y text-body placeholder:text-muted font-sans"
      />

      {error && <p className="text-sm text-seal-deep">{error}</p>}

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm rounded-full text-muted hover:bg-white">
          Discard
        </button>
        <button
          onClick={send}
          disabled={!to || sending}
          className="px-4 py-2 text-sm rounded-full bg-ink hover:bg-ink-deep text-white font-medium disabled:opacity-40 transition-colors"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
