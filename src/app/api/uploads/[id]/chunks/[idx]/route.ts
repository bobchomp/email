import { NextRequest, NextResponse } from "next/server";
import { getUploadMeta, putUploadChunk } from "@/lib/db";
import { UPLOAD_CHUNK_BYTES, UUID_PATTERN } from "@/lib/upload-limits";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; idx: string }> }
) {
  const { id, idx: idxParam } = await params;
  const idx = Number(idxParam);
  if (!UUID_PATTERN.test(id) || !Number.isInteger(idx) || idx < 0) {
    return NextResponse.json({ error: "Bad upload" }, { status: 400 });
  }

  const meta = await getUploadMeta(id);
  if (!meta) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

  const chunkCount = Math.max(1, Math.ceil(meta.size / UPLOAD_CHUNK_BYTES));
  const expectedLength =
    idx === chunkCount - 1 ? meta.size - idx * UPLOAD_CHUNK_BYTES : UPLOAD_CHUNK_BYTES;
  if (idx >= chunkCount) {
    return NextResponse.json({ error: "Chunk out of range" }, { status: 400 });
  }

  const data = Buffer.from(await req.arrayBuffer());
  if (data.length !== expectedLength) {
    return NextResponse.json({ error: "Chunk size mismatch" }, { status: 400 });
  }

  await putUploadChunk(id, idx, data);
  return NextResponse.json({ ok: true });
}
