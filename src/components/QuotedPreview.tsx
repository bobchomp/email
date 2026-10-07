"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { EMAIL_FRAME_SANDBOX, makeLinksOpenInNewTab } from "@/lib/email-frame";
import type { ComposeMode } from "@/lib/reply-compose";

// The quoted original, exactly as the server will append it — read-only
// and collapsed by default, like Gmail's "•••".
export default function QuotedPreview({ messageId, mode }: { messageId: string; mode: ComposeMode }) {
  const [open, setOpen] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && html === null) {
      setError(null);
      try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const data = await apiFetch<{ html: string }>(
          `/api/gmail/messages/${messageId}/quote?mode=${mode}&tz=${encodeURIComponent(tz)}`
        );
        setHtml(data.html);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load the original");
      }
    }
  }

  const label = mode === "forward" ? "forwarded message" : "quoted text";

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={toggle}
        title={open ? `Hide ${label}` : `Show ${label}`}
        aria-expanded={open}
        className="self-start flex items-center gap-2 rounded-full bg-surface border border-line px-2.5 py-0.5 text-xs text-muted hover:text-body hover:bg-ink-soft"
      >
        <span className="tracking-widest leading-none">•••</span>
        <span>{open ? `Hide ${label}` : `Show ${label}`}</span>
      </button>
      {open &&
        (error ? (
          <p className="text-xs text-seal-deep">{error}</p>
        ) : html === null ? (
          <p className="text-xs text-muted">Loading…</p>
        ) : (
          <iframe
            title={label}
            sandbox={EMAIL_FRAME_SANDBOX}
            srcDoc={makeLinksOpenInNewTab(html)}
            className="w-full h-80 rounded-lg border border-line bg-white"
          />
        ))}
    </div>
  );
}
