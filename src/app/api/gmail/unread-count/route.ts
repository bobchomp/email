import { getUnreadCount } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";

export async function GET() {
  return withGmailErrorHandling(async () => ({ count: await getUnreadCount() }));
}
