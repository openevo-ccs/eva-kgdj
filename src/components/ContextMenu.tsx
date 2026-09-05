// Right-click menu rendered by GraphCanvas at a fixed screen position. Closing is wired
// to Escape and a "click outside" listener scoped by a ref check — NOT a bare "close on
// any pointerdown", which would fire on a menu button's OWN pointerdown (which always
// precedes its click event) and unmount the menu before the click could ever reach it,
// making every item silently unclickable. GraphCanvas also closes it on pan/zoom/tap so
// it never floats disconnected from the graph.
import { useEffect, useRef } from "react";

export interface ContextMenuItem { label: string; onClick: () => void; danger?: boolean; disabled?: boolean; hint?: string }

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: ContextMenuItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onOutside = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onOutside);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onOutside); };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 230);
  const top = Math.min(y, window.innerHeight - 26 - items.length * 30);
  return (
    <div ref={ref} className="ctxmenu" style={{ left, top }}>
      {items.length ? items.map((it, i) => <button key={i} className={it.danger ? "danger" : ""} disabled={it.disabled} title={it.hint} onClick={() => { it.onClick(); onClose(); }}>{it.label}</button>)
        : <div className="muted" style={{ padding: "6px 10px" }}>Nothing here</div>}
    </div>
  );
}
