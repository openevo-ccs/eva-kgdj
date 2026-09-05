import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import type cytoscape from "cytoscape";
import type { Core } from "cytoscape";
import { GraphCanvas, connectingSubgraph, edgesAmong, fitGraph, neighbourhood, clearSelection, type LayoutName, type Selection } from "../components/GraphCanvas";
import { NodeDrawer } from "../components/NodeDrawer";
import { EdgeDrawer } from "../components/EdgeDrawer";
import { Help, Tip } from "../components/Tip";
import { useApi, useSession } from "../state/session";
import type { GraphEdge, GraphNode, Subgraph } from "../lib/types";
import { COMMUNITY_COLORS, labelPropagation } from "../lib/analytics";

type Analysis = "none" | "degree" | "communities" | "path";
const ANALYSIS: { key: Analysis; label: string; tip: string; explain: string }[] = [
  { key: "none", label: "off", tip: "No analysis overlay", explain: "" },
  { key: "degree", label: "centrality", tip: "Size each node by how many connections it has (degree centrality). The most connected nodes are listed at the right.", explain: "Node size = number of connections among the visible nodes. Bigger nodes are hubs of the visible graph; the top 12 are listed bottom-right — click one to open it." },
  { key: "communities", label: "communities", tip: "Colour nodes by cluster (label propagation): nodes that are more connected to each other than to the rest get the same colour.", explain: "Colours now show clusters found by label propagation on the visible graph, instead of departments. Clusters that cut across departments are the interesting ones." },
  { key: "path", label: "shortest path", tip: "Click a start node, then a target node, to highlight the shortest route between them.", explain: "" },
];
const LAYOUT_TIP: Record<Exclude<LayoutName, "preset">, string> = { cose: "Organic: connected nodes pull together, everything else repels.", dagre: "Hierarchical: follows edge direction left → right (good for 'grounds' / 'enables' chains).", concentric: "Rings: the most connected nodes in the centre.", grid: "Plain grid, alphabetical." };
type AddMode = "nodes" | "nodes_edges" | "connecting" | "neighbourhood";

