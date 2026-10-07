import { NextRequest } from "next/server";
import { getThread } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";
import { rewriteCidImages } from "@/lib/inline-images";
import { cidKey } from "@/lib/message-parts";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withGmailErrorHandling(async () => {
    const messages = await getThread(id);
    return {
      messages: messages.map((m) => {
        const { html, rewritten } = m.body.html
          ? rewriteCidImages(m.body.html, m.id, m.inlineImages, req.nextUrl.origin)
          : { html: m.body.html, rewritten: new Set<string>() };
        return {
          ...m,
          body: { ...m.body, html },
          // Images actually shown in the body aren't listed again as
          // attachments, matching Gmail. Ones that can't be shown (e.g. an
          // inline TIFF) keep their download chip.
          attachments: m.attachments.filter(
            (a) => !(a.contentId && rewritten.has(cidKey(a.contentId)))
          ),
        };
      }),
    };
  });
}
