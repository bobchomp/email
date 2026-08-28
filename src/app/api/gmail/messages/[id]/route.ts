import { NextRequest } from "next/server";
import {
  deleteMessagePermanently,
  getMessage,
  modifyMessage,
  trashMessage,
  untrashMessage,
} from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";

type Action =
  | "markRead"
  | "markUnread"
  | "star"
  | "unstar"
  | "archive"
  | "unarchive"
  | "trash"
  | "untrash";

const ACTION_LABEL_CHANGES: Record<
  Exclude<Action, "trash" | "untrash">,
  { add: string[]; remove: string[] }
> = {
  markRead: { add: [], remove: ["UNREAD"] },
  markUnread: { add: ["UNREAD"], remove: [] },
  star: { add: ["STARRED"], remove: [] },
  unstar: { add: [], remove: ["STARRED"] },
  archive: { add: [], remove: ["INBOX"] },
  unarchive: { add: ["INBOX"], remove: [] },
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withGmailErrorHandling(() => getMessage(id));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await req.json()) as { action?: Action };
  const action = body.action;

  return withGmailErrorHandling(async () => {
    if (action === "trash") {
      await trashMessage(id);
    } else if (action === "untrash") {
      await untrashMessage(id);
    } else if (action && action in ACTION_LABEL_CHANGES) {
      const change = ACTION_LABEL_CHANGES[action];
      await modifyMessage(id, change.add, change.remove);
    } else {
      throw new Error("Unknown action");
    }
    return { ok: true };
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withGmailErrorHandling(async () => {
    await deleteMessagePermanently(id);
    return { ok: true };
  });
}
