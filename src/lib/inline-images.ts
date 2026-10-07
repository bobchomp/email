import crypto from "node:crypto";
import type { InlineImage } from "./message-parts";

// Email HTML is rendered in a sandboxed iframe with an opaque origin, so
// image requests from it don't carry the session cookie. Inline (cid:)
// images are therefore served from short-lived signed URLs: the signature,
// not the cookie, authorises each one.
const TTL_SECONDS = 60 * 60;

// Raster types only — SVG can carry script and would run under this
// origin if the URL were ever opened directly.
export const SAFE_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/avif",
]);

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET environment variable is not set");
  return s;
}

function sign(messageId: string, partId: string, exp: number): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`inline-image\n${messageId}\n${partId}\n${exp}`)
    .digest("base64url");
}

export function signedInlineImageUrl(messageId: string, partId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const sig = sign(messageId, partId, exp);
  return `/api/inline-image/${encodeURIComponent(messageId)}/${encodeURIComponent(partId)}?exp=${exp}&sig=${sig}`;
}

export function verifyInlineImageSignature(
  messageId: string,
  partId: string,
  exp: string | null,
  sig: string | null
): boolean {
  const expNum = Number(exp);
  if (!sig || !Number.isInteger(expNum) || expNum < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(messageId, partId, expNum));
  const given = Buffer.from(sig);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

// Points every `cid:` reference in an email's HTML at its signed URL.
export function rewriteCidImages(html: string, messageId: string, images: InlineImage[]): string {
  let out = html;
  for (const img of images) {
    if (!SAFE_IMAGE_TYPES.has(img.mimeType.toLowerCase())) continue;
    const url = signedInlineImageUrl(messageId, img.partId);
    out = out.split(`cid:${img.contentId}`).join(url);
  }
  return out;
}
