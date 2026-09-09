// Side panel for a canonical edge: what it connects, its status and provenance,
// reviews (anyone may review an edge, as with nodes), and proposal shortcuts.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { EdgeDetail } from "../lib/types";
import { isVerifiedCitation } from "../lib/types";
import { isEditor, useApi, useSession } from "../state/session";
import { ContentFlags } from "./ContentFlags";
import { CitationCoverageChip, ProvenanceChip, StatusChip } from "./Chips";
import { ReviewForm, ReviewList, ReviewSummaryBar } from "./ReviewPanel";
import { Help, Tip } from "./Tip";

export function EdgeDrawer({ edgeId, onClose, onChanged }: { edgeId: string; onClose: () => void; onChanged: () => void }) {
  const api = useApi(); const { profile } = useSession();
  const [d, setD] = useState<EdgeDetail | null>(null);
  const [tab, setTab] = useState<"about" | "reviews">("about");
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => api.edge(edgeId).then(setD).catch((e) => setMsg((e as Error).message));
  useEffect(() => { setD(null); setMsg(null); setTab("about"); load(); }, [edgeId]);
  if (!d) return <div className="drawer">{msg ? <div className="notice notice-bad">{msg}</div> : <div className="muted">Loading…</div>}</div>;
  const e = d.edge; const editor = isEditor(profile);
  const decide = async (decision: "promote" | "archive") => { if (!confirm(`${decision} this edge?`)) return; await api.decide({ edge_id: e.id, decision, feedback: "" }); await load(); onChanged(); };
  return (
    <div className="drawer">
      <div className="row" style={{ justifyContent: "space-between" }}><h2>Edge: <i>{e.relationship_code}</i></h2><Tip text="Close (Esc)"><button className="btn" onClick={onClose} aria-label="Close">×</button></Tip></div>
      <div className="row"><StatusChip status={e.status} /><ProvenanceChip prov={e.provenance} status={e.status} /><Tip text="Weight 0–5: how strong or central the relationship is"><span className="chip">weight {e.weight}</span></Tip><span className="muted">v{e.version}</span><CitationCoverageChip total={d.citations.length} verified={d.citations.filter(isVerifiedCitation).length} /></div>
      <div className="tabs"><button className={tab === "about" ? "active" : ""} onClick={() => setTab("about")}>about</button><button className={tab === "reviews" ? "active" : ""} onClick={() => setTab("reviews")}>reviews ({d.reviews.length})</button></div>
      {tab === "about" && <>
        <p><Link to={`/explore/${e.source_node_id}`}>{d.source?.label ?? e.source_node_id}</Link> <b>→ {e.relationship_code} →</b> <Link to={`/explore/${e.target_node_id}`}>{d.target?.label ?? e.target_node_id}</Link></p>
        {e.label && <p className="muted">{e.label}</p>}
        <p className="muted">Relationship types are read in the direction of the arrow: "A <i>grounds</i> B" means A is a foundation for B. <Help text="grounds · enables · applies-to · measures · informs · contrasts-with · relates-to · cross-dept · evidences · cites · same-as" /></p>
        <h3>Citations ({d.citations.length})</h3>
        {d.citations.length ? <ul>{d.citations.map((c) => <li key={c.id}>{isVerifiedCitation(c) && <Tip text="Matched against the institute's own PuRe repository record."><span className="chip chip-verified" style={{ marginRight: 4 }}>✓</span></Tip>}{c.authors.slice(0, 3).join(", ")} ({c.year ?? "n.d."}). {c.title}. {c.doi && <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noopener">doi</a>}</li>)}</ul> : <div className="muted">None yet.</div>}
        <ContentFlags kind="edge" targetId={e.id} flags={d.contentFlags} onChanged={load} />
        <h3 style={{ marginTop: 12 }}>Propose</h3>
        <div className="row"><Link className="btn" to={`/proposals/new?type=edit_edge&edge=${e.id}`}>Propose edit</Link><Link className="btn btn-danger" to={`/proposals/new?type=delete_edge&edge=${e.id}`}>Propose removal</Link></div>
        {editor && e.status !== "canonical" && <div className="row" style={{ marginTop: 12 }}><button className="btn btn-primary" onClick={() => decide("promote")}>Promote to canonical</button><button className="btn btn-danger" onClick={() => decide("archive")}>Archive</button></div>}
      </>}
      {tab === "reviews" && <>
        <ReviewSummaryBar s={d.summary} />
        <ReviewList reviews={d.reviews} onChanged={load} />
        <div style={{ marginTop: 12 }}><ReviewForm kind="edge" targetId={e.id} onDone={load} disabledReason={profile && e.created_by === profile.id ? "You authored this edge — conflict of interest." : null} /></div>
      </>}
    </div>
  );
}
