import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { gmail_v1, google } from "googleapis";
import { deleteUploads, getGoogleAccount, readUpload } from "./db";
import { MAX_ATTACHMENT_BYTES } from "./upload-limits";
import { decryptSecret } from "./crypto";
import { buildMimeMessage, type OutgoingAttachment, type OutgoingMessage } from "./mime";
import {
  extractAttachments,
  extractBody,
  cidKey,
  contentIdOf,
  findContentIdParts,
  findPartById,
  listInlineImages,
  partData,
  referencedContentIds,
  referencedInlineBytes,
  textToHtml,
  type Attachment,
  type InlineImage,
  type MessageBody,
} from "./message-parts";
import { buildQuote, htmlToPlainText, type QuoteMode } from "./quote";
import {
  createOAuthClient,
  isReconnectRequiredError,
  ReconnectRequiredError,
} from "./google-oauth";

async function getGmailClient(): Promise<gmail_v1.Gmail> {
  const account = await getGoogleAccount();
  if (!account) {
    throw new ReconnectRequiredError();
  }
  let refreshToken: string;
  try {
    refreshToken = decryptSecret(account.encryptedRefreshToken);
  } catch {
    // A stored token that no longer decrypts (e.g. ENCRYPTION_KEY changed)
    // is unrecoverable — the fix is the same as an expired token: reconnect.
    throw new ReconnectRequiredError();
  }
  const client = createOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return google.gmail({ version: "v1", auth: client });
}

// Wraps a Gmail API call, translating auth failures into a single error type
// the UI can key off of to show "Reconnect Google".
async function withGmail<T>(fn: (gmail: gmail_v1.Gmail) => Promise<T>): Promise<T> {
  const gmail = await getGmailClient();
  try {
    return await fn(gmail);
  } catch (err) {
    if (isReconnectRequiredError(err)) {
      throw new ReconnectRequiredError();
    }
    throw err;
  }
}

function header(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return (
    headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

export type MessageSummary = {
  id: string;
  threadId: string;
  snippet: string;
  subject: string;
  from: string;
  date: string;
  unread: boolean;
  starred: boolean;
  labelIds: string[];
};

// Runs `fn` over `items` with at most `limit` in flight at once. Gmail's
// per-user rate limit is 250 quota units/sec and messages.get costs 5 units
// each (~50/sec sustained) — firing hundreds of gets via a single
// Promise.all risks bursts of 429s, so this keeps a steady, bounded amount
// of concurrency instead.
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const MESSAGE_PAGE_SIZE = 100;
const MESSAGE_FETCH_CONCURRENCY = 20;

export async function listMessages(opts: {
  q?: string;
  labelIds?: string[];
  pageToken?: string;
}): Promise<{ messages: MessageSummary[]; nextPageToken?: string }> {
  return withGmail(async (gmail) => {
    const list = await gmail.users.messages.list({
      userId: "me",
      q: opts.q,
      labelIds: opts.labelIds,
      pageToken: opts.pageToken,
      maxResults: MESSAGE_PAGE_SIZE,
    });

    const ids = list.data.messages ?? [];
    const messages = await mapWithConcurrency(ids, MESSAGE_FETCH_CONCURRENCY, async (m) => {
      const msg = await gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "Date"],
      });
      const labelIds = msg.data.labelIds ?? [];
      return {
        id: msg.data.id!,
        threadId: msg.data.threadId!,
        snippet: msg.data.snippet ?? "",
        subject: header(msg.data.payload?.headers, "Subject") || "(no subject)",
        from: header(msg.data.payload?.headers, "From"),
        date: header(msg.data.payload?.headers, "Date"),
        unread: labelIds.includes("UNREAD"),
        starred: labelIds.includes("STARRED"),
        labelIds,
      } satisfies MessageSummary;
    });

    return { messages, nextPageToken: list.data.nextPageToken ?? undefined };
  });
}

export type { MessageBody, Attachment, InlineImage };

export type MessageDetail = MessageSummary & {
  to: string;
  cc: string;
  body: MessageBody;
  attachments: Attachment[];
  // Images the HTML body can show via `cid:` references.
  inlineImages: InlineImage[];
  // Size of what the body shows inline — carried by any reply/forward
  // quote, so it counts toward the 25MB attachment limit.
  inlineBytes: number;
  messageIdHeader: string;
  references: string;
};

function attachmentFetcher(gmail: gmail_v1.Gmail, messageId: string) {
  return async (attachmentId: string): Promise<Buffer> => {
    const att = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    return Buffer.from(att.data.data ?? "", "base64url");
  };
}

async function toMessageDetail(
  gmail: gmail_v1.Gmail,
  msg: gmail_v1.Schema$Message
): Promise<MessageDetail> {
  const labelIds = msg.labelIds ?? [];
  const headers = msg.payload?.headers;
  const body = await extractBody(msg.payload, attachmentFetcher(gmail, msg.id!));
  return {
    id: msg.id!,
    threadId: msg.threadId!,
    snippet: msg.snippet ?? "",
    subject: header(headers, "Subject") || "(no subject)",
    from: header(headers, "From"),
    to: header(headers, "To"),
    cc: header(headers, "Cc"),
    date: header(headers, "Date"),
    unread: labelIds.includes("UNREAD"),
    starred: labelIds.includes("STARRED"),
    labelIds,
    body,
    attachments: extractAttachments(msg.payload),
    inlineImages: listInlineImages(msg.payload),
    inlineBytes: referencedInlineBytes(msg.payload, body.html),
    messageIdHeader: header(headers, "Message-ID"),
    references: header(headers, "References"),
  };
}

