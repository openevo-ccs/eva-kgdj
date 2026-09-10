// Cytoscape.js wrapper for the KGDJ. Deliberately NOT the AI-agent whiteboard's
// renderer (ask-eva-app/js/graph-engine.js is a hand-rolled SVG force layout
// with a fixed type list); this component is the editorial tool's own view.
// A future shared "graph rendering core" could sit between the two — not now.
//
// Selection model:
//   plain click on a node/edge  -> onSelect(id) / onSelectEdge(id) (opens the drawer)
//   Ctrl/Shift/Cmd + click       -> toggles the element in a multi-selection (Cytoscape's own)
//   Ctrl/Shift + drag on canvas  -> box selection
//   right-click (node/edge/background) -> ContextMenu: base selection actions (exported as
//     baseSelectionActions so a page's own menu items are consistent) + a page-supplied
//     contextMenuExtra (e.g. "Add to my portfolio" in the explorer, "Share with…" in the portfolio)
//   onSelectionChange reports the current multi-selection (node ids, edge ids)
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from "cytoscape";
import dagre from "cytoscape-dagre";
import cola from "cytoscape-cola";
import type { Department, GraphEdge, GraphNode } from "../lib/types";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu";

let registered = false;
function ensurePlugins() { if (!registered) { cytoscape.use(dagre); cytoscape.use(cola); registered = true; } }

export type LayoutName = "cose" | "physics" | "dagre" | "concentric" | "grid" | "preset";
export interface Selection { nodes: string[]; edges: string[] }
export type CtxTarget = { kind: "node"; id: string } | { kind: "edge"; id: string } | { kind: "background" };
export interface PhysicsParams {
  spacing: number; edgeLength: number; gravity: number; infinite: boolean; dagreDirection: "LR" | "TB";
  edgeElasticity: number;  // cose: how stiff edges are (higher = shorter, straighter edges)
  nodeSep: number;         // dagre: spacing between siblings (perpendicular to flow)
  rankSep: number;         // dagre: spacing between ranks (along the flow direction)
  ringSpacing: number;     // concentric: pixel width of each ring
}
// Real multi-department nodes top out at 5 departments today (mpi-eva-graph's
// institute-wide layer, kgdj.node_departments) -- 6 gives one slot of headroom.
// Cytoscape's pie styling supports up to 16 (pie-1-background-color..pie-16-*); the
// "node.pie" stylesheet rule below has to name each pie-N-* selector explicitly, so
// this constant and that rule must stay in sync if the real data ever needs more.
const PIE_MAX_SLICES = 6;

export const DEFAULT_PHYSICS: PhysicsParams = {
  spacing: 8000, edgeLength: 70, gravity: 0.25, infinite: true, dagreDirection: "LR",
  edgeElasticity: 100, nodeSep: 18, rankSep: 90, ringSpacing: 2,
};

export type NodeSizeBy = "none" | "degree" | "eigenvector";
export type EdgeWidthBy = "weight" | "centrality";
export interface EncodingParams { nodeSizeBy: NodeSizeBy; nodeSizeScale: number; edgeWidthBy: EdgeWidthBy; edgeWidthScale: number }
export const DEFAULT_ENCODING: EncodingParams = { nodeSizeBy: "none", nodeSizeScale: 1, edgeWidthBy: "weight", edgeWidthScale: 1 };

export interface GraphCanvasProps {
  nodes: GraphNode[]; edges: GraphEdge[]; deptById: Record<string, Department>;
  layout: LayoutName; selectedId: string | null; onSelect: (id: string | null) => void;
  selectedEdgeId?: string | null; onSelectEdge?: (id: string | null) => void;
  onSelectionChange?: (sel: Selection) => void;
  positions?: Record<string, { x: number; y: number }>;      // for layout "preset"
  onDragEnd?: (id: string, x: number, y: number) => void;
  physicsParams?: PhysicsParams;
  contextMenuExtra?: (target: CtxTarget, sel: Selection) => ContextMenuItem[];
  communities?: Map<string, number> | null; communityColors?: string[];
  highlightPath?: string[] | null;
  encoding?: EncodingParams;
  autoFit?: boolean;   // when true, re-fit the viewport after every layout run and container resize
  onReady?: (cy: Core) => void;
}

