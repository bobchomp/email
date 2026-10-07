import { NextRequest, NextResponse } from "next/server";
import { deleteUploads } from "@/lib/db";
import { UUID_PATTERN } from "@/lib/upload-limits";

// Discards an attachment removed from the composer before sending.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Bad upload" }, { status: 400 });
  await deleteUploads([id]);
  return NextResponse.json({ ok: true });
}
