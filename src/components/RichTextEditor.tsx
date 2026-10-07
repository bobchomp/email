"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import type { EditorView } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";

// Images pasted into the editor are uploaded in the background; the node
// remembers its upload id so the sent HTML can reference it as an inline
// (cid:) attachment instead of a local blob: URL.
const UploadedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      uploadId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-upload-id"),
        renderHTML: (attrs: { uploadId?: string | null }) =>
          attrs.uploadId ? { "data-upload-id": attrs.uploadId } : {},
      },
    };
  },
});

type Props = {
  placeholder?: string;
  autofocus?: boolean;
  onChange: (html: string) => void;
  onSubmit: () => void;
  // Uploads an image pasted/dropped into the text; resolves to its upload id.
  onImageUpload: (file: File) => Promise<string>;
  // Non-image files dropped onto the text become regular attachments.
  onFiles: (files: File[]) => void;
};

function insertUploadingImages(view: EditorView, files: File[], onImageUpload: Props["onImageUpload"]) {
  for (const file of files) {
    const src = URL.createObjectURL(file);
    const node = view.state.schema.nodes.image.create({ src, alt: file.name });
    view.dispatch(view.state.tr.replaceSelectionWith(node));

    const updateNode = (attrs: Record<string, unknown> | null) => {
      // The composer may have been closed while the upload was running.
      if (view.isDestroyed) return;
      view.state.doc.descendants((n, pos) => {
        if (n.type.name !== "image" || n.attrs.src !== src) return true;
        const tr = attrs
          ? view.state.tr.setNodeMarkup(pos, undefined, { ...n.attrs, ...attrs })
          : view.state.tr.delete(pos, pos + n.nodeSize);
        view.dispatch(tr);
        return false;
      });
    };
    onImageUpload(file).then(
      (uploadId) => updateNode({ uploadId }),
      () => updateNode(null)
    );
  }
}

function splitFiles(list: FileList | null | undefined) {
  const files = Array.from(list ?? []);
  return {
    images: files.filter((f) => f.type.startsWith("image/")),
    others: files.filter((f) => !f.type.startsWith("image/")),
  };
}

