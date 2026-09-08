import { NextRequest, NextResponse } from "next/server";
import { pinLabel, unpinLabel } from "@/lib/db";

export async function PUT(
  _req: NextRequest,
  { params }: { params: Promise<{ labelId: string }> }
) {
  const { labelId } = await params;
  try {
    await pinLabel(labelId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to pin label";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ labelId: string }> }
) {
  const { labelId } = await params;
  try {
    await unpinLabel(labelId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to unpin label";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