export async function getMessage(id: string): Promise<MessageDetail> {
  return withGmail(async (gmail) => {
    const msg = await gmail.users.messages.get({ userId: "me", id, format: "full" });
    return toMessageDetail(gmail, msg.data);
  });
}

export async function getThread(threadId: string): Promise<MessageDetail[]> {
  return withGmail(async (gmail) => {
    const thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
    return Promise.all((thread.data.messages ?? []).map((msg) => toMessageDetail(gmail, msg)));
  });
}

// One inline image part of a message, looked up by its (stable) partId.
export async function getInlinePart(
  messageId: string,
  partId: string
): Promise<{ data: Buffer; mimeType: string } | null> {
  return withGmail(async (gmail) => {
    const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
    const part = findPartById(msg.data.payload, partId);
    if (!part) return null;
    const data = await partData(part, attachmentFetcher(gmail, messageId));
    return data ? { data, mimeType: (part.mimeType || "").toLowerCase() } : null;
  });
}

function findAttachmentPart(
  part: gmail_v1.Schema$MessagePart | undefined,
  attachmentId: string
): { filename: string; mimeType: string } | null {
  if (!part) return null;
  if (part.body?.attachmentId === attachmentId && part.filename) {
    return { filename: part.filename, mimeType: part.mimeType || "application/octet-stream" };
  }
  for (const child of part.parts ?? []) {
    const found = findAttachmentPart(child, attachmentId);
    if (found) return found;
  }
  return null;
}

// Re-reads the message's own parts to get the real filename/mimeType rather
// than trusting anything the caller passed in, since those end up in
// response headers (Content-Type / Content-Disposition).
export async function getAttachment(
  messageId: string,
  attachmentId: string
): Promise<{ data: Buffer; filename: string; mimeType: string }> {
  return withGmail(async (gmail) => {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });
    const meta = findAttachmentPart(msg.data.payload, attachmentId);
    if (!meta) {
      throw new Error("Attachment not found on this message");
    }
    const att = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId,
      id: attachmentId,
    });
    if (!att.data.data) {
      throw new Error("Attachment has no data");
    }
    return {
      data: Buffer.from(att.data.data, "base64url"),
      filename: meta.filename,
      mimeType: meta.mimeType,
    };
  });
}

export async function modifyMessage(
  id: string,
  addLabelIds: string[],
  removeLabelIds: string[]
): Promise<void> {
  await withGmail((gmail) =>
    gmail.users.messages.modify({
      userId: "me",
      id,
      requestBody: { addLabelIds, removeLabelIds },
    })
  );
}

export async function trashMessage(id: string): Promise<void> {
  await withGmail((gmail) => gmail.users.messages.trash({ userId: "me", id }));
}

export async function untrashMessage(id: string): Promise<void> {
  await withGmail((gmail) => gmail.users.messages.untrash({ userId: "me", id }));
}

export async function deleteMessagePermanently(id: string): Promise<void> {
  await withGmail((gmail) => gmail.users.messages.delete({ userId: "me", id }));
}

export type Label = {
  id: string;
  name: string;
  type: string | null | undefined;
  color: string | null;
};

export async function listLabels(): Promise<Label[]> {
  return withGmail(async (gmail) => {
    const res = await gmail.users.labels.list({ userId: "me" });
    return (res.data.labels ?? [])
      // Mirrors Gmail's own sidebar: a label the user hid from their label
      // list shouldn't reappear here just because it still exists.
      .filter((l) => l.labelListVisibility !== "labelHide")
      .map((l) => ({
        id: l.id!,
        name: l.name!,
        type: l.type,
        color: l.color?.backgroundColor ?? null,
      }));
  });
}

export async function sendMessage(
  opts: OutgoingMessage & { threadId?: string }
): Promise<void> {
  // Without a From header the builder would name the Message-ID after
  // "localhost", which spam filters dislike — use the account's domain, as
  // regular mail apps do. (From itself is left to Gmail so it fills in the
  // account's display name.)
  const account = await getGoogleAccount();
  const domain = account?.email?.split("@")[1] || "mail.gmail.com";
  const mime = await buildMimeMessage({
    ...opts,
    messageId: `<${randomUUID()}@${domain}>`,
  });
  await withGmail((gmail) =>
    gmail.users.messages.send({
      userId: "me",
      requestBody: { threadId: opts.threadId },
      // Media upload (rather than a base64 `raw` field) lifts the size cap
      // to Gmail's full 35MB, which matters once attachments are included.
      // The client library pipes media bodies, so it needs a stream.
      media: { mimeType: "message/rfc822", body: Readable.from(mime) },
    })
  );
}

