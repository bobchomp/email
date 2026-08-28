import { listLabels } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";

export async function GET() {
  return withGmailErrorHandling(async () => ({ labels: await listLabels() }));
}
