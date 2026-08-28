import { gmail_v1, google } from "googleapis";
import { getGoogleAccount } from "./db";
import { decryptSecret } from "./crypto";
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
      maxResults: 25,
    });

    const ids = list.data.messages ?? [];
    const messages = await Promise.all(
      ids.map(async (m) => {
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
      })
    );

    return { messages, nextPageToken: list.data.nextPageToken ?? undefined };
  });
}

export type MessageBody = {
  text: string | null;
  html: string | null;
};

function extractBody(part: gmail_v1.Schema$MessagePart | undefined): MessageBody {
  const result: MessageBody = { text: null, html: null };
  if (!part) return result;

  function walk(p: gmail_v1.Schema$MessagePart) {
    if (p.mimeType === "text/plain" && p.body?.data) {
      result.text = Buffer.from(p.body.data, "base64url").toString("utf8");
    } else if (p.mimeType === "text/html" && p.body?.data) {
      result.html = Buffer.from(p.body.data, "base64url").toString("utf8");
    }
    for (const child of p.parts ?? []) walk(child);
  }
  walk(part);
  return result;
}

export type MessageDetail = MessageSummary & {
  to: string;
  cc: string;
  body: MessageBody;
  messageIdHeader: string;
  references: string;
};

export async function getMessage(id: string): Promise<MessageDetail> {
  return withGmail(async (gmail) => {
    const msg = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    const labelIds = msg.data.labelIds ?? [];
    const headers = msg.data.payload?.headers;
    return {
      id: msg.data.id!,
      threadId: msg.data.threadId!,
      snippet: msg.data.snippet ?? "",
      subject: header(headers, "Subject") || "(no subject)",
      from: header(headers, "From"),
      to: header(headers, "To"),
      cc: header(headers, "Cc"),
      date: header(headers, "Date"),
      unread: labelIds.includes("UNREAD"),
      starred: labelIds.includes("STARRED"),
      labelIds,
      body: extractBody(msg.data.payload),
      messageIdHeader: header(headers, "Message-ID"),
      references: header(headers, "References"),
    };
  });
}

export async function getThread(threadId: string): Promise<MessageDetail[]> {
  return withGmail(async (gmail) => {
    const thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
    return (thread.data.messages ?? []).map((msg) => {
      const labelIds = msg.labelIds ?? [];
      const headers = msg.payload?.headers;
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
        body: extractBody(msg.payload),
        messageIdHeader: header(headers, "Message-ID"),
        references: header(headers, "References"),
      };
    });
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

function encodeHeaderValue(value: string): string {
  // Encode non-ASCII header values (RFC 2047) so subjects/names with
  // special characters survive the raw MIME message.
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildRawMessage(opts: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const lines: string[] = [];
  lines.push(`To: ${opts.to}`);
  if (opts.cc) lines.push(`Cc: ${opts.cc}`);
  if (opts.bcc) lines.push(`Bcc: ${opts.bcc}`);
  lines.push(`Subject: ${encodeHeaderValue(opts.subject)}`);
  lines.push(`MIME-Version: 1.0`);
  lines.push(`Content-Type: text/plain; charset="UTF-8"`);
  lines.push(`Content-Transfer-Encoding: 7bit`);
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`);
  if (opts.references) lines.push(`References: ${opts.references}`);
  lines.push("");
  lines.push(opts.body);

  const raw = lines.join("\r\n");
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sendMessage(opts: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}): Promise<void> {
  const raw = buildRawMessage(opts);
  await withGmail((gmail) =>
    gmail.users.messages.send({
      userId: "me",
      requestBody: { raw, threadId: opts.threadId },
    })
  );
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
    body:
      `Someone entered the wrong PIN 5 times in a row on your email web app ` +
      `and it has been locked for ${minutes} minute(s).\n\n` +
      `If this wasn't you, consider changing APP_PIN in your Vercel project's ` +
      `environment variables and redeploying.`,
  });
}

export { ReconnectRequiredError };
