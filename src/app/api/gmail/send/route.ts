import { NextRequest } from "next/server";
import { sendMessage } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { to, cc, bcc, subject, text, threadId, inReplyTo, references } = body as {
    to?: string;
    cc?: string;
    bcc?: string;
    subject?: string;
    text?: string;
    threadId?: string;
    inReplyTo?: string;
    references?: string;
  };

  if (!to || !text) {
    return withGmailErrorHandling(async () => {
      throw new Error("'to' and 'text' are required");
    });
  }

  return withGmailErrorHandling(async () => {
    await sendMessage({
      to,
      cc,
      bcc,
      subject: subject ?? "",
      body: text,
      threadId,
      inReplyTo,
      references,
    });
    return { ok: true };
  });
}