function buildLayoutOptions(name: Exclude<LayoutName, "preset">, phys: PhysicsParams): LayoutOptions {
  if (name === "cose") return { name: "cose", animate: "end", animationDuration: 500, nodeRepulsion: () => phys.spacing, idealEdgeLength: () => phys.edgeLength, edgeElasticity: () => phys.edgeElasticity, gravity: phys.gravity, numIter: 800, padding: 30 } as LayoutOptions;
  if (name === "physics") return { name: "cola", animate: true, infinite: phys.infinite, fit: false, nodeSpacing: () => phys.spacing / 400, edgeLength: phys.edgeLength, gravity: phys.gravity, avoidOverlap: true, maxSimulationTime: phys.infinite ? Number.MAX_SAFE_INTEGER : 3000, randomize: false, padding: 30 } as unknown as LayoutOptions;
  if (name === "dagre") return { name: "dagre", rankDir: phys.dagreDirection, nodeSep: phys.nodeSep, rankSep: phys.rankSep, padding: 30 } as unknown as LayoutOptions;
  if (name === "concentric") return { name: "concentric", concentric: (n: cytoscape.NodeSingular) => n.degree(false), levelWidth: () => phys.ringSpacing, padding: 30, animate: false } as LayoutOptions;
  return { name: "grid", padding: 30 } as LayoutOptions;
}

// Node "score" (0..1) feeding both node size and (when edgeWidthBy = "centrality") edge width.
// degree: reuses the same normalised degree centrality already shown in the Explorer's
// "most connected" panel. eigenvector: cytoscape has no eigenvector-centrality algorithm by
// name, but pageRank() is the standard analog (same idea: connections to well-connected nodes
// count more) — normalised here to 0..1 by dividing by the graph's own max rank.
function computeNodeScores(cy: Core, kind: Exclude<NodeSizeBy, "none">): Map<string, number> {
  const out = new Map<string, number>();
  if (kind === "degree") {
    const dc = cy.elements().degreeCentralityNormalized({ directed: false, weight: () => 1 }) as unknown as { degree: (n: cytoscape.NodeSingular) => number };
    cy.nodes().forEach((n) => { out.set(n.id(), dc.degree(n)); });
    return out;
  }
  const pr = cy.elements().pageRank({}) as unknown as { rank: (n: cytoscape.NodeCollection) => number };
  let max = 0;
  cy.nodes().forEach((n) => { const r = pr.rank(n); out.set(n.id(), r); if (r > max) max = r; });
  if (max > 0) out.forEach((v, k) => out.set(k, v / max));
  return out;
}
// A "scale" slider as a gamma curve on the 0..1 score: >1 exaggerates the spread between
// low/high-scoring elements, <1 flattens it toward uniform. Keeps the stylesheet's own
// mapData() range fixed (see the "sized-score"/"width-score" styles) so moving the slider
// never needs a full stylesheet rebuild — only the underlying data value changes.
const gamma = (v: number, scale: number) => (scale > 0 ? Math.pow(Math.max(0, Math.min(1, v)), 1 / scale) : v);
const isMulti = (ev: cytoscape.EventObject) => { const oe = ev.originalEvent as MouseEvent | undefined; return !!(oe && (oe.ctrlKey || oe.shiftKey || oe.metaKey)); };

