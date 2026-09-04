import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { ChangeType, Citation, GraphNode, Proposal } from "../lib/types";
import { CHANGE_LABEL } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { StatusChip } from "../components/Chips";

export default function ProposalsPage() {
  const api = useApi(); const { profile } = useSession();
  const [rows, setRows] = useState<Proposal[]>([]);
  const [mine, setMine] = useState(false);
  useEffect(() => { api.proposals(mine ? { mine: true } : undefined).then(setRows); }, [mine]);
  return (
    <div className="page page-narrow">
      <div className="row" style={{ justifyContent: "space-between" }}><h1>Proposals</h1><div className="row"><label className="chip"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> only mine</label><Link className="btn btn-primary" to="/proposals/new">New proposal</Link></div></div>
      <p className="muted">Anyone may review any submitted proposal (never their own). Editors decide once the reviews are sufficient.</p>
      <table><thead><tr><th>Change</th><th>Rationale</th><th>Submitter</th><th>Status</th><th>Updated</th></tr></thead>
        <tbody>{rows.map((p) => <tr key={p.id}><td><Link to={`/proposals/${p.id}`}>{CHANGE_LABEL[p.change_type]}</Link></td><td>{p.rationale.slice(0, 120)}{p.rationale.length > 120 ? "…" : ""}</td><td>{p.proposer_id ? (p.proposer_id === profile?.id ? "you" : "member") : <span className="muted">anonymous</span>}</td><td><StatusChip status={p.status} /></td><td className="muted">{new Date(p.updated_at).toLocaleDateString()}</td></tr>)}
          {!rows.length && <tr><td colSpan={5} className="muted">No proposals yet.</td></tr>}</tbody></table>
    </div>
  );
}

