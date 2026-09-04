import { useState } from "react";
import type { Rating, Review, ReviewSummary, ReviewTarget } from "../lib/types";
import { RATINGS, RATING_LABEL } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { Markdown, MarkdownEditor } from "./Markdown";
import { RatingBadge } from "./Chips";

export function ReviewSummaryBar({ s }: { s: ReviewSummary | null }) {
  if (!s) return <div className="muted">No reviews yet.</div>;
  return (
    <div className="row" style={{ gap: 12 }}>
      <span><b>{s.n_reviews}</b> review{s.n_reviews === 1 ? "" : "s"}</span>
      <span className="muted">mean {s.mean_score == null ? "—" : (s.mean_score > 0 ? "+" : "") + s.mean_score}</span>
      <span className="muted">{s.strongly_accept}·{s.accept}·{s.neutral}·{s.reject}·{s.strongly_reject} (SA·A·N·R·SR)</span>
      {s.all_reviewers_deleted ? <span className="chip chip-flag">all reviewers erased — needs fresh review</span> : <span className="chip chip-verified">{s.credible_reviews} credible</span>}
    </div>
  );
}

export function ReviewList({ reviews }: { reviews: Review[] }) {
  if (!reviews.length) return null;
  return (
    <div>
      {reviews.map((r) => (
        <div className="review" key={r.id}>
          <div className="review-head">
            <RatingBadge rating={r.rating} />
            <span>{r.reviewer_username || "deleted user"}{!r.reviewer_active && <span className="chip chip-flag" style={{ marginLeft: 6 }}>erased account</span>}</span>
            <span className="muted">{new Date(r.created_at).toLocaleDateString()}{r.week ? ` · week ${r.week}` : ""}</span>
          </div>
          <Markdown md={r.commentary_md} />
        </div>
      ))}
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
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api.review({ target_kind: kind, target_id: targetId, rating, commentary_md: md, week: week ?? null }); setMd(""); onDone(); } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); } }}>
      <h3>Your review <span className="muted">(as {profile.username} — reviewers are always identified)</span></h3>
      <div className="row" style={{ marginBottom: 8 }}>
        {RATINGS.map((r) => <label key={r} className={`rating rating-${r}`} style={{ cursor: "pointer", opacity: rating === r ? 1 : 0.55 }}><input type="radio" name="rating" checked={rating === r} onChange={() => setRating(r)} style={{ marginRight: 4 }} />{RATING_LABEL[r]}</label>)}
      </div>
      <MarkdownEditor value={md} onChange={setMd} placeholder="Commentary in markdown — brief or long. What is right, what is missing, what would make this canonical?" />
      {err && <div className="notice notice-bad">{err}</div>}
      <button className="btn btn-primary" disabled={busy || !md.trim()}>Submit review</button>
    </form>
  );
}
