import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { GraphNode, Proposal, ReviewFlag, ReviewSummary } from "../lib/types";
import { CHANGE_LABEL } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { DeptSwatch, StatusChip } from "../components/Chips";
import { Tip, Help } from "../components/Tip";
import { departmentPairMatrix, pendantChains, underLinkedButPlausible, type DeptPair, type PendantChain, type UnderLinkedNode } from "../lib/coherence";

// A mean near 0 can mean "reviewers are lukewarm" or "reviewers actively disagree" — those call
// for different editorial responses (more reviews vs. a synthesis conversation) and the mean
// alone can't tell them apart. The rating-count breakdown ReviewSummary already carries can.
const disagrees = (s?: ReviewSummary) => !!s && s.strongly_accept + s.accept > 0 && s.reject + s.strongly_reject > 0;

export default function EditorialPage() {
  const api = useApi(); const { deptById, departments } = useSession();
  const [queue, setQueue] = useState<{ proposals: Proposal[]; summaries: Record<string, ReviewSummary> }>({ proposals: [], summaries: {} });
  const [flags, setFlags] = useState<ReviewFlag[]>([]);
  const [seed, setSeed] = useState<GraphNode[]>([]);
  const [nodeSummaries, setNodeSummaries] = useState<Record<string, ReviewSummary>>({});
  const [note, setNote] = useState("");
  // Structural coherence (docs/kgdj/12-graph-coherence.md): computed client-side, over
  // the SAME graph fetch load() already does for the seed-promotion card below — no
  // extra request. Recomputes on every load, so it reflects real edits as they land,
  // not a stale offline snapshot the way scripts/analyze_kgdj_coherence.py's report is.
  const [underLinked, setUnderLinked] = useState<UnderLinkedNode[]>([]);
  const [deptPairs, setDeptPairs] = useState<DeptPair[]>([]);
  const [chains, setChains] = useState<PendantChain[]>([]);
  const load = async () => {
    const [q, f, g] = await Promise.all([api.reviewQueue(), api.flags(), api.graph()]);
    setQueue(q); setFlags(f);
    const proposed = g.nodes.filter((n) => n.status === "proposed");
    setSeed(proposed);
    const sums: Record<string, ReviewSummary> = {};
    await Promise.all(proposed.slice(0, 400).map(async (n) => { const s = await api.reviewSummary("node", n.id); if (s) sums[n.id] = s; }));
    setNodeSummaries(sums);
    setUnderLinked(underLinkedButPlausible(g.nodes, g.edges));
    setDeptPairs(departmentPairMatrix(g.nodes, g.edges, departments));
    setChains(pendantChains(g.nodes, g.edges, departments));
  };
  useEffect(() => { load(); }, []);
  const emptyPairs = deptPairs.filter((p) => p.crossEdges === 0);
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
        <div className="stat" style={emptyPairs.length ? { borderColor: "#e9cf95" } : {}}><b>{emptyPairs.length}</b><span>department pairs with no bridge</span></div>
      </div>
      {flags.length > 0 && <div className="card"><h2>Reviewer-integrity flags</h2><p className="muted">Every identified reviewer of these records has since erased their account. A fresh identified review is needed before (re)promotion.</p>
        <table><thead><tr><th>Target</th><th>Reason</th><th>Raised</th><th></th></tr></thead><tbody>{flags.map((f) => <tr key={f.id}><td>{f.target_kind} <Link to={f.target_kind === "node" ? `/explore/${f.target_id}` : `/proposals/${f.target_id}`}>{f.target_id.slice(0, 8)}…</Link></td><td>{f.reason.replace(/_/g, " ")}</td><td className="muted">{new Date(f.raised_at).toLocaleDateString()}</td><td><input placeholder="note" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 160 }} /> <button className="btn" onClick={async () => { await api.resolveFlag(f.id, note); setNote(""); load(); }}>resolve</button></td></tr>)}</tbody></table></div>}
      <div className="card"><h2>Proposals awaiting decision</h2>
        <table><thead><tr><th>Change</th><th>Status</th><th>Reviews</th><th>Mean</th><th>Credible</th><th>Updated</th></tr></thead>
          <tbody>{queue.proposals.map((p) => { const s = queue.summaries[p.id]; return <tr key={p.id}><td><Link to={`/proposals/${p.id}`}>{CHANGE_LABEL[p.change_type]}</Link><div className="muted">{p.rationale.slice(0, 90)}…</div></td><td><StatusChip status={p.status} /></td><td>{s?.n_reviews ?? 0}</td><td>{s?.mean_score ?? "—"} {disagrees(s) && <Tip text="Reviewers didn't just land near the middle — at least one accepted and at least one rejected. Probably wants a synthesis conversation, not just more reviews."><span className="chip chip-flag">disagree</span></Tip>}</td><td>{s ? (s.all_reviewers_deleted ? <span className="chip chip-flag">none</span> : s.credible_reviews) : "—"}</td><td className="muted">{new Date(p.updated_at).toLocaleDateString()}</td></tr>; })}
            {!queue.proposals.length && <tr><td colSpan={6} className="muted">Nothing waiting.</td></tr>}</tbody></table></div>
      <div className="card"><h2>Graph coherence <Help text="Structural diagnostics, not content review: where the graph's shape itself has a gap, independent of whether any individual node or edge is correct. Recomputed live from the current graph on every visit to this page. See docs/kgdj/12-graph-coherence.md for the method and a worked example." /></h2>
        <p className="muted">Not a review queue — a map of where the graph's shape has a gap. Deliberately doesn't guess which two nodes should bridge a gap: that took real research when it was done on the sibling mpi-eva-graph, and a guessed pairing here would look like a claim rather than a question.</p>

        <h3>Department pairs with no direct connection ({emptyPairs.length} of {deptPairs.length})</h3>
        {emptyPairs.length > 0 ? <table><thead><tr><th>Departments</th><th></th></tr></thead><tbody>
          {emptyPairs.map((p) => <tr key={p.a.id + p.b.id}><td><DeptSwatch dept={p.a} />{p.a.name} <span className="muted">↔</span> <DeptSwatch dept={p.b} />{p.b.name}</td>
            <td><Tip text="Might be a real gap in the institute's actual research, or might not — that itself is worth recording once someone has looked."><Link className="btn btn-mini" to="/proposals/new?type=add_edge">propose a bridge…</Link></Tip></td></tr>)}
        </tbody></table> : <p className="muted">Every department pair has at least one direct connection.</p>}

        <h3 style={{ marginTop: 14 }}>Under-linked nodes with an obvious candidate ({underLinked.length}{underLinked.length >= 40 ? "+" : ""})</h3>
        <p className="muted">Degree ≤ 1, and the same department already has a theory or method that could plausibly ground it.</p>
        {underLinked.length > 0 ? <table><thead><tr><th>Node</th><th>Could connect to</th><th></th></tr></thead><tbody>
          {underLinked.slice(0, 15).map((u) => <tr key={u.node.id}><td><DeptSwatch dept={u.node.department_id ? deptById[u.node.department_id] : null} /><Link to={`/explore/${u.node.id}`}>{u.node.label}</Link> <span className="muted">{u.node.type_code}</span></td>
            <td className="muted">{u.candidateGrounding.map((g) => g.label).join(", ")}</td>
            <td><Link className="btn btn-mini" to={`/proposals/new?type=add_edge&node=${u.node.id}`}>propose a connection…</Link></td></tr>)}
        </tbody></table> : <p className="muted">None found.</p>}

        <h3 style={{ marginTop: 14 }}>Pendant chains ({chains.length})</h3>
        <p className="muted">A run of nodes connected only end-to-end, each missing its own direct link back to the department's real hub — often invisible in a table of degree numbers alone, obvious once you look at the actual nodes.</p>
        {chains.length > 0 ? chains.slice(0, 8).map((c, i) => <div className="review" key={i}>
          <DeptSwatch dept={c.department} />{c.department.name} <span className="muted">· {c.hops} hops</span>
          <div>{c.chain.map((n, j) => <span key={n.id}>{j > 0 && <span className="muted"> → </span>}<Link to={`/explore/${n.id}`}>{n.label}</Link></span>)}</div>
        </div>) : <p className="muted">None found.</p>}
      </div>

      <div className="card"><h2>Seed nodes with reviews — ready to promote?</h2><p className="muted">The imported mpi-eva-graph nodes are single-pass drafts. Promote when you judge the identified reviews sufficient; archive what should not enter the journal.</p>
        <table><thead><tr><th>Node</th><th>Reviews</th><th>Mean</th><th>Credible</th><th></th></tr></thead>
          <tbody>{reviewedSeed.map((n) => { const s = nodeSummaries[n.id]; return <tr key={n.id}><td><DeptSwatch dept={n.department_id ? deptById[n.department_id] : null} /><Link to={`/explore/${n.id}`}>{n.label}</Link> <span className="muted">{n.type_code}</span></td><td>{s.n_reviews}</td><td>{s.mean_score}</td><td>{s.all_reviewers_deleted ? <span className="chip chip-flag">none</span> : s.credible_reviews}</td><td><button className="btn btn-primary" disabled={s.all_reviewers_deleted} onClick={() => promote(n)}>promote</button></td></tr>; })}
            {!reviewedSeed.length && <tr><td colSpan={5} className="muted">No seed node has been reviewed yet.</td></tr>}</tbody></table></div>
    </div>
  );
}
