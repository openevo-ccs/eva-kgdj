// Graph analysis for the "Graph Analysis" panel (Comparative Cultural
// Psychology module exercises): degree centrality and shortest paths come
// from Cytoscape's own algorithms (see GraphCanvas); community detection is
// a small label-propagation implementation here (Cytoscape has none built in).
import type { GraphEdge } from "./types";

export function labelPropagation(nodeIds: string[], edges: GraphEdge[], iterations = 30, seed = 7): Map<string, number> {
  const adj = new Map<string, string[]>();
  nodeIds.forEach((id) => adj.set(id, []));
  edges.forEach((e) => { adj.get(e.source_node_id)?.push(e.target_node_id); adj.get(e.target_node_id)?.push(e.source_node_id); });
  const label = new Map<string, number>(nodeIds.map((id, i) => [id, i]));
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const order = nodeIds.slice();
  for (let it = 0; it < iterations; it++) {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    let changed = 0;
    for (const id of order) {
      const counts = new Map<number, number>();
      for (const nb of adj.get(id) || []) { const l = label.get(nb)!; counts.set(l, (counts.get(l) || 0) + 1); }
      if (!counts.size) continue;
      let best = label.get(id)!, bestN = -1;
      counts.forEach((n, l) => { if (n > bestN || (n === bestN && l < best)) { best = l; bestN = n; } });
      if (best !== label.get(id)) { label.set(id, best); changed++; }
    }
    if (!changed) break;
  }
  // renumber communities 0..k-1 by size
  const sizes = new Map<number, number>();
  label.forEach((l) => sizes.set(l, (sizes.get(l) || 0) + 1));
  const rank = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
  const idx = new Map(rank.map((l, i) => [l, i]));
  const out = new Map<string, number>();
  label.forEach((l, id) => out.set(id, idx.get(l)!));
  return out;
}

export const COMMUNITY_COLORS = ["#1b5e4e", "#7d7a9c", "#17948a", "#8fa0b3", "#e8c33e", "#e2841e", "#a3a13a", "#7a2027", "#1e3a5c", "#5a5a5a", "#8659d6", "#d9445f"];
