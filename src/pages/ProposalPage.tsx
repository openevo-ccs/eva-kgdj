import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { ProposalDetail } from "../lib/types";
import { CHANGE_LABEL } from "../lib/types";
import { isEditor, useApi, useSession } from "../state/session";
import { StatusChip } from "../components/Chips";
import { Markdown } from "../components/Markdown";
import { ReviewForm, ReviewList, ReviewSummaryBar } from "../components/ReviewPanel";

export default function ProposalPage() {
  const { id } = useParams(); const api = useApi(); const { profile } = useSession();
  const [d, setD] = useState<ProposalDetail | null>(null);
  const [feedback, setFeedback] = useState(""); const [err, setErr] = useState<string | null>(null);
  const load = () => api.proposal(id!).then(setD).catch((e) => setErr((e as Error).message));
  useEffect(() => { load(); }, [id]);
  if (!d) return <div className="page">{err ? <div className="notice notice-bad">{err}</div> : <span className="muted">Loading…</span>}</div>;
  const p = d.proposal; const mine = p.proposer_id === profile?.id; const editor = isEditor(profile);
  const open = ["pending", "under_review", "revision_requested"].includes(p.status);
  const decide = async (decision: "approve" | "reject" | "request_revision") => { try { await api.decide({ proposal_id: p.id, decision, feedback }); await load(); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="page page-narrow">
      <div className="row" style={{ justifyContent: "space-between" }}><h1>{CHANGE_LABEL[p.change_type]}{d.targetNode && <> · <Link to={`/explore/${d.targetNode.id}`}>{d.targetNode.label}</Link></>}</h1><StatusChip status={p.status} /></div>
      <div className="muted">submitted by {p.proposer_id ? (mine ? "you" : d.proposerUsername || "member") : "anonymous"}{p.submitted_at && ` · ${new Date(p.submitted_at).toLocaleDateString()}`}{p.module_id && " · coursework"}</div>
      {mine && <div className="row" style={{ marginTop: 6 }}>
        <label className="chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={p.submitter_anonymous} onChange={async (e) => { await api.setAnonymity(p.id, e.target.checked); load(); }} /> anonymous to members</label>
        {p.status === "draft" && <button className="btn btn-primary" onClick={async () => { try { await api.submitProposal(p.id); load(); } catch (e) { setErr((e as Error).message); } }}>Submit for review</button>}
        {open && <button className="btn btn-danger" onClick={async () => { await api.withdrawProposal(p.id); load(); }}>Withdraw</button>}
      </div>}
      {err && <div className="notice notice-bad">{err}</div>}
      <div className="card"><h2>Proposed change</h2>
        <table><tbody>{Object.entries(p.payload).map(([k, v]) => <tr key={k}><th style={{ width: 160 }}>{k}</th><td>{typeof v === "string" ? v : JSON.stringify(v)}</td></tr>)}</tbody></table>
        {d.targetNode && p.change_type === "edit_node" && <details style={{ marginTop: 8 }}><summary className="muted">current version of the node (v{d.targetNode.version})</summary><p>{d.targetNode.description}</p></details>}
      </div>
      <div className="card"><h2>Rationale</h2><Markdown md={p.rationale} /></div>
      <div className="card"><h2>Citations ({d.citations.length})</h2>{d.citations.length ? <ul>{d.citations.map((c) => <li key={c.id}>{c.authors.slice(0, 3).join(", ")}{c.authors.length > 3 ? " et al." : ""} ({c.year ?? "n.d."}). {c.title}. {c.doi && <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noopener">{c.doi}</a>}</li>)}</ul> : <span className="muted">none</span>}</div>
      <div className="card"><h2>Reviews</h2><ReviewSummaryBar s={d.summary} /><ReviewList reviews={d.reviews} />
        <div style={{ marginTop: 12 }}><ReviewForm kind="proposal" targetId={p.id} onDone={load} disabledReason={mine ? "You submitted this proposal — conflict of interest." : !open ? `Proposal is ${p.status.replace("_", " ")}; reviews are closed.` : null} /></div>
      </div>
      {d.decisions.length > 0 && <div className="card"><h2>Editorial decisions</h2>{d.decisions.map((x) => <div className="review" key={x.id}><div className="review-head"><StatusChip status={x.decision} /><span className="muted">{new Date(x.decided_at).toLocaleString()}</span></div>{x.feedback && <Markdown md={x.feedback} />}</div>)}</div>}
      {editor && open && <div className="card"><h2>Editorial decision</h2>
        <p className="muted">{d.summary ? `${d.summary.credible_reviews} credible review(s), mean ${d.summary.mean_score}.` : "No reviews yet — consider waiting for at least one identified review."}</p>
        <div className="field"><label>Feedback to the submitter (markdown)</label><textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={4} /></div>
        <div className="row"><button className="btn btn-primary" onClick={() => decide("approve")}>Approve → canonical</button><button className="btn" onClick={() => decide("request_revision")}>Request revision</button><button className="btn btn-danger" onClick={() => decide("reject")}>Reject</button></div>
      </div>}
    </div>
  );
}
