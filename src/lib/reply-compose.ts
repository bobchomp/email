import type { MessageDetail } from "./gmail";
import {
  parseAddressList,
  formatAddressList,
  dedupeAddresses,
  type EmailAddress,
} from "./email-address";

export type ComposeMode = "reply" | "replyAll" | "forward";

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
