import { apiFetch } from "./api-client";

// Uploads a file in chunks (each request stays under Vercel's 4.5MB body
// limit) and returns the upload id to pass to the send route.
export async function uploadFile(
  file: File,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const { id, chunkSize } = await apiFetch<{ id: string; chunkSize: number }>("/api/uploads", {
    method: "POST",
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  });

  const chunkCount = Math.max(1, Math.ceil(file.size / chunkSize));
  for (let i = 0; i < chunkCount; i++) {
    const res = await fetch(`/api/uploads/${id}/chunks/${i}`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: file.slice(i * chunkSize, (i + 1) * chunkSize),
    });
    if (res.status === 401) {
      window.location.href = "/unlock";
      throw new Error("locked");
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Upload failed (${res.status})`);
    }
    onProgress?.((i + 1) / chunkCount);
  }
  return id;
}

export function discardUpload(id: string): void {
  // Fire-and-forget: unsent uploads are purged after a day regardless.
  fetch(`/api/uploads/${id}`, { method: "DELETE" }).catch(() => {});
}
