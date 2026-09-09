// Card-based alternative to the graph canvas: one card per node, browsable without the
// physics/zoom/pan overhead of Cytoscape — useful when a student wants to read through a
// filtered set of nodes rather than navigate them spatially. Deliberately reuses whatever
// nodes/edges the caller already has in memory (Explorer's `visible`, Portfolio's `composite`)
// and opens the same node drawer/panel a graph click would — this is a second way to reach
// the same detail view, not a second data path or a second editing surface.
import type { Department, GraphEdge, GraphNode } from "../lib/types";
import { DeptSwatch, StatusChip } from "./Chips";

export interface NodeCardsProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  deptById: Record<string, Department>;
  onOpen: (id: string) => void;
  annotationOf?: (id: string) => string | undefined;
  inPortfolioIds?: Set<string>;
}

export function NodeCards({ nodes, edges, deptById, onOpen, annotationOf, inPortfolioIds }: NodeCardsProps) {
  const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]));
  if (!nodes.length) return <p className="muted" style={{ padding: 12 }}>Nothing matches the current filters.</p>;
  return (
    <div className="node-cards">
      {nodes.map((n) => {
        const dept = n.department_id ? deptById[n.department_id] : null;
        const conns = edges.filter((e) => e.source_node_id === n.id || e.target_node_id === n.id);
        const annotation = annotationOf?.(n.id);
        return (
          <div className="node-card" key={n.id}>
            <div className="node-card-head">
              <DeptSwatch dept={dept} />
              <b>{n.label}</b>
            </div>
            <div className="row" style={{ marginTop: 4, marginBottom: 6 }}>
              <StatusChip status={n.status} />
              <span className="chip">{n.type_code}</span>
              {dept && <span className="chip">{dept.abbr}</span>}
              {n.provenance?.shared ? <span className="chip" style={{ color: "#e2841e", borderColor: "#f0d3a8" }}>shared</span> : null}
              {inPortfolioIds?.has(n.id) && <span className="chip chip-verified">in your portfolio</span>}
            </div>
            <details className="node-card-section" open={n.description.length > 0 && n.description.length < 180}>
              <summary>Description</summary>
              <p>{n.description || <span className="muted">No description.</span>}</p>
            </details>
            {annotation !== undefined && (
              <details className="node-card-section" open={annotation.length > 0}>
                <summary>Your note</summary>
                <p>{annotation || <span className="muted">Not annotated yet.</span>}</p>
              </details>
            )}
            <details className="node-card-section">
              <summary>Connections ({conns.length})</summary>
              {conns.length ? (
                <ul>
                  {conns.slice(0, 12).map((e) => {
                    const other = e.source_node_id === n.id ? e.target_node_id : e.source_node_id;
                    const o = nodesById[other];
                    return <li key={e.id}>{e.source_node_id === n.id ? "→" : "←"} {e.relationship_code} — {o ? o.label : other}</li>;
                  })}
                </ul>
              ) : <p className="muted">None among the currently visible nodes.</p>}
            </details>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn btn-mini" onClick={() => onOpen(n.id)}>Open →</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Small "graph | cards" segmented toggle shared by Explorer and Portfolio toolbars.
export function ViewToggle({ view, onChange }: { view: "graph" | "cards"; onChange: (v: "graph" | "cards") => void }) {
  return (
    <span className="seg" role="group" aria-label="View">
      <span className="seg-label">view</span>
      <button className={view === "graph" ? "active" : ""} onClick={() => onChange("graph")}>graph</button>
      <button className={view === "cards" ? "active" : ""} onClick={() => onChange("cards")}>cards</button>
    </span>
  );
}
