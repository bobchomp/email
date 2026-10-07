import { NextRequest } from "next/server";
import { getThread } from "@/lib/gmail";
import { withGmailErrorHandling } from "@/lib/api-helpers";
import { rewriteCidImages } from "@/lib/inline-images";
import { referencedContentIds } from "@/lib/message-parts";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withGmailErrorHandling(async () => {
    const messages = await getThread(id);
    return {
      messages: messages.map((m) => {
        const shownInline = referencedContentIds(m.body.html);
        return {
          ...m,
          body: {
            ...m.body,
            html: m.body.html && rewriteCidImages(m.body.html, m.id, m.inlineImages),
          },
          // Images shown in the body aren't listed again as attachments,
          // matching Gmail.
          attachments: m.attachments.filter(
            (a) => !(a.contentId && shownInline.has(a.contentId))
          ),
        };
      }),
    };
  });
}
