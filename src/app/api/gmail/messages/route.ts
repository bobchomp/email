import { NextRequest } from "next/server";
import { listMessages } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? undefined;
  const labelIdsParam = req.nextUrl.searchParams.get("labelIds");
  const labelIds = labelIdsParam ? labelIdsParam.split(",") : undefined;
  const pageToken = req.nextUrl.searchParams.get("pageToken") ?? undefined;

  return withGmailErrorHandling(() => listMessages({ q, labelIds, pageToken }));
}
