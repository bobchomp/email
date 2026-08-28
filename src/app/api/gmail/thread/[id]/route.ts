import { NextRequest } from "next/server";
import { getThread } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withGmailErrorHandling(async () => ({ messages: await getThread(id) }));
}
