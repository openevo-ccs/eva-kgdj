import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GraphNode, Proposal, ReviewFlag, ReviewSummary } from "../lib/types";
import { CHANGE_LABEL } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { DeptSwatch, StatusChip } from "../components/Chips";

export default function EditorialPage() {
  const api = useApi(); const { deptById } = useSession();
  const [queue, setQueue] = useState<{ proposals: Proposal[]; summaries: Record<string, ReviewSummary> }>({ proposals: [], summaries: {} });
  const [flags, setFlags] = useState<ReviewFlag[]>([]);
  const [seed, setSeed] = useState<GraphNode[]>([]);
  const [nodeSummaries, setNodeSummaries] = useState<Record<string, ReviewSummary>>({});
  const [note, setNote] = useState("");
  const load = async () => {
    const [q, f, g] = await Promise.all([api.reviewQueue(), api.flags(), api.graph()]);
    setQueue(q); setFlags(f);
    const proposed = g.nodes.filter((n) => n.status === "proposed");
    setSeed(proposed);
    const sums: Record<string, ReviewSummary> = {};
    await Promise.all(proposed.slice(0, 400).map(async (n) => { const s = await api.reviewSummary("node", n.id); if (s) sums[n.id] = s; }));
    setNodeSummaries(sums);
  };
  useEffect(() => { load(); }, []);
  const reviewedSeed = seed.filter((n) => nodeSummaries[n.id]).sort((a, b) => (nodeSummaries[b.id].mean_score ?? 0) - (nodeSummaries[a.id].mean_score ?? 0));
  const promote = async (n: GraphNode) => { if (!confirm(`Promote "${n.label}" to canonical?`)) return; await api.decide({ node_id: n.id, decision: "promote" }); await load(); };
  return (
    <div className="page page-narrow">
      <h1>Editorial dashboard</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="stat"><b>{queue.proposals.length}</b><span>open proposals</span></div>
        <div className="stat"><b>{seed.length}</b><span>seed nodes awaiting promotion</span></div>
        <div className="stat"><b>{reviewedSeed.length}</b><span>of them reviewed</span></div>
        <div className="stat" style={flags.length ? { borderColor: "#f0b8b8" } : {}}><b>{flags.length}</b><span>integrity flags</span></div>
      </div>
      {flags.length > 0 && <div className="card"><h2>Reviewer-integrity flags</h2><p className="muted">Every identified reviewer of these records has since erased their account. A fresh identified review is needed before (re)promotion.</p>
        <table><thead><tr><th>Target</th><th>Reason</th><th>Raised</th><th></th></tr></thead><tbody>{flags.map((f) => <tr key={f.id}><td>{f.target_kind} <Link to={f.target_kind === "node" ? `/explore/${f.target_id}` : `/proposals/${f.target_id}`}>{f.target_id.slice(0, 8)}…</Link></td><td>{f.reason.replace(/_/g, " ")}</td><td className="muted">{new Date(f.raised_at).toLocaleDateString()}</td><td><input placeholder="note" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 160 }} /> <button className="btn" onClick={async () => { await api.resolveFlag(f.id, note); setNote(""); load(); }}>resolve</button></td></tr>)}</tbody></table></div>}
      <div className="card"><h2>Proposals awaiting decision</h2>
        <table><thead><tr><th>Change</th><th>Status</th><th>Reviews</th><th>Mean</th><th>Credible</th><th>Updated</th></tr></thead>
          <tbody>{queue.proposals.map((p) => { const s = queue.summaries[p.id]; return <tr key={p.id}><td><Link to={`/proposals/${p.id}`}>{CHANGE_LABEL[p.change_type]}</Link><div className="muted">{p.rationale.slice(0, 90)}…</div></td><td><StatusChip status={p.status} /></td><td>{s?.n_reviews ?? 0}</td><td>{s?.mean_score ?? "—"}</td><td>{s ? (s.all_reviewers_deleted ? <span className="chip chip-flag">none</span> : s.credible_reviews) : "—"}</td><td className="muted">{new Date(p.updated_at).toLocaleDateString()}</td></tr>; })}
            {!queue.proposals.length && <tr><td colSpan={6} className="muted">Nothing waiting.</td></tr>}</tbody></table></div>
      <div className="card"><h2>Seed nodes with reviews — ready to promote?</h2><p className="muted">The imported mpi-eva-graph nodes are single-pass drafts. Promote when you judge the identified reviews sufficient; archive what should not enter the journal.</p>
        <table><thead><tr><th>Node</th><th>Reviews</th><th>Mean</th><th>Credible</th><th></th></tr></thead>
          <tbody>{reviewedSeed.map((n) => { const s = nodeSummaries[n.id]; return <tr key={n.id}><td><DeptSwatch dept={n.department_id ? deptById[n.department_id] : null} /><Link to={`/explore/${n.id}`}>{n.label}</Link> <span className="muted">{n.type_code}</span></td><td>{s.n_reviews}</td><td>{s.mean_score}</td><td>{s.all_reviewers_deleted ? <span className="chip chip-flag">none</span> : s.credible_reviews}</td><td><button className="btn btn-primary" disabled={s.all_reviewers_deleted} onClick={() => promote(n)}>promote</button></td></tr>; })}
            {!reviewedSeed.length && <tr><td colSpan={5} className="muted">No seed node has been reviewed yet.</td></tr>}</tbody></table></div>
    </div>
  );
}
