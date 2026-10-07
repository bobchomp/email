import { NextRequest } from "next/server";
import { composeAndSend, type ComposeRequest } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";

const QUOTE_MODES = new Set(["reply", "replyAll", "forward"]);

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

function parseRequest(body: Record<string, unknown>): ComposeRequest {
  const to = optionalString(body.to);
  if (!to) throw new Error("'to' is required");

  let quote: ComposeRequest["quote"];
  if (body.quote && typeof body.quote === "object") {
    const q = body.quote as Record<string, unknown>;
    const messageId = optionalString(q.messageId);
    if (!messageId || typeof q.mode !== "string" || !QUOTE_MODES.has(q.mode)) {
      throw new Error("Invalid quote");
    }
    const partIds = Array.isArray(q.forwardPartIds)
      ? q.forwardPartIds.filter((id): id is string => typeof id === "string")
      : undefined;
    quote = { messageId, mode: q.mode as "reply" | "replyAll" | "forward", forwardPartIds: partIds };
  }

  const html = optionalString(body.html);
  const text = optionalString(body.text);
  if (!html && !text && !quote) throw new Error("Message is empty");

  return {
    to,
    cc: optionalString(body.cc),
    bcc: optionalString(body.bcc),
    subject: typeof body.subject === "string" ? body.subject : "",
    html,
    text,
    quote,
    timeZone: optionalString(body.timeZone),
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;
  return withGmailErrorHandling(async () => {
    await composeAndSend(parseRequest(body));
    return { ok: true };
  });
}