export default function RichTextEditor({
  placeholder,
  autofocus,
  onChange,
  onSubmit,
  onImageUpload,
  onFiles,
}: Props) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // The editor captures its handlers once, at creation — route them through
  // a ref so they always call this render's props and state.
  const handlers = useRef({ onChange, onSubmit, onImageUpload, onFiles, openLinkBox: () => {} });

  const editor = useEditor({
    // Rendered on the client only — avoids an SSR hydration mismatch.
    immediatelyRender: false,
    autofocus: autofocus ? "start" : false,
    extensions: [
      StarterKit.configure({
        heading: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
      }),
      UploadedImage.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    editorProps: {
      attributes: { class: "rich-editor-content" },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          handlers.current.onSubmit();
          return true;
        }
        if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
          handlers.current.openLinkBox();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const { images } = splitFiles(event.clipboardData?.files);
        if (images.length === 0) return false;
        insertUploadingImages(view, images, handlers.current.onImageUpload);
        return true;
      },
      handleDrop: (view, event) => {
        const { images, others } = splitFiles(event.dataTransfer?.files);
        if (images.length === 0 && others.length === 0) return false;
        event.preventDefault();
        if (others.length) handlers.current.onFiles(others);
        if (images.length) insertUploadingImages(view, images, handlers.current.onImageUpload);
        return true;
      },
    },
    onUpdate: ({ editor }) => handlers.current.onChange(editor.getHTML()),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: e }: { editor: Editor | null }) => ({
      bold: !!e?.isActive("bold"),
      italic: !!e?.isActive("italic"),
      underline: !!e?.isActive("underline"),
      strike: !!e?.isActive("strike"),
      link: !!e?.isActive("link"),
      bulletList: !!e?.isActive("bulletList"),
      orderedList: !!e?.isActive("orderedList"),
      blockquote: !!e?.isActive("blockquote"),
    }),
  });

  function openLinkBox() {
    if (!editor) return;
    setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkOpen(true);
  }

  useEffect(() => {
    handlers.current = { onChange, onSubmit, onImageUpload, onFiles, openLinkBox };
  });

  function applyLink() {
    if (!editor) return;
    const url = linkUrl.trim();
    const chain = editor.chain().focus().extendMarkRange("link");
    if (!url) {
      chain.unsetLink().run();
    } else if (editor.state.selection.empty && !editor.isActive("link")) {
      // No text selected: insert the URL itself as the link text.
      editor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] }).run();
    } else {
      chain.setLink({ href: url }).run();
    }
    setLinkOpen(false);
  }

  const button = (label: string, isActive: boolean, run: () => void, icon: React.ReactNode) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isActive}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={`h-7 w-7 flex items-center justify-center rounded-md text-sm ${
        isActive ? "bg-ink-soft text-ink-deep" : "text-muted hover:bg-white hover:text-body"
      }`}
    >
      {icon}
    </button>
  );

  const c = () => editor?.chain().focus();

  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface focus-within:border-ink/50">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-line px-1.5 py-1">
        {button("Bold (Ctrl+B)", !!active?.bold, () => c()?.toggleBold().run(), <b>B</b>)}
        {button("Italic (Ctrl+I)", !!active?.italic, () => c()?.toggleItalic().run(), <i className="font-serif">I</i>)}
        {button("Underline (Ctrl+U)", !!active?.underline, () => c()?.toggleUnderline().run(), <u>U</u>)}
        {button("Strikethrough", !!active?.strike, () => c()?.toggleStrike().run(), <s>S</s>)}
        <span className="mx-1 h-4 w-px bg-line" />
        {button("Link (Ctrl+K)", !!active?.link, openLinkBox, (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
          </svg>
        ))}
        {button("Bulleted list", !!active?.bulletList, () => c()?.toggleBulletList().run(), (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
            <circle cx="4.5" cy="6" r="1" fill="currentColor" /><circle cx="4.5" cy="12" r="1" fill="currentColor" /><circle cx="4.5" cy="18" r="1" fill="currentColor" />
          </svg>
        ))}
        {button("Numbered list", !!active?.orderedList, () => c()?.toggleOrderedList().run(), (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" />
            <text x="2" y="8" fontSize="7" fill="currentColor" stroke="none">1</text>
            <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none">2</text>
            <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none">3</text>
          </svg>
        ))}
        {button("Quote", !!active?.blockquote, () => c()?.toggleBlockquote().run(), (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M7 7h4v4c0 3-1.5 5-4 6l-.5-1.2C8 15 8.6 13.8 8.7 12H7V7Zm8 0h4v4c0 3-1.5 5-4 6l-.5-1.2c1.5-.8 2.1-2 2.2-3.8H15V7Z" />
          </svg>
        ))}
        {button("Clear formatting", false, () => c()?.unsetAllMarks().clearNodes().run(), (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M6 5h12M10 5 8 19M4 21 20 3" />
          </svg>
        ))}
      </div>

      {linkOpen && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
          className="flex items-center gap-2 border-b border-line px-2 py-1.5"
        >
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setLinkOpen(false);
                editor?.commands.focus();
              }
            }}
            placeholder="Paste or type a link"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none text-body placeholder:text-muted"
          />
          <button type="submit" className="text-xs font-medium text-ink hover:text-ink-deep">
            Apply
          </button>
          {active?.link && (
            <button
              type="button"
              onClick={() => {
                editor?.chain().focus().extendMarkRange("link").unsetLink().run();
                setLinkOpen(false);
              }}
              className="text-xs text-muted hover:text-body"
            >
              Remove
            </button>
          )}
        </form>
      )}

      <EditorContent editor={editor} className="rich-editor" />
    </div>
  );
}
