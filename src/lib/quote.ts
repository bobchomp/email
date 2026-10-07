import * as cheerio from "cheerio";
import juice from "juice";
import { convert } from "html-to-text";
import type { MessageDetail } from "./gmail";
import { textToHtml } from "./message-parts";

export type QuoteMode = "reply" | "replyAll" | "forward";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Makes the original email's HTML safe to embed inside a reply: its
// <style> rules are inlined onto the elements they target (so they can't
// leak out and restyle the new text above the quote), then everything that
// shouldn't travel inside another email's body is dropped.
export function cleanHtmlForQuote(html: string): string {
  let inlined = html;
  try {
    inlined = juice(html, {
      removeStyleTags: true,
      preserveMediaQueries: false,
      preserveFontFaces: false,
      preserveKeyFrames: false,
      preservePseudos: false,
      insertPreservedExtraCss: false,
    });
  } catch {
    // Unparseable CSS — fall back to the raw HTML minus its style blocks.
  }
  const $ = cheerio.load(inlined);
  $("script, noscript, style, link, meta, base, title, iframe, frame, frameset, object, embed, applet").remove();
  const body = $("body");
  return (body.length ? body.html() : $.root().html()) ?? "";
}

// Block-aware HTML → plain text for the text/plain alternative: keeps
// paragraph/line/list structure, shows links as "text <url>" and images by
// their alt text, and drops hidden preheader text.
export function htmlToPlainText(html: string): string {
  const $ = cheerio.load(html);
  $("[style]").each((_, el) => {
    const style = $(el).attr("style") ?? "";
    if (/display\s*:\s*none/i.test(style)) $(el).remove();
  });
  $("script, style, head, title").remove();

  return convert($.html(), {
    wordwrap: false,
    selectors: [
      {
        selector: "a",
        options: { linkBrackets: ["<", ">"], hideLinkHrefIfSameAsText: true },
      },
      { selector: "img", format: "imageAlt" },
      { selector: "table", format: "block" },
      { selector: "tr", format: "block" },
      { selector: "td", format: "block" },
      { selector: "th", format: "block" },
    ],
    formatters: {
      imageAlt: (elem, _walk, builder) => {
        const alt = (elem.attribs?.alt ?? "").trim();
        if (alt) builder.addInline(`[${alt}]`);
      },
    },
  })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// "Wed, 7 Oct 2026 at 14:03" in the reader's own time zone, matching
// Gmail's attribution line. Falls back to the raw header if unparseable.
export function formatQuoteDate(dateHeader: string, timeZone?: string): string {
  const date = new Date(dateHeader);
  if (!dateHeader || Number.isNaN(date.getTime())) return dateHeader;
  let parts: Intl.DateTimeFormatPart[];
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  try {
    parts = new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).formatToParts(date);
  } catch {
    // Invalid time zone name from the client — use the server's.
    parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(date);
  }
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")}, ${get("day")} ${get("month")} ${get("year")} at ${get("hour")}:${get("minute")}`;
}

function quoteLines(text: string): string {
  return text
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

// Splits `"Name" <email>` into its parts for Gmail-style forward headers.
function splitAddress(from: string): { name: string; email: string } {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: "", email: from.trim() };
}

export function buildQuote(
  original: MessageDetail,
  mode: QuoteMode,
  timeZone?: string
): { html: string; text: string } {
  const date = formatQuoteDate(original.date, timeZone);
  const bodyHtml = original.body.html
    ? cleanHtmlForQuote(original.body.html)
    : textToHtml(original.body.text ?? original.snippet);
  const bodyText =
    original.body.text ??
    (original.body.html ? htmlToPlainText(original.body.html) : original.snippet);

  if (mode === "forward") {
    const sender = splitAddress(original.from);
    const fromHtml = sender.name
      ? `<strong class="gmail_sendername" dir="auto">${escapeHtml(sender.name)}</strong> <span dir="auto">&lt;${escapeHtml(sender.email)}&gt;</span>`
      : escapeHtml(sender.email);
    const headerRows = [
      `From: ${fromHtml}`,
      `Date: ${escapeHtml(date)}`,
      `Subject: ${escapeHtml(original.subject)}`,
      `To: ${escapeHtml(original.to)}`,
      original.cc ? `Cc: ${escapeHtml(original.cc)}` : null,
    ].filter(Boolean);

    const html =
      `<div class="gmail_quote"><div dir="ltr" class="gmail_attr">` +
      `---------- Forwarded message ---------<br>${headerRows.join("<br>")}<br></div>` +
      `<br><br>${bodyHtml}</div>`;

    const text = [
      "---------- Forwarded message ---------",
      `From: ${original.from}`,
      `Date: ${date}`,
      `Subject: ${original.subject}`,
      `To: ${original.to}`,
      original.cc ? `Cc: ${original.cc}` : null,
      "",
      bodyText,
    ]
      .filter((line): line is string => line !== null)
      .join("\n");

    return { html, text };
  }

  const sender = splitAddress(original.from);
  const fromDisplay = sender.name ? `${sender.name} <${sender.email}>` : sender.email;
  const attribution = `On ${date}, ${fromDisplay} wrote:`;
  const html =
    `<div class="gmail_quote"><div dir="ltr" class="gmail_attr">${escapeHtml(attribution)}<br></div>` +
    `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">` +
    `${bodyHtml}</blockquote></div>`;
  const text = `${attribution}\n${quoteLines(bodyText)}`;
  return { html, text };
}
