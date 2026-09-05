import { useState } from "react";
import type { Rating, Review, ReviewSummary, ReviewTarget } from "../lib/types";
import { RATINGS, RATING_LABEL } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { Markdown, MarkdownEditor } from "./Markdown";
import { RatingBadge } from "./Chips";
import { Help, Tip } from "./Tip";

export function ReviewSummaryBar({ s }: { s: ReviewSummary | null }) {
  if (!s) return <div className="muted">No reviews yet.</div>;
  return (
    <div className="row" style={{ gap: 12 }}>
      <span><b>{s.n_reviews}</b> review{s.n_reviews === 1 ? "" : "s"}</span>
      <Tip text="Mean of the ratings: strongly reject −2 … strongly accept +2"><span className="muted">mean {s.mean_score == null ? "—" : (s.mean_score > 0 ? "+" : "") + s.mean_score}</span></Tip>
      <Tip text="Counts of strongly accept · accept · neutral · reject · strongly reject"><span className="muted">{s.strongly_accept}·{s.accept}·{s.neutral}·{s.reject}·{s.strongly_reject}</span></Tip>
      {s.all_reviewers_deleted ? <span className="chip chip-flag">all reviewers erased — needs fresh review</span> : <Tip text="Reviews by identified, non-erased accounts. Editors need at least one before promoting."><span className="chip chip-verified">{s.credible_reviews} credible</span></Tip>}
    </div>
  );
}

export function ReviewList({ reviews, onChanged }: { reviews: Review[]; onChanged?: () => void }) {
  const api = useApi(); const { profile } = useSession();
  const [err, setErr] = useState<string | null>(null);
  if (!reviews.length) return null;
  const vote = async (r: Review) => { setErr(null); try { await api.markHelpful(r.id, !r.helpful_by_me); onChanged?.(); } catch (e) { setErr((e as Error).message); } };
  return (
    <div>
      {reviews.map((r) => (
        <div className="review" key={r.id}>
          <div className="review-head">
            <RatingBadge rating={r.rating} />
            <span>{r.reviewer_username || "deleted user"}{!r.reviewer_active && <span className="chip chip-flag" style={{ marginLeft: 6 }}>erased account</span>}</span>
            <span className="muted">{new Date(r.created_at).toLocaleDateString()}{r.week ? ` · week ${r.week}` : ""}</span>
            {r.reviewer_id !== profile?.id && <Tip text={r.helpful_by_me ? "You marked this review as helpful — click to undo" : "Mark this review as helpful (identified; counts on the 'most helpful reviewer' board)"}><button className={"btn btn-mini" + (r.helpful_by_me ? " active" : "")} onClick={() => vote(r)}>▲ helpful{r.helpful_count ? ` ${r.helpful_count}` : ""}</button></Tip>}
            {r.reviewer_id === profile?.id && !!r.helpful_count && <span className="muted">▲ {r.helpful_count} found this helpful</span>}
          </div>
          <Markdown md={r.commentary_md} />
        </div>
      ))}
      {err && <div className="notice notice-bad">{err}</div>}
    </div>
  );
}

export function ReviewForm({ kind, targetId, week, onDone, disabledReason }: { kind: ReviewTarget; targetId: string; week?: number | null; onDone: () => void; disabledReason?: string | null }) {
  const api = useApi(); const { profile } = useSession();
  const [rating, setRating] = useState<Rating>("accept");
  const [md, setMd] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  if (disabledReason) return <div className="muted">{disabledReason}</div>;
  const what = kind === "subgraph" ? "portfolio" : kind;
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api.review({ target_kind: kind, target_id: targetId, rating, commentary_md: md, week: week ?? null }); setMd(""); onDone(); } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); } }}>
      <h3>Your review <span className="muted">(as {profile.username} — reviewers are always identified)</span> <Help text={`Rate whether this ${what} should stand as it is, and say why in the commentary. Ratings are suggestions to the editors, not votes; the commentary is what helps the author and the editors most.`} /></h3>
      <div className="row" style={{ marginBottom: 8 }}>
        {RATINGS.map((r) => <label key={r} className={`rating rating-${r}`} style={{ cursor: "pointer", opacity: rating === r ? 1 : 0.55 }}><input type="radio" name="rating" checked={rating === r} onChange={() => setRating(r)} style={{ marginRight: 4 }} />{RATING_LABEL[r]}</label>)}
      </div>
      <MarkdownEditor value={md} onChange={setMd} placeholder="Commentary in markdown — brief or long. What is right, what is missing, what would make this canonical?" />
      {err && <div className="notice notice-bad">{err}</div>}
      <button className="btn btn-primary" disabled={busy || !md.trim()}>Submit review</button>
    </form>
  );
}