export function GraphCanvas(p: GraphCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const runningLayout = useRef<{ stop: () => void } | null>(null);
  const lastLayout = useRef<string>("");
  const cb = useRef(p); cb.current = p;
  // true only while "physics" (cola, infinite:true) is live-simulating: it never emits its own
  // layoutstop, and unlike the one-shot layouts (which all default fit:true and correctly frame
  // themselves already) a resize-triggered fit caught mid-simulation would fit to whatever
  // transient, still-drifting bounding box exists at that instant and then just stay there —
  // looks exactly like the graph "flying out of view" once the simulation settles back down.
  const liveSimActive = useRef(false);
  const [menu, setMenu] = useState<{ x: number; y: number; target: CtxTarget } | null>(null);

  // (re)build elements when data/colouring changes
  useEffect(() => {
    if (!host.current) return;
    ensurePlugins();
    const els: ElementDefinition[] = [];
    const degree = new Map<string, number>();
    p.edges.forEach((e) => { degree.set(e.source_node_id, (degree.get(e.source_node_id) || 0) + 1); degree.set(e.target_node_id, (degree.get(e.target_node_id) || 0) + 1); });
    for (const n of p.nodes) {
      const dept = n.department_id ? p.deptById[n.department_id] : null;
      const comm = p.communities?.get(n.id);
      const color = comm != null && p.communityColors ? p.communityColors[comm % p.communityColors.length] : dept?.color_hex || "#8a8f99";
      const pos = p.positions?.[n.id];
      // Real multi-department nodes (mpi-eva-graph's institute-wide layer -- theories/
      // topics genuinely spanning 2-5 departments, kgdj.node_departments) render as a
      // pie-sliced circle, one wedge per department, instead of a misleading single
      // color -- cytoscape's own native pie-background-* styling (see the "node.pie"
      // selector below), not a plugin. Community-analysis mode still wins outright (a
      // node's community is one fact, not several) -- pie only applies to the plain
      // department view.
      const deptIds = (comm == null && (n.department_ids?.length ?? 0) > 1) ? n.department_ids! : null;
      const pieData: Record<string, string | number> = {};
      if (deptIds) {
        const slices = deptIds.slice(0, PIE_MAX_SLICES);
        const size = 100 / slices.length;
        // Explicit zero-size fill for every unused slice index, not left undefined --
        // cytoscape's data() mapper on a missing property is a style warning waiting to
        // happen, not a guaranteed silent 0.
        for (let i = 1; i <= PIE_MAX_SLICES; i++) { pieData[`pieColor${i}`] = "#8a8f99"; pieData[`pieSize${i}`] = 0; }
        slices.forEach((id, i) => { pieData[`pieColor${i + 1}`] = p.deptById[id]?.color_hex || "#8a8f99"; pieData[`pieSize${i + 1}`] = size; });
      }
      els.push({ data: { id: n.id, label: n.label, color, status: n.status, student: (n.provenance?.source as string) === "kgdj" ? 1 : 0, type: n.type_code, deg: degree.get(n.id) || 0, ...pieData }, classes: n.status + (n.provenance?.shared ? " shared" : "") + (deptIds ? " pie" : ""), ...(pos ? { position: { x: pos.x, y: pos.y } } : {}) });
    }
    const ids = new Set(p.nodes.map((n) => n.id));
    for (const e of p.edges) {
      if (!ids.has(e.source_node_id) || !ids.has(e.target_node_id)) continue;
      els.push({ data: { id: e.id, source: e.source_node_id, target: e.target_node_id, label: e.relationship_code, weight: e.weight, status: e.status, adopted: (e.provenance?.adopted as number) || 0 }, classes: e.status + ((e.provenance?.adopted as number) ? " adopted" : "") + (e.provenance?.shared ? " shared" : "") });
    }
    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: host.current, elements: els, minZoom: 0.15, maxZoom: 4, wheelSensitivity: 0.25, boxSelectionEnabled: true, selectionType: "single",
        style: [
          { selector: "node", style: { "background-color": "data(color)", label: "data(label)", "font-size": 9, color: "#2a2d33", "text-valign": "bottom", "text-margin-y": 3, "text-wrap": "ellipsis", "text-max-width": "110", width: 16, height: 16, "border-width": 1.5, "border-color": "#fff", "text-background-color": "#fbfbf9", "text-background-opacity": 0.85, "text-background-padding": "1px" } },
          // Real multi-department nodes: one pie wedge per department (data(pieColorN)/
          // pieSizeN), built in the elements loop above. Overrides the plain
          // background-color rule via selector specificity/order, not a separate class of
          // node otherwise — everything else about ".pie" nodes (size, border, labels,
          // encoding-driven sizing below) stays identical to a normal node.
          { selector: "node.pie", style: Object.fromEntries([
            ["pie-size", "100%"],
            ...Array.from({ length: PIE_MAX_SLICES }, (_, i) => i + 1).flatMap((i) => [
              [`pie-${i}-background-color`, `data(pieColor${i})`],
              [`pie-${i}-background-size`, `data(pieSize${i})`],
            ]),
          ]) as Record<string, string> },
          // sizeScore/widthScore are written by the encoding effect below, 0..1 already gamma-adjusted
          // by the user's scale slider — the mapData range here stays fixed on purpose (see gamma()).
          { selector: "node.sized-score", style: { width: "mapData(sizeScore, 0, 1, 12, 46)", height: "mapData(sizeScore, 0, 1, 12, 46)" } },
          { selector: "edge.width-score", style: { width: "mapData(widthScore, 0, 1, 0.6, 4.5)" } },
          // proposed / pending-review: dashed; student-authored (source kgdj): double border
          { selector: "node.proposed", style: { "border-style": "dashed", "border-color": "#7a4d9c", "border-width": 2, "background-opacity": 0.75 } },
          { selector: "node.canonical", style: { "border-color": "#1a6b46", "border-width": 2 } },
          { selector: "node[student = 1]", style: { "border-style": "double", "border-width": 4, "border-color": "#7a2027" } },
          { selector: "node:selected", style: { "border-color": "#006c66", "border-width": 4, "z-index": 10, "overlay-color": "#006c66", "overlay-opacity": 0.15, "overlay-padding": 5 } },
          { selector: "node.dim", style: { opacity: 0.18 } },
          { selector: "node.path", style: { "border-color": "#d42a3c", "border-width": 4, "background-blacken": -0.1 } },
          { selector: "node.shared", style: { "border-color": "#e2841e" } },
          // A gentle, always-on halo (not an alarm colour) marking scicomm-sensitivity nodes —
          // topics that need care in how they're described publicly (e.g. "percent Neanderthal"
          // popular narratives, "language death" deficit framing). Distinct from selection's teal
          // overlay and shortest-path's red so the three never read as the same kind of signal.
          { selector: 'node[type = "scicomm-sensitivity"]', style: { "underlay-color": "#c9932e", "underlay-opacity": 0.28, "underlay-padding": 4 } },
          { selector: "edge", style: { width: "mapData(weight, 0, 5, 0.6, 3)", "line-color": "#b9bcc4", "target-arrow-color": "#b9bcc4", "target-arrow-shape": "triangle", "arrow-scale": 0.7, "curve-style": "bezier", "font-size": 7, color: "#6b7280", "text-rotation": "autorotate", "text-background-color": "#fbfbf9", "text-background-opacity": 0.8 } },
          { selector: "edge.proposed", style: { "line-style": "dashed", "line-color": "#c9b6dc", "target-arrow-color": "#c9b6dc" } },
          { selector: "edge.canonical", style: { "line-color": "#8fb8a3", "target-arrow-color": "#8fb8a3" } },
          { selector: "edge.adopted", style: { "line-style": "solid", "line-color": "#1a6b46", "target-arrow-color": "#1a6b46", width: 2 } },
          { selector: "edge.shared", style: { "line-color": "#e2841e", "target-arrow-color": "#e2841e" } },
          { selector: "edge:selected, edge.path", style: { "line-color": "#d42a3c", "target-arrow-color": "#d42a3c", width: 3, label: "data(label)", "overlay-color": "#d42a3c", "overlay-opacity": 0.1, "overlay-padding": 4 } },
          { selector: "edge.dim", style: { opacity: 0.12 } },
        ],
      });
      const cy = cyRef.current;
      cy.on("tap", "node", (ev) => { if (isMulti(ev)) return; cb.current.onSelect(ev.target.id()); });
      cy.on("tap", "edge", (ev) => { if (isMulti(ev)) return; cb.current.onSelectEdge?.(ev.target.id()); });
      cy.on("tap", (ev) => { if (ev.target === cy) { cb.current.onSelect(null); cb.current.onSelectEdge?.(null); } });
      cy.on("select unselect", () => { const sel = cy.$(":selected"); cb.current.onSelectionChange?.({ nodes: sel.nodes().map((n) => n.id()), edges: sel.edges().map((e) => e.id()) }); emphasise(cy, cb.current); });
      cy.on("dragfree", "node", (ev) => { const pos = ev.target.position(); cb.current.onDragEnd?.(ev.target.id(), pos.x, pos.y); });
      cy.on("cxttap", "node", (ev) => { const oe = ev.originalEvent as MouseEvent; oe?.preventDefault(); setMenu({ x: oe.clientX, y: oe.clientY, target: { kind: "node", id: ev.target.id() } }); });
      cy.on("cxttap", "edge", (ev) => { const oe = ev.originalEvent as MouseEvent; oe?.preventDefault(); setMenu({ x: oe.clientX, y: oe.clientY, target: { kind: "edge", id: ev.target.id() } }); });
      cy.on("cxttap", (ev) => { if (ev.target !== cy) return; const oe = ev.originalEvent as MouseEvent; oe?.preventDefault(); setMenu({ x: oe.clientX, y: oe.clientY, target: { kind: "background" } }); });
      // NOT "tap": a right-click that opens the menu is itself ALSO a tap candidate (tap is
      // button-agnostic; cxttap is additional), and cytoscape defers emitting "tap" briefly
      // to disambiguate single vs. double-tap — that deferred echo would otherwise fire a
      // beat after the menu opens and close it via this same handler, right as a real user
      // (or a fast automated click) tries to click an item. ContextMenu's own pointerdown
      // "click outside" check already covers dismissing on a real background tap.
      cy.on("pan zoom", () => setMenu(null));
      // One-shot layouts (cose/dagre/concentric/grid) all default fit:true and correctly frame
      // themselves already — no extra handling needed. "physics" is different: it deliberately
      // sets fit:false (fitting on every simulation tick would be constant camera jitter) and
      // never fires its own layoutstop (infinite:true runs until explicitly stopped), so it gets
      // exactly one fit, after giving the simulation a moment to get past its initial chaotic
      // "explosion" from overlapping start positions — not fit continuously, which is what the
      // ResizeObserver below must avoid doing while a live simulation is still moving things.
      cy.on("layoutstart", () => {
        if (cb.current.layout !== "physics") return;
        liveSimActive.current = true;
        window.setTimeout(() => { if (liveSimActive.current && (cb.current.autoFit ?? true)) cy.fit(undefined, 30); }, 900);
      });
      cy.on("layoutstop", () => { liveSimActive.current = false; });
      p.onReady?.(cy);
    } else {
      // Patch in place rather than remove()+add(): this effect re-fires for reasons that have
      // nothing to do with the graph's actual shape (e.g. a parent re-render handing down a new
      // deptById object with the same content) — a wholesale wipe-and-re-add on every such firing
      // silently resets every existing node to cytoscape's un-positioned default, and since the
      // layout-rerun guard below only looks at node/edge COUNTS, an unchanged count means no
      // layout ever runs to fix it: the graph looks right for a moment, then collapses to one
      // overlapping cluster the next time anything else causes a re-render. Only truly new/removed
      // elements should ever touch position; elements that persist just get fresh data/classes.
      const cy = cyRef.current;
      const keep = cy.$(":selected").map((e) => e.id());
      const nextIds = new Set(els.map((el) => el.data!.id as string));
      cy.batch(() => {
        cy.elements().filter((e) => !nextIds.has(e.id())).remove();
        const toAdd: ElementDefinition[] = [];
        for (const el of els) {
          const id = el.data!.id as string;
          const existing = cy.getElementById(id);
          if (existing.nonempty()) {
            existing.data(el.data);
            // Targeted remove/add, not a full .classes() replace: sized-score/width-score are
            // owned by the separate encoding effect below (different dependencies, doesn't
            // necessarily re-fire alongside this one) and must survive this element being patched.
            const owned = existing.isNode() ? "proposed canonical archived shared" : "proposed canonical archived adopted shared";
            existing.removeClass(owned).addClass((el.classes as string) ?? "");
          } else toAdd.push(el);
        }
        cy.add(toAdd);
        keep.forEach((id) => cy.getElementById(id).select());
      });
    }
    const physics = p.physicsParams ?? DEFAULT_PHYSICS;
    const key = p.layout + ":" + p.nodes.length + ":" + p.edges.length + ":" + JSON.stringify(physics);
    if (key !== lastLayout.current) {
      lastLayout.current = key;
      runningLayout.current?.stop();
      if (p.layout === "preset") { const missing = cyRef.current.nodes().filter((n) => !p.positions?.[n.id()]); if (missing.length === cyRef.current.nodes().length) { const l = cyRef.current.layout(buildLayoutOptions("cose", physics)); runningLayout.current = l; l.run(); } else { if (missing.length) missing.layout({ name: "grid", boundingBox: { x1: 0, y1: -140, w: 400, h: 100 }, padding: 0 } as LayoutOptions).run(); cyRef.current.fit(undefined, 30); } }
      else { const l = cyRef.current.layout(buildLayoutOptions(p.layout, physics)); runningLayout.current = l; l.run(); }
    }
    emphasise(cyRef.current, p);
  }, [p.nodes, p.edges, p.deptById, p.layout, p.physicsParams, p.communities, p.communityColors]);

  // Node size / edge width by centrality — decoupled from the layout/rebuild effect above so
  // moving a "scale" slider only restyles (writes new data(), no layout re-run, no position churn).
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    const enc = p.encoding ?? DEFAULT_ENCODING;
    cy.batch(() => {
      // One shared score basis: whatever nodeSizeBy asks for, or (if node sizing is off but edge
      // width still wants centrality) degree as the cheap always-available fallback basis.
      const scores = enc.nodeSizeBy !== "none" ? computeNodeScores(cy, enc.nodeSizeBy)
        : enc.edgeWidthBy === "centrality" ? computeNodeScores(cy, "degree") : null;

      if (scores && enc.nodeSizeBy !== "none") cy.nodes().addClass("sized-score").forEach((n) => { n.data("sizeScore", gamma(scores.get(n.id()) ?? 0, enc.nodeSizeScale)); });
      else cy.nodes().removeClass("sized-score");

      if (scores && enc.edgeWidthBy === "centrality") {
        cy.edges().addClass("width-score").forEach((e) => {
          const s = ((scores.get(e.source().id()) ?? 0) + (scores.get(e.target().id()) ?? 0)) / 2;
          e.data("widthScore", gamma(s, enc.edgeWidthScale));
        });
      } else cy.edges().removeClass("width-score");
    });
  }, [p.nodes, p.edges, p.encoding]);

  // selection + path highlight driven from props (drawer open/closed)
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.batch(() => {
      const multi = cy.$(":selected").length > 1;
      if (!multi) cy.elements().unselect();
      if (p.selectedId) { const n = cy.getElementById(p.selectedId); if (n.nonempty()) n.select(); }
      if (p.selectedEdgeId) { const e = cy.getElementById(p.selectedEdgeId); if (e.nonempty()) e.select(); }
      emphasise(cy, p);
    });
  }, [p.selectedId, p.selectedEdgeId, p.highlightPath]);

  // Cytoscape sizes its canvases from the container at init and only re-measures on a
  // window resize event — a sibling flex/grid item changing width (dragging the
  // ResizableDrawer's handle, collapsing it) fires neither, so the canvas silently keeps
  // its stale (often larger) pixel size and visually/hit-test overlaps whatever is now
  // next to it. A ResizeObserver on the host catches every such case.
  useEffect(() => {
    if (!host.current) return;
    const ro = new ResizeObserver(() => {
      const cy = cyRef.current; if (!cy) return;
      cy.resize();
      // The container's real size is often not what it was when the layout last fit the
      // viewport (sidebars/banners still settling right after mount is the common case) — this
      // is what actually fixes nodes loading off-screen. Skipped while physics is live-simulating
      // (see liveSimActive above) — fitting to a still-moving bounding box mid-simulation is the
      // "flies out of view" bug, not a fix for it.
      if ((cb.current.autoFit ?? true) && !liveSimActive.current) cy.fit(undefined, 30);
    });
    ro.observe(host.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => { runningLayout.current?.stop(); cyRef.current?.destroy(); cyRef.current = null; }, []);
  return (
    <div ref={host} className="graph-canvas" onContextMenu={(e) => e.preventDefault()}>
      {/* Portalled to <body>, deliberately NOT rendered as a child of this div: cytoscape
          owns this container imperatively (appends/manages its own canvases directly, outside
          React's tracking) and .ctxmenu is `position: fixed` anyway, so nesting it here bought
          nothing and cytoscape's own DOM churn on this node (element rebuilds, resize) could
          disrupt a React-rendered sibling it doesn't know about — observed as the menu's own
          click never reaching React once a second cxttap fired shortly after the first. */}
      {menu && cyRef.current && createPortal((() => {
        const cy = cyRef.current!;
        const sel: Selection = { nodes: cy.nodes(":selected").map((n) => n.id()), edges: cy.edges(":selected").map((e) => e.id()) };
        const items = [...baseSelectionActions(cy, menu.target), ...(p.contextMenuExtra?.(menu.target, sel) ?? [])];
        return <ContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />;
      })(), document.body)}
    </div>
  );
}

// Dim everything except: the path (if any) or the closed neighbourhood of the selection.
function emphasise(cy: Core, p: GraphCanvasProps) {
  cy.batch(() => {
    cy.elements().removeClass("dim path");
    if (p.highlightPath && p.highlightPath.length) {
      const set = new Set(p.highlightPath);
      cy.elements().addClass("dim");
      cy.nodes().filter((n) => set.has(n.id())).removeClass("dim").addClass("path");
      cy.edges().filter((e) => set.has(e.source().id()) && set.has(e.target().id())).removeClass("dim").addClass("path");
      return;
    }
    const sel = cy.$(":selected");
    if (sel.length) { cy.elements().addClass("dim"); sel.nodes().closedNeighborhood().removeClass("dim"); sel.edges().removeClass("dim").connectedNodes().removeClass("dim"); }
  });
}

// Right-click menu base actions: select/deselect/select-neighbours/select-connected-edges/
// clear/select-all. Exported so a page can build its own menu the same way if it ever needs to.
export function baseSelectionActions(cy: Core, target: CtxTarget): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];
  const selCount = cy.$(":selected").length;
  if (target.kind === "node") {
    const n = cy.getElementById(target.id); const isSel = n.selected();
    items.push({ label: isSel ? "Deselect" : "Select", onClick: () => (isSel ? n.unselect() : n.select()) });
    items.push({ label: "Select neighbours", onClick: () => n.closedNeighborhood().select() });
    items.push({ label: "Select connected edges", onClick: () => n.connectedEdges().select() });
  } else if (target.kind === "edge") {
    const e = cy.getElementById(target.id); const isSel = e.selected();
    items.push({ label: isSel ? "Deselect" : "Select", onClick: () => (isSel ? e.unselect() : e.select()) });
    items.push({ label: "Select endpoints", onClick: () => e.connectedNodes().select() });
  } else {
    items.push({ label: "Select all visible", onClick: () => cy.elements().select() });
  }
  if (selCount > 0) items.push({ label: "Clear selection", onClick: () => cy.elements().unselect() });
  return items;
}

