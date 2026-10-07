import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createUpload } from "@/lib/db";
import { MAX_ATTACHMENT_BYTES, UPLOAD_CHUNK_BYTES } from "@/lib/upload-limits";

// Starts a chunked upload of one composer attachment.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { filename?: unknown; contentType?: unknown; size?: unknown };

  const size = typeof body.size === "number" ? body.size : NaN;
  if (!Number.isInteger(size) || size < 0 || size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "Attachments can be up to 25MB" }, { status: 400 });
  }

  // These end up in the outgoing message's MIME headers.
  const filename =
    (typeof body.filename === "string" ? body.filename : "")
      .replace(/[\x00-\x1f\x7f/\\]/g, "")
      .trim()
      .slice(0, 255) || "attachment";
  const contentType =
    typeof body.contentType === "string" && /^[\w.+-]+\/[\w.+-]+$/.test(body.contentType)
      ? body.contentType.toLowerCase()
      : "application/octet-stream";

  const id = randomUUID();
  await createUpload({ id, filename, contentType, size });
  return NextResponse.json({ id, chunkSize: UPLOAD_CHUNK_BYTES });
}
