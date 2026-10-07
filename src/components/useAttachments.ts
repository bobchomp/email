"use client";

import { useEffect, useRef, useState } from "react";
import { discardUpload, uploadFile } from "@/lib/uploads-client";
import { MAX_ATTACHMENT_BYTES, formatBytes } from "@/lib/upload-limits";

export type UploadItem = {
  key: string;
  name: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  uploadId?: string;
  error?: string;
};

// Composer attachments: files uploaded in the background as soon as they're
// added (so Send is instant), plus images pasted into the text.
// `reservedBytes` counts toward the 25MB limit too (forwarded files, and
// the inline images a quote carries).
export function useAttachments(reservedBytes = 0) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [inlinePending, setInlinePending] = useState(0);
  const [inlineBytes, setInlineBytes] = useState(0);
  const [limitError, setLimitError] = useState<string | null>(null);
  const nextKey = useRef(0);
  const removedKeys = useRef(new Set<string>());
  // Every upload this composer created, so unsent ones can be thrown away
  // when it closes without sending.
  const ownedUploadIds = useRef(new Set<string>());
  const sent = useRef(false);

  useEffect(
    () => () => {
      if (sent.current) return;
      for (const id of ownedUploadIds.current) discardUpload(id);
      ownedUploadIds.current.clear();
    },
    []
  );

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const fileBytes = items.filter((i) => i.status !== "error").reduce((n, i) => n + i.size, 0);
  const remainingBytes = MAX_ATTACHMENT_BYTES - reservedBytes - fileBytes - inlineBytes;

  const overLimit = (file: File) =>
    `${file.name} (${formatBytes(file.size)}) would take attachments over Gmail's 25MB limit`;

  function addFiles(files: File[]) {
    setLimitError(null);
    let budget = remainingBytes;
    for (const file of files) {
      if (file.size > budget) {
        setLimitError(overLimit(file));
        continue;
      }
      budget -= file.size;
      const key = `u${nextKey.current++}`;
      setItems((prev) => [...prev, { key, name: file.name, size: file.size, progress: 0, status: "uploading" }]);
      uploadFile(file, (progress) => update(key, { progress })).then(
        (uploadId) => {
          ownedUploadIds.current.add(uploadId);
          // Removed while still uploading — throw the finished upload away.
          if (removedKeys.current.has(key)) {
            discardUpload(uploadId);
            return;
          }
          update(key, { uploadId, status: "done", progress: 1 });
        },
        (err: unknown) =>
          update(key, { status: "error", error: err instanceof Error ? err.message : "Upload failed" })
      );
    }
  }

  function remove(key: string) {
    removedKeys.current.add(key);
    const item = items.find((i) => i.key === key);
    if (item?.uploadId) discardUpload(item.uploadId);
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  // For images pasted into the text. Rejecting removes the image again.
  async function uploadInline(file: File): Promise<string> {
    if (file.size > remainingBytes) {
      setLimitError(overLimit(file));
      throw new Error("over limit");
    }
    setInlineBytes((n) => n + file.size);
    setInlinePending((n) => n + 1);
    try {
      const id = await uploadFile(file);
      ownedUploadIds.current.add(id);
      return id;
    } catch (err) {
      setInlineBytes((n) => n - file.size);
      throw err;
    } finally {
      setInlinePending((n) => n - 1);
    }
  }

  function discardAll() {
    for (const id of ownedUploadIds.current) discardUpload(id);
    ownedUploadIds.current.clear();
  }

  // After a successful send the server has already consumed (and deleted)
  // the uploads — don't try to discard them on close.
  function markSent() {
    sent.current = true;
  }

  return {
    items,
    addFiles,
    remove,
    uploadInline,
    discardAll,
    markSent,
    limitError,
    busy: inlinePending > 0 || items.some((i) => i.status === "uploading"),
    hasErrors: items.some((i) => i.status === "error"),
    uploadIds: items.filter((i) => i.status === "done" && i.uploadId).map((i) => i.uploadId!),
  };
}
