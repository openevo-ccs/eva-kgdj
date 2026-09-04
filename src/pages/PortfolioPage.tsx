import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Core } from "cytoscape";
import { GraphCanvas } from "../components/GraphCanvas";
import { ReviewForm, ReviewList } from "../components/ReviewPanel";
import { useApi, useSession } from "../state/session";
import type { GraphEdge, GraphNode, PrivateNode, PrivateNodeType, Subgraph, SubgraphLink, SubgraphNode, Visibility } from "../lib/types";

const PRIVATE_COLORS: Record<PrivateNodeType, string> = { self: "#7a2027", question: "#8659d6", resource: "#1f5f9c", theory: "#d9445f", method: "#e2833f" };

export default function PortfolioPage() {
  const api = useApi(); const { profile, deptById, myModules } = useSession(); const { id } = useParams(); const nav = useNavigate();
  const [list, setList] = useState<Subgraph[]>([]);
  const [data, setData] = useState<{ subgraph: Subgraph; nodes: SubgraphNode[]; privateNodes: PrivateNode[]; links: SubgraphLink[]; reviews: import("../lib/types").Review[] } | null>(null);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [title, setTitle] = useState("My orientation graph");
  const [pn, setPn] = useState<{ type: PrivateNodeType; label: string; source: string; week: string }>({ type: "question", label: "", source: "", week: "" });
  const [link, setLink] = useState<{ from: string; to: string; why: string; lens: string; week: string }>({ from: "", to: "", why: "", lens: "", week: "" });
  const [shareWith, setShareWith] = useState(""); const [err, setErr] = useState<string | null>(null);
  const [cy, setCy] = useState<Core | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const loadList = () => api.subgraphs().then(setList);
  const load = () => { if (id) api.subgraph(id).then(setData).catch((e) => setErr((e as Error).message)); };
  useEffect(() => { loadList(); api.graph().then(setGraph); }, []);
  useEffect(() => { setData(null); setErr(null); load(); }, [id]);
  const mine = data?.subgraph.owner_id === profile?.id;

  // Composite graph: forked canonical nodes + private nodes + the student's own links (+ canonical edges among forked nodes, dimmed via status)
  const composite = useMemo(() => {
    if (!data) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    const byId = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));
    const nodes: GraphNode[] = data.nodes.map((sn) => byId[sn.node_id]).filter(Boolean).map((n) => ({ ...n }));
    for (const p of data.privateNodes) nodes.push({ id: p.id, slug: p.id, label: p.label, type_code: p.node_type, description: p.source || "", department_id: null, status: "canonical", external_ids: {}, provenance: { source: "student" }, tags: [], version: 1, created_by: null, created_at: "", updated_at: "", canonical_since: null });
    const ids = new Set(nodes.map((n) => n.id));
    const edges: GraphEdge[] = data.links.map((l) => ({ id: l.id, source_node_id: (l.from_node_id || l.from_private_id)!, target_node_id: (l.to_node_id || l.to_private_id)!, relationship_code: l.lens ? `[${l.lens}] ${l.why.slice(0, 40)}` : l.why.slice(0, 40), label: l.why, weight: 3, status: "canonical", provenance: {}, version: 1, created_by: null, created_at: "", updated_at: "", canonical_since: null }));
    for (const e of graph.edges) if (ids.has(e.source_node_id) && ids.has(e.target_node_id)) edges.push({ ...e, status: "proposed" });
    return { nodes, edges: edges.filter((e) => ids.has(e.source_node_id) && ids.has(e.target_node_id)) };
  }, [data, graph]);
  const deptByIdWithPrivate = useMemo(() => { const d = { ...deptById }; for (const [t, c] of Object.entries(PRIVATE_COLORS)) d[`priv-${t}`] = { id: `priv-${t}`, code: t, name: t, abbr: t, color_hex: c }; return d; }, [deptById]);
  const compositeNodes = useMemo(() => composite.nodes.map((n) => n.provenance?.source === "student" ? { ...n, department_id: `priv-${n.type_code}` } : n), [composite]);
  const allTargets = useMemo(() => [...(data?.nodes.map((sn) => ({ id: sn.node_id, label: graph.nodes.find((n) => n.id === sn.node_id)?.label || sn.node_id, priv: false })) || []), ...(data?.privateNodes.map((p) => ({ id: p.id, label: p.label, priv: true })) || [])], [data, graph]);

  const savePositions = async () => { if (!cy || !data) return; const pos = cy.nodes().map((n) => { const p = n.position(); const priv = data.privateNodes.some((x) => x.id === n.id()); return priv ? { private_id: n.id(), x: p.x, y: p.y } : { node_id: n.id(), x: p.x, y: p.y }; }); await api.savePositions(data.subgraph.id, pos); };
  const addPrivate = async () => { if (!data) return; await api.addPrivateNode(data.subgraph.id, pn.type, pn.label, pn.source || null, pn.week ? Number(pn.week) : null); setPn({ ...pn, label: "", source: "" }); load(); };
  const addLink = async () => {
    if (!data) return; setErr(null);
    const f = allTargets.find((t) => t.id === link.from), t = allTargets.find((x) => x.id === link.to); if (!f || !t) return;
    try { await api.addLink({ subgraph_id: data.subgraph.id, from_node_id: f.priv ? null : f.id, from_private_id: f.priv ? f.id : null, to_node_id: t.priv ? null : t.id, to_private_id: t.priv ? t.id : null, why: link.why, lens: link.lens || null, created_week: link.week ? Number(link.week) : null }); setLink({ ...link, why: "" }); load(); } catch (e) { setErr((e as Error).message); }
  };

  if (!id) return (
    <div className="page page-narrow">
      <h1>Portfolios</h1>
      <p className="muted">Your orientation graph for the module: fork canonical nodes, add your own questions and resources, and write one sentence per connection — "I'm connecting ___ to ___, because ___". Private by default; share with classmates for critique; your module's instructor can always see it.</p>
      <form className="row" onSubmit={async (e) => { e.preventDefault(); const g = await api.createSubgraph(title, myModules[0]?.module.id ?? null); nav(`/portfolio/${g.id}`); }}><input value={title} onChange={(e) => setTitle(e.target.value)} /><button className="btn btn-primary">Create portfolio</button></form>
      <table style={{ marginTop: 12 }}><thead><tr><th>Title</th><th>Owner</th><th>Visibility</th><th>Created</th></tr></thead><tbody>{list.map((g) => <tr key={g.id}><td><Link to={`/portfolio/${g.id}`}>{g.title}</Link></td><td>{g.owner_id === profile?.id ? "you" : "member"}</td><td>{g.visibility}</td><td className="muted">{new Date(g.created_at).toLocaleDateString()}</td></tr>)}{!list.length && <tr><td colSpan={4} className="muted">No portfolios visible to you yet.</td></tr>}</tbody></table>
    </div>
  );
  if (!data) return <div className="page">{err ? <div className="notice notice-bad">{err}</div> : <span className="muted">Loading…</span>}</div>;
  return (
    <div className="explorer" style={{ flex: 1, minWidth: 0 }}>
      <div className="toolbar">
        <Link to="/portfolio" className="btn">← portfolios</Link><b>{data.subgraph.title}</b><span className="muted">{data.nodes.length} canonical · {data.privateNodes.length} own · {data.links.length} connections</span>
        {mine && <><select value={data.subgraph.visibility} onChange={async (e) => { await api.setVisibility(data.subgraph.id, e.target.value as Visibility); load(); }}><option value="private">private</option><option value="shared">shared (listed people)</option><option value="module">module</option><option value="members">all members</option></select>
          <input placeholder="share with username" value={shareWith} onChange={(e) => setShareWith(e.target.value)} style={{ width: 160 }} /><button className="btn" onClick={async () => { try { await api.share(data.subgraph.id, shareWith); setShareWith(""); } catch (e) { setErr((e as Error).message); } }}>share</button>
          <button className="btn" onClick={savePositions}>save layout</button></>}
      </div>
      <div className="explorer-body">
        <div className="graph-host">
          <GraphCanvas nodes={compositeNodes} edges={composite.edges} deptById={deptByIdWithPrivate} layout="cose" selectedId={selected} onSelect={setSelected} onReady={setCy} />
          <div className="legend">{Object.entries(PRIVATE_COLORS).map(([t, c]) => <span key={t}><span className="dept-sw" style={{ background: c }} />{t}</span>)}<span><span className="dept-sw" style={{ background: "#fff", border: "2px dashed #7a4d9c" }} />canonical edge (context)</span></div>
        </div>
        <div className="drawer">
          {err && <div className="notice notice-bad">{err}</div>}
          {mine && <>
            <h3>Add your own node</h3>
            <div className="row"><select value={pn.type} onChange={(e) => setPn({ ...pn, type: e.target.value as PrivateNodeType })}>{Object.keys(PRIVATE_COLORS).map((t) => <option key={t}>{t}</option>)}</select><input placeholder="label" value={pn.label} onChange={(e) => setPn({ ...pn, label: e.target.value })} /><input placeholder="source" value={pn.source} onChange={(e) => setPn({ ...pn, source: e.target.value })} style={{ width: 90 }} /><input placeholder="wk" value={pn.week} onChange={(e) => setPn({ ...pn, week: e.target.value })} style={{ width: 40 }} /><button className="btn" disabled={!pn.label} onClick={addPrivate}>add</button></div>
            <h3 style={{ marginTop: 12 }}>This week, I'm connecting…</h3>
            <div className="field"><select value={link.from} onChange={(e) => setLink({ ...link, from: e.target.value })}><option value="">— from —</option>{allTargets.map((t) => <option key={t.id} value={t.id}>{t.priv ? "★ " : ""}{t.label}</option>)}</select></div>
            <div className="field"><select value={link.to} onChange={(e) => setLink({ ...link, to: e.target.value })}><option value="">— to —</option>{allTargets.map((t) => <option key={t.id} value={t.id}>{t.priv ? "★ " : ""}{t.label}</option>)}</select></div>
            <div className="field"><label>because…</label><textarea rows={3} value={link.why} onChange={(e) => setLink({ ...link, why: e.target.value })} /></div>
            <div className="row"><input placeholder="lens (mechanism, evidence, theory…)" value={link.lens} onChange={(e) => setLink({ ...link, lens: e.target.value })} /><input placeholder="wk" value={link.week} onChange={(e) => setLink({ ...link, week: e.target.value })} style={{ width: 40 }} /><button className="btn btn-primary" disabled={!link.from || !link.to || link.why.length < 10} onClick={addLink}>connect</button></div>
            <p className="muted">Fork canonical nodes from the Graph tab ("fork to portfolio").</p>
          </>}
          <h3 style={{ marginTop: 12 }}>Connections</h3>
          {data.links.map((l) => { const f = allTargets.find((t) => t.id === (l.from_node_id || l.from_private_id)), t = allTargets.find((x) => x.id === (l.to_node_id || l.to_private_id)); return <div className="review" key={l.id}><b>{f?.label} → {t?.label}</b><div>{l.lens && <span className="chip">{l.lens}</span>} {l.why}</div>{l.created_week && <div className="muted">week {l.created_week}</div>}</div>; })}
          <h3 style={{ marginTop: 12 }}>Critique ({data.reviews.length})</h3>
          <ReviewList reviews={data.reviews} />
          {!mine && <ReviewForm kind="subgraph" targetId={data.subgraph.id} onDone={load} />}
        </div>
      </div>
    </div>
  );
}
