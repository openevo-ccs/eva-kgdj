import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Core } from "cytoscape";
import { GraphCanvas, fitGraph, type CtxTarget, type EncodingParams, type LayoutName, type PhysicsParams, type Selection } from "../components/GraphCanvas";
import type { ContextMenuItem } from "../components/ContextMenu";
import { LayoutPicker, loadGraphPrefs } from "../components/LayoutPicker";
import { NodeCards, ViewToggle } from "../components/NodeCards";
import { ResizableDrawer } from "../components/ResizableDrawer";
import { ReviewForm, ReviewList } from "../components/ReviewPanel";
import { Help, Tip } from "../components/Tip";
import { useApi, useSession } from "../state/session";
import type { CohortStats, GraphEdge, GraphNode, PrivateNode, PrivateNodeType, Subgraph, SubgraphDetail, SubgraphLink, SubgraphNode, Visibility } from "../lib/types";
import { PRIVATE_TYPE_HELP } from "../lib/types";
import { backedUpThisSession, buildBackup, downloadText, lastBackupAt, noteBackup, parseBackup, safeFilename } from "../lib/backup";
import { buildReportHtml, portfolioMetrics } from "../lib/report";

const PRIVATE_COLORS: Record<PrivateNodeType, string> = { self: "#7a2027", question: "#8659d6", resource: "#1f5f9c", theory: "#d9445f", method: "#e2833f" };
const VIS_TIP: Record<Visibility, string> = { private: "Only you (and your module's instructor) can open it", shared: "You, your instructor, and the people you list below", module: "Everyone in your module", members: "Every KGDJ member" };
const DEFAULT_WHY = "Canonical relationship:";
const ago = (d: Date | null) => { if (!d) return "never"; const m = Math.round((Date.now() - d.getTime()) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

type Node = SubgraphNode & { kind: "node" }; type Priv = PrivateNode & { kind: "priv" }; type LinkRow = SubgraphLink & { kind: "link" };

export default function PortfolioPage() {
  const api = useApi(); const { profile, deptById, myModules } = useSession(); const { id } = useParams(); const nav = useNavigate();
  const [list, setList] = useState<Subgraph[]>([]);
  const [data, setData] = useState<SubgraphDetail | null>(null);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
  const [title, setTitle] = useState("My orientation graph");
  const [pn, setPn] = useState<{ type: PrivateNodeType; label: string; source: string }>({ type: "question", label: "", source: "" });
  const [link, setLink] = useState<{ from: string; to: string; why: string; lens: string }>({ from: "", to: "", why: "", lens: "" });
  const [shareWith, setShareWith] = useState(""); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null);
  const [cy, setCy] = useState<Core | null>(null);
  const [sel, setSel] = useState<Selection>({ nodes: [], edges: [] });
  const prefs = useMemo(loadGraphPrefs, []);
  const [view, setView] = useState<"graph" | "cards">("graph");
  const [layout, setLayout] = useState<LayoutName>("preset");
  const [physics, setPhysics] = useState<PhysicsParams>(prefs.physics);
  const [encoding, setEncoding] = useState<EncodingParams>(prefs.encoding);
  const [autoFit, setAutoFit] = useState(prefs.autoFit);
  const layoutInit = useRef(false);
  const [, setBackupTick] = useState(0); const [reportBusy, setReportBusy] = useState(false);
  const pending = useRef<Record<string, { x: number; y: number }>>({}); const saveTimer = useRef<number | null>(null);
  const loadList = () => api.subgraphs().then(setList);
  const load = () => { if (id) api.subgraph(id).then(setData).catch((e) => setErr((e as Error).message)); };
  useEffect(() => { loadList(); api.graph().then(setGraph); }, []);
  useEffect(() => { setData(null); setErr(null); setOk(null); setSel({ nodes: [], edges: [] }); layoutInit.current = false; load(); }, [id]);
  const mine = data?.subgraph.owner_id === profile?.id;
  const nodesById = useMemo(() => Object.fromEntries(graph.nodes.map((n) => [n.id, n])), [graph]);

  // Composite graph: forked canonical nodes + private nodes + the student's own links (+ canonical edges among forked nodes as dashed context)
  const composite = useMemo(() => {
    if (!data) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    const nodes: GraphNode[] = [];
    for (const sn of data.nodes) { const n = nodesById[sn.node_id]; if (n) nodes.push({ ...n, provenance: { ...n.provenance, shared: sn.shared } }); }
    for (const p of data.privateNodes) nodes.push({ id: p.id, slug: p.id, label: p.label, type_code: p.node_type, description: p.source || "", department_id: `priv-${p.node_type}`, status: "canonical", external_ids: {}, provenance: { source: "student", shared: p.shared }, tags: [], version: 1, created_by: null, created_at: "", updated_at: "", canonical_since: null });
    const ids = new Set(nodes.map((n) => n.id));
    const adopted = new Set(data.links.map((l) => l.edge_id).filter(Boolean));
    const edges: GraphEdge[] = data.links.map((l) => ({ id: l.id, source_node_id: (l.from_node_id || l.from_private_id)!, target_node_id: (l.to_node_id || l.to_private_id)!, relationship_code: l.lens ? `[${l.lens}] ${l.why.slice(0, 40)}` : l.why.slice(0, 40), label: l.why, weight: 3, status: "canonical", provenance: { adopted: l.edge_id ? 1 : 0, shared: l.shared }, version: 1, created_by: null, created_at: "", updated_at: "", canonical_since: null }));
    for (const e of graph.edges) if (ids.has(e.source_node_id) && ids.has(e.target_node_id) && !adopted.has(e.id)) edges.push({ ...e, status: "proposed" });
    return { nodes, edges: edges.filter((e) => ids.has(e.source_node_id) && ids.has(e.target_node_id)) };
  }, [data, graph]);
  const deptByIdWithPrivate = useMemo(() => { const d = { ...deptById }; for (const [t, c] of Object.entries(PRIVATE_COLORS)) d[`priv-${t}`] = { id: `priv-${t}`, code: t, name: t, abbr: t, color_hex: c }; return d; }, [deptById]);
  const positions = useMemo(() => { const p: Record<string, { x: number; y: number }> = {}; data?.nodes.forEach((n) => { if (n.pos_x != null && n.pos_y != null) p[n.node_id] = { x: n.pos_x, y: n.pos_y }; }); data?.privateNodes.forEach((n) => { if (n.pos_x != null && n.pos_y != null) p[n.id] = { x: n.pos_x, y: n.pos_y }; }); return p; }, [data]);
  useEffect(() => { if (data && !layoutInit.current) { layoutInit.current = true; setLayout(Object.keys(positions).length ? "preset" : "cose"); } }, [data, positions]);
  const allTargets = useMemo(() => [...(data?.nodes.map((sn) => ({ id: sn.node_id, label: nodesById[sn.node_id]?.label || sn.node_id, priv: false })) || []), ...(data?.privateNodes.map((p) => ({ id: p.id, label: p.label, priv: true })) || [])], [data, graph]);
  const labelOf = (nid: string | null) => (nid ? allTargets.find((t) => t.id === nid)?.label ?? nodesById[nid]?.label ?? nid : "");

  // autosave positions after a drag (debounced)
  const onDragEnd = (nid: string, x: number, y: number) => {
    if (!mine || !data) return; pending.current[nid] = { x, y };
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => { const pos = Object.entries(pending.current).map(([k, v]) => data.privateNodes.some((p) => p.id === k) ? { private_id: k, ...v } : { node_id: k, ...v }); pending.current = {}; await api.savePositions(data.subgraph.id, pos); }, 800);
  };
  const addPrivate = async () => { if (!data) return; await api.addPrivateNode(data.subgraph.id, pn.type, pn.label, pn.source || null); setPn({ ...pn, label: "", source: "" }); load(); };
  const addLink = async () => {
    if (!data) return; setErr(null);
    const f = allTargets.find((t) => t.id === link.from), t = allTargets.find((x) => x.id === link.to); if (!f || !t) return;
    try { await api.addLink({ subgraph_id: data.subgraph.id, from_node_id: f.priv ? null : f.id, from_private_id: f.priv ? f.id : null, to_node_id: t.priv ? null : t.id, to_private_id: t.priv ? t.id : null, why: link.why, lens: link.lens || null, edge_id: null }); setLink({ ...link, why: "" }); load(); } catch (e) { setErr((e as Error).message); }
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
        links: data.links.map((l) => ({ from: labelOf(l.from_node_id || l.from_private_id), to: labelOf(l.to_node_id || l.to_private_id), why: l.why, lens: l.lens, created_at: l.created_at })) });
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
      <p className="muted">Your orientation graph for the module: add canonical nodes, write your own questions and resources, and give every connection one sentence — "I'm connecting ___ to ___, because ___". Private by default; share a specific idea with your module, or the whole thing with classmates for critique.</p>
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
  const moduleName = myModules.find((m) => m.module.id === sg.module_id)?.module.name ?? "your module";
  const selCount = sel.nodes.length + sel.edges.length;
  const resolveNode = (nid: string): Node | Priv | undefined => { const n = data.nodes.find((x) => x.node_id === nid); if (n) return { ...n, kind: "node" }; const p = data.privateNodes.find((x) => x.id === nid); return p ? { ...p, kind: "priv" } : undefined; };
  const resolveEdge = (eid: string): LinkRow | undefined => { const l = data.links.find((x) => x.id === eid); return l ? { ...l, kind: "link" } : undefined; };
  const singleNode = selCount === 1 && sel.nodes.length === 1 ? resolveNode(sel.nodes[0]) : undefined;
  const singleLink = selCount === 1 && sel.edges.length === 1 ? resolveEdge(sel.edges[0]) : undefined;
  const singleCtx = selCount === 1 && sel.edges.length === 1 && !singleLink ? graph.edges.find((e) => e.id === sel.edges[0]) : undefined;
  const clearSel = () => setSel({ nodes: [], edges: [] });

  const toggleShared = async (t: Node | Priv | LinkRow, shared: boolean) => {
    if (t.kind === "node") await api.setNodeShared(sg.id, t.node_id, shared); else if (t.kind === "priv") await api.setPrivateNodeShared(t.id, shared); else await api.setLinkShared(t.id, shared);
    setOk(shared ? `Shared with ${moduleName}.` : "Un-shared."); load();
  };
  const proposeNode = (p: PrivateNode) => nav("/proposals/new", { state: { prefill: { change_type: "add_node", label: p.label, type_code: p.node_type === "theory" ? "theory" : p.node_type === "method" ? "method" : "concept", description: p.source || `From a student portfolio: ${p.label}` } } });
  const proposeLink = (l: SubgraphLink) => l.from_node_id && l.to_node_id && nav("/proposals/new", { state: { prefill: { change_type: "add_edge", source_node_id: l.from_node_id, target_node_id: l.to_node_id, relationship_code: l.lens || "relates-to", label: l.why.startsWith(DEFAULT_WHY) ? undefined : l.why.slice(0, 80) } } });

  const contextMenuExtra = (target: CtxTarget, liveSel: Selection): ContextMenuItem[] => {
    if (!mine || target.kind === "background") return [];
    const items: ContextMenuItem[] = [];
    if (liveSel.nodes.length + liveSel.edges.length > 1) return items; // bulk actions live in the sidebar's "N selected" panel
    if (target.kind === "node") {
      const t = resolveNode(target.id); if (!t) return items;
      items.push({ label: t.shared ? "Un-share from module" : `Share with ${moduleName}`, onClick: () => toggleShared(t, !t.shared) });
      if (t.kind === "priv") items.push({ label: "Propose to canonical graph…", onClick: () => proposeNode(t) });
      else items.push({ label: "Open in canonical graph", onClick: () => window.open(`#/explore/${t.node_id}`, "_self") });
      items.push({ label: "Remove from portfolio", danger: true, onClick: async () => { if (t.kind === "node") await api.removeNode(sg.id, t.node_id); else await api.removePrivateNode(t.id); clearSel(); load(); } });
    } else {
      const t = resolveEdge(target.id);
      if (t) {
        items.push({ label: t.shared ? "Un-share from module" : `Share with ${moduleName}`, onClick: () => toggleShared(t, !t.shared) });
        if (t.from_node_id && t.to_node_id) items.push({ label: "Propose as canonical connection…", onClick: () => proposeLink(t) });
        items.push({ label: "Remove connection", danger: true, onClick: async () => { await api.removeLink(t.id); clearSel(); load(); } });
      } else { const ctx = graph.edges.find((e) => e.id === target.id); if (ctx) items.push({ label: "Adopt into my portfolio", onClick: () => adopt(ctx) }); }
    }
    return items;
  };
  const adopt = async (ctx: GraphEdge) => { await api.addLink({ subgraph_id: sg.id, from_node_id: ctx.source_node_id, from_private_id: null, to_node_id: ctx.target_node_id, to_private_id: null, edge_id: ctx.id, lens: "canonical", why: `${DEFAULT_WHY} ${ctx.relationship_code}${ctx.label ? ` — ${ctx.label}` : ""}. (Rewrite this in your own words: why does this connection matter to you?)` }); load(); };

  return (
    <div className="explorer" style={{ flex: 1, minWidth: 0 }}>
      <div className="toolbar">
        <Link to="/portfolio" className="btn">← portfolios</Link>
        <b>{sg.title}</b>{mine && <Tip text="Rename"><button className="btn btn-mini" onClick={async () => { const t = prompt("Portfolio title", sg.title); if (t && t !== sg.title) { await api.updateSubgraph(sg.id, { title: t }); load(); loadList(); } }}>✎</button></Tip>}
        <span className="muted">{data.nodes.length} canonical · {data.privateNodes.length} own · {data.links.length} connections</span>
        {mine && <>
          <Tip text={VIS_TIP[sg.visibility]}><select value={sg.visibility} onChange={async (e) => { await api.setVisibility(sg.id, e.target.value as Visibility); load(); }} aria-label="Visibility"><option value="private">private</option><option value="shared">shared (listed people)</option><option value="module">module</option><option value="members">all members</option></select></Tip>
          <Tip text="Give one classmate access (and the right to critique) by username"><input placeholder="share with username" value={shareWith} onChange={(e) => setShareWith(e.target.value)} style={{ width: 150 }} /></Tip><button className="btn" onClick={async () => { try { await api.share(sg.id, shareWith); setShareWith(""); setOk(`Shared with ${shareWith}.`); } catch (e) { setErr((e as Error).message); } }}>share</button>
        </>}
        <ViewToggle view={view} onChange={setView} />
        {view === "graph" && <LayoutPicker layout={layout} onLayout={setLayout} physics={physics} onPhysics={setPhysics} encoding={encoding} onEncoding={setEncoding} autoFit={autoFit} onAutoFit={setAutoFit} allowPreset />}
        {view === "graph" && <Tip text="Fit the whole portfolio in view now — separate from the auto-fit toggle in layout options"><button className="btn" onClick={() => fitGraph(cy)}>Fit</button></Tip>}
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
      {!data.full_access && <div className="subbar">You're viewing an idea {data.subgraph.owner_id === profile?.id ? "you" : "a classmate"} shared with {moduleName} — the rest of this portfolio is private. See <Link to="/commons">Commons</Link> for everything shared into your modules.</div>}
      {(err || ok) && <div className={`notice ${err ? "notice-bad" : "notice-ok"}`} style={{ margin: "6px 12px 0" }}>{err || ok} <button className="btn btn-mini" onClick={() => { setErr(null); setOk(null); }} style={{ marginLeft: 8 }}>×</button></div>}
      <div className="explorer-body">
        <div className="graph-host">
          {view === "cards" ? (
            <NodeCards nodes={composite.nodes} edges={composite.edges} deptById={deptByIdWithPrivate} onOpen={(id) => setSel({ nodes: [id], edges: [] })}
              annotationOf={(id) => data.nodes.find((n) => n.node_id === id)?.custom_annotation} />
          ) : <>
            <GraphCanvas nodes={composite.nodes} edges={composite.edges} deptById={deptByIdWithPrivate} layout={layout} physicsParams={physics} positions={positions} encoding={encoding} autoFit={autoFit}
              selectedId={null} onSelect={() => {}} selectedEdgeId={null} onSelectEdge={() => {}} onSelectionChange={setSel} contextMenuExtra={contextMenuExtra} onDragEnd={onDragEnd}
              onReady={(c) => { setCy(c); if (new URLSearchParams(window.location.search).get("debug")) (window as unknown as { __cy?: Core }).__cy = c; }} />
            <div className="legend">{Object.entries(PRIVATE_COLORS).map(([t, c]) => <Tip key={t} text={PRIVATE_TYPE_HELP[t as PrivateNodeType]}><span><span className="dept-sw" style={{ background: c }} />{t}</span></Tip>)}<Tip text="Your own connection ('because' sentence)"><span><span className="dept-sw" style={{ background: "#fff", border: "2px solid #8fb8a3" }} />your connection</span></Tip><Tip text="Adopted from a canonical edge; rewrite the wording in your own words"><span><span className="dept-sw" style={{ background: "#fff", border: "2px solid #1a6b46" }} />adopted canonical edge</span></Tip><Tip text="A canonical edge between two of your nodes that you have not adopted yet — click it to adopt, or right-click for options"><span><span className="dept-sw" style={{ background: "#fff", border: "2px dashed #7a4d9c" }} />canonical context</span></Tip><Tip text="Shared with your module — visible to classmates even though the rest of the portfolio is private"><span><span className="dept-sw" style={{ background: "#fff", border: "2px solid #e2841e" }} />shared with module</span></Tip>{mine && <span className="muted">drag to arrange · right-click for quick actions · Ctrl+click to select several</span>}</div>
          </>}
        </div>
        <ResizableDrawer>
          <div className="drawer">
            {selCount > 1 ? <BulkPanel sel={sel} data={data} graph={graph} mine={!!mine} nodesById={nodesById} moduleName={moduleName} onClose={clearSel} onDone={(m) => { setOk(m); clearSel(); load(); }} onErr={setErr} api={api} sgId={sg.id} nav={nav} />
              : singleNode ? (singleNode.kind === "node" ? (() => { const n = nodesById[singleNode.node_id]; return <NodePanel node={singleNode} label={n?.label ?? singleNode.node_id} sub={`${n?.type_code ?? ""}${n?.department_id ? " · " + (deptById[n.department_id]?.abbr ?? "") : ""}`} exploreId={singleNode.node_id} mine={!!mine} moduleName={moduleName}
                onClose={clearSel} onSave={async (a) => { await api.updateAnnotation(sg.id, singleNode.node_id, a); setOk("Annotation saved."); load(); }} onRemove={async () => { if (!confirm(`Remove "${n?.label}" (and its connections) from this portfolio?`)) return; await api.removeNode(sg.id, singleNode.node_id); clearSel(); load(); }}
                onShare={(s) => toggleShared(singleNode, s)} />; })()
                : <PrivatePanel node={singleNode} mine={!!mine} moduleName={moduleName} onClose={clearSel} onSave={async (patch) => { await api.updatePrivateNode(singleNode.id, patch); setOk("Saved."); load(); }} onRemove={async () => { if (!confirm(`Remove "${singleNode.label}" (and its connections)?`)) return; await api.removePrivateNode(singleNode.id); clearSel(); load(); }}
                    onShare={(s) => toggleShared(singleNode, s)} onPropose={() => proposeNode(singleNode)} />)
              : singleLink ? <LinkPanel link={singleLink} from={labelOf(singleLink.from_node_id || singleLink.from_private_id)} to={labelOf(singleLink.to_node_id || singleLink.to_private_id)} mine={!!mine} moduleName={moduleName}
                  onClose={clearSel} onSave={async (patch) => { try { await api.updateLink(singleLink.id, patch); setOk("Connection saved."); load(); } catch (e) { setErr((e as Error).message); } }} onRemove={async () => { if (!confirm("Remove this connection?")) return; await api.removeLink(singleLink.id); clearSel(); load(); }}
                  onShare={(s) => toggleShared(singleLink, s)} onPropose={singleLink.from_node_id && singleLink.to_node_id ? () => proposeLink(singleLink) : undefined} />
              : singleCtx ? <div>
                  <div className="row" style={{ justifyContent: "space-between" }}><h3>Canonical edge (context)</h3><button className="btn" onClick={clearSel}>×</button></div>
                  <p>{labelOf(singleCtx.source_node_id)} <b>→ {singleCtx.relationship_code} →</b> {labelOf(singleCtx.target_node_id)}</p>
                  <p className="muted">This edge exists in the canonical graph between two of your nodes. Adopting it turns it into one of your connections, which you can then rewrite in your own words.</p>
                  {mine && <button className="btn btn-primary" onClick={() => { adopt(singleCtx); clearSel(); }}>Adopt into my portfolio</button>}
                  <p className="muted" style={{ marginTop: 8 }}><Link to={`/explore?edge=${singleCtx.id}`}>Open in the canonical graph →</Link></p>
                </div>
              : <>
            {mine && (unannotated > 0 || canonicalWording > 0 || !data.privateNodes.length || !data.links.length) && <div className="card" style={{ padding: "10px 12px" }}><b>Next steps</b> <Help text="Small nudges computed from your portfolio. They disappear as you go." /><ul className="nudges">
              {unannotated > 0 && <li>{unannotated} canonical node{unannotated === 1 ? " has" : "s have"} no real annotation yet — click a node to write one.</li>}
              {canonicalWording > 0 && <li>{canonicalWording} adopted connection{canonicalWording === 1 ? " still uses" : "s still use"} the canonical wording — click an edge and say why it matters to you.</li>}
              {!data.privateNodes.length && <li>No node of your own yet — add a question you actually have.</li>}
              {!data.links.length && <li>No connection yet — the "because" sentences are the heart of the portfolio.</li>}
            </ul></div>}
            {mine && <>
              <h3>Add your own node <Help text={Object.entries(PRIVATE_TYPE_HELP).map(([k, v]) => `${k}: ${v}`).join("\n")} /></h3>
              <div className="row"><Tip text={PRIVATE_TYPE_HELP[pn.type]}><select value={pn.type} onChange={(e) => setPn({ ...pn, type: e.target.value as PrivateNodeType })} aria-label="Node type">{Object.keys(PRIVATE_COLORS).map((t) => <option key={t}>{t}</option>)}</select></Tip><input placeholder="label" value={pn.label} onChange={(e) => setPn({ ...pn, label: e.target.value })} aria-label="Label" /><Tip text="Where it comes from (DOI, URL, lecture, …)"><input placeholder="source" value={pn.source} onChange={(e) => setPn({ ...pn, source: e.target.value })} style={{ width: 110 }} /></Tip><button className="btn" disabled={!pn.label} onClick={addPrivate}>add</button></div>
              <h3 style={{ marginTop: 12 }}>I'm connecting… <Help text="Pick two nodes of this portfolio and say why they belong together. At least 10 characters; a good 'because' names a mechanism, a piece of evidence, or a method. The lens is an optional one-word tag for the kind of reason." /></h3>
              <div className="field"><select value={link.from} onChange={(e) => setLink({ ...link, from: e.target.value })} aria-label="From"><option value="">— from —</option>{allTargets.map((t) => <option key={t.id} value={t.id}>{t.priv ? "★ " : ""}{t.label}</option>)}</select></div>
              <div className="field"><select value={link.to} onChange={(e) => setLink({ ...link, to: e.target.value })} aria-label="To"><option value="">— to —</option>{allTargets.map((t) => <option key={t.id} value={t.id}>{t.priv ? "★ " : ""}{t.label}</option>)}</select></div>
              <div className="field"><label>because…</label><textarea rows={3} value={link.why} onChange={(e) => setLink({ ...link, why: e.target.value })} /></div>
              <div className="row"><Tip text="Optional tag: mechanism, evidence, theory, method, history…"><input placeholder="lens (mechanism, evidence, theory…)" value={link.lens} onChange={(e) => setLink({ ...link, lens: e.target.value })} /></Tip><button className="btn btn-primary" disabled={!link.from || !link.to || link.why.length < 10} onClick={addLink}>connect</button></div>
              <p className="muted">Add canonical nodes from the <Link to="/explore">Graph</Link> tab, or Ctrl+click several here and use the panel that appears.</p>
            </>}
            <h3 style={{ marginTop: 12 }}>Connections ({data.links.length})</h3>
            {data.links.map((l) => <div className="review" key={l.id} style={{ cursor: "pointer" }} onClick={() => setSel({ nodes: [], edges: [l.id] })}><b>{labelOf(l.from_node_id || l.from_private_id)} → {labelOf(l.to_node_id || l.to_private_id)}</b><div>{l.lens && <span className="chip">{l.lens}</span>} {l.edge_id && <span className="chip chip-verified">adopted</span>} {l.shared && <span className="chip" style={{ color: "#e2841e", borderColor: "#f0d3a8" }}>shared</span>} {l.why}</div><div className="muted">{dateOf(l.created_at)}</div></div>)}
            {!data.links.length && <div className="muted">None yet.</div>}
            {data.full_access ? <>
              <h3 style={{ marginTop: 12 }}>Critique ({data.reviews.length}) <Help text="Classmates you shared with (and your instructor) can leave an identified critique with a rating. You cannot critique your own portfolio." /></h3>
              <ReviewList reviews={data.reviews} onChanged={load} />
              {!mine && <ReviewForm kind="subgraph" targetId={sg.id} onDone={load} />}
            </> : <p className="muted" style={{ marginTop: 12 }}>Group discussion on a single shared idea isn't available yet — that's coming with the commons space. For now, see it in context on the <Link to="/commons">Commons</Link> page.</p>}
            {mine && <div style={{ marginTop: 18 }}><button className="btn btn-danger" onClick={async () => { if (!confirm(`Delete portfolio "${sg.title}"? Download a backup first if you want to keep it.`)) return; await api.deleteSubgraph(sg.id); nav("/portfolio"); }}>Delete this portfolio</button></div>}
          </>}
          </div>
        </ResizableDrawer>
      </div>
    </div>
  );
}

