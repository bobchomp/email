import type { gmail_v1 } from "googleapis";

type Part = gmail_v1.Schema$MessagePart;

export type MessageBody = {
  text: string | null;
  html: string | null;
};

export type Attachment = {
  attachmentId: string;
  // Stable across fetches, unlike attachmentId (Gmail issues a new one on
  // every messages.get), so it's what to use to pick attachments later.
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  // Set when the part has a Content-ID, i.e. it can be shown inline by an
  // HTML body that references it as `cid:<contentId>`.
  contentId?: string;
};

// Loads a part's body when Gmail stored it separately (large bodies and
// most attachments come back with an attachmentId instead of inline data).
export type FetchAttachment = (attachmentId: string) => Promise<Buffer>;

function partHeader(p: Part, name: string): string {
  return p.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

export function contentIdOf(p: Part): string | undefined {
  const raw = partHeader(p, "Content-ID").trim();
  if (!raw) return undefined;
  return raw.replace(/^<|>$/g, "");
}

function isAttachmentPart(p: Part): boolean {
  if (p.mimeType === "message/rfc822") return true;
  if (/^\s*attachment/i.test(partHeader(p, "Content-Disposition"))) return true;
  return !!p.filename;
}

function decodeText(data: Buffer, p: Part): string {
  const charset = /charset\s*=\s*"?([^";\s]+)/i.exec(partHeader(p, "Content-Type"))?.[1];
  try {
    return new TextDecoder(charset || "utf-8").decode(data);
  } catch {
    // Unknown/unsupported charset label — UTF-8 is the best remaining guess.
    return new TextDecoder("utf-8").decode(data);
  }
}

export async function partData(p: Part, fetchAttachment: FetchAttachment): Promise<Buffer | null> {
  if (p.body?.data) return Buffer.from(p.body.data, "base64url");
  if (p.body?.attachmentId) return fetchAttachment(p.body.attachmentId);
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function textToHtml(text: string): string {
  return `<div style="white-space:pre-wrap">${escapeHtml(text)}</div>`;
}

// Mirrors how mail clients pick what to display: in multipart/alternative
// the richest version wins; in mixed/related, body pieces are shown in
// order (Apple Mail splits a body around inline images this way); attached
// files and attached emails are never treated as the body.
export async function extractBody(
  root: Part | undefined,
  fetchAttachment: FetchAttachment
): Promise<MessageBody> {
  async function render(p: Part): Promise<MessageBody> {
    const type = (p.mimeType || "").toLowerCase();

    if (type.startsWith("multipart/")) {
      const children = await Promise.all((p.parts ?? []).map(render));
      if (type === "multipart/alternative") {
        return {
          html: [...children].reverse().find((c) => c.html)?.html ?? null,
          text: children.find((c) => c.text)?.text ?? null,
        };
      }
      // In multipart/mixed (Apple Mail's layout), an inline image sitting
      // between body pieces is shown at that spot — unless the HTML already
      // references it, as multipart/related bodies do.
      const referenced = children.map((c) => c.html ?? "").join("");
      const inlineImages = (p.parts ?? []).map((child) => {
        if (type !== "multipart/mixed") return null;
        if (!(child.mimeType || "").startsWith("image/")) return null;
        if (/^\s*attachment/i.test(partHeader(child, "Content-Disposition"))) return null;
        const cid = contentIdOf(child);
        if (!cid || referenced.includes(`cid:${cid}`)) return null;
        return `<img src="cid:${escapeHtml(cid)}" alt="${escapeHtml(child.filename || "")}">`;
      });

      const anyHtml = children.some((c) => c.html) || inlineImages.some(Boolean);
      const html = anyHtml
        ? children
            .map((c, i) => inlineImages[i] ?? c.html ?? (c.text ? textToHtml(c.text) : ""))
            .filter(Boolean)
            .join("")
        : null;
      const texts = children.map((c) => c.text).filter((t): t is string => !!t);
      return { html, text: texts.length ? texts.join("\n") : null };
    }

    if (isAttachmentPart(p)) return { html: null, text: null };

    if (type === "text/html" || type === "text/plain") {
      const data = await partData(p, fetchAttachment);
      if (!data) return { html: null, text: null };
      const content = decodeText(data, p);
      return type === "text/html" ? { html: content, text: null } : { html: null, text: content };
    }

    return { html: null, text: null };
  }

  if (!root) return { html: null, text: null };
  return render(root);
}

export function extractAttachments(root: Part | undefined): Attachment[] {
  const result: Attachment[] = [];

  function walk(p: Part) {
    if (p.filename && p.body?.attachmentId) {
      result.push({
        attachmentId: p.body.attachmentId,
        partId: p.partId ?? "",
        filename: p.filename,
        mimeType: p.mimeType || "application/octet-stream",
        size: p.body.size ?? 0,
        contentId: contentIdOf(p),
      });
      // An attached email is one attachment — don't list its insides too.
      if (p.mimeType === "message/rfc822") return;
    }
    for (const child of p.parts ?? []) walk(child);
  }

  if (root) walk(root);
  return result;
}

export type InlineImage = { contentId: string; partId: string; mimeType: string };

export function listInlineImages(root: Part | undefined): InlineImage[] {
  return [...findContentIdParts(root)]
    .filter(([, p]) => (p.mimeType || "").startsWith("image/"))
    .map(([contentId, p]) => ({ contentId, partId: p.partId ?? "", mimeType: p.mimeType || "" }));
}

export function findPartById(root: Part | undefined, partId: string): Part | null {
  if (!root) return null;
  if ((root.partId ?? "") === partId) return root;
  for (const child of root.parts ?? []) {
    const found = findPartById(child, partId);
    if (found) return found;
  }
  return null;
}

// Every part that can be referenced as `cid:` from an HTML body, keyed by
// Content-ID, outside of attached emails.
export function findContentIdParts(root: Part | undefined): Map<string, Part> {
  const result = new Map<string, Part>();
  function walk(p: Part) {
    if (p.mimeType === "message/rfc822") return;
    const cid = contentIdOf(p);
    if (cid && !(p.mimeType || "").startsWith("multipart/")) result.set(cid, p);
    for (const child of p.parts ?? []) walk(child);
  }
  if (root) walk(root);
  return result;
}

// All `cid:` references an HTML body makes, so the matching inline images
// can travel with a reply or forward.
export function referencedContentIds(html: string | null): Set<string> {
  const ids = new Set<string>();
  if (!html) return ids;
  for (const m of html.matchAll(/cid:([^"'\s)>]+)/gi)) {
    try {
      ids.add(decodeURIComponent(m[1]));
    } catch {
      ids.add(m[1]);
    }
  }
  return ids;
}
