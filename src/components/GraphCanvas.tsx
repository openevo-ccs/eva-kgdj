// Cytoscape.js wrapper for the KGDJ. Deliberately NOT the AI-agent whiteboard's
// renderer (ask-eva-app/js/graph-engine.js is a hand-rolled SVG force layout
// with a fixed type list); this component is the editorial tool's own view.
// A future shared "graph rendering core" could sit between the two — not now.
//
// Selection model:
//   plain click on a node/edge  -> onSelect(id) / onSelectEdge(id) (opens the drawer)
//   Ctrl/Shift/Cmd + click       -> toggles the element in a multi-selection (Cytoscape's own)
//   Ctrl/Shift + drag on canvas  -> box selection
//   onSelectionChange reports the current multi-selection (node ids, edge ids)
import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from "cytoscape";
import dagre from "cytoscape-dagre";
import type { Department, GraphEdge, GraphNode } from "../lib/types";

let registered = false;
function ensurePlugins() { if (!registered) { cytoscape.use(dagre); registered = true; } }

export type LayoutName = "cose" | "dagre" | "concentric" | "grid" | "preset";
export interface Selection { nodes: string[]; edges: string[] }

export interface GraphCanvasProps {
  nodes: GraphNode[]; edges: GraphEdge[]; deptById: Record<string, Department>;
  layout: LayoutName; selectedId: string | null; onSelect: (id: string | null) => void;
  selectedEdgeId?: string | null; onSelectEdge?: (id: string | null) => void;
  onSelectionChange?: (sel: Selection) => void;
  positions?: Record<string, { x: number; y: number }>;      // for layout "preset"
  onDragEnd?: (id: string, x: number, y: number) => void;
  communities?: Map<string, number> | null; communityColors?: string[];
  highlightPath?: string[] | null; sizeByDegree?: boolean;
  onReady?: (cy: Core) => void;
}

const LAYOUTS: Record<Exclude<LayoutName, "preset">, LayoutOptions> = {
  cose: { name: "cose", animate: false, nodeRepulsion: () => 8000, idealEdgeLength: () => 70, gravity: 0.25, numIter: 800, padding: 30 } as LayoutOptions,
  dagre: { name: "dagre", rankDir: "LR", nodeSep: 18, rankSep: 90, padding: 30 } as unknown as LayoutOptions,
  concentric: { name: "concentric", concentric: (n: cytoscape.NodeSingular) => n.degree(false), levelWidth: () => 2, padding: 30, animate: false } as LayoutOptions,
  grid: { name: "grid", padding: 30 } as LayoutOptions,
};
const isMulti = (ev: cytoscape.EventObject) => { const oe = ev.originalEvent as MouseEvent | undefined; return !!(oe && (oe.ctrlKey || oe.shiftKey || oe.metaKey)); };