function ShareRow({ shared, moduleName, onShare }: { shared: boolean; moduleName: string; onShare: (s: boolean) => void }) {
  return <Tip text={shared ? "Visible to your module even though the rest of the portfolio is private" : `Make just this one visible to ${moduleName}, without sharing the rest of your portfolio`}>
    <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={shared} onChange={(e) => onShare(e.target.checked)} /> share with {moduleName}</label>
  </Tip>;
}

function NodePanel({ node, label, sub, exploreId, mine, moduleName, onClose, onSave, onRemove, onShare }: { node: Node; label: string; sub: string; exploreId: string; mine: boolean; moduleName: string; onClose: () => void; onSave: (a: string) => Promise<void>; onRemove: () => Promise<void>; onShare: (s: boolean) => void }) {
  const [a, setA] = useState(node.custom_annotation);
  const dirty = a !== node.custom_annotation;
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}><h3>{label}</h3><button className="btn" onClick={onClose} aria-label="Close">×</button></div>
      <div className="muted">{sub} · <Link to={`/explore/${exploreId}`}>open in the canonical graph →</Link></div>
      <div className="field" style={{ marginTop: 10 }}><label>Your annotation <Help text="Why this node matters to you. 40+ characters count as a real annotation." /></label><textarea rows={5} value={a} onChange={(e) => setA(e.target.value)} readOnly={!mine} placeholder={mine ? "What does this node mean for your own question?" : ""} /></div>
      <div className="row">{mine && <button className="btn btn-primary" disabled={!dirty} onClick={() => onSave(a)}>Save</button>}{mine && <ShareRow shared={node.shared} moduleName={moduleName} onShare={onShare} />}{mine && <button className="btn btn-danger" onClick={onRemove}>Remove</button>}</div>
      <p className="muted" style={{ marginTop: 8 }}>{a.trim().length < 40 ? `${Math.max(0, 40 - a.trim().length)} more characters to count as annotated` : "✓ counts as annotated"} · last edited {dateOf(node.updated_at)}</p>
    </div>
  );
}

