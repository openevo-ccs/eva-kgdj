import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type cytoscape from "cytoscape";
import type { Core } from "cytoscape";
import { GraphCanvas, type LayoutName } from "../components/GraphCanvas";
import { NodeDrawer } from "../components/NodeDrawer";
import { useApi, useSession } from "../state/session";
import type { GraphEdge, GraphNode } from "../lib/types";
import { COMMUNITY_COLORS, labelPropagation } from "../lib/analytics";

export default function ExplorerPage() {
  const api = useApi(); const { departments, deptById } = useSession();
  const { nodeId } = useParams(); const nav = useNavigate();
  const [nodes, setNodes] = useState<GraphNode[]>([]); const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [depts, setDepts] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set(["canonical", "proposed"]));
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [layout, setLayout] = useState<LayoutName>("cose");
  const [analysis, setAnalysis] = useState<"none" | "degree" | "communities" | "path">("none");
  const [pathFrom, setPathFrom] = useState<string | null>(null);
  const [path, setPath] = useState<string[] | null>(null);
  const [degreeTop, setDegreeTop] = useState<{ id: string; label: string; d: number }[]>([]);
  const cyRef = useRef<Core | null>(null);
  const [version, setVersion] = useState(0);

  const reload = () => api.graph().then((g) => { setNodes(g.nodes); setEdges(g.edges); });
  useEffect(() => { reload(); }, [version]);
  useEffect(() => { if (departments.length && !depts.size) setDepts(new Set(departments.map((d) => d.id))); }, [departments]);
  const allTypes = useMemo(() => [...new Set(nodes.map((n) => n.type_code))].sort(), [nodes]);
  useEffect(() => { if (allTypes.length && !types.size) setTypes(new Set(allTypes)); }, [allTypes]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    const vn = nodes.filter((n) => statuses.has(n.status) && types.has(n.type_code) && (!n.department_id || depts.has(n.department_id)) && (!s || n.label.toLowerCase().includes(s) || n.description.toLowerCase().includes(s) || n.tags.some((t) => t.toLowerCase().includes(s))));
    const ids = new Set(vn.map((n) => n.id));
    return { nodes: vn, edges: edges.filter((e) => ids.has(e.source_node_id) && ids.has(e.target_node_id) && statuses.has(e.status)) };
  }, [nodes, edges, depts, statuses, types, q]);
  const nodesById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const communities = useMemo(() => analysis === "communities" ? labelPropagation(visible.nodes.map((n) => n.id), visible.edges) : null, [analysis, visible]);

  useEffect(() => {
    if (analysis !== "degree" || !cyRef.current) { setDegreeTop([]); return; }
    const cy = cyRef.current; const dc = cy.elements().degreeCentralityNormalized({ directed: false, weight: () => 1 }) as unknown as { degree: (n: cytoscape.NodeSingular) => number };
    const rows = cy.nodes().map((n) => ({ id: n.id(), label: n.data("label") as string, d: Math.round(dc.degree(n) * 1000) / 1000 })).sort((a, b) => b.d - a.d).slice(0, 12);
    setDegreeTop(rows);
  }, [analysis, visible]);

  const select = (id: string | null) => {
    if (analysis === "path" && id) {
      if (!pathFrom) { setPathFrom(id); setPath(null); return; }
      const cy = cyRef.current; if (cy) { const res = cy.elements().dijkstra({ root: `#${pathFrom}`, directed: false, weight: () => 1 }); const p = res.pathTo(cy.getElementById(id)); setPath(p.nodes().map((n) => n.id())); }
      setPathFrom(null); return;
    }
    nav(id ? `/explore/${id}` : "/explore");
  };
  const toggle = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); setter(n); };
  const commCount = communities ? new Set(communities.values()).size : 0;

  return (
    <div className="explorer" style={{ flex: 1, minWidth: 0 }}>
      <div className="toolbar">
        <input type="search" placeholder="Search nodes…" value={q} onChange={(e) => setQ(e.target.value)} />
        {departments.map((d) => <label key={d.id}><input type="checkbox" checked={depts.has(d.id)} onChange={() => toggle(depts, d.id, setDepts)} /><span className="dept-sw" style={{ background: d.color_hex || "#999" }} />{d.abbr}</label>)}
        <span className="muted">|</span>
        {["canonical", "proposed"].map((s) => <label key={s}><input type="checkbox" checked={statuses.has(s)} onChange={() => toggle(statuses, s, setStatuses)} />{s}</label>)}
        <span className="muted">|</span>
        {allTypes.map((t) => <label key={t}><input type="checkbox" checked={types.has(t)} onChange={() => toggle(types, t, setTypes)} />{t}</label>)}
        <span className="muted">|</span>
        <select value={layout} onChange={(e) => setLayout(e.target.value as LayoutName)} title="Layout"><option value="cose">cose (organic)</option><option value="dagre">dagre (hierarchical)</option><option value="concentric">concentric (by degree)</option><option value="grid">grid</option></select>
        <select value={analysis} onChange={(e) => { setAnalysis(e.target.value as typeof analysis); setPath(null); setPathFrom(null); }} title="Graph analysis"><option value="none">analysis: none</option><option value="degree">degree centrality</option><option value="communities">communities (label propagation)</option><option value="path">shortest path (click two nodes)</option></select>
        <span className="muted">{visible.nodes.length} nodes · {visible.edges.length} edges</span>
      </div>
      <div className="explorer-body">
        <div className="graph-host">
          <GraphCanvas nodes={visible.nodes} edges={visible.edges} deptById={deptById} layout={layout} selectedId={nodeId ?? null} onSelect={select}
            communities={communities} communityColors={COMMUNITY_COLORS} highlightPath={path} sizeByDegree={analysis === "degree"} onReady={(cy) => { cyRef.current = cy; }} />
          <div className="legend">
            <span><span className="dept-sw" style={{ background: "#fff", border: "2px solid #1a6b46" }} />canonical</span>
            <span><span className="dept-sw" style={{ background: "#fff", border: "2px dashed #7a4d9c" }} />proposed / pending review</span>
            <span><span className="dept-sw" style={{ background: "#fff", border: "3px double #7a2027" }} />student-authored (approved)</span>
            {analysis === "communities" && <span>{commCount} communities</span>}
            {analysis === "path" && <span>{pathFrom ? "now click the target node" : path ? `path: ${path.length - 1} steps` : "click the start node"}</span>}
          </div>
          {analysis === "degree" && degreeTop.length > 0 && (
            <div className="legend" style={{ left: "auto", right: 10, bottom: 10, flexDirection: "column", alignItems: "stretch", gap: 2 }}>
              <b style={{ fontSize: 11 }}>Degree centrality (top 12)</b>
              {degreeTop.map((r) => <span key={r.id} style={{ cursor: "pointer" }} onClick={() => nav(`/explore/${r.id}`)}>{r.d.toFixed(3)} · {r.label}</span>)}
            </div>
          )}
        </div>
        {nodeId ? <NodeDrawer nodeId={nodeId} nodesById={nodesById} onClose={() => nav("/explore")} onChanged={() => setVersion((v) => v + 1)} />
          : <div className="drawer"><h2>Canonical graph explorer</h2><p className="muted">Click a node for its description, citations, reviews and open proposals; fork it into your portfolio; or propose a change. Dashed nodes are the imported seed awaiting review — every one of the 306 needs identified reviewers before an editor promotes it.</p></div>}
      </div>
    </div>
  );
}
