// Email HTML is shown in an iframe sandboxed with no allow-scripts/
// allow-same-origin (so nothing in an email can execute or reach this app's
// session), which also blocks a plain link from doing anything when
// clicked. Force every link to open in a genuine new tab instead —
// allow-popups permits that via plain HTML (no script needed), and
// allow-popups-to-escape-sandbox keeps the new tab itself unsandboxed and
// normal; rel=noopener stops it getting a window.opener handle back into
// this app.
export const EMAIL_FRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

export function makeLinksOpenInNewTab(html: string): string {
  return html.replace(/<a\b([^>]*)>/gi, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\s+target\s*=\s*(".*?"|'.*?'|\S+)/gi, "")
      .replace(/\s+rel\s*=\s*(".*?"|'.*?'|\S+)/gi, "");
    return `<a${cleaned} target="_blank" rel="noopener noreferrer">`;
  });
}