function PrivatePanel({ node, mine, moduleName, onClose, onSave, onRemove, onShare, onPropose }: { node: Priv; mine: boolean; moduleName: string; onClose: () => void; onSave: (p: { label?: string; source?: string | null; node_type?: PrivateNodeType }) => Promise<void>; onRemove: () => Promise<void>; onShare: (s: boolean) => void; onPropose: () => void }) {
  const [t, setT] = useState<PrivateNodeType>(node.node_type); const [l, setL] = useState(node.label); const [s, setS] = useState(node.source ?? "");
  const dirty = t !== node.node_type || l !== node.label || s !== (node.source ?? "");
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}><h3>★ {node.label}</h3><button className="btn" onClick={onClose} aria-label="Close">×</button></div>
      <div className="muted">your own node · {PRIVATE_TYPE_HELP[node.node_type]}</div>
      <div className="field" style={{ marginTop: 10 }}><label>Type</label><select value={t} onChange={(e) => setT(e.target.value as PrivateNodeType)} disabled={!mine}>{Object.keys(PRIVATE_COLORS).map((x) => <option key={x}>{x}</option>)}</select></div>
      <div className="field"><label>Label</label><input value={l} onChange={(e) => setL(e.target.value)} readOnly={!mine} /></div>
      <div className="field"><label>Source</label><input value={s} onChange={(e) => setS(e.target.value)} readOnly={!mine} placeholder="DOI, URL, lecture…" /></div>
      {mine && <div className="row">
        <button className="btn btn-primary" disabled={!l.trim() || !dirty} onClick={() => onSave({ label: l, source: s || null, node_type: t })}>Save</button>
        <Tip text="Turn this idea into a real proposal, peer-reviewed and — if accepted — added to the canonical graph"><button className="btn" onClick={onPropose}>Propose to canonical graph…</button></Tip>
        <ShareRow shared={node.shared} moduleName={moduleName} onShare={onShare} />
        <button className="btn btn-danger" onClick={onRemove}>Remove</button>
      </div>}
      <p className="muted" style={{ marginTop: 8 }}>last edited {dateOf(node.updated_at)}</p>
    </div>
  );
}

