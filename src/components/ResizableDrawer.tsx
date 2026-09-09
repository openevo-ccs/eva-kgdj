// Wraps a resizable side panel: a drag handle to resize, and a collapse chevron that shrinks
// it to a thin rail. Width and collapsed state persist per browser, keyed by `storageKey` so
// independent panels (the right-side node/edit drawer, the left-side filter/layout sidebar)
// don't fight over the same localStorage slot. `side="left"` mirrors the handle to the panel's
// right edge and the collapse chevron/rail border to match (see the drawer-shell-left /
// drawer-rail-left CSS in styles.css).
import { useEffect, useRef, useState } from "react";
import { Tip } from "./Tip";

const MIN = 280, MAX = 640, DEFAULT = 380;

function loadWidth(key: string, min: number, max: number, dflt: number) { try { const v = Number(localStorage.getItem(key + ".width")); return v >= min && v <= max ? v : dflt; } catch { return dflt; } }
function loadCollapsed(key: string) { try { return localStorage.getItem(key + ".collapsed") === "1"; } catch { return false; } }

export function ResizableDrawer({ children, side = "right", storageKey = "kgdj.sidebar", min = MIN, max = MAX, defaultWidth = DEFAULT }: {
  children: React.ReactNode; side?: "left" | "right"; storageKey?: string; min?: number; max?: number; defaultWidth?: number;
}) {
  const [width, setWidth] = useState(() => loadWidth(storageKey, min, max, defaultWidth));
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(storageKey));
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, w: width });

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      // Delta from the drag's own start point, not an absolute window-edge calculation —
      // works the same regardless of which side the panel is on or what's to its left.
      const delta = e.clientX - dragStart.current.x;
      const w = Math.min(max, Math.max(min, dragStart.current.w + (side === "left" ? delta : -delta)));
      setWidth(w);
    };
    const onUp = () => { if (dragging.current) { dragging.current = false; try { localStorage.setItem(storageKey + ".width", String(width)); } catch { /* ignore */ } document.body.style.cursor = ""; document.body.style.userSelect = ""; } };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [width, side, min, max, storageKey]);

  const toggle = () => { const c = !collapsed; setCollapsed(c); try { localStorage.setItem(storageKey + ".collapsed", c ? "1" : "0"); } catch { /* ignore */ } };
  const startDrag = (e: React.PointerEvent) => { dragging.current = true; dragStart.current = { x: e.clientX, w: width }; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; };

  if (collapsed) return (
    <div className={"drawer drawer-rail" + (side === "left" ? " drawer-rail-left" : "")}>
      <Tip text="Expand panel" place={side === "left" ? "right" : "left"}><button className="btn btn-mini" onClick={toggle} aria-label="Expand panel">{side === "left" ? "▸" : "◂"}</button></Tip>
    </div>
  );
  return (
    <div className={"drawer-shell" + (side === "left" ? " drawer-shell-left" : "")} style={{ width }}>
      <div className="drawer-handle" onPointerDown={startDrag} />
      {/* the absolutely-positioned wrapper must be a direct child of .drawer-shell — Tip's
          own span is itself `position: relative`, which would otherwise become the
          positioning context instead (and — being an inline-flex box sized to the button —
          place it at the shell's flow-start, not its top-right corner) */}
      <div className="drawer-collapse"><Tip text="Collapse panel" place={side === "left" ? "right" : "left"}><button className="btn btn-mini" onClick={toggle} aria-label="Collapse panel">{side === "left" ? "◂" : "▸"}</button></Tip></div>
      {children}
    </div>
  );
}
