import MailComposer from "nodemailer/lib/mail-composer";

export type OutgoingAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
  // Set for images referenced from the HTML as `cid:<cid>` — they're placed
  // in the multipart/related part beside the HTML instead of attached.
  cid?: string;
};

export type OutgoingMessage = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  messageId?: string;
  attachments?: OutgoingAttachment[];
};

// Builds a complete RFC 5322 message (multipart/alternative text + HTML,
// wrapped in related/mixed parts as needed for inline images and
// attachments), with every header and body correctly encoded.
export async function buildMimeMessage(msg: OutgoingMessage): Promise<Buffer> {
  const composer = new MailComposer({
    to: msg.to,
    cc: msg.cc || undefined,
    bcc: msg.bcc || undefined,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    inReplyTo: msg.inReplyTo || undefined,
    references: msg.references || undefined,
    messageId: msg.messageId,
    attachments: msg.attachments?.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      content: a.content,
      cid: a.cid,
      // Explicit, because the builder otherwise marks attached emails
      // (message/rfc822) inline and some clients then render them in the body.
      contentDisposition: a.cid ? "inline" : "attachment",
    })),
    // Content only ever comes from memory — never let a value be read as a
    // file path or fetched as a URL on the server.
    disableFileAccess: true,
    disableUrlAccess: true,
    newline: "\r\n",
  });

  const root = composer.compile();
  // Gmail reads Bcc recipients from the header (and strips it before
  // delivery), so it has to stay in the message we hand over.
  root.keepBcc = true;
  return root.build();
}