function LinkPanel({ link, from, to, mine, moduleName, onClose, onSave, onRemove, onShare, onPropose }: { link: LinkRow; from: string; to: string; mine: boolean; moduleName: string; onClose: () => void; onSave: (p: { why?: string; lens?: string | null }) => Promise<void>; onRemove: () => Promise<void>; onShare: (s: boolean) => void; onPropose?: () => void }) {
  const [why, setWhy] = useState(link.why); const [lens, setLens] = useState(link.lens ?? "");
  const dirty = why !== link.why || lens !== (link.lens ?? "");
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}><h3>{from} → {to}</h3><button className="btn" onClick={onClose} aria-label="Close">×</button></div>
      {link.edge_id && <div className="notice">Adopted from a canonical edge. {why.startsWith(DEFAULT_WHY) ? "It still has the canonical wording — rewrite it in your own words." : "Rewritten in your words ✓"} <Link to={`/explore?edge=${link.edge_id}`}>view the canonical edge →</Link></div>}
      <div className="field"><label>because… <Help text="At least 10 characters. A good 'because' names a mechanism, a piece of evidence or a method." /></label><textarea rows={5} value={why} onChange={(e) => setWhy(e.target.value)} readOnly={!mine} /></div>
      <div className="field"><label>lens</label><input placeholder="mechanism, evidence, theory…" value={lens} onChange={(e) => setLens(e.target.value)} readOnly={!mine} /></div>
      {mine && <div className="row">
        <button className="btn btn-primary" disabled={why.trim().length < 10 || !dirty} onClick={() => onSave({ why, lens: lens || null })}>Save</button>
        {onPropose && <Tip text="Propose this exact connection as a canonical edge, peer-reviewed"><button className="btn" onClick={onPropose}>Propose as canonical connection…</button></Tip>}
        <ShareRow shared={link.shared} moduleName={moduleName} onShare={onShare} />
        <button className="btn btn-danger" onClick={onRemove}>Remove</button>
      </div>}
      <p className="muted" style={{ marginTop: 8 }}>last edited {dateOf(link.updated_at)}</p>
    </div>
  );
}

