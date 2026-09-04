// Cytoscape.js wrapper for the KGDJ. Deliberately NOT the AI-agent whiteboard's
// renderer (ask-eva-app/js/graph-engine.js is a hand-rolled SVG force layout
// with a fixed type list); this component is the editorial tool's own view.
// A future shared "graph rendering core" could sit between the two — not now.
import { useEffect, useRef } from "react";
import cytoscape, { type Core, type ElementDefinition, type LayoutOptions } from "cytoscape";
import dagre from "cytoscape-dagre";
import type { Department, GraphEdge, GraphNode } from "../lib/types";

let registered = false;
function ensurePlugins() { if (!registered) { cytoscape.use(dagre); registered = true; } }

export type LayoutName = "cose" | "dagre" | "concentric" | "grid";

export interface GraphCanvasProps {
  nodes: GraphNode[]; edges: GraphEdge[]; deptById: Record<string, Department>;
  layout: LayoutName; selectedId: string | null; onSelect: (id: string | null) => void;
  communities?: Map<string, number> | null; communityColors?: string[];
  highlightPath?: string[] | null; sizeByDegree?: boolean;
  onReady?: (cy: Core) => void;
}

const LAYOUTS: Record<LayoutName, LayoutOptions> = {
  cose: { name: "cose", animate: false, nodeRepulsion: () => 8000, idealEdgeLength: () => 70, gravity: 0.25, numIter: 800, padding: 30 } as LayoutOptions,
  dagre: { name: "dagre", rankDir: "LR", nodeSep: 18, rankSep: 90, padding: 30 } as unknown as LayoutOptions,
  concentric: { name: "concentric", concentric: (n: cytoscape.NodeSingular) => n.degree(false), levelWidth: () => 2, padding: 30, animate: false } as LayoutOptions,
  grid: { name: "grid", padding: 30 } as LayoutOptions,
};

export function GraphCanvas(p: GraphCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const lastLayout = useRef<string>("");
  const onSelectRef = useRef(p.onSelect); onSelectRef.current = p.onSelect;

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
      els.push({ data: { id: n.id, label: n.label, color, status: n.status, student: (n.provenance?.source as string) === "kgdj" ? 1 : 0, type: n.type_code, deg: degree.get(n.id) || 0 }, classes: n.status });
    }
    const ids = new Set(p.nodes.map((n) => n.id));
    for (const e of p.edges) {
      if (!ids.has(e.source_node_id) || !ids.has(e.target_node_id)) continue;
      els.push({ data: { id: e.id, source: e.source_node_id, target: e.target_node_id, label: e.relationship_code, weight: e.weight, status: e.status }, classes: e.status });
    }
    if (!cyRef.current) {
      cyRef.current = cytoscape({
        container: host.current, elements: els, minZoom: 0.15, maxZoom: 4, wheelSensitivity: 0.25,
        style: [
          { selector: "node", style: { "background-color": "data(color)", label: "data(label)", "font-size": 9, color: "#2a2d33", "text-valign": "bottom", "text-margin-y": 3, "text-wrap": "ellipsis", "text-max-width": "110", width: p.sizeByDegree ? "mapData(deg, 0, 14, 12, 40)" : 16, height: p.sizeByDegree ? "mapData(deg, 0, 14, 12, 40)" : 16, "border-width": 1.5, "border-color": "#fff", "text-background-color": "#fbfbf9", "text-background-opacity": 0.85, "text-background-padding": "1px" } },
          // proposed / pending-review: dashed; student-authored (source kgdj): double border
          { selector: "node.proposed", style: { "border-style": "dashed", "border-color": "#7a4d9c", "border-width": 2, "background-opacity": 0.75 } },
          { selector: "node.canonical", style: { "border-color": "#1a6b46", "border-width": 2 } },
          { selector: "node[student = 1]", style: { "border-style": "double", "border-width": 4, "border-color": "#7a2027" } },
          { selector: "node:selected", style: { "border-color": "#17948a", "border-width": 4, "z-index": 10 } },
          { selector: "node.dim", style: { opacity: 0.18 } },
          { selector: "node.path", style: { "border-color": "#d42a3c", "border-width": 4, "background-blacken": -0.1 } },
          { selector: "edge", style: { width: "mapData(weight, 0, 5, 0.6, 3)", "line-color": "#b9bcc4", "target-arrow-color": "#b9bcc4", "target-arrow-shape": "triangle", "arrow-scale": 0.7, "curve-style": "bezier", "font-size": 7, color: "#6b7280", "text-rotation": "autorotate", "text-background-color": "#fbfbf9", "text-background-opacity": 0.8 } },
          { selector: "edge.proposed", style: { "line-style": "dashed", "line-color": "#c9b6dc", "target-arrow-color": "#c9b6dc" } },
          { selector: "edge.canonical", style: { "line-color": "#8fb8a3", "target-arrow-color": "#8fb8a3" } },
          { selector: "edge:selected, edge.path", style: { "line-color": "#d42a3c", "target-arrow-color": "#d42a3c", width: 3, label: "data(label)" } },
          { selector: "edge.dim", style: { opacity: 0.12 } },
        ],
      });
      cyRef.current.on("tap", "node", (ev) => onSelectRef.current(ev.target.id()));
      cyRef.current.on("tap", (ev) => { if (ev.target === cyRef.current) onSelectRef.current(null); });
      p.onReady?.(cyRef.current);
    } else {
      const cy = cyRef.current;
      cy.batch(() => { cy.elements().remove(); cy.add(els); });
    }
    const key = p.layout + ":" + p.nodes.length + ":" + p.edges.length;
    if (key !== lastLayout.current) { lastLayout.current = key; cyRef.current.layout(LAYOUTS[p.layout]).run(); }
  }, [p.nodes, p.edges, p.deptById, p.layout, p.communities, p.communityColors, p.sizeByDegree]);

  // selection + path highlight
  useEffect(() => {
    const cy = cyRef.current; if (!cy) return;
    cy.batch(() => {
      cy.elements().unselect().removeClass("dim path");
      if (p.highlightPath && p.highlightPath.length) {
        const set = new Set(p.highlightPath);
        cy.elements().addClass("dim");
        cy.nodes().filter((n) => set.has(n.id())).removeClass("dim").addClass("path");
        cy.edges().filter((e) => set.has(e.source().id()) && set.has(e.target().id())).removeClass("dim").addClass("path");
      }
      if (p.selectedId) { const n = cy.getElementById(p.selectedId); if (n.nonempty()) { n.select(); if (!p.highlightPath) { cy.elements().addClass("dim"); n.closedNeighborhood().removeClass("dim"); } } }
    });
  }, [p.selectedId, p.highlightPath]);

  useEffect(() => () => { cyRef.current?.destroy(); cyRef.current = null; }, []);
  return <div ref={host} className="graph-canvas" />;
}
