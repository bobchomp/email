"use client";

import { useState } from "react";
import { apiFetch, ReconnectRequiredClientError } from "@/lib/api-client";

export type ComposePrefill = {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
};

export default function ComposeModal({
  prefill,
  onClose,
  onSent,
}: {
  prefill?: ComposePrefill;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(prefill?.to ?? "");
  const [cc, setCc] = useState(prefill?.cc ?? "");
  const [subject, setSubject] = useState(prefill?.subject ?? "");
  const [body, setBody] = useState(prefill?.body ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          subject,
          text: body,
          threadId: prefill?.threadId,
          inReplyTo: prefill?.inReplyTo,
          references: prefill?.references,
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-body/30 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl bg-surface border border-line shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="font-medium text-body">
            {prefill?.threadId ? "Reply" : "New message"}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-body">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4 overflow-y-auto">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="To"
            className="border-b border-line bg-transparent py-2 outline-none text-sm text-body placeholder:text-muted"
          />
          <input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Cc"
            className="border-b border-line bg-transparent py-2 outline-none text-sm text-body placeholder:text-muted"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="border-b border-line bg-transparent py-2 outline-none text-sm text-body placeholder:text-muted"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message…"
            rows={10}
            className="bg-transparent py-2 outline-none text-sm resize-none text-body placeholder:text-muted"
          />
        </div>

        {error && <p className="px-4 text-sm text-seal-deep">{error}</p>}

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-line">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-full text-muted hover:bg-surface-2"
          >
            Cancel
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
    </div>
  );
}
