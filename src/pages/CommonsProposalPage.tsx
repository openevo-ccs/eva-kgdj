// One Commons proposal: payload, rationale, reviews, and (for stewards) the decide panel.
// Structurally ProposalPage.tsx one level down (see docs/kgdj/04-commons-design.md §2) — the
// review/rating widgets reuse ReviewPanel's RATINGS/RATING_LABEL and RatingBadge, but commons_reviews
// is its own table (no target_kind polymorphism, no helpful votes), so the form/list here are
// commons-specific rather than literally the same ReviewForm/ReviewList components.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { CommonsProposalDetail, Rating } from "../lib/types";
import { COMMONS_CHANGE_LABEL, COMMONS_ROLE_LABEL, RATING_LABEL, RATINGS } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { StatusChip, RatingBadge } from "../components/Chips";
import { Markdown, MarkdownEditor } from "../components/Markdown";
import { Help } from "../components/Tip";

const SCORE: Record<Rating, number> = { strongly_reject: -2, reject: -1, neutral: 0, accept: 1, strongly_accept: 2 };

export default function CommonsProposalPage() {
  const { id } = useParams(); const api = useApi(); const { profile } = useSession();
  const [d, setD] = useState<CommonsProposalDetail | null>(null);
  const [rationale, setRationale] = useState(""); const [err, setErr] = useState<string | null>(null);
  const load = () => api.commonsProposal(id!).then(setD).catch((e) => setErr((e as Error).message));
  useEffect(() => { load(); }, [id]);
  if (!d) return <div className="page">{err ? <div className="notice notice-bad">{err}</div> : <span className="muted">Loading…</span>}</div>;
  const p = d.proposal; const mine = p.proposed_by === profile?.id;
  const open = ["pending", "under_review", "revision_requested"].includes(p.status);
  const decide = async (outcome: "approve" | "reject" | "request_revision" | "archive") => { try { await api.commonsDecide({ proposal_id: p.id, outcome, rationale }); await load(); } catch (e) { setErr((e as Error).message); } };
  const n = d.reviews.length;
  const mean = n ? Math.round((d.reviews.reduce((a, r) => a + SCORE[r.rating], 0) / n) * 100) / 100 : null;

  return (
    <div className="page page-narrow">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{COMMONS_CHANGE_LABEL[p.change_type]}{d.targetItem && <> · {d.targetItem.label}</>}{d.targetLink && <> · connection</>}</h1>
        <StatusChip status={p.status} />
      </div>
      <div className="muted">
        proposed by {mine ? "you" : d.proposedByUsername || "member"}{p.submitted_at && ` · ${new Date(p.submitted_at).toLocaleDateString()}`}
        {p.review_restricted_to_role && <> · review restricted to {COMMONS_ROLE_LABEL[p.review_restricted_to_role]}+</>}
      </div>
      {err && <div className="notice notice-bad">{err}</div>}
      <div className="card"><h2>Proposed change</h2>
        <table><tbody>{Object.entries(p.payload).map(([k, v]) => <tr key={k}><th style={{ width: 160 }}>{k}</th><td>{typeof v === "string" ? v : JSON.stringify(v)}</td></tr>)}</tbody></table>
      </div>
      <div className="card"><h2>Rationale</h2><Markdown md={p.rationale} /></div>
      {d.citations.length > 0 && <div className="card"><h2>Citations ({d.citations.length})</h2><ul>{d.citations.map((c) => <li key={c.id}>{c.authors.slice(0, 3).join(", ")}{c.authors.length > 3 ? " et al." : ""} ({c.year ?? "n.d."}). {c.title}. {c.doi && <a href={`https://doi.org/${c.doi}`} target="_blank" rel="noopener">{c.doi}</a>}</li>)}</ul></div>}
      <div className="card">
        <h2>Reviews <Help text="Commons review is open to any active participant by default, unless this proposal restricted it to reviewer/steward. A steward is never blocked." /></h2>
        {n ? <div className="row" style={{ gap: 12, marginBottom: 8 }}><span><b>{n}</b> review{n === 1 ? "" : "s"}</span><span className="muted">mean {mean != null && mean > 0 ? "+" : ""}{mean}</span></div> : <div className="muted">No reviews yet.</div>}
        {d.reviews.map((r) => <div className="review" key={r.id}>
          <div className="review-head"><RatingBadge rating={r.rating} /><span>{r.reviewer_username || "member"}</span><span className="muted">{new Date(r.created_at).toLocaleDateString()}</span></div>
          <Markdown md={r.commentary_md} />
        </div>)}
        <div style={{ marginTop: 12 }}><CommonsReviewForm proposalId={p.id} disabledReason={mine ? "You submitted this proposal — conflict of interest." : !open ? `Proposal is ${p.status.replace("_", " ")}; reviews are closed.` : null} onDone={load} /></div>
      </div>
      {d.decisions.length > 0 && <div className="card"><h2>Decisions</h2>{d.decisions.map((x) => <div className="review" key={x.id}><div className="review-head"><StatusChip status={x.outcome} /><span className="muted">{new Date(x.decided_at).toLocaleString()}</span></div>{x.rationale && <Markdown md={x.rationale} />}</div>)}</div>}
      {open && <div className="card"><h2>Decision <span className="muted">(stewards)</span></h2>
        <div className="field"><label>Rationale (markdown)</label><textarea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={3} /></div>
        <div className="row">
          <button className="btn btn-primary" onClick={() => decide("approve")}>Approve</button>
          <button className="btn" onClick={() => decide("request_revision")}>Request revision</button>
          <button className="btn btn-danger" onClick={() => decide("reject")}>Reject</button>
          {p.target_item_id && <button className="btn btn-danger" onClick={() => decide("archive")}>Archive item instead</button>}
        </div>
        <div className="muted" style={{ marginTop: 6 }}>Only stewards can decide — non-stewards get a row-level-security error if they try.</div>
      </div>}
      <div className="row"><Link className="btn btn-mini" to={`/commons/spaces/${p.commons_space_id}`}>← back to space</Link></div>
    </div>
  );
}

function CommonsReviewForm({ proposalId, disabledReason, onDone }: { proposalId: string; disabledReason: string | null; onDone: () => void }) {
  const api = useApi(); const { profile } = useSession();
  const [rating, setRating] = useState<Rating>("accept");
  const [md, setMd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  if (disabledReason) return <div className="muted">{disabledReason}</div>;
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api.commonsReview({ proposal_id: proposalId, rating, commentary_md: md }); setMd(""); onDone(); } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); } }}>
      <h3>Your review <span className="muted">(as {profile.username})</span></h3>
      <div className="row" style={{ marginBottom: 8 }}>
        {RATINGS.map((r) => <label key={r} className={`rating rating-${r}`} style={{ cursor: "pointer", opacity: rating === r ? 1 : 0.55 }}><input type="radio" name="rating" checked={rating === r} onChange={() => setRating(r)} style={{ marginRight: 4 }} />{RATING_LABEL[r]}</label>)}
      </div>
      <MarkdownEditor value={md} onChange={setMd} placeholder="What's right, what's missing, what would make this a good addition to the commons?" />
      {err && <div className="notice notice-bad">{err}</div>}
      <button className="btn btn-primary" disabled={busy || !md.trim()}>Submit review</button>
    </form>
  );
}
