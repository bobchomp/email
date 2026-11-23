import { NextRequest } from "next/server";
import { setThreadFolders } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";

// Only user folders can be added/removed here; system labels (Inbox, Spam,
// Trash…) change through their own actions — "move" is the one exception,
// and only ever removes INBOX.
const USER_LABEL = /^Label_\d+$/;

function labelList(v: unknown): string[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 100 || !v.every((id) => typeof id === "string" && USER_LABEL.test(id))) {
    throw new Error("Invalid folders");
  }
  return v as string[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as { add?: unknown; remove?: unknown; move?: unknown };
  return withGmailErrorHandling(async () => {
    await setThreadFolders(id, {
      add: labelList(body.add),
      remove: labelList(body.remove),
      move: body.move === true,
    });
    return { ok: true };
  });
}
