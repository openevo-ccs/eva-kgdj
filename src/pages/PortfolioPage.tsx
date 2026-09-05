import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Core } from "cytoscape";
import { GraphCanvas, fitGraph } from "../components/GraphCanvas";
import { ReviewForm, ReviewList } from "../components/ReviewPanel";
import { Help, Tip } from "../components/Tip";
import { useApi, useSession } from "../state/session";
import type { CohortStats, GraphEdge, GraphNode, PrivateNodeType, Subgraph, SubgraphDetail, SubgraphLink, Visibility } from "../lib/types";
import { PRIVATE_TYPE_HELP } from "../lib/types";
import { backedUpThisSession, buildBackup, downloadText, lastBackupAt, noteBackup, parseBackup, safeFilename } from "../lib/backup";
import { buildReportHtml, portfolioMetrics } from "../lib/report";

const PRIVATE_COLORS: Record<PrivateNodeType, string> = { self: "#7a2027", question: "#8659d6", resource: "#1f5f9c", theory: "#d9445f", method: "#e2833f" };
const VIS_TIP: Record<Visibility, string> = { private: "Only you (and your module's instructor) can open it", shared: "You, your instructor, and the people you list below", module: "Everyone in your module", members: "Every KGDJ member" };
const DEFAULT_WHY = "Canonical relationship:";
const ago = (d: Date | null) => { if (!d) return "never"; const m = Math.round((Date.now() - d.getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export default function PortfolioPage() {
  const api = useApi(); const { profile, deptById, myModules } = useSession(); const { id } = useParams(); const nav = useNavigate();
  const [list, setList] = useState<Subgraph[]>([]);
  const [data, setData] = useState<SubgraphDetail | null>(null);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [title, setTitle] = useState("My orientation graph");
  const [pn, setPn] = useState<{ type: PrivateNodeType; label: string; source: string; week: string }>({ type: "question", label: "", source: "", week: "" });
  const [link, setLink] = useState<{ from: string; to: string; why: string; lens: string; week: string }>({ from: "", to: "", why: "", lens: "", week: "" });
  const [shareWith, setShareWith] = useState(""); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null);
  const [cy, setCy] = useState<Core | null>(null);
  const [selected, setSelected] = useState<string | null>(null); const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [, setBackupTick] = useState(0); const [reportBusy, setReportBusy] = useState(false);
  const pending = useRef<Record<string, { x: number; y: number }>>({}); const saveTimer = useRef<number | null>(null);
  const loadList = () => api.subgraphs().then(setList);
  const load = () => { if (id) api.subgraph(id).then(setData).catch((e) => setErr((e as Error).message)); };
  useEffect(() => { loadList(); api.graph().then(setGraph); }, []);
  useEffect(() => { setData(null); setErr(null); setOk(null); setSelected(null); setSelectedEdge(null); load(); }, [id]);
  const mine = data?.subgraph.owner_id === profile?.id;
  const nodesById = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.id, n])), [graph]);

  // Composite graph: forked canonical nodes + private nodes + the student's own links (+ canonical edges among forked nodes as dashed context)
  const composite = useMemo(() => {
    if (!data) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    const nodes: GraphNode[] = data.nodes.map((sn) => nodesById[sn.node_id]).filter(Boolean).map((n) => ({ ...n }));
    for (const p of data.privateNodes) nodes.push({ id: p.id, slug: p.id, label: p.label, type_code: p.node_type, description: p.source || "", department_id: `priv-${p.node_type}`, status: "canonical", external_ids: {}, provenance: { source: "student" }, tags: [], version: 1, created_by: null, created_at: "", updated_at: "", canonical_since: null });
    const ids = new Set(nodes.map((n) => n.id));
    const adopted = new Set(data.links.map((l) => l.edge_id).filter(Boolean));
    const edges: GraphEdge[] = data.links.map((l) => ({ id: l.id, source_node_id: (l.from_node_id || l.from_private_id)!, target_node_id: (l.to_node_id || l.to_private_id)!, relationship_code: l.lens ? `[${l.lens}] ${l.why.slice(0, 40)}` : l.why.slice(0, 40), label: l.why, weight: 3, status: "canonical", provenance: { adopted: l.edge_id ? 1 : 0 }, version: 1, created_by: null, created_at: "", updated_at: "", canonical_since: null }));
    for (const e of graph.edges) if (ids.has(e.source_node_id) && ids.has(e.target_node_id) && !adopted.has(e.id)) edges.push({ ...e, status: "proposed" });
    return { nodes, edges: edges.filter((e) => ids.has(e.source_node_id) && ids.has(e.target_node_id)) };
  }, [data, graph]);
  const deptByIdWithPrivate = useMemo(() => { const d = { ...deptById }; for (const [t, c] of Object.entries(PRIVATE_COLORS)) d[`priv-${t}`] = { id: `priv-${t}`, code: t, name: t, abbr: t, color_hex: c }; return d; }, [deptById]);
  const positions = useMemo(() => { const p: Record<string, { x: number; y: number }> = {}; data?.nodes.forEach((n) => { if (n.pos_x != null && n.pos_y != null) p[n.node_id] = { x: n.pos_x, y: n.pos_y }; }); data?.privateNodes.forEach((n) => { if (n.pos_x != null && n.pos_y != null) p[n.id] = { x: n.pos_x, y: n.pos_y }; }); return p; }, [data]);
  const allTargets = useMemo(() => [...(data?.nodes.map((sn) => ({ id: sn.node_id, label: nodesById[sn.node_id]?.label || sn.node_id, priv: false })) || []), ...(data?.privateNodes.map((p) => ({ id: p.id, label: p.label, priv: true })) || [])], [data, graph]);
  const labelOf = (nid: string | null) => (nid ? allTargets.find((t) => t.id === nid)?.label ?? nodesById[nid]?.label ?? nid : "");

  // autosave positions after a drag (debounced)
  const onDragEnd = (nid: string, x: number, y: number) => {
    if (!mine || !data) return; pending.current[nid] = { x, y };
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => { const pos = Object.entries(pending.current).map(([k, v]) => data.privateNodes.some((p) => p.id === k) ? { private_id: k, ...v } : { node_id: k, ...v }); pending.current = {}; await api.savePositions(data.subgraph.id, pos); }, 800);
  };
  const addPrivate = async () => { if (!data) return; await api.addPrivateNode(data.subgraph.id, pn.type, pn.label, pn.source || null, pn.week ? Number(pn.week) : null); setPn({ ...pn, label: "", source: "" }); load(); };
  const addLink = async () => {
    if (!data) return; setErr(null);
    const f = allTargets.find((t) => t.id === link.from), t = allTargets.find((x) => x.id === link.to); if (!f || !t) return;
    try { await api.addLink({ subgraph_id: data.subgraph.id, from_node_id: f.priv ? null : f.id, from_private_id: f.priv ? f.id : null, to_node_id: t.priv ? null : t.id, to_private_id: t.priv ? t.id : null, why: link.why, lens: link.lens || null, created_week: link.week ? Number(link.week) : null, edge_id: null }); setLink({ ...link, why: "" }); load(); } catch (e) { setErr((e as Error).message); }
  };
  const doBackup = () => { if (!data) return; const b = buildBackup(data, nodesById, profile?.username ?? null); downloadText(`kgdj-portfolio-${safeFilename(data.subgraph.title)}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b, null, 2)); noteBackup(data.subgraph.id); setBackupTick((t) => t + 1); setOk("Backup downloaded. Keep it with your course files."); };
  const doReport = async () => {
    if (!data) return; setReportBusy(true); setErr(null);
    try {
      const metrics = portfolioMetrics(data, nodesById);
      const cohorts: CohortStats[] = [];
      if (data.subgraph.module_id) cohorts.push(await api.cohortStats("module", data.subgraph.module_id));
      cohorts.push(await api.cohortStats("program"));
      const moduleName = myModules.find((m) => m.module.id === data.subgraph.module_id)?.module.name ?? null;
      const html = buildReportHtml({ title: data.subgraph.title, owner: profile?.username ?? "me", moduleName, generatedAt: new Date(), metrics, cohorts,
        nodes: data.nodes.map((sn) => { const n = nodesById[sn.node_id]; return { label: n?.label ?? sn.node_id, type: n?.type_code ?? "", dept: n?.department_id ? deptById[n.department_id]?.abbr ?? null : null, annotation: sn.custom_annotation }; }),
        privateNodes: data.privateNodes.map((p) => ({ label: p.label, type: p.node_type, source: p.source })),
        links: data.links.map((l) => ({ from: labelOf(l.from_node_id || l.from_private_id), to: labelOf(l.to_node_id || l.to_private_id), why: l.why, lens: l.lens, week: l.created_week })) });
      downloadText(`kgdj-report-${safeFilename(data.subgraph.title)}-${new Date().toISOString().slice(0, 10)}.html`, html, "text/html");
      setOk("Report downloaded — open it in your browser or print it to PDF.");
    } catch (e) { setErr((e as Error).message); } finally { setReportBusy(false); }
  };
  const restore = async (file: File) => {
    setErr(null);
    try { const b = parseBackup(await file.text()); const g = await api.importPortfolio(b, `${b.subgraph.title} (restored ${new Date().toLocaleDateString()})`, myModules[0]?.module.id ?? b.subgraph.module_id); nav(`/portfolio/${g.id}`); } catch (e) { setErr((e as Error).message); }
  };

  if (!id) return (
    <div className="page page-narrow">
      <h1>Portfolios</h1>
      <p className="muted">Your orientation graph for the module: add canonical nodes, write your own questions and resources, and give every connection one sentence — "I'm connecting ___ to ___, because ___". Private by default; share with classmates for critique; your module's instructor can always see it.</p>
      <div className="notice"><b>Your work is yours to keep.</b> The app does not promise to store portfolios beyond the module. Download a backup at the end of every session (button in the portfolio toolbar) — you can restore it here at any time.</div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <form className="row" onSubmit={async (e) => { e.preventDefault(); const g = await api.createSubgraph(title, myModules[0]?.module.id ?? null); nav(`/portfolio/${g.id}`); }}><input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Portfolio title" /><button className="btn btn-primary">Create portfolio</button></form>
        <Tip text="Restore a portfolio from a backup file you downloaded earlier (creates a new portfolio)"><label className="btn">Restore from backup…<input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ""; }} /></label></Tip>
      </div>
      {err && <div className="notice notice-bad" style={{ marginTop: 8 }}>{err}</div>}
      <table style={{ marginTop: 12 }}><thead><tr><th>Title</th><th>Owner</th><th>Visibility</th><th>Last backup (this browser)</th><th>Created</th></tr></thead><tbody>{list.map((g) => <tr key={g.id}><td><Link to={`/portfolio/${g.id}`}>{g.title}</Link></td><td>{g.owner_id === profile?.id ? "you" : "member"}</td><td>{g.visibility}</td><td className="muted">{g.owner_id === profile?.id ? ago(lastBackupAt(g.id)) : "—"}</td><td className="muted">{new Date(g.created_at).toLocaleDateString()}</td></tr>)}{!list.length && <tr><td colSpan={5} className="muted">No portfolios visible to you yet. Create one above, or add nodes from the Graph tab.</td></tr>}</tbody></table>
    </div>
  );
  if (!data) return <div className="page">{err ? <div className="notice notice-bad">{err}</div> : <span className="muted">Loading…</span>}</div>;

  const sg = data.subgraph; const last = lastBackupAt(sg.id); const fresh = backedUpThisSession(sg.id);
  const unannotated = data.nodes.filter((n) => n.custom_annotation.trim().length < 40).length;
  const canonicalWording = data.links.filter((l) => l.why.startsWith(DEFAULT_WHY)).length;
  const selNode = selected ? data.nodes.find((n) => n.node_id === selected) : null; const selPriv = selected ? data.privateNodes.find((p) => p.id === selected) : null;
  const selLink = selectedEdge ? data.links.find((l) => l.id === selectedEdge) : null; const selCtx = selectedEdge && !selLink ? graph.edges.find((e) => e.id === selectedEdge) : null;
  const clearSel = () => { setSelected(null); setSelectedEdge(null); };

  return (
    <div className="explorer" style={{ flex: 1, minWidth: 0 }}>
      <div className="toolbar">
        <Link to="/portfolio" className="btn">← portfolios</Link>
        <b>{sg.title}</b>{mine && <Tip text="Rename"><button className="btn btn-mini" onClick={async () => { const t = prompt("Portfolio title", sg.title); if (t && t !== sg.title) { await api.updateSubgraph(sg.id, { title: t }); load(); loadList(); } }}>✎</button></Tip>}
        <span className="muted">{data.nodes.length} canonical · {data.privateNodes.length} own · {data.links.length} connections</span>
        {mine && <>
          <Tip text={VIS_TIP[sg.visibility]}><select value={sg.visibility} onChange={async (e) => { await api.setVisibility(sg.id, e.target.value as Visibility); load(); }} aria-label="Visibility"><option value="private">private</option><option value="shared">shared (listed people)</option><option value="module">module</option><option value="members">all members</option></select></Tip>
          <Tip text="Give one classmate access (and the right to critique) by username"><input placeholder="share with username" value={shareWith} onChange={(e) => setShareWith(e.target.value)} style={{ width: 150 }} /></Tip><button className="btn" onClick={async () => { try { await api.share(sg.id, shareWith); setShareWith(""); setOk(`Shared with ${shareWith}.`); } catch (e) { setErr((e as Error).message); } }}>share</button>
          <Tip text="The module week you last checked this portfolio in with your instructor"><select value={sg.last_checkpoint_week ?? ""} onChange={async (e) => { await api.updateSubgraph(sg.id, { last_checkpoint_week: e.target.value ? Number(e.target.value) : null }); load(); }} aria-label="Checkpoint week"><option value="">checkpoint: —</option>{Array.from({ length: 15 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>checkpoint: week {w}</option>)}</select></Tip>
        </>}
        <Tip text="Fit the whole portfolio in view"><button className="btn" onClick={() => fitGraph(cy)}>Fit</button></Tip>
        {mine && <span className="row" data-tour="backup" style={{ marginLeft: "auto", gap: 6 }}>
          <Tip text="Download this portfolio as a JSON file you keep yourself. Restore it from the portfolios list at any time." place="bottom"><button className={"btn " + (fresh ? "btn-ok" : "btn-warn")} onClick={doBackup}>⬇ Download backup</button></Tip>
          <Tip text="Self-contained HTML report: your portfolio's shape compared with anonymised aggregates of your module and the MSc program, plus one suggestion per dimension." place="bottom"><button className="btn" disabled={reportBusy} onClick={doReport}>{reportBusy ? "…" : "⬇ Download report"}</button></Tip>
          <span className="muted">last backup: {ago(last)}</span>
        </span>}
      </div>
      {mine && !fresh && <div className="banner">
        <b>Back up before you leave.</b> The KGDJ keeps no copies of your portfolio for you: if it is lost or you delete your account, the backup file is what remains. One click, every session.
        <button className="btn btn-primary" onClick={doBackup} style={{ marginLeft: 12 }}>Download backup now</button>
      </div>}
      {(err || ok) && <div className={`notice ${err ? "notice-bad" : "notice-ok"}`} style={{ margin: "6px 12px 0" }}>{err || ok} <button className="btn btn-mini" onClick={() => { setErr(null); setOk(null); }} style={{ marginLeft: 8 }}>×</button></div>}
      <div className="explorer-body">
        <div className="graph-host">
          <GraphCanvas nodes={composite.nodes} edges={composite.edges} deptById={deptByIdWithPrivate} layout={Object.keys(positions).length ? "preset" : "cose"} positions={positions} selectedId={selected} onSelect={(nid) => { setSelected(nid); setSelectedEdge(null); }} selectedEdgeId={selectedEdge} onSelectEdge={(eid) => { setSelectedEdge(eid); setSelected(null); }} onDragEnd={onDragEnd} onReady={setCy} />
          <div className="legend">{Object.entries(PRIVATE_COLORS).map(([t, c]) => <Tip key={t} text={PRIVATE_TYPE_HELP[t as PrivateNodeType]}><span><span className="dept-sw" style={{ background: c }} />{t}</span></Tip>)}<Tip text="Your own connection ('because' sentence)"><span><span className="dept-sw" style={{ background: "#fff", border: "2px solid #8fb8a3" }} />your connection</span></Tip><Tip text="Adopted from a canonical edge; rewrite the wording in your own words"><span><span className="dept-sw" style={{ background: "#fff", border: "2px solid #1a6b46" }} />adopted canonical edge</span></Tip><Tip text="A canonical edge between two of your nodes that you have not adopted yet — click it to adopt"><span><span className="dept-sw" style={{ background: "#fff", border: "2px dashed #7a4d9c" }} />canonical context</span></Tip>{mine && <span className="muted">drag to arrange · positions save automatically</span>}</div>
        </div>
        <div className="drawer">
          {selNode && (() => { const n = nodesById[selNode.node_id]; return <NodePanel key={selNode.node_id} label={n?.label ?? selNode.node_id} sub={`${n?.type_code ?? ""}${n?.department_id ? " · " + (deptById[n.department_id]?.abbr ?? "") : ""}`} exploreId={selNode.node_id} annotation={selNode.custom_annotation} week={selNode.added_week} mine={!!mine} onClose={clearSel}
            onSave={async (a, w) => { await api.updateAnnotation(sg.id, selNode.node_id, a, w); setOk("Annotation saved."); load(); }} onRemove={async () => { if (!confirm(`Remove "${n?.label}" (and its connections) from this portfolio?`)) return; await api.removeNode(sg.id, selNode.node_id); clearSel(); load(); }} />; })()}
          {selPriv && <PrivatePanel key={selPriv.id} node={selPriv} mine={!!mine} onClose={clearSel} onSave={async (patch) => { await api.updatePrivateNode(selPriv.id, patch); setOk("Saved."); load(); }} onRemove={async () => { if (!confirm(`Remove "${selPriv.label}" (and its connections)?`)) return; await api.removePrivateNode(selPriv.id); clearSel(); load(); }} />}
          {selLink && <LinkPanel key={selLink.id} link={selLink} from={labelOf(selLink.from_node_id || selLink.from_private_id)} to={labelOf(selLink.to_node_id || selLink.to_private_id)} mine={!!mine} onClose={clearSel} onSave={async (patch) => { try { await api.updateLink(selLink.id, patch); setOk("Connection saved."); load(); } catch (e) { setErr((e as Error).message); } }} onRemove={async () => { if (!confirm("Remove this connection?")) return; await api.removeLink(selLink.id); clearSel(); load(); }} />}
          {selCtx && <div>
            <div className="row" style={{ justifyContent: "space-between" }}><h3>Canonical edge (context)</h3><button className="btn" onClick={clearSel}>×</button></div>
            <p>{labelOf(selCtx.source_node_id)} <b>→ {selCtx.relationship_code} →</b> {labelOf(selCtx.target_node_id)}</p>
            <p className="muted">This edge exists in the canonical graph between two of your nodes. Adopting it turns it into one of your connections, which you can then rewrite in your own words.</p>
            {mine && <button className="btn btn-primary" onClick={async () => { await api.addLink({ subgraph_id: sg.id, from_node_id: selCtx.source_node_id, from_private_id: null, to_node_id: selCtx.target_node_id, to_private_id: null, edge_id: selCtx.id, lens: "canonical", created_week: null, why: `${DEFAULT_WHY} ${selCtx.relationship_code}${selCtx.label ? ` — ${selCtx.label}` : ""}. (Rewrite this in your own words: why does this connection matter to you?)` }); clearSel(); load(); }}>Adopt into my portfolio</button>}
            <p className="muted" style={{ marginTop: 8 }}><Link to={`/explore?edge=${selCtx.id}`}>Open in the canonical graph →</Link></p>
          </div>}
          {!selected && !selectedEdge && <>
            {mine && (unannotated > 0 || canonicalWording > 0 || !data.privateNodes.length || !data.links.length) && <div className="card" style={{ padding: "10px 12px" }}><b>Next steps</b> <Help text="Small nudges computed from your portfolio. They disappear as you go." /><ul className="nudges">
              {unannotated > 0 && <li>{unannotated} canonical node{unannotated === 1 ? " has" : "s have"} no real annotation yet — click a node to write one.</li>}
              {canonicalWording > 0 && <li>{canonicalWording} adopted connection{canonicalWording === 1 ? " still uses" : "s still use"} the canonical wording — click an edge and say why it matters to you.</li>}
              {!data.privateNodes.length && <li>No node of your own yet — add a question you actually have.</li>}
              {!data.links.length && <li>No connection yet — the "because" sentences are the heart of the portfolio.</li>}
            </ul></div>}
            {mine && <>
              <h3>Add your own node <Help text={Object.entries(PRIVATE_TYPE_HELP).map(([k, v]) => `${k}: ${v}`).join("\n")} /></h3>
              <div className="row"><Tip text={PRIVATE_TYPE_HELP[pn.type]}><select value={pn.type} onChange={(e) => setPn({ ...pn, type: e.target.value as PrivateNodeType })} aria-label="Node type">{Object.keys(PRIVATE_COLORS).map((t) => <option key={t}>{t}</option>)}</select></Tip><input placeholder="label" value={pn.label} onChange={(e) => setPn({ ...pn, label: e.target.value })} aria-label="Label" /><Tip text="Where it comes from (DOI, URL, lecture, …)"><input placeholder="source" value={pn.source} onChange={(e) => setPn({ ...pn, source: e.target.value })} style={{ width: 90 }} /></Tip><Tip text="Module week"><input placeholder="wk" value={pn.week} onChange={(e) => setPn({ ...pn, week: e.target.value })} style={{ width: 40 }} /></Tip><button className="btn" disabled={!pn.label} onClick={addPrivate}>add</button></div>
              <h3 style={{ marginTop: 12 }}>This week, I'm connecting… <Help text="Pick two nodes of this portfolio and say why they belong together. At least 10 characters; a good 'because' names a mechanism, a piece of evidence, or a method. The lens is an optional one-word tag for the kind of reason." /></h3>
              <div className="field"><select value={link.from} onChange={(e) => setLink({ ...link, from: e.target.value })} aria-label="From"><option value="">— from —</option>{allTargets.map((t) => <option key={t.id} value={t.id}>{t.priv ? "★ " : ""}{t.label}</option>)}</select></div>
              <div className="field"><select value={link.to} onChange={(e) => setLink({ ...link, to: e.target.value })} aria-label="To"><option value="">— to —</option>{allTargets.map((t) => <option key={t.id} value={t.id}>{t.priv ? "★ " : ""}{t.label}</option>)}</select></div>
              <div className="field"><label>because…</label><textarea rows={3} value={link.why} onChange={(e) => setLink({ ...link, why: e.target.value })} /></div>
              <div className="row"><Tip text="Optional tag: mechanism, evidence, theory, method, history…"><input placeholder="lens (mechanism, evidence, theory…)" value={link.lens} onChange={(e) => setLink({ ...link, lens: e.target.value })} /></Tip><input placeholder="wk" value={link.week} onChange={(e) => setLink({ ...link, week: e.target.value })} style={{ width: 40 }} aria-label="Week" /><button className="btn btn-primary" disabled={!link.from || !link.to || link.why.length < 10} onClick={addLink}>connect</button></div>
              <p className="muted">Add canonical nodes from the <Link to="/explore">Graph</Link> tab: open a node → "add to my portfolio", or Ctrl+click several and use the selection bar.</p>
            </>}
            <h3 style={{ marginTop: 12 }}>Connections ({data.links.length})</h3>
            {data.links.map((l) => <div className="review" key={l.id} style={{ cursor: "pointer" }} onClick={() => { setSelectedEdge(l.id); setSelected(null); }}><b>{labelOf(l.from_node_id || l.from_private_id)} → {labelOf(l.to_node_id || l.to_private_id)}</b><div>{l.lens && <span className="chip">{l.lens}</span>} {l.edge_id && <span className="chip chip-verified">adopted</span>} {l.why}</div>{l.created_week && <div className="muted">week {l.created_week}</div>}</div>)}
            {!data.links.length && <div className="muted">None yet.</div>}
            <h3 style={{ marginTop: 12 }}>Critique ({data.reviews.length}) <Help text="Classmates you shared with (and your instructor) can leave an identified critique with a rating. You cannot critique your own portfolio." /></h3>
            <ReviewList reviews={data.reviews} onChanged={load} />
            {!mine && <ReviewForm kind="subgraph" targetId={sg.id} onDone={load} />}
            {mine && <div style={{ marginTop: 18 }}><button className="btn btn-danger" onClick={async () => { if (!confirm(`Delete portfolio "${sg.title}"? Download a backup first if you want to keep it.`)) return; await api.deleteSubgraph(sg.id); nav("/portfolio"); }}>Delete this portfolio</button></div>}
          </>}
        </div>
      </div>
    </div>
  );
}

function NodePanel({ label, sub, exploreId, annotation, week, mine, onClose, onSave, onRemove }: { label: string; sub: string; exploreId: string; annotation: string; week: number | null; mine: boolean; onClose: () => void; onSave: (a: string, w: number | null) => Promise<void>; onRemove: () => Promise<void> }) {
  const [a, setA] = useState(annotation); const [w, setW] = useState<number | "">(week ?? "");
  const dirty = a !== annotation || (w === "" ? null : w) !== week;
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}><h3>{label}</h3><button className="btn" onClick={onClose} aria-label="Close">×</button></div>
      <div className="muted">{sub} · <Link to={`/explore/${exploreId}`}>open in the canonical graph →</Link></div>
      <div className="field" style={{ marginTop: 10 }}><label>Your annotation <Help text="Why this node matters to you. 40+ characters count as a real annotation." /></label><textarea rows={5} value={a} onChange={(e) => setA(e.target.value)} readOnly={!mine} placeholder={mine ? "What does this node mean for your own question?" : ""} /></div>
      <div className="row"><label className="muted">week <input type="number" min={1} max={15} value={w} onChange={(e) => setW(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: 60 }} disabled={!mine} /></label>
        {mine && <button className="btn btn-primary" disabled={!dirty} onClick={() => onSave(a, w === "" ? null : Number(w))}>Save</button>}
        {mine && <button className="btn btn-danger" onClick={onRemove}>Remove</button>}</div>
      <p className="muted" style={{ marginTop: 8 }}>{a.trim().length < 40 ? `${Math.max(0, 40 - a.trim().length)} more characters to count as annotated` : "✓ counts as annotated"}</p>
    </div>
  );
}

function PrivatePanel({ node, mine, onClose, onSave, onRemove }: { node: { id: string; node_type: PrivateNodeType; label: string; source: string | null; created_week: number | null }; mine: boolean; onClose: () => void; onSave: (p: { label?: string; source?: string | null; node_type?: PrivateNodeType; created_week?: number | null }) => Promise<void>; onRemove: () => Promise<void> }) {
  const [t, setT] = useState<PrivateNodeType>(node.node_type); const [l, setL] = useState(node.label); const [s, setS] = useState(node.source ?? ""); const [w, setW] = useState<number | "">(node.created_week ?? "");
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}><h3>★ {node.label}</h3><button className="btn" onClick={onClose} aria-label="Close">×</button></div>
      <div className="muted">your own node · {PRIVATE_TYPE_HELP[node.node_type]}</div>
      <div className="row" style={{ marginTop: 10 }}><select value={t} onChange={(e) => setT(e.target.value as PrivateNodeType)} disabled={!mine}>{Object.keys(PRIVATE_COLORS).map((x) => <option key={x}>{x}</option>)}</select><label className="muted">week <input type="number" min={1} max={15} value={w} onChange={(e) => setW(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: 60 }} disabled={!mine} /></label></div>
      <div className="field" style={{ marginTop: 8 }}><label>Label</label><input value={l} onChange={(e) => setL(e.target.value)} readOnly={!mine} /></div>
      <div className="field"><label>Source</label><input value={s} onChange={(e) => setS(e.target.value)} readOnly={!mine} placeholder="DOI, URL, lecture…" /></div>
      {mine && <div className="row"><button className="btn btn-primary" disabled={!l.trim()} onClick={() => onSave({ label: l, source: s || null, node_type: t, created_week: w === "" ? null : Number(w) })}>Save</button><button className="btn btn-danger" onClick={onRemove}>Remove</button></div>}
    </div>
  );
}

function LinkPanel({ link, from, to, mine, onClose, onSave, onRemove }: { link: SubgraphLink; from: string; to: string; mine: boolean; onClose: () => void; onSave: (p: { why?: string; lens?: string | null; created_week?: number | null }) => Promise<void>; onRemove: () => Promise<void> }) {
  const [why, setWhy] = useState(link.why); const [lens, setLens] = useState(link.lens ?? ""); const [w, setW] = useState<number | "">(link.created_week ?? "");
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}><h3>{from} → {to}</h3><button className="btn" onClick={onClose} aria-label="Close">×</button></div>
      {link.edge_id && <div className="notice">Adopted from a canonical edge. {why.startsWith(DEFAULT_WHY) ? "It still has the canonical wording — rewrite it in your own words." : "Rewritten in your words ✓"} <Link to={`/explore?edge=${link.edge_id}`}>view the canonical edge →</Link></div>}
      <div className="field"><label>because… <Help text="At least 10 characters. A good 'because' names a mechanism, a piece of evidence or a method." /></label><textarea rows={5} value={why} onChange={(e) => setWhy(e.target.value)} readOnly={!mine} /></div>
      <div className="row"><input placeholder="lens" value={lens} onChange={(e) => setLens(e.target.value)} readOnly={!mine} style={{ width: 140 }} /><label className="muted">week <input type="number" min={1} max={15} value={w} onChange={(e) => setW(e.target.value === "" ? "" : Number(e.target.value))} style={{ width: 60 }} disabled={!mine} /></label></div>
      {mine && <div className="row" style={{ marginTop: 8 }}><button className="btn btn-primary" disabled={why.trim().length < 10} onClick={() => onSave({ why, lens: lens || null, created_week: w === "" ? null : Number(w) })}>Save</button><button className="btn btn-danger" onClick={onRemove}>Remove</button></div>}
    </div>
  );
}
