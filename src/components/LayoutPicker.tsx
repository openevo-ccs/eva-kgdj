// Shared layout + physics + visual-encoding control for both graph views (Explorer and
// Portfolio), so the two are literally the same control, not look-alikes. A purely controlled
// component: the parent page owns the current layout/physics/encoding/autoFit state; this owns
// nothing but persisting a convenient default (loadGraphPrefs) and rendering the controls that
// are actually meaningful for whichever layout is active.
//
// Two render modes: the default (a compact <select> + gear-icon popover) fits a horizontal
// toolbar; `inline` renders every control directly, no popover, for a vertical sidebar where
// there's room to show them all at once.
import { useState } from "react";
import { DEFAULT_ENCODING, DEFAULT_PHYSICS, type EdgeWidthBy, type EncodingParams, type LayoutName, type NodeSizeBy, type PhysicsParams } from "./GraphCanvas";
import { Help, Tip } from "./Tip";

const KEY = "kgdj.graph.prefs";

export function loadGraphPrefs(): { layout: LayoutName; physics: PhysicsParams; encoding: EncodingParams; autoFit: boolean } {
  try {
    const raw = localStorage.getItem(KEY); if (!raw) throw 0;
    const p = JSON.parse(raw);
    return { layout: p.layout ?? "cose", physics: { ...DEFAULT_PHYSICS, ...p.physics }, encoding: { ...DEFAULT_ENCODING, ...p.encoding }, autoFit: p.autoFit ?? true };
  } catch { return { layout: "cose", physics: DEFAULT_PHYSICS, encoding: DEFAULT_ENCODING, autoFit: true }; }
}
export function saveGraphPrefs(layout: LayoutName, physics: PhysicsParams, encoding: EncodingParams, autoFit: boolean) {
  try { localStorage.setItem(KEY, JSON.stringify({ layout, physics, encoding, autoFit })); } catch { /* private mode */ }
}

const LAYOUT_OPTS: { value: LayoutName; label: string; tip: string }[] = [
  { value: "cose", label: "organic", tip: "Connected nodes pull together, everything else repels. Runs once and settles." },
  { value: "physics", label: "physics", tip: "The same idea, but kept running live: drag a node and its neighbours react. Good for exploring what's densely connected." },
  { value: "dagre", label: "hierarchical", tip: "Follows edge direction (good for 'grounds' / 'enables' chains). Runs once and settles." },
  { value: "concentric", label: "rings", tip: "Most-connected nodes in the centre, rings outward by degree. Runs once and settles." },
  { value: "grid", label: "grid", tip: "Plain alphabetical grid — useful as a neutral starting point." },
];
const NODE_SIZE_OPTS: { value: NodeSizeBy; label: string; tip: string }[] = [
  { value: "none", label: "uniform", tip: "Every node the same size." },
  { value: "degree", label: "degree centrality", tip: "Bigger = more connections among the visible nodes." },
  { value: "eigenvector", label: "eigenvector centrality", tip: "Bigger = connected to other well-connected nodes, not just more connections (PageRank, the standard stand-in for eigenvector centrality)." },
];
const EDGE_WIDTH_OPTS: { value: EdgeWidthBy; label: string; tip: string }[] = [
  { value: "weight", label: "assigned weight", tip: "The relationship's own editorial weight." },
  { value: "centrality", label: "endpoint centrality", tip: "Thicker between two well-connected nodes — uses the same measure as node size, or degree if node size is off." },
];

export interface LayoutPickerProps {
  layout: LayoutName; onLayout: (l: LayoutName) => void;
  physics: PhysicsParams; onPhysics: (p: PhysicsParams) => void;
  encoding: EncodingParams; onEncoding: (e: EncodingParams) => void;
  autoFit: boolean; onAutoFit: (b: boolean) => void;
  allowPreset?: boolean; inline?: boolean;
}

