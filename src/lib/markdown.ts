// Review commentary and rationales are markdown; rendered through marked and
// sanitised with DOMPurify before insertion (never raw HTML from users).
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(md: string): string {
  const html = marked.parse(md || "", { async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS: ["style", "script", "iframe", "form", "input"], ADD_ATTR: ["target", "rel"] });
}
