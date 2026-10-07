import { formatBytes } from "@/lib/upload-limits";

export default function AttachmentChip({
  name,
  size,
  progress,
  error,
  onRemove,
}: {
  name: string;
  size: number;
  progress?: number;
  error?: string;
  onRemove: () => void;
}) {
  const uploading = progress !== undefined && progress < 1 && !error;
  return (
    <div
      className={`relative flex items-center gap-2 overflow-hidden rounded-lg border px-2.5 py-1.5 text-sm ${
        error ? "border-seal bg-seal-soft" : "border-line bg-surface"
      }`}
      title={error ?? name}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0 text-muted">
        <path d="M21.44 11.05 12.25 20.24a5 5 0 0 1-7.07-7.07l9.19-9.19a3.34 3.34 0 0 1 4.71 4.71l-9.2 9.19a1.67 1.67 0 0 1-2.36-2.36l8.49-8.48" />
      </svg>
      <span className="max-w-44 truncate text-body">{name}</span>
      <span className="shrink-0 text-xs text-muted">
        {error ? "Failed" : uploading ? `${Math.round((progress ?? 0) * 100)}%` : formatBytes(size)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${name}`}
        className="shrink-0 text-muted hover:text-body"
      >
        ×
      </button>
      {uploading && (
        <span
          className="absolute bottom-0 left-0 h-0.5 bg-ink transition-all"
          style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
        />
      )}
    </div>
  );
}
