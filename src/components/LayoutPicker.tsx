// Shared layout + physics control for both graph views (Explorer and Portfolio),
// so the two are literally the same control, not look-alikes. A purely controlled
// component: the parent page owns the current layout name; this owns nothing but
// persisting a convenient default (loadGraphPrefs) and rendering the sliders that
// are actually meaningful for whichever layout is active.
import { useState } from "react";
import { DEFAULT_PHYSICS, type LayoutName, type PhysicsParams } from "./GraphCanvas";
import { Help, Tip } from "./Tip";

const KEY = "kgdj.graph.prefs";

export function loadGraphPrefs(): { layout: LayoutName; physics: PhysicsParams } {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) throw 0;
    const p = JSON.parse(raw); return { layout: p.layout ?? "cose", physics: { ...DEFAULT_PHYSICS, ...p.physics } };
  } catch { return { layout: "cose", physics: DEFAULT_PHYSICS }; }
}
export function saveGraphPrefs(layout: LayoutName, physics: PhysicsParams) { try { localStorage.setItem(KEY, JSON.stringify({ layout, physics })); } catch { /* private mode */ } }

const LAYOUT_OPTS: { value: LayoutName; label: string; tip: string }[] = [
  { value: "cose", label: "organic", tip: "Connected nodes pull together, everything else repels. Runs once and settles." },
  { value: "physics", label: "physics", tip: "The same idea, but kept running live: drag a node and its neighbours react. Good for exploring what's densely connected." },
  { value: "dagre", label: "hierarchical", tip: "Follows edge direction (good for 'grounds' / 'enables' chains). Runs once and settles." },
  { value: "concentric", label: "rings", tip: "Most-connected nodes in the centre, rings outward by degree. Runs once and settles." },
  { value: "grid", label: "grid", tip: "Plain alphabetical grid — useful as a neutral starting point." },
];

export function LayoutPicker({ layout, onLayout, physics, onPhysics, allowPreset }: {
  layout: LayoutName; onLayout: (l: LayoutName) => void; physics: PhysicsParams; onPhysics: (p: PhysicsParams) => void; allowPreset?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const opts = allowPreset ? [{ value: "preset" as LayoutName, label: "your arrangement", tip: "Whatever you last dragged things to." }, ...LAYOUT_OPTS] : LAYOUT_OPTS;
  const set = (p: Partial<PhysicsParams>) => { const next = { ...physics, ...p }; onPhysics(next); saveGraphPrefs(layout, next); };
  const isForce = layout === "cose" || layout === "physics";
  return (
    <span className="row" style={{ gap: 4 }} data-tour="layout">
      <Tip text={opts.find((o) => o.value === layout)?.tip || "Layout"}>
        <select value={layout} onChange={(e) => { const l = e.target.value as LayoutName; onLayout(l); saveGraphPrefs(l, physics); }} aria-label="Layout">
          {opts.map((o) => <option key={o.value} value={o.value}>layout: {o.label}</option>)}
        </select>
      </Tip>
      {(isForce || layout === "dagre") && <span style={{ position: "relative" }}>
        <Tip text="Layout options"><button type="button" className="btn btn-mini" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Layout options">⚙</button></Tip>
        {open && <div className="popover" style={{ width: 240 }} onClick={(e) => e.stopPropagation()}>
          {isForce && <>
            <div className="field"><label>Spacing <Help text="How strongly nodes push each other apart." /></label><input type="range" min={2000} max={20000} step={500} value={physics.spacing} onChange={(e) => set({ spacing: Number(e.target.value) })} /></div>
            <div className="field"><label>Edge length</label><input type="range" min={30} max={200} step={5} value={physics.edgeLength} onChange={(e) => set({ edgeLength: Number(e.target.value) })} /></div>
            <div className="field"><label>Gravity <Help text="How strongly everything is pulled toward the centre." /></label><input type="range" min={0} max={2} step={0.05} value={physics.gravity} onChange={(e) => set({ gravity: Number(e.target.value) })} /></div>
          </>}
          {layout === "physics" && <label className="row" style={{ cursor: "pointer" }}><input type="checkbox" checked={physics.infinite} onChange={(e) => set({ infinite: e.target.checked })} /> keep simulating (drag nodes to feel it)</label>}
          {layout === "dagre" && <div className="field"><label>Direction</label><select value={physics.dagreDirection} onChange={(e) => set({ dagreDirection: e.target.value as "LR" | "TB" })}><option value="LR">left → right</option><option value="TB">top → bottom</option></select></div>}
        </div>}
      </span>}
    </span>
  );
}
