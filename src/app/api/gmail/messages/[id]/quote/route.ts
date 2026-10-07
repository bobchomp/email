import { NextRequest } from "next/server";
import { getMessage } from "@/lib/gmail";
import { buildQuote, type QuoteMode } from "@/lib/quote";
import { withGmailErrorHandling } from "@/lib/api-helpers";

const QUOTE_MODES = new Set(["reply", "replyAll", "forward"]);

// The exact quote the send route will append, so the composer can preview
// what actually goes out.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mode = req.nextUrl.searchParams.get("mode") ?? "reply";
  const timeZone = req.nextUrl.searchParams.get("tz") ?? undefined;

  return withGmailErrorHandling(async () => {
    if (!QUOTE_MODES.has(mode)) throw new Error("Invalid mode");
    const original = await getMessage(id);
    return { html: buildQuote(original, mode as QuoteMode, timeZone).html };
  });
}
