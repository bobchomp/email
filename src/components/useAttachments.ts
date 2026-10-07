"use client";

import { useRef, useState } from "react";
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
// `reservedBytes` counts toward the 25MB limit too (e.g. forwarded files).
export function useAttachments(reservedBytes = 0) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [inlinePending, setInlinePending] = useState(0);
  const [limitError, setLimitError] = useState<string | null>(null);
  const inlineIds = useRef<string[]>([]);
  const nextKey = useRef(0);
  const removedKeys = useRef(new Set<string>());

  const update = (key: string, patch: Partial<UploadItem>) =>
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  const usedBytes = items.filter((i) => i.status !== "error").reduce((n, i) => n + i.size, 0);

  function addFiles(files: File[]) {
    setLimitError(null);
    let budget = MAX_ATTACHMENT_BYTES - reservedBytes - usedBytes;
    for (const file of files) {
      if (file.size > budget) {
        setLimitError(
          `${file.name} (${formatBytes(file.size)}) would take attachments over Gmail's 25MB limit`
        );
        continue;
      }
      budget -= file.size;
      const key = `u${nextKey.current++}`;
      setItems((prev) => [...prev, { key, name: file.name, size: file.size, progress: 0, status: "uploading" }]);
      uploadFile(file, (progress) => update(key, { progress })).then(
        (uploadId) => {
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

  async function uploadInline(file: File): Promise<string> {
    setInlinePending((n) => n + 1);
    try {
      const id = await uploadFile(file);
      inlineIds.current.push(id);
      return id;
    } finally {
      setInlinePending((n) => n - 1);
    }
  }

  function discardAll() {
    for (const i of items) if (i.uploadId) discardUpload(i.uploadId);
    for (const id of inlineIds.current) discardUpload(id);
  }

  return {
    items,
    addFiles,
    remove,
    uploadInline,
    discardAll,
    limitError,
    busy: inlinePending > 0 || items.some((i) => i.status === "uploading"),
    hasErrors: items.some((i) => i.status === "error"),
    uploadIds: items.filter((i) => i.status === "done" && i.uploadId).map((i) => i.uploadId!),
  };
}
