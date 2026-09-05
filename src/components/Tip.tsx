// Tooltips and inline help. `Tip` wraps any element with a CSS tooltip
// (data-tip, see styles.css) — hover or keyboard focus shows it, no library.
// `Help` is the small ⓘ glyph for a longer explanation next to a label.
import type { ReactNode } from "react";

export function Tip({ text, children, place = "top", block = false }: { text: string; children: ReactNode; place?: "top" | "bottom" | "left" | "right"; block?: boolean }) {
  return <span className={"tip" + (block ? " tip-block" : "")} data-tip={text} data-place={place}>{children}</span>;
}

export function Help({ text, place = "bottom" }: { text: string; place?: "top" | "bottom" | "left" | "right" }) {
  return <span className="tip help" data-tip={text} data-place={place} tabIndex={0} aria-label={text} role="img">?</span>;
}
