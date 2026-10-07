// Under Vercel's 4.5MB request-body cap for functions, with headroom.
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

// Gmail's attachment limit; the encoded message (~1.37x) then stays under
// its 35MB total message size.
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// Upload ids are random UUIDs.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
