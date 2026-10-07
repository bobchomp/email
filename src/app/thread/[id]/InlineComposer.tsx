"use client";

import { useRef, useState } from "react";
import type { MessageDetail } from "@/lib/gmail";
import { apiFetch, ReconnectRequiredClientError } from "@/lib/api-client";
import { buildRecipients, buildSubject, type ComposeMode } from "@/lib/reply-compose";
import { toEmailHtml } from "@/lib/email-html";
import LoadingOverlay from "@/components/LoadingOverlay";
import RichTextEditor from "@/components/RichTextEditor";
import QuotedPreview from "@/components/QuotedPreview";
import AttachmentChip from "@/components/AttachmentChip";
import { useAttachments } from "@/components/useAttachments";

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

  const [to, setTo] = useState(initial.to);
  const [cc, setCc] = useState(initial.cc);
  const [bcc, setBcc] = useState("");
  const [ccVisible, setCcVisible] = useState(!!initial.cc);
  const [bccVisible, setBccVisible] = useState(false);
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // A forward carries the original's files (minus images shown inline in
  // its body, which travel with the quote) unless removed here.
  const forwardable =
    mode === "forward"
      ? message.attachments.filter(
          (a) => !(a.contentId && message.body.html?.includes(`cid:${a.contentId}`))
        )
      : [];
  const [removedPartIds, setRemovedPartIds] = useState<Set<string>>(new Set());
  const forwarded = forwardable.filter((a) => !removedPartIds.has(a.partId));
  const forwardedBytes = forwarded.reduce((n, a) => n + a.size, 0);

  const attachments = useAttachments(forwardedBytes);

  async function send() {
    if (!to || sending || attachments.busy) return;
    if (attachments.hasErrors) {
      setError("Remove the attachments that failed to upload first");
      return;
    }
    setSending(true);
    setError(null);
    const { html: emailHtml, inlineUploadIds } = toEmailHtml(html);
    try {
      // Only the newly written part goes up — the server fetches the
      // original itself for the quote, threading and forwarded files.
      await apiFetch("/api/gmail/send", {
        method: "POST",
        body: JSON.stringify({
          to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject: buildSubject(mode, message.subject),
          html: emailHtml,
          uploadIds: attachments.uploadIds,
          inlineUploadIds,
          quote: {
            messageId: message.id,
            mode,
            forwardPartIds: mode === "forward" ? forwarded.map((a) => a.partId) : undefined,
          },
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

  function discard() {
    attachments.discardAll();
    onClose();
  }

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted w-8 shrink-0">{label}</span>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 border-b border-line bg-transparent py-1.5 outline-none text-sm text-body placeholder:text-muted"
      />
    </div>
  );

  return (
    <div
      className={`relative mt-3 rounded-xl border bg-surface-2 p-3 flex flex-col gap-2 ${
        dragging ? "border-ink border-dashed" : "border-line"
      }`}
      onKeyDown={(e) => {
        // Ctrl/Cmd+Enter sends from anywhere in the composer (the editor
        // handles — and marks — the key itself when it has focus).
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.defaultPrevented) {
          e.preventDefault();
          send();
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        setDragging(false);
        if (e.defaultPrevented || !e.dataTransfer.files.length) return;
        e.preventDefault();
        attachments.addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {sending && <LoadingOverlay message="Sending…" />}

      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{MODE_LABEL[mode]}</p>

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">{field("To", to, setTo, "Recipient")}</div>
        {!ccVisible && (
          <button onClick={() => setCcVisible(true)} className="text-xs text-muted hover:text-body shrink-0">
            Cc
          </button>
        )}
        {!bccVisible && (
          <button onClick={() => setBccVisible(true)} className="text-xs text-muted hover:text-body shrink-0">
            Bcc
          </button>
        )}
      </div>
      {ccVisible && field("Cc", cc, setCc, "Cc")}
      {bccVisible && field("Bcc", bcc, setBcc, "Bcc")}

      <RichTextEditor
        autofocus
        placeholder={mode === "forward" ? "Add a note (optional)" : "Write your reply…"}
        onChange={setHtml}
        onSubmit={send}
        onImageUpload={attachments.uploadInline}
        onFiles={attachments.addFiles}
      />

      {(forwarded.length > 0 || attachments.items.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {forwarded.map((a) => (
            <AttachmentChip
              key={`fwd-${a.partId}`}
              name={a.filename}
              size={a.size}
              onRemove={() => setRemovedPartIds((prev) => new Set(prev).add(a.partId))}
            />
          ))}
          {attachments.items.map((i) => (
            <AttachmentChip
              key={i.key}
              name={i.name}
              size={i.size}
              progress={i.progress}
              error={i.error}
              onRemove={() => attachments.remove(i.key)}
            />
          ))}
        </div>
      )}

      <QuotedPreview messageId={message.id} mode={mode} />

      {attachments.limitError && <p className="text-sm text-seal-deep">{attachments.limitError}</p>}
      {error && <p className="text-sm text-seal-deep">{error}</p>}

      <div className="flex items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            attachments.addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-full text-muted hover:bg-white hover:text-body"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.34 3.34 0 0 1 4.71 4.71l-9.2 9.19a1.67 1.67 0 0 1-2.36-2.36l8.49-8.48" />
          </svg>
          Attach
        </button>
        <div className="flex-1" />
        <button onClick={discard} className="px-4 py-2 text-sm rounded-full text-muted hover:bg-white">
          Discard
        </button>
        <button
          onClick={send}
          disabled={!to || sending || attachments.busy}
          title="Send (Ctrl+Enter)"
          className="px-4 py-2 text-sm rounded-full bg-ink hover:bg-ink-deep text-white font-medium disabled:opacity-40 transition-colors"
        >
          {attachments.busy ? "Uploading…" : sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
