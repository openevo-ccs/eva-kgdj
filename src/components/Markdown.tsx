import { useState } from "react";
import { renderMarkdown } from "../lib/markdown";

export function Markdown({ md, className }: { md: string; className?: string }) {
  return <div className={"md " + (className || "")} dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />;
}

// Markdown editor with a live preview. A richer editor (TinyMCE or similar)
// can replace the textarea later; the stored value stays markdown either way.
export function MarkdownEditor({ value, onChange, placeholder, rows }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <div className="tabs"><button type="button" className={!preview ? "active" : ""} onClick={() => setPreview(false)}>Write</button><button type="button" className={preview ? "active" : ""} onClick={() => setPreview(true)}>Preview</button><span className="muted">markdown</span></div>
      {preview ? <div className="card"><Markdown md={value || "_nothing yet_"} /></div>
        : <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows || 6} style={{ width: "100%" }} />}
    </div>
  );
}
