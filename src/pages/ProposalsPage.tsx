import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { ChangeType, Citation, GraphEdge, GraphNode, Proposal } from "../lib/types";
import { CHANGE_LABEL, isVerifiedCitation } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { StatusChip } from "../components/Chips";
import { Help, Tip } from "../components/Tip";

// Prefill/batch shapes a caller (e.g. PortfolioPage, turning a private idea into a real
// proposal) passes via router state — see proposeNode/proposeLink/BulkPanel.doPropose there.
type NodePrefill = { change_type: "add_node"; label: string; type_code: string; description: string; source_commons_item_id?: string };
type EdgePrefill = { change_type: "add_edge"; source_node_id: string; target_node_id: string; relationship_code: string; label?: string };
export type ProposalPrefill = NodePrefill | EdgePrefill;
export interface ProposalBatch { items: ProposalPrefill[] }
interface NavState { prefill?: ProposalPrefill; batch?: ProposalBatch }

const STATUS_TIP: Record<string, string> = { draft: "Saved by the submitter, not yet visible to reviewers", pending: "Submitted; waiting for the first review", under_review: "Has at least one review; editors decide when reviews suffice", revision_requested: "An editor asked the submitter for changes", approved: "Applied to the canonical graph", rejected: "Declined by an editor (feedback on the proposal page)", withdrawn: "Withdrawn by the submitter" };

export default function ProposalsPage() {
  const api = useApi(); const { profile } = useSession();
  const [rows, setRows] = useState<Proposal[]>([]);
  const [mine, setMine] = useState(false);
  useEffect(() => { api.proposals(mine ? { mine: true } : undefined).then(setRows); }, [mine]);
  return (
    <div className="page page-narrow">
      <div className="row" style={{ justifyContent: "space-between" }}><h1>Proposals <Help text="Every change to the canonical graph is a proposal: a rationale, at least one citation for additions and edits, peer reviews by anyone (never the submitter), then an editorial decision." /></h1><div className="row"><label className="chip"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> only mine</label><Link className="btn btn-primary" to="/proposals/new">New proposal</Link></div></div>
      <p className="muted">Anyone may review any submitted proposal (never their own). Editors decide once the reviews are sufficient. Submitters may stay anonymous towards members; reviewers are always identified.</p>
      <table><thead><tr><th>Change</th><th>Rationale</th><th>Submitter</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody>{rows.map((p) => <tr key={p.id}><td><Link to={`/proposals/${p.id}`}>{CHANGE_LABEL[p.change_type]}</Link></td><td>{p.rationale.slice(0, 120)}{p.rationale.length > 120 ? "…" : ""}</td><td>{p.proposer_id ? (p.proposer_id === profile?.id ? "you" : "member") : <span className="muted">anonymous</span>}</td><td><Tip text={STATUS_TIP[p.status] || p.status}><StatusChip status={p.status} /></Tip></td><td className="muted">{new Date(p.updated_at).toLocaleDateString()}</td></tr>)}
          {!rows.length && <tr><td colSpan={5} className="muted">No proposals yet. Open a node in the Graph and use "propose", or start a new one above.</td></tr>}</tbody></table>
    </div>
  );
}

