"use client";

import { useRef, useState } from "react";
import { apiFetch, ReconnectRequiredClientError } from "@/lib/api-client";
import { toEmailHtml, isEditorHtmlEmpty } from "@/lib/email-html";
import LoadingOverlay from "@/components/LoadingOverlay";
import RichTextEditor from "@/components/RichTextEditor";
import AttachmentChip from "@/components/AttachmentChip";
import { useAttachments } from "@/components/useAttachments";

export default function ComposeModal({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [bccVisible, setBccVisible] = useState(false);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attachments = useAttachments();

  async function send() {
    if (!to || sending || attachments.busy) return;
    if (attachments.hasErrors) {
      setError("Remove the attachments that failed to upload first");
      return;
    }
    if (isEditorHtmlEmpty(html) && attachments.uploadIds.length === 0) {
      setError("Write a message or attach a file first");
      return;
    }
    setSending(true);
    setError(null);
    const { html: emailHtml, inlineUploadIds } = toEmailHtml(html);
    try {
      await apiFetch("/api/gmail/send", {
        method: "POST",
        body: JSON.stringify({
          to,
          cc: cc || undefined,
          bcc: bcc || undefined,
          subject,
          html: emailHtml,
          uploadIds: attachments.uploadIds,
          inlineUploadIds,
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

  const input = (value: string, set: (v: string) => void, placeholder: string) => (
    <input
      value={value}
      onChange={(e) => set(e.target.value)}
      placeholder={placeholder}
      className="flex-1 min-w-0 border-b border-line bg-transparent py-2 outline-none text-sm text-body placeholder:text-muted"
    />
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-body/30 p-0 sm:p-4">
      {sending && <LoadingOverlay message="Sending…" />}

      <div
        className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl bg-surface border border-line shadow-xl flex flex-col max-h-[90vh]"
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter sends from anywhere in the window (the editor
          // handles — and marks — the key itself when it has focus).
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.defaultPrevented) {
            e.preventDefault();
            send();
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDrop={(e) => {
          if (e.defaultPrevented || !e.dataTransfer.files.length) return;
          e.preventDefault();
          attachments.addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 className="font-medium text-body">New message</h2>
          <button onClick={discard} aria-label="Close" className="text-muted hover:text-body">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2 p-4 overflow-y-auto">
          <div className="flex items-center gap-2">
            {input(to, setTo, "To")}
            {!bccVisible && (
              <button onClick={() => setBccVisible(true)} className="text-xs text-muted hover:text-body shrink-0">
                Bcc
              </button>
            )}
          </div>
          <div className="flex">{input(cc, setCc, "Cc")}</div>
          {bccVisible && <div className="flex">{input(bcc, setBcc, "Bcc")}</div>}
          <div className="flex">{input(subject, setSubject, "Subject")}</div>

          <RichTextEditor
            placeholder="Write your message…"
            onChange={setHtml}
            onSubmit={send}
            onImageUpload={attachments.uploadInline}
            onFiles={attachments.addFiles}
          />

          {attachments.items.length > 0 && (
            <div className="flex flex-wrap gap-2">
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
        </div>

        {attachments.limitError && <p className="px-4 text-sm text-seal-deep">{attachments.limitError}</p>}
        {error && <p className="px-4 text-sm text-seal-deep">{error}</p>}

        <div className="flex items-center gap-2 px-4 py-3 border-t border-line">
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
            className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-full text-muted hover:bg-surface-2 hover:text-body"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.34 3.34 0 0 1 4.71 4.71l-9.2 9.19a1.67 1.67 0 0 1-2.36-2.36l8.49-8.48" />
            </svg>
            Attach
          </button>
          <div className="flex-1" />
          <button onClick={discard} className="px-4 py-2 text-sm rounded-full text-muted hover:bg-surface-2">
            Cancel
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
    </div>
  );
}
