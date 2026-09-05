// Wraps the side panel used by both ExplorerPage and PortfolioPage: a drag handle to
// resize, and a collapse chevron that shrinks it to a thin rail. Width and collapsed
// state persist per browser (shared across both pages, like the layout preference).
import { useEffect, useRef, useState } from "react";
import { Tip } from "./Tip";

const WIDTH_KEY = "kgdj.sidebar.width";
const COLLAPSED_KEY = "kgdj.sidebar.collapsed";
const MIN = 280, MAX = 640, DEFAULT = 380;

function loadWidth() { try { const v = Number(localStorage.getItem(WIDTH_KEY)); return v >= MIN && v <= MAX ? v : DEFAULT; } catch { return DEFAULT; } }
function loadCollapsed() { try { return localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; } }

export function ResizableDrawer({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(loadWidth);
  const [collapsed, setCollapsed] = useState(loadCollapsed);
  const dragging = useRef(false);

  useEffect(() => {
    const onMove = (e: PointerEvent) => { if (!dragging.current) return; const w = Math.min(MAX, Math.max(MIN, window.innerWidth - e.clientX)); setWidth(w); };
    const onUp = () => { if (dragging.current) { dragging.current = false; try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* ignore */ } document.body.style.cursor = ""; document.body.style.userSelect = ""; } };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [width]);

  const toggle = () => { const c = !collapsed; setCollapsed(c); try { localStorage.setItem(COLLAPSED_KEY, c ? "1" : "0"); } catch { /* ignore */ } };
  const startDrag = () => { dragging.current = true; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; };

  if (collapsed) return (
    <div className="drawer drawer-rail">
      <Tip text="Expand panel" place="left"><button className="btn btn-mini" onClick={toggle} aria-label="Expand panel">◂</button></Tip>
    </div>
  );
  return (
    <div className="drawer-shell" style={{ width }}>
      <div className="drawer-handle" onPointerDown={startDrag} />
      {/* the absolutely-positioned wrapper must be a direct child of .drawer-shell — Tip's
          own span is itself `position: relative`, which would otherwise become the
          positioning context instead (and — being an inline-flex box sized to the button —
          place it at the shell's flow-start, not its top-right corner) */}
      <div className="drawer-collapse"><Tip text="Collapse panel" place="left"><button className="btn btn-mini" onClick={toggle} aria-label="Collapse panel">▸</button></Tip></div>
      {children}
    </div>
  );
}
