import { NextRequest } from "next/server";
import { getLabelUnreadCounts, getUnreadCount } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";

// ?labels=Label_1,Label_2 also returns those labels' unread counts.
export async function GET(req: NextRequest) {
  const labelIds = (req.nextUrl.searchParams.get("labels") ?? "")
    .split(",")
    .filter((id) => /^[\w-]{1,100}$/.test(id))
    .slice(0, 50);

  return withGmailErrorHandling(async () => {
    const [count, labels] = await Promise.all([getUnreadCount(), getLabelUnreadCounts(labelIds)]);
    return { count, labels };
  });
}
