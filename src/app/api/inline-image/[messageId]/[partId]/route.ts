import { NextRequest, NextResponse } from "next/server";
import { getInlinePart } from "@/lib/gmail";
import { SAFE_IMAGE_TYPES, verifyInlineImageSignature } from "@/lib/inline-images";

// Serves an email's inline (cid:) image. Reachable without the session
// cookie (see src/proxy.ts) because the sandboxed email frame can't send
// it — the URL's signature is what authorises the request.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string; partId: string }> }
) {
  const { messageId, partId } = await params;
  const exp = req.nextUrl.searchParams.get("exp");
  const sig = req.nextUrl.searchParams.get("sig");
  if (!verifyInlineImageSignature(messageId, partId, exp, sig)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    const part = await getInlinePart(messageId, partId);
    if (!part || !SAFE_IMAGE_TYPES.has(part.mimeType)) {
      return new NextResponse("Not found", { status: 404 });
    }
    return new NextResponse(new Uint8Array(part.data), {
      headers: {
        "Content-Type": part.mimeType === "image/jpg" ? "image/jpeg" : part.mimeType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