export function GraphCanvas(p: GraphCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const lastLayout = useRef<string>("");
  const cb = useRef(p); cb.current = p;

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
      els.push({ data: { id: n.id, label: n.label, color, status: n.status, student: (n.provenance?.source as string) === "kgdj" ? 1 : 0, type: n.type_code, deg: degree.get(n.id) || 0 }, classes: n.status + (p.sizeByDegree ? " sized" : ""), ...(pos ? { position: { x: pos.x, y: pos.y } } : {}) });
    }
    const ids = new Set(p.nodes.map((n) => n.id));
    for (const e of p.edges) {
      if (!ids.has(e.source_node_id) || !ids.has(e.target_node_id)) continue;
      els.push({ data: { id: e.id, source: e.source_node_id, target: e.target_node_id, label: e.relationship_code, weight: e.weight, status: e.status, adopted: (e.provenance?.adopted as number) || 0 }, classes: e.status + ((e.provenance?.adopted as number) ? " adopted" : "") });
    }
    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: host.current, elements: els, minZoom: 0.15, maxZoom: 4, wheelSensitivity: 0.25, boxSelectionEnabled: true, selectionType: "single",
        style: [
          { selector: "node", style: { "background-color": "data(color)", label: "data(label)", "font-size": 9, color: "#2a2d33", "text-valign": "bottom", "text-margin-y": 3, "text-wrap": "ellipsis", "text-max-width": "110", width: 16, height: 16, "border-width": 1.5, "border-color": "#fff", "text-background-color": "#fbfbf9", "text-background-opacity": 0.85, "text-background-padding": "1px" } },
          { selector: "node.sized", style: { width: "mapData(deg, 0, 14, 12, 44)", height: "mapData(deg, 0, 14, 12, 44)" } },
          // proposed / pending-review: dashed; student-authored (source kgdj): double border
          { selector: "node.proposed", style: { "border-style": "dashed", "border-color": "#7a4d9c", "border-width": 2, "background-opacity": 0.75 } },
          { selector: "node.canonical", style: { "border-color": "#1a6b46", "border-width": 2 } },
          { selector: "node[student = 1]", style: { "border-style": "double", "border-width": 4, "border-color": "#7a2027" } },
          { selector: "node:selected", style: { "border-color": "#17948a", "border-width": 4, "z-index": 10, "overlay-color": "#17948a", "overlay-opacity": 0.15, "overlay-padding": 5 } },
          { selector: "node.dim", style: { opacity: 0.18 } },
          { selector: "node.path", style: { "border-color": "#d42a3c", "border-width": 4, "background-blacken": -0.1 } },
          { selector: "edge", style: { width: "mapData(weight, 0, 5, 0.6, 3)", "line-color": "#b9bcc4", "target-arrow-color": "#b9bcc4", "target-arrow-shape": "triangle", "arrow-scale": 0.7, "curve-style": "bezier", "font-size": 7, color: "#6b7280", "text-rotation": "autorotate", "text-background-color": "#fbfbf9", "text-background-opacity": 0.8 } },
          { selector: "edge.proposed", style: { "line-style": "dashed", "line-color": "#c9b6dc", "target-arrow-color": "#c9b6dc" } },
          { selector: "edge.canonical", style: { "line-color": "#8fb8a3", "target-arrow-color": "#8fb8a3" } },
          { selector: "edge.adopted", style: { "line-style": "solid", "line-color": "#1a6b46", "target-arrow-color": "#1a6b46", width: 2 } },
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
      p.onReady?.(cy);
    } else {
      const cy = cyRef.current;
      const keep = cy.$(":selected").map((e) => e.id());
      cy.batch(() => { cy.elements().remove(); cy.add(els); keep.forEach((id) => cy.getElementById(id).select()); });
    }
    const key = p.layout + ":" + p.nodes.length + ":" + p.edges.length;
    if (key !== lastLayout.current) {
      lastLayout.current = key;
      if (p.layout === "preset") { const missing = cyRef.current.nodes().filter((n) => !p.positions?.[n.id()]); if (missing.length === cyRef.current.nodes().length) cyRef.current.layout(LAYOUTS.cose).run(); else { if (missing.length) missing.layout({ name: "grid", boundingBox: { x1: 0, y1: -140, w: 400, h: 100 }, padding: 0 } as LayoutOptions).run(); cyRef.current.fit(undefined, 30); } }
      else cyRef.current.layout(LAYOUTS[p.layout]).run();
    }
    emphasise(cyRef.current, p);
  }, [p.nodes, p.edges, p.deptById, p.layout, p.communities, p.communityColors, p.sizeByDegree]);

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

  useEffect(() => () => { cyRef.current?.destroy(); cyRef.current = null; }, []);
  return <div ref={host} className="graph-canvas" />;
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

// Helpers used by the pages' toolbar buttons.
export function fitGraph(cy: Core | null, toSelection = false) { if (!cy) return; const sel = cy.$(":selected"); if (toSelection && sel.length) cy.animate({ fit: { eles: sel.closedNeighborhood(), padding: 60 }, duration: 250 }); else cy.animate({ fit: { eles: cy.elements(), padding: 30 }, duration: 250 }); }
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
