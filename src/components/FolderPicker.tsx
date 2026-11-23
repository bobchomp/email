"use client";

import { useEffect, useRef, useState } from "react";
import type { Label } from "@/lib/gmail";
import { apiFetch } from "@/lib/api-client";
import { getCachedLabels, isFresh, setCachedLabels } from "@/lib/inbox-cache";

export type FolderChange = { add: string[]; remove: string[]; move: boolean };

// "Add to folder" popup for an open email: tick folders (user labels) to add
// the conversation to them, untick to take it out, or create a new one.
// "Add" keeps it where it is; "Move" also takes it out of the Inbox.
export default function FolderPicker({
  threadId,
  currentLabelIds,
  onDone,
  onClose,
}: {
  threadId: string;
  currentLabelIds: string[];
  onDone: (change: FolderChange) => void;
  onClose: () => void;
}) {
  const [folders, setFolders] = useState<Label[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(currentLabelIds));
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cached = getCachedLabels();
    if (cached && isFresh(cached.fetchedAt)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cache-hit fast path
      setFolders(cached.labels);
      return;
    }
    apiFetch<{ labels: Label[] }>("/api/gmail/labels")
      .then((data) => {
        setFolders(data.labels);
        setCachedLabels(data.labels);
      })
      .catch(() => setError("Couldn't load your folders"));
  }, []);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    // Clicks inside the email body (a sandboxed iframe) never reach this
    // document, but they do take focus away from the window.
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const userFolders = (folders ?? [])
    .filter((l) => l.type === "user")
    .sort((a, b) => a.name.localeCompare(b.name));
  const term = filter.trim();
  const shown = userFolders.filter((l) => l.name.toLowerCase().includes(term.toLowerCase()));
  const exactMatch = userFolders.some((l) => l.name.toLowerCase() === term.toLowerCase());

  const initial = new Set(currentLabelIds);
  const add = [...checked].filter((id) => !initial.has(id));
  const remove = [...initial].filter((id) => !checked.has(id));
  const changed = add.length > 0 || remove.length > 0;

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createFolder() {
    if (!term || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { label } = await apiFetch<{ label: Label }>("/api/gmail/labels", {
        method: "POST",
        body: JSON.stringify({ name: term }),
      });
      const next = [...(folders ?? []).filter((l) => l.id !== label.id), label];
      setFolders(next);
      setCachedLabels(next);
      setChecked((prev) => new Set(prev).add(label.id));
      setFilter("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the folder");
    } finally {
      setBusy(false);
    }
  }

  async function apply(move: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/gmail/thread/${threadId}/folders`, {
        method: "POST",
        body: JSON.stringify({ add, remove, move }),
      });
      onDone({ add, remove, move });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the folders");
      setBusy(false);
    }
  }

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Add to folder"
      className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-line bg-surface shadow-xl text-sm text-body"
    >
      <div className="border-b border-line p-2">
        <input
          ref={input}
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && term && !exactMatch) createFolder();
          }}
          placeholder="Search or name a new folder"
          className="w-full rounded-lg bg-surface-2 px-3 py-1.5 outline-none placeholder:text-muted focus:ring-1 focus:ring-ink"
        />
      </div>

      <div className="max-h-64 overflow-y-auto py-1">
        {folders === null && !error && <p className="px-3 py-2 text-muted">Loading folders…</p>}
        {shown.map((l) => (
          <label key={l.id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-surface-2">
            <input
              type="checkbox"
              checked={checked.has(l.id)}
              onChange={() => toggle(l.id)}
              className="accent-ink"
            />
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: l.color ?? "var(--color-line)" }} />
            <span className="min-w-0 truncate">{l.name}</span>
          </label>
        ))}
        {folders !== null && shown.length === 0 && !term && (
          <p className="px-3 py-2 text-muted">No folders yet</p>
        )}
        {term && !exactMatch ? (
          <button
            type="button"
            onClick={createFolder}
            disabled={busy}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-surface-2 disabled:opacity-50"
          >
            <span className="text-base leading-none">+</span>
            <span className="min-w-0 truncate">New folder “{term}”</span>
          </button>
        ) : (
          !term && (
            <button
              type="button"
              onClick={() => input.current?.focus()}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-surface-2"
            >
              <span className="text-base leading-none">+</span>
              <span>New folder…</span>
            </button>
          )
        )}
      </div>

      {error && <p className="px-3 pb-1 text-seal-deep">{error}</p>}

      <div className="flex items-center justify-end gap-2 border-t border-line p-2">
        <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-muted hover:bg-surface-2">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => apply(false)}
          disabled={!changed || busy}
          title="Add to the ticked folders and keep it where it is"
          className="rounded-full border border-line px-3 py-1.5 hover:bg-surface-2 disabled:opacity-40"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => apply(true)}
          disabled={checked.size === 0 || busy}
          title="Put it in the ticked folders and take it out of the Inbox"
          className="rounded-full bg-ink px-3 py-1.5 font-medium text-white hover:bg-ink-deep disabled:opacity-40"
        >
          Move
        </button>
      </div>
    </div>
  );
}