export function NewProposalPage() {
  const api = useApi(); const { departments, myModules } = useSession(); const nav = useNavigate();
  const [sp] = useSearchParams();
  const navState = (useLocation().state as NavState | null) || null;
  const batch = navState?.batch ?? null;
  const [type, setType] = useState<ChangeType>(navState?.prefill?.change_type || (sp.get("type") as ChangeType) || "add_node");
  const [nodes, setNodes] = useState<GraphNode[]>([]); const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [targetNode, setTargetNode] = useState<string>(navState?.prefill?.change_type === "add_edge" ? navState.prefill.source_node_id : sp.get("node") || "");
  const [targetEdge, setTargetEdge] = useState<string>(sp.get("edge") || "");
  const p0 = navState?.prefill;
  const [label, setLabel] = useState(p0?.change_type === "add_node" ? p0.label : ""); const [typeCode, setTypeCode] = useState(p0?.change_type === "add_node" ? p0.type_code : "concept"); const [desc, setDesc] = useState(p0?.change_type === "add_node" ? p0.description : ""); const [dept, setDept] = useState("");
  const [edgeTarget, setEdgeTarget] = useState(p0?.change_type === "add_edge" ? p0.target_node_id : ""); const [rel, setRel] = useState(p0?.change_type === "add_edge" ? p0.relationship_code : "relates-to"); const [edgeLabel, setEdgeLabel] = useState(p0?.change_type === "add_edge" ? p0.label || "" : ""); const [weight, setWeight] = useState(3);
  const [rationale, setRationale] = useState(""); const [anonymous, setAnonymous] = useState(false);
  const [citQ, setCitQ] = useState(""); const [found, setFound] = useState<Citation[]>([]); const [chosen, setChosen] = useState<Citation[]>([]);
  const [newDoi, setNewDoi] = useState(""); const [newTitle, setNewTitle] = useState(""); const [newAuthors, setNewAuthors] = useState(""); const [newYear, setNewYear] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { api.graph().then((g) => { setNodes(g.nodes); setEdges(g.edges); }); }, []);
  useEffect(() => { const t = setTimeout(() => api.searchCitations(citQ).then(setFound), 250); return () => clearTimeout(t); }, [citQ]);
  useEffect(() => { const n = nodes.find((x) => x.id === targetNode); if (n && type === "edit_node") { setLabel(n.label); setDesc(n.description); setTypeCode(n.type_code); } }, [targetNode, nodes, type]);
  useEffect(() => { const e = edges.find((x) => x.id === targetEdge); if (e && type === "edit_edge") { setRel(e.relationship_code); setEdgeLabel(e.label || ""); setWeight(e.weight); } }, [targetEdge, edges, type]);
  const nodeOpts = useMemo(() => nodes.slice().sort((a, b) => a.label.localeCompare(b.label)), [nodes]);
  const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const edgeOpts = useMemo(() => edges.map((e) => ({ id: e.id, text: `${nodeLabel(e.source_node_id)} → ${e.relationship_code} → ${nodeLabel(e.target_node_id)}` })).sort((a, b) => a.text.localeCompare(b.text)), [edges, nodes]);
  const needsCitation = ["add_node", "edit_node", "add_edge", "edit_edge"].includes(type);
  const isEdgeType = type === "edit_edge" || type === "delete_edge";

  const submit = async (asDraft: boolean) => {
    setBusy(true); setErr(null);
    try {
      const payload: Record<string, unknown> = type === "add_node" ? { label, type_code: typeCode, description: desc, department_code: dept || undefined }
        : type === "edit_node" ? { label, type_code: typeCode, description: desc, ...(dept ? { department_code: dept } : {}) }
        : type === "add_edge" ? { source_node_id: targetNode, target_node_id: edgeTarget, relationship_code: rel, label: edgeLabel || undefined, weight }
        : type === "edit_edge" ? { relationship_code: rel, label: edgeLabel || undefined, weight } : {};
      const id = await api.createProposal({ change_type: type, target_node_id: ["edit_node", "archive_node"].includes(type) ? targetNode : null, target_edge_id: isEdgeType ? targetEdge : null, payload, rationale, module_id: myModules[0]?.module.id ?? null, submitter_anonymous: anonymous, citation_ids: chosen.map((c) => c.id), source_commons_item_id: p0?.change_type === "add_node" ? p0.source_commons_item_id ?? null : null }, !asDraft);
      nav(`/proposals/${id}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const addCitation = async () => { const c = await api.addCitation({ doi: newDoi || null, title: newTitle, authors: newAuthors.split(";").map((s) => s.trim()).filter(Boolean), year: newYear ? Number(newYear) : null }); setChosen([...chosen, c]); setNewDoi(""); setNewTitle(""); setNewAuthors(""); setNewYear(""); };
  const submitBatch = async () => {
    if (!batch) return; setBusy(true); setErr(null);
    try {
      if (rationale.length < 20) throw new Error("A proposal needs a rationale of at least 20 characters before submission");
      if (!chosen.length) throw new Error("At least one citation is required before submission");
      for (const item of batch.items) {
        const payload = item.change_type === "add_node" ? { label: item.label, type_code: item.type_code, description: item.description } : { source_node_id: item.source_node_id, target_node_id: item.target_node_id, relationship_code: item.relationship_code, label: item.label || undefined };
        await api.createProposal({ change_type: item.change_type, target_node_id: null, payload, rationale, module_id: myModules[0]?.module.id ?? null, submitter_anonymous: anonymous, citation_ids: chosen.map((c) => c.id) }, true);
      }
      nav("/proposals");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const citationsCard = (needsCit: boolean) => (
    <div className="card">
      <h2>Citations {needsCit && <span className="muted">(at least one required)</span>} <Help text="Additions and edits must cite at least one source (DOI or PuRe handle). Search the journal's citation pool first; add a new one only if it is missing." /></h2>
      {chosen.map((c) => {
        const verified = isVerifiedCitation(c);
        return <div className="row" key={c.id}>
          <Tip text={verified ? "Matched against the institute's own PuRe repository record — this is genuinely MPI-EVA-affiliated work, not just a resolvable identifier." : "Has an identifier, but nobody has confirmed it against the institute's own records yet. Not wrong — just not yet verified the way an imported citation is."}>
            <span className={verified ? "chip chip-verified" : "chip"}>{verified ? "✓ " : ""}{c.doi || c.pure_handle}</span>
          </Tip>
          <span>{c.title} ({c.year ?? "n.d."})</span>
          <button className="btn" onClick={() => setChosen(chosen.filter((x) => x.id !== c.id))}>remove</button>
        </div>;
      })}
      <div className="field" style={{ marginTop: 8 }}><label>Find an existing citation (DOI or title)</label><input value={citQ} onChange={(e) => setCitQ(e.target.value)} placeholder="10.1017/… or title words" /></div>
      {found.filter((f) => !chosen.some((c) => c.id === f.id)).slice(0, 8).map((c) => <div className="row" key={c.id}><button className="btn" onClick={() => setChosen([...chosen, c])}>add</button><span>{c.authors.slice(0, 2).join(", ")} ({c.year ?? "n.d."}) {c.title}</span></div>)}
      <details style={{ marginTop: 10 }}><summary className="muted">Add a citation not yet in the journal</summary>
        <div className="row"><div className="field" style={{ flex: 1 }}><label>DOI</label><input value={newDoi} onChange={(e) => setNewDoi(e.target.value)} placeholder="10.…" /></div><div className="field"><label>Year</label><input value={newYear} onChange={(e) => setNewYear(e.target.value)} style={{ width: 80 }} /></div></div>
        <div className="field"><label>Title</label><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></div>
        <div className="field"><label>Authors (Family, Given; separated by ;)</label><input value={newAuthors} onChange={(e) => setNewAuthors(e.target.value)} /></div>
        <button className="btn" type="button" disabled={!newTitle || (!newDoi)} onClick={addCitation}>Add citation</button>
        <div className="muted">Citations are Crossref-verified by the editors' routine (<code>evalit verify</code>); an unverifiable DOI will be flagged in review.</div>
      </details>
    </div>
  );

  if (batch) return (
    <div className="page page-narrow">
      <h1>Propose {batch.items.length} item{batch.items.length === 1 ? "" : "s"} to the canonical graph <Help text="One rationale and citation set is used for all of them; each becomes its own proposal, peer-reviewed independently." /></h1>
      <div className="card">
        <h2>What you're proposing</h2>
        <ul>{batch.items.map((it, i) => <li key={i}>{it.change_type === "add_node" ? <>new node: <b>{it.label}</b> <span className="muted">({it.type_code})</span></> : <>new connection: <b>{nodeLabel(it.source_node_id)} → {it.relationship_code} → {nodeLabel(it.target_node_id)}</b></>}</li>)}</ul>
      </div>
      <div className="card">
        <div className="field"><label>Rationale (≥ 20 characters; markdown, shared by all {batch.items.length})</label><textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why should these join the canonical graph? What is the evidence?" /></div>
        <Tip text="Members see 'anonymous'; editors and your module's instructor still see who submitted. Reviewers are always identified." block><label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> submit anonymously</label></Tip>
      </div>
      {citationsCard(true)}
      {err && <div className="notice notice-bad">{err}</div>}
      <div className="row"><button className="btn btn-primary" disabled={busy} onClick={submitBatch}>Submit {batch.items.length} proposal{batch.items.length === 1 ? "" : "s"}</button><Link className="btn" to="/portfolio">Cancel</Link></div>
    </div>
  );

  return (
    <div className="page page-narrow">
      <h1>New proposal <Help text="A proposal is reviewed by peers before an editor applies it. Write the rationale as if for a reviewer who has not read your sources: what changes, and what evidence supports it." /></h1>
      {p0?.change_type === "add_node" && p0.source_commons_item_id && <p className="muted">Promoting a commons item into the canonical graph — once approved, the item stays linked back to this node.</p>}
      <div className="card">
        <div className="field"><label>Change type</label><select value={type} onChange={(e) => setType(e.target.value as ChangeType)}>{Object.entries(CHANGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {(type === "edit_node" || type === "archive_node" || type === "add_edge") && <div className="field"><label>{type === "add_edge" ? "From node" : "Target node"}</label><select value={targetNode} onChange={(e) => setTargetNode(e.target.value)}><option value="">— choose —</option>{nodeOpts.map((n) => <option key={n.id} value={n.id}>{n.label} ({n.type_code})</option>)}</select></div>}
        {isEdgeType && <div className="field"><label>Edge</label><select value={targetEdge} onChange={(e) => setTargetEdge(e.target.value)}><option value="">— choose —</option>{edgeOpts.map((e) => <option key={e.id} value={e.id}>{e.text}</option>)}</select></div>}
        {(type === "add_node" || type === "edit_node") && <>
          <div className="field"><label>Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="row"><div className="field" style={{ flex: 1 }}><label>Type</label><select value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>{["theory", "domain", "method", "topic", "finding", "concept", "scicomm-sensitivity", "ethics-note", "fieldsite"].map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field" style={{ flex: 1 }}><label>Department</label><select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">cross-department / unchanged</option>{departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select></div></div>
          <div className="field"><label>Description</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </>}
        {(type === "add_edge" || type === "edit_edge") && <>
          {type === "add_edge" && <div className="field"><label>To node</label><select value={edgeTarget} onChange={(e) => setEdgeTarget(e.target.value)}><option value="">— choose —</option>{nodeOpts.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select></div>}
          <div className="row"><div className="field" style={{ flex: 1 }}><label>Relationship <Help text="Read in the arrow's direction: 'A grounds B' = A is a foundation for B; 'measures' = a method measures a construct; 'contrasts-with' for rival accounts." /></label><select value={rel} onChange={(e) => setRel(e.target.value)}>{["grounds", "enables", "applies-to", "measures", "informs", "contrasts-with", "relates-to", "cross-dept", "evidences", "cites", "same-as"].map((r) => <option key={r}>{r}</option>)}</select></div>
            <div className="field" style={{ flex: 1 }}><label>Label (optional)</label><input value={edgeLabel} onChange={(e) => setEdgeLabel(e.target.value)} /></div>
            <div className="field"><label>Weight 0–5</label><input type="number" min={0} max={5} step={0.5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></div></div>
        </>}
        <div className="field"><label>Rationale (≥ 20 characters; markdown)</label><textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why should the canonical graph change? What is the evidence?" /></div>
        <Tip text="Members see 'anonymous'; editors and your module's instructor still see who submitted. Reviewers are always identified. You can switch this at any time on the proposal page." block><label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> submit anonymously</label></Tip>
      </div>
      {citationsCard(needsCitation)}
      {err && <div className="notice notice-bad">{err}</div>}
      <div className="row"><button className="btn btn-primary" disabled={busy} onClick={() => submit(false)}>Submit for review</button><Tip text="Keep it private and finish later; drafts are not visible to reviewers"><button className="btn" disabled={busy} onClick={() => submit(true)}>Save as draft</button></Tip></div>
    </div>
  );
}
