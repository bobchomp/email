import { NextRequest, NextResponse } from "next/server";
import { getAttachment } from "@/lib/gmail";
import { ReconnectRequiredError } from "@/lib/google-oauth";

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]/g, "").trim();
}

// Always forces a download (never `inline`) regardless of the attachment's
// mime type — an attacker-crafted email attaching an HTML/SVG file must
// never render inline under this app's own origin.
//
// HTTP header values must be ByteStrings (Latin-1) — Node's Headers throws
// on anything outside that range — so the plain `filename=` fallback has to
// be scrubbed to printable ASCII. The real name (any script/emoji) still
// reaches RFC 5987-compliant clients via the percent-encoded `filename*=`.
function contentDisposition(filename: string): string {
  const asciiFallback =
    filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'") || "attachment";
  const encoded = encodeURIComponent(filename).replace(/'/g, "%27");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { id, attachmentId } = await params;

  try {
    const { data, filename, mimeType } = await getAttachment(id, attachmentId);
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": sanitizeHeaderValue(mimeType) || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": contentDisposition(filename),
        "Content-Length": String(data.length),
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ReconnectRequiredError) {
      return NextResponse.redirect(new URL("/connect?reason=expired", req.url));
    }
    const message = err instanceof Error ? err.message : "Failed to download attachment";
    return new NextResponse(message, { status: 500 });
  }
}
