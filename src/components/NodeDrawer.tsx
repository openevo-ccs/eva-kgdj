import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CommonsItem, GraphNode, NodeDetail, Subgraph } from "../lib/types";
import { CHANGE_LABEL, isVerifiedCitation } from "../lib/types";
import { isEditor, useApi, useSession } from "../state/session";
import { ContentFlags } from "./ContentFlags";
import { CitationCoverageChip, DeptSwatch, ProvenanceChip, StatusChip } from "./Chips";
import { ReviewForm, ReviewList, ReviewSummaryBar } from "./ReviewPanel";
import { Help, Tip } from "./Tip";

type Tab = "about" | "reviews" | "propose" | "add";
const TAB_TIP: Record<Tab, string> = { about: "Description, citations, connections and open proposals", reviews: "Read reviews and write your own (identified)", propose: "Propose an edit, a new connection, or archival — goes through peer review", add: "Fork this node into your portfolio with your own annotation" };

export function NodeDrawer({ nodeId, nodesById, inPortfolio, sharedByClassmates, onClose, onChanged }: { nodeId: string; nodesById: Record<string, GraphNode>; inPortfolio?: boolean; sharedByClassmates?: CommonsItem[]; onClose: () => void; onChanged: () => void }) {
  const api = useApi(); const { profile, deptById, myModules } = useSession();
  const [d, setD] = useState<NodeDetail | null>(null);
  const [tab, setTab] = useState<Tab>("about");
  const [subgraphs, setSubgraphs] = useState<Subgraph[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api.node(nodeId).then(setD).catch((e) => setMsg((e as Error).message));
  useEffect(() => { setD(null); setMsg(null); setTab("about"); load(); }, [nodeId]);
  useEffect(() => { if (tab === "add") api.subgraphs().then(setSubgraphs); }, [tab]);
  if (!d) return <div className="drawer">{msg ? <div className="notice notice-bad">{msg}</div> : <div className="muted">Loading…</div>}</div>;
  const n = d.node; const dept = n.department_id ? deptById[n.department_id] : null;
  const editor = isEditor(profile);
  const decide = async (decision: "promote" | "archive") => { if (!confirm(`${decision} "${n.label}"?`)) return; await api.decide({ node_id: n.id, decision, feedback: "" }); await load(); onChanged(); };
  return (
    <div className="drawer">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><DeptSwatch dept={dept} />{n.label}</h2><Tip text="Close (Esc)"><button className="btn" onClick={onClose} aria-label="Close">×</button></Tip></div>
      <div className="row"><StatusChip status={n.status} /><Tip text={n.type_code === "scicomm-sensitivity" ? "Touches a live science-communication sensitivity — read the description before quoting this publicly." : "Node type"}><span className={n.type_code === "scicomm-sensitivity" ? "chip chip-scicomm" : "chip"}>{n.type_code}</span></Tip><ProvenanceChip prov={n.provenance} status={n.status} /><Tip text="Version: increases with every approved edit"><span className="muted">v{n.version}</span></Tip><CitationCoverageChip total={d.citations.length} verified={d.citations.filter(isVerifiedCitation).length} />{inPortfolio && <Tip text="This node is already in one of your portfolios"><span className="chip chip-verified">in your portfolio</span></Tip>}</div>
      {d.flags.length > 0 && <div className="notice notice-bad" style={{ marginTop: 8 }}>⚑ {d.flags[0].reason.replace(/_/g, " ")} — this record needs a fresh identified review before promotion.</div>}
      <div className="tabs">{(["about", "reviews", "propose", "add"] as const).map((t) => <Tip key={t} text={TAB_TIP[t]} place="bottom"><button className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "reviews" ? `reviews (${d.reviews.length})` : t === "add" ? "add to my portfolio" : t}</button></Tip>)}</div>

      {tab === "about" && <>
        <p>{n.description || <span className="muted">No description.</span>}</p>
        {n.tags.length > 0 && <div className="row">{n.tags.map((t) => <span className="chip" key={t}>{t}</span>)}</div>}
        <h3 style={{ marginTop: 12 }}>Citations ({d.citations.length}) <Help text="Literature attached to this node through approved proposals. DOIs are verified against Crossref by the editors' routine." /></h3>
        {d.citations.length ? <ul>{d.citations.map((c) => <li key={c.id}>{isVerifiedCitation(c) && <Tip text="Matched against the institute's own PuRe repository record."><span className="chip chip-verified" style={{ marginRight: 4 }}>✓</span></Tip>}{c.authors.slice(0, 3).join(", ")}{c.authors.length > 3 ? " et al." : ""} ({c.year ?? "n.d."}). {c.title}. {c.doi && <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noopener">doi</a>}</li>)}</ul> : <div className="muted">None yet — a proposal adding one is the natural first contribution.</div>}
        <h3>Connections ({d.edges.length}) <Help text="Edges touching this node. → means this node is the source, ← the target. Click one to open the edge." /></h3>
        <ul>{d.edges.slice(0, 40).map((e) => { const other = e.source_node_id === n.id ? e.target_node_id : e.source_node_id; const o = nodesById[other]; return <li key={e.id}>{e.source_node_id === n.id ? "→" : "←"} <Link to={`/explore?edge=${e.id}`}><i>{e.relationship_code}</i></Link> <Link to={`/explore/${other}`}>{o ? o.label : other}</Link> <StatusChip status={e.status} /></li>; })}</ul>
        {d.proposals.length > 0 && <><h3>Open proposals</h3><ul>{d.proposals.map((p) => <li key={p.id}><Link to={`/proposals/${p.id}`}>{CHANGE_LABEL[p.change_type]}</Link> <StatusChip status={p.status} /></li>)}</ul></>}
        <ContentFlags kind="node" targetId={n.id} flags={d.contentFlags} onChanged={load} />
        {!!sharedByClassmates?.length && <>
          <h3>Shared by classmates ({sharedByClassmates.length}) <Help text="Members who deliberately shared their own take on this exact node into a module's Commons. Their full portfolio may still be private — this is only what they chose to share." /></h3>
          <ul>{sharedByClassmates.map((c, i) => <li key={i}><Link to={`/portfolio/${c.subgraph_id}`}>{c.owner_username}</Link>{c.sub_label && <>: {c.sub_label}</>}</li>)}</ul>
        </>}
        <div className="muted" style={{ marginTop: 10 }}>ids: <code>{n.slug}</code>{Object.entries(n.external_ids).map(([k, v]) => <span key={k}> · {k}: <code>{String(v)}</code></span>)}</div>
        {editor && n.status !== "canonical" && <div className="row" style={{ marginTop: 12 }}><Tip text="Editors only: mark this node canonical. Needs at least one credible identified review."><button className="btn btn-primary" onClick={() => decide("promote")}>Promote to canonical</button></Tip><button className="btn btn-danger" onClick={() => decide("archive")}>Archive</button></div>}
        {editor && n.status === "canonical" && <div className="row" style={{ marginTop: 12 }}><button className="btn btn-danger" onClick={() => decide("archive")}>Archive</button></div>}
      </>}

      {tab === "reviews" && <>
        <ReviewSummaryBar s={d.summary} />
        <ReviewList reviews={d.reviews} onChanged={load} />
        <div style={{ marginTop: 12 }}><ReviewForm kind="node" targetId={n.id} onDone={load} disabledReason={profile && n.created_by === profile.id ? "You authored this node — conflict of interest." : null} /></div>
      </>}

      {tab === "propose" && <>
        <p className="muted">Propose an edit to this node, or its archival. Edits need at least one citation before submission; every proposal is peer reviewed before an editor decides.</p>
        <div className="row"><Link className="btn btn-primary" to={`/proposals/new?type=edit_node&node=${n.id}`}>Propose edit</Link><Link className="btn" to={`/proposals/new?type=add_edge&node=${n.id}`}>Propose a connection</Link><Link className="btn btn-danger" to={`/proposals/new?type=archive_node&node=${n.id}`}>Propose archival</Link></div>
      </>}

      {tab === "add" && <AddPanel node={n} subgraphs={subgraphs} inPortfolio={!!inPortfolio} onDone={(m) => { setMsg(m); setTab("about"); onChanged(); }} myModuleId={myModules[0]?.module.id ?? null} />}
      {msg && <div className="notice notice-ok" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

function AddPanel({ node, subgraphs, inPortfolio, onDone, myModuleId }: { node: GraphNode; subgraphs: Subgraph[]; inPortfolio: boolean; onDone: (m: string) => void; myModuleId: string | null }) {
  const api = useApi(); const { profile } = useSession();
  const mine = subgraphs.filter((g) => g.owner_id === profile?.id);
  const [target, setTarget] = useState<string>(mine[0]?.id ?? "new");
  const [title, setTitle] = useState("My orientation graph");
  const [annotation, setAnnotation] = useState("");
  useEffect(() => { if (mine.length && target === "new") setTarget(mine[0].id); }, [subgraphs]);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); let id = target; if (id === "new") id = (await api.createSubgraph(title, myModuleId)).id; await api.forkNode(id, node.id, annotation); onDone(`Added "${node.label}" to your portfolio.`); }}>
      {inPortfolio && <div className="notice">Already in one of your portfolios — adding again updates the annotation if you write one.</div>}
      <div className="field"><label>Portfolio <Help text="Your orientation graph for the module. You can keep several, but one is usual." /></label><select value={target} onChange={(e) => setTarget(e.target.value)}>{mine.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}<option value="new">+ new portfolio…</option></select></div>
      {target === "new" && <div className="field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>}
      <div className="field"><label>Your annotation <Help text="Why this node matters to you, in your own words. Annotations of 40+ characters count as real annotations in your portfolio report." /></label><textarea rows={3} value={annotation} onChange={(e) => setAnnotation(e.target.value)} placeholder="What does this node mean for your own question?" /></div>
      <button className="btn btn-primary">Add to my portfolio</button>
      <p className="muted" style={{ marginTop: 8 }}>Tip: hold Ctrl and click several nodes in the graph to add a whole cluster at once.</p>
    </form>
  );
}