export default function ExplorerPage() {
  const api = useApi(); const { departments, deptById, profile, myModules } = useSession();
  const { nodeId } = useParams(); const nav = useNavigate(); const [sp] = useSearchParams();
  const edgeId = sp.get("edge");
  const [nodes, setNodes] = useState<GraphNode[]>([]); const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [depts, setDepts] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set(["canonical", "proposed"]));
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [layout, setLayout] = useState<LayoutName>("cose");
  const [analysis, setAnalysis] = useState<Analysis>("none");
  const [pathFrom, setPathFrom] = useState<string | null>(null);
  const [path, setPath] = useState<string[] | null>(null);
  const [degreeTop, setDegreeTop] = useState<{ id: string; label: string; d: number }[]>([]);
  const [sel, setSel] = useState<Selection>({ nodes: [], edges: [] });
  const [addOpen, setAddOpen] = useState(false);
  const [mine, setMine] = useState<Subgraph[]>([]); const [target, setTarget] = useState<string>("new"); const [newTitle, setNewTitle] = useState("My orientation graph"); const [week, setWeek] = useState<number | "">("");
  const [myNodeIds, setMyNodeIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ kind: "ok" | "bad"; text: string; link?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cyRef = useRef<Core | null>(null);
  const [version, setVersion] = useState(0);

  const reload = () => api.graph().then((g) => { setNodes(g.nodes); setEdges(g.edges); });
  const loadMine = async () => { const gs = (await api.subgraphs()).filter((g) => g.owner_id === profile?.id); setMine(gs); if (gs.length && target === "new") setTarget(gs[0].id); const ids = new Set<string>(); for (const g of gs) { const d = await api.subgraph(g.id); d.nodes.forEach((n) => ids.add(n.node_id)); } setMyNodeIds(ids); };
  useEffect(() => { reload(); }, [version]);
  useEffect(() => { loadMine(); }, []);
  useEffect(() => { if (departments.length && !depts.size) setDepts(new Set(departments.map((d) => d.id))); }, [departments]);
  const allTypes = useMemo(() => [...new Set(nodes.map((n) => n.type_code))].sort(), [nodes]);
  useEffect(() => { if (allTypes.length && !types.size) setTypes(new Set(allTypes)); }, [allTypes]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (addOpen) setAddOpen(false); else if (sel.nodes.length + sel.edges.length) clearSelection(cyRef.current); else if (nodeId || edgeId) nav("/explore"); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [nodeId, edgeId, sel, addOpen]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    const vn = nodes.filter((n) => statuses.has(n.status) && types.has(n.type_code) && (!n.department_id || depts.has(n.department_id)) && (!s || n.label.toLowerCase().includes(s) || n.description.toLowerCase().includes(s) || n.tags.some((t) => t.toLowerCase().includes(s))));
    const ids = new Set(vn.map((n) => n.id));
    return { nodes: vn, edges: edges.filter((e) => ids.has(e.source_node_id) && ids.has(e.target_node_id) && statuses.has(e.status)) };
  }, [nodes, edges, depts, statuses, types, q]);
  const nodesById = useMemo(() => Object.fromEntries(nodes.map((n) => [n.id, n])), [nodes]);
  const edgesById = useMemo(() => Object.fromEntries(edges.map((e) => [e.id, e])), [edges]);
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
  const selectEdge = (id: string | null) => { if (analysis === "path") return; nav(id ? `/explore?edge=${id}` : "/explore"); };
  const toggle = (set: Set<string>, v: string, setter: (s: Set<string>) => void) => { const n = new Set(set); n.has(v) ? n.delete(v) : n.add(v); setter(n); };
  const commCount = communities ? new Set(communities.values()).size : 0;
  const multi = sel.nodes.length + sel.edges.length > 1 || sel.edges.length > 0;

  // ---- add selection to my portfolio ------------------------------------------------
  const preview = (mode: AddMode): Selection => {
    const cy = cyRef.current; if (!cy) return { nodes: [], edges: [] };
    const base = new Set(sel.nodes); sel.edges.forEach((id) => { const e = edgesById[id]; if (e) { base.add(e.source_node_id); base.add(e.target_node_id); } });
    const ns = [...base];
    if (mode === "nodes") return { nodes: ns, edges: [] };
    if (mode === "nodes_edges") return { nodes: ns, edges: [...new Set([...sel.edges, ...edgesAmong(cy, ns)])] };
    if (mode === "connecting") { const c = connectingSubgraph(cy, ns); return { nodes: c.nodes, edges: [...new Set([...c.edges, ...edgesAmong(cy, c.nodes)])] }; }
    return neighbourhood(cy, ns);
  };
  const addToPortfolio = async (mode: AddMode) => {
    setBusy(true); setNotice(null);
    try {
      const what = preview(mode);
      let gid = target; let title = mine.find((g) => g.id === gid)?.title || newTitle;
      if (gid === "new" || !mine.some((g) => g.id === gid)) { const g = await api.createSubgraph(newTitle, myModules[0]?.module.id ?? null); gid = g.id; title = g.title; }
      const current = await api.subgraph(gid);
      const have = new Set(current.nodes.map((n) => n.node_id)); const haveEdges = new Set(current.links.map((l) => l.edge_id).filter(Boolean));
      const wk = week === "" ? null : Number(week);
      const newNodes = what.nodes.filter((id) => !have.has(id));
      await api.forkNodes(gid, newNodes.map((id) => ({ node_id: id, annotation: "", week: wk })));
      const newEdges = what.edges.map((id) => edgesById[id]).filter((e) => e && !haveEdges.has(e.id));
      await api.addLinks(newEdges.map((e) => ({ subgraph_id: gid, from_node_id: e.source_node_id, from_private_id: null, to_node_id: e.target_node_id, to_private_id: null, edge_id: e.id, lens: "canonical", created_week: wk,
        why: `Canonical relationship: ${e.relationship_code}${e.label ? ` — ${e.label}` : ""}. (Rewrite this in your own words: why does this connection matter to you?)` })));
      setNotice({ kind: "ok", text: `Added ${newNodes.length} node${newNodes.length === 1 ? "" : "s"} and ${newEdges.length} connection${newEdges.length === 1 ? "" : "s"} to "${title}"${what.nodes.length - newNodes.length ? ` (${what.nodes.length - newNodes.length} already there)` : ""}.`, link: `/portfolio/${gid}` });
      setAddOpen(false); clearSelection(cyRef.current); loadMine();
    } catch (e) { setNotice({ kind: "bad", text: (e as Error).message }); } finally { setBusy(false); }
  };
  const counts = (mode: AddMode) => { const p = preview(mode); return `${p.nodes.length} node${p.nodes.length === 1 ? "" : "s"}${p.edges.length ? `, ${p.edges.length} edge${p.edges.length === 1 ? "" : "s"}` : ""}`; };
  const active = ANALYSIS.find((a) => a.key === analysis)!;

  return (
    <div className="explorer" style={{ flex: 1, minWidth: 0 }}>
      <div className="toolbar" data-tour="filters">
        <Tip text="Search labels, descriptions and tags of the visible nodes"><input type="search" placeholder="Search nodes…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search nodes" /></Tip>
        {departments.map((d) => <Tip key={d.id} text={`${d.name}: show or hide its nodes`}><label><input type="checkbox" checked={depts.has(d.id)} onChange={() => toggle(depts, d.id, setDepts)} /><span className="dept-sw" style={{ background: d.color_hex || "#999" }} />{d.abbr}</label></Tip>)}
        <span className="muted">|</span>
        {["canonical", "proposed"].map((s) => <Tip key={s} text={s === "canonical" ? "Nodes and edges an editor has promoted after identified review" : "Imported seed and submitted proposals still awaiting review (drawn dashed)"}><label><input type="checkbox" checked={statuses.has(s)} onChange={() => toggle(statuses, s, setStatuses)} />{s}</label></Tip>)}
        <span className="muted">|</span>
        {allTypes.map((t) => <Tip key={t} text={`Show or hide nodes of type "${t}"`}><label><input type="checkbox" checked={types.has(t)} onChange={() => toggle(types, t, setTypes)} />{t}</label></Tip>)}
        <span className="muted">|</span>
        <span data-tour="layout" className="row" style={{ gap: 6 }}>
          <Tip text={LAYOUT_TIP[layout as Exclude<LayoutName, "preset">] || "Layout"}><select value={layout} onChange={(e) => setLayout(e.target.value as LayoutName)} aria-label="Layout"><option value="cose">layout: organic</option><option value="dagre">layout: hierarchical</option><option value="concentric">layout: rings by degree</option><option value="grid">layout: grid</option></select></Tip>
          <span className="seg" role="group" aria-label="Graph analysis"><span className="seg-label">analysis <Help text="Analyses run on the nodes currently visible (after your filters). Centrality: node size = connections. Communities: colour = cluster. Shortest path: click two nodes." /></span>
            {ANALYSIS.map((a) => <Tip key={a.key} text={a.tip}><button className={analysis === a.key ? "active" : ""} onClick={() => { setAnalysis(a.key); setPath(null); setPathFrom(null); }}>{a.label}</button></Tip>)}
          </span>
        </span>
        <Tip text="Fit the whole graph in view (or the selection, if any)"><button className="btn" onClick={() => fitGraph(cyRef.current, true)}>Fit</button></Tip>
        <span className="muted">{visible.nodes.length} nodes · {visible.edges.length} edges</span>
      </div>
      {(active.explain || analysis === "path") && <div className="subbar">
        {analysis === "path" ? (pathFrom ? <>Start: <b>{nodesById[pathFrom]?.label}</b> — now click the target node.</> : path ? <>Shortest path highlighted: <b>{path.length - 1} steps</b> ({path.map((id) => nodesById[id]?.label).join(" → ")}). Click another start node to search again.</> : <>Click the <b>start</b> node, then the <b>target</b> node.</>) : active.explain}
      </div>}
      {multi && <div className="selbar" data-tour="selection">
        <b>{sel.nodes.length} node{sel.nodes.length === 1 ? "" : "s"} · {sel.edges.length} edge{sel.edges.length === 1 ? "" : "s"} selected</b>
        <span className="muted">Ctrl+click adds or removes; Ctrl+drag boxes; Esc clears</span>
        <span style={{ position: "relative" }}>
          <button className="btn btn-primary" onClick={() => setAddOpen(!addOpen)} aria-expanded={addOpen}>Add to my portfolio ▾</button>
          {addOpen && <div className="popover">
            <div className="field"><label>Portfolio</label><select value={target} onChange={(e) => setTarget(e.target.value)}>{mine.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}<option value="new">+ new portfolio…</option></select></div>
            {(target === "new" || !mine.length) && <div className="field"><label>Title</label><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></div>}
            <div className="field"><label>Module week (optional)</label><input type="number" min={1} max={15} value={week} onChange={(e) => setWeek(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: 80 }} /></div>
            <div className="menu">
              <button disabled={busy} onClick={() => addToPortfolio("nodes")}><b>Add selected nodes</b><span className="muted">{counts("nodes")} — endpoints of selected edges included</span></button>
              <button disabled={busy} onClick={() => addToPortfolio("nodes_edges")}><b>Add selected nodes and edges</b><span className="muted">{counts("nodes_edges")} — every canonical edge among them becomes a connection you can rewrite</span></button>
              <button disabled={busy} onClick={() => addToPortfolio("connecting")}><b>Add everything that connects the selected nodes</b><span className="muted">{counts("connecting")} — nodes and edges on the shortest paths between each pair</span></button>
              <button disabled={busy} onClick={() => addToPortfolio("neighbourhood")}><b>Add selected nodes and their neighbours</b><span className="muted">{counts("neighbourhood")} — one step out from each selected node</span></button>
            </div>
          </div>}
        </span>
        <button className="btn" onClick={() => fitGraph(cyRef.current, true)}>Fit to selection</button>
        <button className="btn" onClick={() => clearSelection(cyRef.current)}>Clear</button>
      </div>}
      {notice && <div className={`notice notice-${notice.kind}`} style={{ margin: "6px 12px 0" }}>{notice.text} {notice.link && <Link to={notice.link}>Open portfolio →</Link>} <button className="btn btn-mini" onClick={() => setNotice(null)} style={{ marginLeft: 8 }}>×</button></div>}
      <div className="explorer-body">
        <div className="graph-host" data-tour="canvas">
          <GraphCanvas nodes={visible.nodes} edges={visible.edges} deptById={deptById} layout={layout} selectedId={nodeId ?? null} onSelect={select} selectedEdgeId={edgeId} onSelectEdge={selectEdge} onSelectionChange={setSel}
            communities={communities} communityColors={COMMUNITY_COLORS} highlightPath={path} sizeByDegree={analysis === "degree"}
            onReady={(cy) => { cyRef.current = cy; if (new URLSearchParams(window.location.search).get("debug")) (window as unknown as { __cy?: Core }).__cy = cy; }} />
          <div className="legend">
            <Tip text="Promoted by an editor after identified review"><span><span className="dept-sw" style={{ background: "#fff", border: "2px solid #1a6b46" }} />canonical</span></Tip>
            <Tip text="Imported seed or submitted proposal; needs identified reviews before an editor promotes it"><span><span className="dept-sw" style={{ background: "#fff", border: "2px dashed #7a4d9c" }} />proposed / pending review</span></Tip>
            <Tip text="Created through an approved member proposal"><span><span className="dept-sw" style={{ background: "#fff", border: "3px double #7a2027" }} />member-authored (approved)</span></Tip>
            {analysis === "communities" && <span>{commCount} communities</span>}
            <span className="muted">Ctrl+click: multi-select · scroll: zoom · drag: pan</span>
          </div>
          {analysis === "degree" && degreeTop.length > 0 && (
            <div className="legend" style={{ left: "auto", right: 10, bottom: 10, flexDirection: "column", alignItems: "stretch", gap: 2 }}>
              <b style={{ fontSize: 11 }}>Most connected (top 12) <Help text="Normalised degree centrality among the visible nodes: 1.0 would mean connected to every other visible node." /></b>
              {degreeTop.map((r) => <span key={r.id} style={{ cursor: "pointer" }} onClick={() => nav(`/explore/${r.id}`)}>{r.d.toFixed(3)} · {r.label}</span>)}
            </div>
          )}
        </div>
        <div data-tour="drawer" style={{ display: "contents" }}>
          {nodeId ? <NodeDrawer nodeId={nodeId} nodesById={nodesById} inPortfolio={myNodeIds.has(nodeId)} onClose={() => nav("/explore")} onChanged={() => { setVersion((v) => v + 1); loadMine(); }} />
            : edgeId ? <EdgeDrawer edgeId={edgeId} onClose={() => nav("/explore")} onChanged={() => setVersion((v) => v + 1)} />
            : <div className="drawer"><h2>Canonical graph explorer</h2>
                <p className="muted">Click a node for its description, citations, reviews and open proposals; add it to your portfolio; or propose a change. Click an edge to see and review the relationship.</p>
                <p className="muted">Dashed nodes are the imported seed awaiting review — each needs identified reviewers before an editor promotes it. Hold <b>Ctrl</b> to select several nodes and edges, then use <b>Add to my portfolio</b>.</p>
                {mine.length > 0 && <p className="muted">Nodes already in one of your portfolios: <b>{myNodeIds.size}</b>. <Link to="/portfolio">Open portfolios →</Link></p>}
              </div>}
        </div>
      </div>
    </div>
  );
}
