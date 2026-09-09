import type { MessageDetail } from "./gmail";
import {
  parseAddressList,
  formatAddressList,
  dedupeAddresses,
  type EmailAddress,
} from "./email-address";

export type ComposeMode = "reply" | "replyAll" | "forward";

// Browser-only (DOMParser) — this module is only ever imported from client
// components, never from a server route.
export function messageToPlainText(m: MessageDetail): string {
  if (m.body.text) return m.body.text;
  if (m.body.html) {
    const doc = new DOMParser().parseFromString(m.body.html, "text/html");
    const text = doc.body.textContent?.replace(/\n{3,}/g, "\n\n").trim();
    if (text) return text;
  }
  return m.snippet;
}

export function quoteMessage(m: MessageDetail): string {
  const plain = messageToPlainText(m);
  const quoted = plain
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
  const dateStr = m.date ? new Date(m.date).toLocaleString() : "";
  return `On ${dateStr}, ${m.from} wrote:\n${quoted}`;
}

export function forwardBody(m: MessageDetail): string {
  const plain = messageToPlainText(m);
  const dateStr = m.date ? new Date(m.date).toLocaleString() : "";
  return [
    "---------- Forwarded message ---------",
    `From: ${m.from}`,
    `Date: ${dateStr}`,
    `Subject: ${m.subject}`,
    `To: ${m.to}`,
    m.cc ? `Cc: ${m.cc}` : null,
    "",
    plain,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function buildRecipients(
  mode: ComposeMode,
  m: MessageDetail,
  selfEmail: string | null
): { to: string; cc: string } {
  if (mode === "forward") return { to: "", cc: "" };

  const fromAddr = parseAddressList(m.from)[0];
  const to = fromAddr ? formatAddressList([fromAddr]) : "";

  if (mode === "reply") return { to, cc: "" };

  // Reply All: original To + Cc, minus yourself and the sender (already in To).
  const isExcluded = (a: EmailAddress) =>
    (!!selfEmail && a.email.toLowerCase() === selfEmail.toLowerCase()) ||
    (!!fromAddr && a.email.toLowerCase() === fromAddr.email.toLowerCase());

  const cc = dedupeAddresses([...parseAddressList(m.to), ...parseAddressList(m.cc)]).filter(
    (a) => !isExcluded(a)
  );
  return { to, cc: formatAddressList(cc) };
}

export function buildSubject(mode: ComposeMode, subject: string): string {
  if (mode === "forward") {
    return /^fwd:/i.test(subject) ? subject : `Fwd: ${subject}`;
  }
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}