// Helpers used by the pages' toolbar buttons.
// Centres on the true centroid of the selected nodes' own positions (not their neighbourhood,
// and not just the midpoint of their bounding box — a selection skewed toward one side, e.g.
// three clustered nodes and one distant outlier, has a centroid closer to the cluster than the
// bounding box's own centre would put it) when something is selected; otherwise the whole
// visible graph. Zoom still comes from the selection's bounding box, so it's framed properly —
// only where that framing gets centred changes.
export function fitGraph(cy: Core | null) {
  if (!cy) return;
  const sel = cy.$(":selected");
  const eles = sel.length ? sel : cy.elements();
  const bb = eles.boundingBox();
  const pad = sel.length ? 60 : 30;
  const w = cy.width(), h = cy.height();
  const zoom = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), Math.min((w - pad * 2) / Math.max(bb.w, 1), (h - pad * 2) / Math.max(bb.h, 1))));
  const nodes = eles.nodes();
  let cx = (bb.x1 + bb.x2) / 2, cyy = (bb.y1 + bb.y2) / 2;
  if (nodes.length) {
    let sx = 0, sy = 0;
    nodes.forEach((n) => { const p = n.position(); sx += p.x; sy += p.y; });
    cx = sx / nodes.length; cyy = sy / nodes.length;
  }
  cy.animate({ zoom, pan: { x: w / 2 - cx * zoom, y: h / 2 - cyy * zoom } }, { duration: 250 });
}
export function clearSelection(cy: Core | null) { cy?.elements().unselect(); }
export function selectIds(cy: Core | null, ids: string[]) { if (!cy) return; cy.batch(() => { cy.elements().unselect(); ids.forEach((id) => cy.getElementById(id).select()); }); }

