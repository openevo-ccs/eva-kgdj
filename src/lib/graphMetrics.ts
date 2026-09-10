// Structural fragility measures for the canonical graph, live in the browser —
// companion to coherence.ts (which deliberately stays cytoscape-free; see that
// file's own header). These two genuinely need real graph algorithms
// (Hopcroft-Tarjan biconnected components), not a plain adjacency walk, and
// cytoscape.js — already a real dependency, already doing pageRank/degree-
// centrality/Dijkstra live in GraphCanvas.tsx and ExplorerPage.tsx — ships a
// tested implementation. A headless instance (no DOM container) is built here
// purely for its analysis API, thrown away after; nothing rendered.
//
// Before writing this: checked what KGDJ already has, since three separate
// near-misses earlier the same day (an already-built coherence panel, an
// already-working Ask Eva retrieval pipeline, an already-shipped UX review)
// made "assume it's missing" a bad default. Found PageRank, degree
// centrality, community detection (label propagation, analytics.ts) and
// shortest-path (Dijkstra) all already live in the app — genuinely nothing
// left to add there. Betweenness/closeness centrality and articulation
// points/bridges were the real, confirmed gap: the offline
// scripts/analyze_kgdj_coherence.py computes articulation points (not
// bridges) for a point-in-time report; neither reaches the live app.
import cytoscape from "cytoscape";
import type { GraphEdge, GraphNode } from "./types";

export interface FragilityMetrics {
  articulationPointIds: Set<string>;
  bridgeEdgeIds: Set<string>;
  betweenness: Map<string, number>; // 0..1, normalised by the graph's own max
}

export function computeFragility(nodes: GraphNode[], edges: GraphEdge[]): FragilityMetrics {
  const cy = cytoscape({
    headless: true,
    elements: [
      ...nodes.map((n) => ({ data: { id: n.id } })),
      ...edges.map((e) => ({ data: { id: e.id, source: e.source_node_id, target: e.target_node_id } })),
    ],
  });

  const { cut, components } = cy.elements().hopcroftTarjanBiconnectedComponents();
  const articulationPointIds = new Set(cut.map((n) => n.id()));
  // A bridge is exactly a biconnected component with one edge in it — the
  // standard characterisation, not a separate cytoscape API (it has none).
  const bridgeEdgeIds = new Set<string>();
  for (const comp of components) {
    const es = comp.edges();
    if (es.length === 1) bridgeEdgeIds.add(es[0].id());
  }

  const bc = cy.elements().betweennessCentrality({ directed: false, weight: () => 1 }) as unknown as { betweenness: (n: cytoscape.NodeSingular) => number };
  const betweenness = new Map<string, number>();
  let max = 0;
  cy.nodes().forEach((n) => { const v = bc.betweenness(n); betweenness.set(n.id(), v); if (v > max) max = v; });
  if (max > 0) betweenness.forEach((v, k) => betweenness.set(k, v / max));

  cy.destroy();
  return { articulationPointIds, bridgeEdgeIds, betweenness };
}
