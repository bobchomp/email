import { NextRequest, NextResponse } from "next/server";
import { deleteUploads } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Discards an attachment removed from the composer before sending.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Bad upload" }, { status: 400 });
  await deleteUploads([id]);
  return NextResponse.json({ ok: true });
}