export function NewProposalPage() {
  const api = useApi(); const { departments, myModules } = useSession(); const nav = useNavigate();
  const [sp] = useSearchParams();
  const [type, setType] = useState<ChangeType>((sp.get("type") as ChangeType) || "add_node");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [targetNode, setTargetNode] = useState<string>(sp.get("node") || "");
  const [label, setLabel] = useState(""); const [typeCode, setTypeCode] = useState("concept"); const [desc, setDesc] = useState(""); const [dept, setDept] = useState("");
  const [edgeTarget, setEdgeTarget] = useState(""); const [rel, setRel] = useState("relates-to"); const [edgeLabel, setEdgeLabel] = useState(""); const [weight, setWeight] = useState(3);
  const [rationale, setRationale] = useState(""); const [anonymous, setAnonymous] = useState(false);
  const [citQ, setCitQ] = useState(""); const [found, setFound] = useState<Citation[]>([]); const [chosen, setChosen] = useState<Citation[]>([]);
  const [newDoi, setNewDoi] = useState(""); const [newTitle, setNewTitle] = useState(""); const [newAuthors, setNewAuthors] = useState(""); const [newYear, setNewYear] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { api.graph().then((g) => setNodes(g.nodes)); }, []);
  useEffect(() => { const t = setTimeout(() => api.searchCitations(citQ).then(setFound), 250); return () => clearTimeout(t); }, [citQ]);
  useEffect(() => { const n = nodes.find((x) => x.id === targetNode); if (n && type === "edit_node") { setLabel(n.label); setDesc(n.description); setTypeCode(n.type_code); } }, [targetNode, nodes, type]);
  const nodeOpts = useMemo(() => nodes.slice().sort((a, b) => a.label.localeCompare(b.label)), [nodes]);
  const needsCitation = ["add_node", "edit_node", "add_edge", "edit_edge"].includes(type);

  const submit = async (asDraft: boolean) => {
    setBusy(true); setErr(null);
    try {
      const payload: Record<string, unknown> = type === "add_node" ? { label, type_code: typeCode, description: desc, department_code: dept || undefined }
        : type === "edit_node" ? { label, type_code: typeCode, description: desc, ...(dept ? { department_code: dept } : {}) }
        : type === "add_edge" ? { source_node_id: targetNode, target_node_id: edgeTarget, relationship_code: rel, label: edgeLabel || undefined, weight } : {};
      const id = await api.createProposal({ change_type: type, target_node_id: ["edit_node", "archive_node"].includes(type) ? targetNode : null, payload, rationale, module_id: myModules[0]?.module.id ?? null, submitter_anonymous: anonymous, citation_ids: chosen.map((c) => c.id) }, !asDraft);
      nav(`/proposals/${id}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const addCitation = async () => { const c = await api.addCitation({ doi: newDoi || null, title: newTitle, authors: newAuthors.split(";").map((s) => s.trim()).filter(Boolean), year: newYear ? Number(newYear) : null }); setChosen([...chosen, c]); setNewDoi(""); setNewTitle(""); setNewAuthors(""); setNewYear(""); };

  return (
    <div className="page page-narrow">
      <h1>New proposal</h1>
      <div className="card">
        <div className="field"><label>Change type</label><select value={type} onChange={(e) => setType(e.target.value as ChangeType)}>{Object.entries(CHANGE_LABEL).filter(([k]) => !k.includes("edge") || k === "add_edge").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {(type === "edit_node" || type === "archive_node" || type === "add_edge") && <div className="field"><label>{type === "add_edge" ? "From node" : "Target node"}</label><select value={targetNode} onChange={(e) => setTargetNode(e.target.value)}><option value="">— choose —</option>{nodeOpts.map((n) => <option key={n.id} value={n.id}>{n.label} ({n.type_code})</option>)}</select></div>}
        {(type === "add_node" || type === "edit_node") && <>
          <div className="field"><label>Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="row"><div className="field" style={{ flex: 1 }}><label>Type</label><select value={typeCode} onChange={(e) => setTypeCode(e.target.value)}>{["theory", "domain", "method", "topic", "finding", "concept", "scicomm-sensitivity", "ethics-note", "fieldsite"].map((t) => <option key={t}>{t}</option>)}</select></div>
            <div className="field" style={{ flex: 1 }}><label>Department</label><select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">cross-department / unchanged</option>{departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}</select></div></div>
          <div className="field"><label>Description</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </>}
        {type === "add_edge" && <>
          <div className="field"><label>To node</label><select value={edgeTarget} onChange={(e) => setEdgeTarget(e.target.value)}><option value="">— choose —</option>{nodeOpts.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select></div>
          <div className="row"><div className="field" style={{ flex: 1 }}><label>Relationship</label><select value={rel} onChange={(e) => setRel(e.target.value)}>{["grounds", "enables", "applies-to", "measures", "informs", "contrasts-with", "relates-to", "cross-dept", "evidences", "cites", "same-as"].map((r) => <option key={r}>{r}</option>)}</select></div>
            <div className="field" style={{ flex: 1 }}><label>Label (optional)</label><input value={edgeLabel} onChange={(e) => setEdgeLabel(e.target.value)} /></div>
            <div className="field"><label>Weight 0–5</label><input type="number" min={0} max={5} step={0.5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} /></div></div>
        </>}
        <div className="field"><label>Rationale (≥ 20 characters; markdown)</label><textarea value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why should the canonical graph change? What is the evidence?" /></div>
        <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} /> submit anonymously (hidden from members; editors and your module's instructor still see you; you can change this any time)</label>
      </div>
      <div className="card">
        <h2>Citations {needsCitation && <span className="muted">(at least one required)</span>}</h2>
        {chosen.map((c) => <div className="row" key={c.id}><span className="chip chip-verified">{c.doi || c.pure_handle}</span><span>{c.title} ({c.year ?? "n.d."})</span><button className="btn" onClick={() => setChosen(chosen.filter((x) => x.id !== c.id))}>remove</button></div>)}
        <div className="field" style={{ marginTop: 8 }}><label>Find an existing citation (DOI or title)</label><input value={citQ} onChange={(e) => setCitQ(e.target.value)} placeholder="10.1017/… or title words" /></div>
        {found.filter((f) => !chosen.some((c) => c.id === f.id)).slice(0, 8).map((c) => <div className="row" key={c.id}><button className="btn" onClick={() => setChosen([...chosen, c])}>add</button><span>{c.authors.slice(0, 2).join(", ")} ({c.year ?? "n.d."}) {c.title}</span></div>)}
        <details style={{ marginTop: 10 }}><summary className="muted">Add a citation not yet in the journal</summary>
          <div className="row"><div className="field" style={{ flex: 1 }}><label>DOI (or leave empty and give a PuRe handle in title notes)</label><input value={newDoi} onChange={(e) => setNewDoi(e.target.value)} placeholder="10.…" /></div><div className="field"><label>Year</label><input value={newYear} onChange={(e) => setNewYear(e.target.value)} style={{ width: 80 }} /></div></div>
          <div className="field"><label>Title</label><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} /></div>
          <div className="field"><label>Authors (Family, Given; separated by ;)</label><input value={newAuthors} onChange={(e) => setNewAuthors(e.target.value)} /></div>
          <button className="btn" type="button" disabled={!newTitle || (!newDoi)} onClick={addCitation}>Add citation</button>
          <div className="muted">Citations are Crossref-verified by the editors' routine (<code>evalit verify</code>); an unverifiable DOI will be flagged in review.</div>
        </details>
      </div>
      {err && <div className="notice notice-bad">{err}</div>}
      <div className="row"><button className="btn btn-primary" disabled={busy} onClick={() => submit(false)}>Submit for review</button><button className="btn" disabled={busy} onClick={() => submit(true)}>Save as draft</button></div>
    </div>
  );
}
