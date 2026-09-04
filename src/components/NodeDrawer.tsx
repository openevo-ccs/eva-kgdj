import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GraphNode, NodeDetail, Subgraph } from "../lib/types";
import { CHANGE_LABEL } from "../lib/types";
import { isEditor, useApi, useSession } from "../state/session";
import { DeptSwatch, ProvenanceChip, StatusChip } from "./Chips";
import { ReviewForm, ReviewList, ReviewSummaryBar } from "./ReviewPanel";

export function NodeDrawer({ nodeId, nodesById, onClose, onChanged }: { nodeId: string; nodesById: Record<string, GraphNode>; onClose: () => void; onChanged: () => void }) {
  const api = useApi(); const { profile, deptById, myModules } = useSession();
  const [d, setD] = useState<NodeDetail | null>(null);
  const [tab, setTab] = useState<"about" | "reviews" | "propose" | "fork">("about");
  const [subgraphs, setSubgraphs] = useState<Subgraph[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api.node(nodeId).then(setD).catch((e) => setMsg((e as Error).message));
  useEffect(() => { setD(null); setMsg(null); setTab("about"); load(); }, [nodeId]);
  useEffect(() => { if (tab === "fork") api.subgraphs().then(setSubgraphs); }, [tab]);
  if (!d) return <div className="drawer">{msg ? <div className="notice notice-bad">{msg}</div> : <div className="muted">Loading…</div>}</div>;
  const n = d.node; const dept = n.department_id ? deptById[n.department_id] : null;
  const editor = isEditor(profile);
  const decide = async (decision: "promote" | "archive") => { if (!confirm(`${decision} "${n.label}"?`)) return; await api.decide({ node_id: n.id, decision, feedback: "" }); await load(); onChanged(); };
  return (
    <div className="drawer">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><DeptSwatch dept={dept} />{n.label}</h2><button className="btn" onClick={onClose}>×</button></div>
      <div className="row"><StatusChip status={n.status} /><span className="chip">{n.type_code}</span><ProvenanceChip prov={n.provenance} status={n.status} /><span className="muted">v{n.version}</span></div>
      {d.flags.length > 0 && <div className="notice notice-bad" style={{ marginTop: 8 }}>⚑ {d.flags[0].reason.replace(/_/g, " ")} — this record needs a fresh identified review before promotion.</div>}
      <div className="tabs">{(["about", "reviews", "propose", "fork"] as const).map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t === "reviews" ? `reviews (${d.reviews.length})` : t === "fork" ? "fork to portfolio" : t}</button>)}</div>

      {tab === "about" && <>
        <p>{n.description || <span className="muted">No description.</span>}</p>
        {n.tags.length > 0 && <div className="row">{n.tags.map((t) => <span className="chip" key={t}>{t}</span>)}</div>}
        <h3 style={{ marginTop: 12 }}>Citations ({d.citations.length})</h3>
        {d.citations.length ? <ul>{d.citations.map((c) => <li key={c.id}>{c.authors.slice(0, 3).join(", ")}{c.authors.length > 3 ? " et al." : ""} ({c.year ?? "n.d."}). {c.title}. {c.doi && <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noopener">doi</a>}</li>)}</ul> : <div className="muted">None yet — a proposal adding one is the natural first contribution.</div>}
        <h3>Connections ({d.edges.length})</h3>
        <ul>{d.edges.slice(0, 40).map((e) => { const other = e.source_node_id === n.id ? e.target_node_id : e.source_node_id; const o = nodesById[other]; return <li key={e.id}>{e.source_node_id === n.id ? "→" : "←"} <i>{e.relationship_code}</i> {o ? o.label : other} <StatusChip status={e.status} /></li>; })}</ul>
        {d.proposals.length > 0 && <><h3>Open proposals</h3><ul>{d.proposals.map((p) => <li key={p.id}><Link to={`/proposals/${p.id}`}>{CHANGE_LABEL[p.change_type]}</Link> <StatusChip status={p.status} /></li>)}</ul></>}
        <div className="muted" style={{ marginTop: 10 }}>ids: <code>{n.slug}</code>{Object.entries(n.external_ids).map(([k, v]) => <span key={k}> · {k}: <code>{String(v)}</code></span>)}</div>
        {editor && n.status !== "canonical" && <div className="row" style={{ marginTop: 12 }}><button className="btn btn-primary" onClick={() => decide("promote")}>Promote to canonical</button><button className="btn btn-danger" onClick={() => decide("archive")}>Archive</button></div>}
        {editor && n.status === "canonical" && <div className="row" style={{ marginTop: 12 }}><button className="btn btn-danger" onClick={() => decide("archive")}>Archive</button></div>}
      </>}

      {tab === "reviews" && <>
        <ReviewSummaryBar s={d.summary} />
        <ReviewList reviews={d.reviews} />
        <div style={{ marginTop: 12 }}><ReviewForm kind="node" targetId={n.id} onDone={load} disabledReason={profile && n.created_by === profile.id ? "You authored this node — conflict of interest." : null} /></div>
      </>}

      {tab === "propose" && <>
        <p className="muted">Propose an edit to this node, or its archival. Edits need at least one citation before submission.</p>
        <div className="row"><Link className="btn btn-primary" to={`/proposals/new?type=edit_node&node=${n.id}`}>Propose edit</Link><Link className="btn" to={`/proposals/new?type=add_edge&node=${n.id}`}>Propose a connection</Link><Link className="btn btn-danger" to={`/proposals/new?type=archive_node&node=${n.id}`}>Propose archival</Link></div>
      </>}

      {tab === "fork" && <ForkPanel node={n} subgraphs={subgraphs} onDone={(m) => { setMsg(m); setTab("about"); }} myModuleId={myModules[0]?.module.id ?? null} />}
      {msg && <div className="notice notice-ok" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}

function ForkPanel({ node, subgraphs, onDone, myModuleId }: { node: GraphNode; subgraphs: Subgraph[]; onDone: (m: string) => void; myModuleId: string | null }) {
  const api = useApi(); const { profile } = useSession();
  const mine = subgraphs.filter((g) => g.owner_id === profile?.id);
  const [target, setTarget] = useState<string>(mine[0]?.id ?? "new");
  const [title, setTitle] = useState("My orientation graph");
  const [annotation, setAnnotation] = useState("");
  const [week, setWeek] = useState<number | "">("");
  useEffect(() => { if (mine.length && target === "new") setTarget(mine[0].id); }, [subgraphs]);
  return (
    <form onSubmit={async (e) => { e.preventDefault(); let id = target; if (id === "new") id = (await api.createSubgraph(title, myModuleId)).id; await api.forkNode(id, node.id, annotation, week === "" ? null : Number(week)); onDone(`Added "${node.label}" to your portfolio.`); }}>
      <div className="field"><label>Portfolio</label><select value={target} onChange={(e) => setTarget(e.target.value)}>{mine.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}<option value="new">+ new portfolio…</option></select></div>
      {target === "new" && <div className="field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>}
      <div className="field"><label>Your annotation (why this node matters to you)</label><textarea rows={3} value={annotation} onChange={(e) => setAnnotation(e.target.value)} /></div>
      <div className="field"><label>Module week</label><input type="number" min={1} max={15} value={week} onChange={(e) => setWeek(e.target.value === "" ? "" : Number(e.target.value))} /></div>
      <button className="btn btn-primary">Fork to portfolio</button>
    </form>
  );
}
