import { NextResponse } from "next/server";
import { getPinnedLabelIds } from "@/lib/db";

export async function GET() {
  try {
    const labelIds = await getPinnedLabelIds();
    return NextResponse.json({ labelIds });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load pinned labels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