// "All nodes and edges that connect the selected nodes": union of shortest paths between every pair.
export function connectingSubgraph(cy: Core, nodeIds: string[]): Selection {
  const nodes = new Set(nodeIds); const edges = new Set<string>();
  for (let i = 0; i < nodeIds.length; i++) {
    const res = cy.elements().dijkstra({ root: `#${nodeIds[i]}`, directed: false, weight: () => 1 });
    for (let j = i + 1; j < nodeIds.length; j++) {
      const path = res.pathTo(cy.getElementById(nodeIds[j])); if (!path || !path.length) continue;
      path.nodes().forEach((n) => { nodes.add(n.id()); }); path.edges().forEach((e) => { edges.add(e.id()); });
    }
  }
  return { nodes: [...nodes], edges: [...edges] };
}
export function neighbourhood(cy: Core, nodeIds: string[]): Selection {
  const base = nodeIds.reduce((col, id) => col.union(cy.getElementById(id)), cy.collection());
  const col = base.closedNeighborhood();
  return { nodes: col.nodes().map((n) => n.id()), edges: col.edges().map((e) => e.id()) };
}
export function edgesAmong(cy: Core, nodeIds: string[]): string[] {
  const set = new Set(nodeIds);
  return cy.edges().filter((e) => set.has(e.source().id()) && set.has(e.target().id())).map((e) => e.id());
}
