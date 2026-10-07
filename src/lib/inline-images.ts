import crypto from "node:crypto";
import { CID_REFERENCE, cidKey, type InlineImage } from "./message-parts";

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

// Expiry is rounded up to a whole hour (so a link lasts 1–2 hours) to keep
// URLs identical between page loads within the hour, letting the browser
// cache the image instead of re-fetching it from Gmail on every view.
export function signedInlineImageUrl(origin: string, messageId: string, partId: string): string {
  const exp = (Math.floor(Date.now() / 1000 / TTL_SECONDS) + 2) * TTL_SECONDS;
  const sig = sign(messageId, partId, exp);
  return `${origin}/api/inline-image/${encodeURIComponent(messageId)}/${encodeURIComponent(partId)}?exp=${exp}&sig=${sig}`;
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

// Points every `cid:` reference in an email's HTML at its signed URL, in a
// single pass (so one Content-ID that prefixes another can't clobber it).
// URLs are absolute: the email's own <base href> would otherwise resolve
// them against the sender's server. Returns the cidKeys it resolved.
export function rewriteCidImages(
  html: string,
  messageId: string,
  images: InlineImage[],
  origin: string
): { html: string; rewritten: Set<string> } {
  const byKey = new Map(
    images
      .filter((img) => SAFE_IMAGE_TYPES.has(img.mimeType.toLowerCase()))
      .map((img) => [cidKey(img.contentId), img])
  );
  const rewritten = new Set<string>();
  const out = html.replace(CID_REFERENCE, (match, raw: string) => {
    const key = cidKey(raw);
    const img = byKey.get(key);
    if (!img) return match;
    rewritten.add(key);
    return signedInlineImageUrl(origin, messageId, img.partId);
  });
  return { html: out, rewritten };
}