export type ComposeRequest = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  // The newly written part only — never the quoted original.
  html?: string;
  text?: string;
  // Files uploaded from the composer (see /api/uploads).
  uploadIds?: string[];
  // Images pasted into the editor, uploaded the same way; the HTML refers
  // to each as `cid:<uploadId>@inline`.
  inlineUploadIds?: string[];
  quote?: {
    messageId: string;
    mode: QuoteMode;
    // Which of the original's attachments to forward (by partId); all when
    // omitted.
    forwardPartIds?: string[];
  };
  timeZone?: string;
};

// Builds and sends a new message, reply or forward. For replies/forwards
// the original is fetched here from Gmail (not trusted from the browser):
// its quote, threading headers, inline images and — for forwards — its
// attachments all come from the real message.
export async function composeAndSend(req: ComposeRequest): Promise<void> {
  const newHtml = req.html || (req.text ? textToHtml(req.text) : "");
  const newText = req.html ? htmlToPlainText(req.html) : (req.text ?? "");
  const attachments: OutgoingAttachment[] = [];
  // De-duplicated: an image copied within the editor shares one upload.
  const inlineIds = new Set(req.inlineUploadIds ?? []);
  const uploadIds = [...new Set([...(req.uploadIds ?? []), ...inlineIds])];
  for (const id of uploadIds) {
    const upload = await readUpload(id);
    if (!upload) throw new Error("An attachment didn't finish uploading — try attaching it again");
    const inline = inlineIds.has(id);
    attachments.push({
      filename: upload.filename,
      contentType: upload.contentType,
      content: upload.data,
      cid: inline ? `${id}@inline` : undefined,
    });
  }

  let html = `<div dir="ltr">${newHtml}</div>`;
  let text = newText;
  let threadId: string | undefined;
  let inReplyTo: string | undefined;
  let references: string | undefined;

  if (req.quote) {
    const { messageId, mode, forwardPartIds } = req.quote;
    await withGmail(async (gmail) => {
      const msg = await gmail.users.messages.get({ userId: "me", id: messageId, format: "full" });
      const original = await toMessageDetail(gmail, msg.data);
      const fetchAttachment = attachmentFetcher(gmail, messageId);

      const quote = buildQuote(original, mode, req.timeZone);
      html += `<br>${quote.html}`;
      text = `${newText}\n\n${quote.text}`;

      // Inline images the quoted HTML shows, kept under their exact original
      // Content-IDs so the unchanged references in the quote still resolve.
      const cidParts = findContentIdParts(msg.data.payload);
      const inlineCids = referencedContentIds(original.body.html);
      for (const key of inlineCids) {
        const part = cidParts.get(key);
        if (!part) continue;
        const data = await partData(part, fetchAttachment);
        if (!data) continue;
        attachments.push({
          filename: part.filename || "image",
          contentType: part.mimeType || "application/octet-stream",
          content: data,
          cid: contentIdOf(part),
        });
      }

      if (mode === "forward") {
        const wanted = forwardPartIds ? new Set(forwardPartIds) : null;
        for (const att of original.attachments) {
          if (att.contentId && inlineCids.has(cidKey(att.contentId))) continue;
          if (wanted && !wanted.has(att.partId)) continue;
          attachments.push({
            filename: att.filename,
            contentType: att.mimeType,
            content: await fetchAttachment(att.attachmentId),
          });
        }
      } else {
        threadId = original.threadId;
        inReplyTo = original.messageIdHeader || undefined;
        references =
          [original.references, original.messageIdHeader].filter(Boolean).join(" ") || undefined;
      }
    });
  }

  const totalBytes = attachments.reduce((sum, a) => sum + a.content.length, 0);
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachments total ${(totalBytes / 1024 / 1024).toFixed(1)}MB — Gmail's limit is 25MB`
    );
  }

  await sendMessage({
    to: req.to,
    cc: req.cc,
    bcc: req.bcc,
    subject: req.subject,
    html,
    text,
    attachments,
    threadId,
    inReplyTo,
    references,
  });

  await deleteUploads(uploadIds).catch(() => {
    // Leftovers are purged after a day anyway — the send itself succeeded.
  });
}

// Best-effort self-alert when the PIN gets locked out after repeated wrong
// attempts. Silently does nothing if no Google account is connected yet or
// no ALERT_EMAIL is configured — must never throw into the PIN flow.
export async function sendLockoutAlert(lockoutSeconds: number): Promise<void> {
  const alertEmail = process.env.ALERT_EMAIL;
  if (!alertEmail) return;
  const account = await getGoogleAccount();
  if (!account) return;
  const minutes = Math.round(lockoutSeconds / 60);
  await sendMessage({
    to: alertEmail,
    subject: "Security alert: your email app was locked out",
    text:
      `Someone entered the wrong PIN 5 times in a row on your email web app ` +
      `and it has been locked for ${minutes} minute(s).\n\n` +
      `If this wasn't you, consider changing APP_PIN in your Vercel project's ` +
      `environment variables and redeploying.`,
  });
}

export { ReconnectRequiredError };
