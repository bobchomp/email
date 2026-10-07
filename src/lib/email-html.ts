// Browser-only (DOMParser): converts the editor's HTML into the markup mail
// clients render consistently, using Gmail's own conventions.
export function toEmailHtml(editorHtml: string): { html: string; inlineUploadIds: string[] } {
  const doc = new DOMParser().parseFromString(`<body>${editorHtml}</body>`, "text/html");

  // One <div> per line (Enter) and <div><br></div> for a blank line, as
  // Gmail does — <p> margins vary wildly between Outlook, Apple Mail, etc.
  for (const p of Array.from(doc.querySelectorAll("p"))) {
    const div = doc.createElement("div");
    div.innerHTML = p.innerHTML.trim() ? p.innerHTML : "<br>";
    p.replaceWith(div);
  }

  for (const bq of Array.from(doc.querySelectorAll("blockquote"))) {
    bq.setAttribute(
      "style",
      "margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex"
    );
  }

  const inlineUploadIds = new Set<string>();
  for (const img of Array.from(doc.querySelectorAll("img"))) {
    const uploadId = img.getAttribute("data-upload-id");
    if (uploadId) {
      img.setAttribute("src", `cid:${uploadId}@inline`);
      img.removeAttribute("data-upload-id");
      img.setAttribute("style", "max-width:100%");
      inlineUploadIds.add(uploadId);
    } else if ((img.getAttribute("src") ?? "").startsWith("blob:")) {
      // A pasted image whose upload never finished can't be delivered.
      img.remove();
    }
  }

  for (const a of Array.from(doc.querySelectorAll("a"))) {
    a.removeAttribute("rel");
    a.setAttribute("target", "_blank");
  }

  // A Set: an image copied within the editor shares one upload.
  return { html: doc.body.innerHTML, inlineUploadIds: [...inlineUploadIds] };
}

export function isEditorHtmlEmpty(editorHtml: string): boolean {
  const doc = new DOMParser().parseFromString(`<body>${editorHtml}</body>`, "text/html");
  return !doc.body.textContent?.trim() && !doc.body.querySelector("img");
}