// The "N selected" panel: bulk annotate / set-because / share / remove / propose-to-canonical.
function BulkPanel({ sel, data, graph, mine, nodesById, moduleName, onClose, onDone, onErr, api, sgId, nav }: {
  sel: Selection; data: SubgraphDetail; graph: { nodes: GraphNode[]; edges: GraphEdge[] }; mine: boolean; nodesById: Record<string, GraphNode>; moduleName: string;
  onClose: () => void; onDone: (m: string) => void; onErr: (m: string) => void; api: ReturnType<typeof useApi>; sgId: string; nav: ReturnType<typeof useNavigate>;
}) {
  const nodeRows = sel.nodes.map((id) => data.nodes.find((n) => n.node_id === id)).filter((n): n is SubgraphNode => !!n);
  const privRows = sel.nodes.map((id) => data.privateNodes.find((n) => n.id === id)).filter((n): n is PrivateNode => !!n);
  const linkRows = sel.edges.map((id) => data.links.find((l) => l.id === id)).filter((l): l is SubgraphLink => !!l);
  const ctxRows = sel.edges.map((id) => graph.edges.find((e) => e.id === id)).filter((e): e is GraphEdge => !!e && !linkRows.some((l) => l.edge_id === e.id));
  const [annotate, setAnnotate] = useState(""); const [because, setBecause] = useState(""); const [busy, setBusy] = useState(false);
  const proposable = privRows.length + linkRows.filter((l) => l.from_node_id && l.to_node_id).length;
  const skipped = linkRows.length - linkRows.filter((l) => l.from_node_id && l.to_node_id).length;

  const doAnnotate = async () => { setBusy(true); try { for (const n of nodeRows) await api.updateAnnotation(sgId, n.node_id, annotate); onDone(`Annotated ${nodeRows.length} node${nodeRows.length === 1 ? "" : "s"}.`); } catch (e) { onErr((e as Error).message); } finally { setBusy(false); } };
  const doBecause = async () => {
    setBusy(true);
    try {
      for (const l of linkRows) await api.updateLink(l.id, { why: because });
      for (const e of ctxRows) await api.addLink({ subgraph_id: sgId, from_node_id: e.source_node_id, from_private_id: null, to_node_id: e.target_node_id, to_private_id: null, edge_id: e.id, lens: "canonical", why: because });
      onDone(`Set "because" for ${linkRows.length + ctxRows.length} connection${linkRows.length + ctxRows.length === 1 ? "" : "s"}.`);
    } catch (e) { onErr((e as Error).message); } finally { setBusy(false); }
  };
  const doShare = async (shared: boolean) => {
    setBusy(true);
    try {
      for (const n of nodeRows) await api.setNodeShared(sgId, n.node_id, shared);
      for (const p of privRows) await api.setPrivateNodeShared(p.id, shared);
      for (const l of linkRows) await api.setLinkShared(l.id, shared);
      onDone(shared ? `Shared ${nodeRows.length + privRows.length + linkRows.length} item(s) with ${moduleName}.` : "Un-shared.");
    } catch (e) { onErr((e as Error).message); } finally { setBusy(false); }
  };
  const doRemove = async () => {
    if (!confirm(`Remove ${sel.nodes.length + linkRows.length} item(s) from your portfolio?`)) return;
    setBusy(true);
    try { for (const n of nodeRows) await api.removeNode(sgId, n.node_id); for (const p of privRows) await api.removePrivateNode(p.id); for (const l of linkRows) await api.removeLink(l.id); onDone("Removed."); } catch (e) { onErr((e as Error).message); } finally { setBusy(false); }
  };
  const doPropose = () => {
    const items: { change_type: "add_node"; label: string; type_code: string; description: string }[] = privRows.map((p) => ({ change_type: "add_node", label: p.label, type_code: p.node_type === "theory" ? "theory" : p.node_type === "method" ? "method" : "concept", description: p.source || `From a student portfolio: ${p.label}` }));
    const edgeItems: { change_type: "add_edge"; source_node_id: string; target_node_id: string; relationship_code: string }[] = linkRows.filter((l) => l.from_node_id && l.to_node_id).map((l) => ({ change_type: "add_edge", source_node_id: l.from_node_id!, target_node_id: l.to_node_id!, relationship_code: l.lens || "relates-to" }));
    nav("/proposals/new", { state: { batch: { items: [...items, ...edgeItems] } } });
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}><h3>{sel.nodes.length + sel.edges.length} selected</h3><button className="btn" onClick={onClose} aria-label="Close">×</button></div>
      <ul style={{ maxHeight: 140, overflow: "auto", fontSize: 12.5, paddingLeft: 18, margin: "6px 0" }}>
        {nodeRows.map((n) => <li key={n.node_id}>{nodesById[n.node_id]?.label ?? n.node_id}</li>)}
        {privRows.map((p) => <li key={p.id}>★ {p.label}</li>)}
        {linkRows.map((l) => <li key={l.id}>connection: {l.why.slice(0, 50)}{l.why.length > 50 ? "…" : ""}</li>)}
        {ctxRows.map((e) => <li key={e.id} className="muted">canonical context (not yet in your portfolio): {e.relationship_code}</li>)}
      </ul>
      {!mine ? <p className="muted">Only the owner can act on a selection here.</p> : <>
        {nodeRows.length > 0 && <div className="field"><label>Annotate {nodeRows.length} canonical node{nodeRows.length === 1 ? "" : "s"}…</label><textarea rows={3} value={annotate} onChange={(e) => setAnnotate(e.target.value)} placeholder="Applied to every selected canonical node" /><button className="btn" disabled={busy || annotate.trim().length < 5} onClick={doAnnotate}>Apply annotation</button></div>}
        {(linkRows.length > 0 || ctxRows.length > 0) && <div className="field"><label>Set "because" for {linkRows.length + ctxRows.length} connection{linkRows.length + ctxRows.length === 1 ? "" : "s"}…{ctxRows.length > 0 && <span className="muted"> ({ctxRows.length} will be adopted first)</span>}</label><textarea rows={3} value={because} onChange={(e) => setBecause(e.target.value)} placeholder="Applied to every selected connection" /><button className="btn" disabled={busy || because.trim().length < 10} onClick={doBecause}>Apply</button></div>}
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" disabled={busy} onClick={() => doShare(true)}>Share selected with {moduleName}</button>
          <button className="btn" disabled={busy} onClick={() => doShare(false)}>Un-share selected</button>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <Tip text={proposable ? `Creates ${proposable} proposal${proposable === 1 ? "" : "s"}${skipped ? `; ${skipped} connection(s) skipped (a private node on one end isn't proposed yet)` : ""}` : "Nothing here is eligible yet — private nodes, or connections between two already-canonical nodes, can be proposed"}>
            <button className="btn btn-primary" disabled={busy || !proposable} onClick={doPropose}>Propose {proposable || ""} to canonical graph…</button>
          </Tip>
          <button className="btn btn-danger" disabled={busy} onClick={doRemove}>Remove selected</button>
        </div>
      </>}
    </div>
  );
}