export function LayoutPicker({ layout, onLayout, physics, onPhysics, encoding, onEncoding, autoFit, onAutoFit, allowPreset, inline }: LayoutPickerProps) {
  const [open, setOpen] = useState(false);
  const opts = allowPreset ? [{ value: "preset" as LayoutName, label: "your arrangement", tip: "Whatever you last dragged things to." }, ...LAYOUT_OPTS] : LAYOUT_OPTS;
  const setPhysics = (patch: Partial<PhysicsParams>) => { const next = { ...physics, ...patch }; onPhysics(next); saveGraphPrefs(layout, next, encoding, autoFit); };
  const setEncoding = (patch: Partial<EncodingParams>) => { const next = { ...encoding, ...patch }; onEncoding(next); saveGraphPrefs(layout, physics, next, autoFit); };
  const setAutoFit = (b: boolean) => { onAutoFit(b); saveGraphPrefs(layout, physics, encoding, b); };
  const setLayout = (l: LayoutName) => { onLayout(l); saveGraphPrefs(l, physics, encoding, autoFit); };
  const isForce = layout === "cose" || layout === "physics";

  const physicsControls = <>
    {isForce && <>
      <div className="field"><label>Repulsion <Help text="How strongly nodes push each other apart." /></label><input type="range" min={2000} max={20000} step={500} value={physics.spacing} onChange={(e) => setPhysics({ spacing: Number(e.target.value) })} /></div>
      <div className="field"><label>Edge length</label><input type="range" min={30} max={200} step={5} value={physics.edgeLength} onChange={(e) => setPhysics({ edgeLength: Number(e.target.value) })} /></div>
      <div className="field"><label>Gravity <Help text="How strongly everything is pulled toward the centre." /></label><input type="range" min={0} max={2} step={0.05} value={physics.gravity} onChange={(e) => setPhysics({ gravity: Number(e.target.value) })} /></div>
    </>}
    {layout === "cose" && <div className="field"><label>Edge stiffness <Help text="Higher pulls connected nodes into shorter, straighter edges." /></label><input type="range" min={20} max={400} step={10} value={physics.edgeElasticity} onChange={(e) => setPhysics({ edgeElasticity: Number(e.target.value) })} /></div>}
    {layout === "physics" && <label className="row" style={{ cursor: "pointer" }}><input type="checkbox" checked={physics.infinite} onChange={(e) => setPhysics({ infinite: e.target.checked })} /> keep simulating (drag nodes to feel it)</label>}
    {layout === "dagre" && <>
      <div className="field"><label>Direction</label><select value={physics.dagreDirection} onChange={(e) => setPhysics({ dagreDirection: e.target.value as "LR" | "TB" })}><option value="LR">left → right</option><option value="TB">top → bottom</option></select></div>
      <div className="field"><label>Node separation <Help text="Spacing between siblings, across the flow direction." /></label><input type="range" min={4} max={80} step={2} value={physics.nodeSep} onChange={(e) => setPhysics({ nodeSep: Number(e.target.value) })} /></div>
      <div className="field"><label>Rank separation <Help text="Spacing between ranks, along the flow direction." /></label><input type="range" min={20} max={240} step={10} value={physics.rankSep} onChange={(e) => setPhysics({ rankSep: Number(e.target.value) })} /></div>
    </>}
    {layout === "concentric" && <div className="field"><label>Ring spacing</label><input type="range" min={1} max={10} step={0.5} value={physics.ringSpacing} onChange={(e) => setPhysics({ ringSpacing: Number(e.target.value) })} /></div>}
  </>;

  const encodingControls = <>
    <div className="field"><label>Node size by <Help text={NODE_SIZE_OPTS.map((o) => `${o.label}: ${o.tip}`).join("\n")} /></label><select value={encoding.nodeSizeBy} onChange={(e) => setEncoding({ nodeSizeBy: e.target.value as NodeSizeBy })}>{NODE_SIZE_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
    {encoding.nodeSizeBy !== "none" && <div className="field"><label>Node size emphasis <Help text="Above 1×: exaggerates the difference between low- and high-scoring nodes. Below 1×: flattens it." /></label><input type="range" min={0.3} max={3} step={0.1} value={encoding.nodeSizeScale} onChange={(e) => setEncoding({ nodeSizeScale: Number(e.target.value) })} /></div>}
    <div className="field"><label>Edge thickness by <Help text={EDGE_WIDTH_OPTS.map((o) => `${o.label}: ${o.tip}`).join("\n")} /></label><select value={encoding.edgeWidthBy} onChange={(e) => setEncoding({ edgeWidthBy: e.target.value as EdgeWidthBy })}>{EDGE_WIDTH_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
    {encoding.edgeWidthBy === "centrality" && <div className="field"><label>Edge thickness emphasis</label><input type="range" min={0.3} max={3} step={0.1} value={encoding.edgeWidthScale} onChange={(e) => setEncoding({ edgeWidthScale: Number(e.target.value) })} /></div>}
  </>;

  const autoFitControl = <Tip text="When on, the view re-fits to the visible graph automatically after every layout change or panel resize. Turn off to keep your own pan/zoom."><label className="row" style={{ cursor: "pointer" }}><input type="checkbox" checked={autoFit} onChange={(e) => setAutoFit(e.target.checked)} /> auto-fit to window</label></Tip>;

  if (inline) {
    return (
      <div data-tour="layout">
        <div className="field"><label>Layout</label><select value={layout} onChange={(e) => setLayout(e.target.value as LayoutName)} aria-label="Layout">{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        {(isForce || layout === "dagre" || layout === "concentric") && physicsControls}
        {autoFitControl}
        <div className="sidebar-sep" />
        {encodingControls}
      </div>
    );
  }

  return (
    <span className="row" style={{ gap: 4 }} data-tour="layout">
      <Tip text={opts.find((o) => o.value === layout)?.tip || "Layout"}>
        <select value={layout} onChange={(e) => setLayout(e.target.value as LayoutName)} aria-label="Layout">
          {opts.map((o) => <option key={o.value} value={o.value}>layout: {o.label}</option>)}
        </select>
      </Tip>
      <span style={{ position: "relative" }}>
        <Tip text="Layout, sizing and fit options"><button type="button" className="btn btn-mini" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Layout options">⚙</button></Tip>
        {open && <div className="popover" style={{ width: 260 }} onClick={(e) => e.stopPropagation()}>
          {physicsControls}
          {autoFitControl}
          <div className="sidebar-sep" />
          {encodingControls}
        </div>}
      </span>
    </span>
  );
}
