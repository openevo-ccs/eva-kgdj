// A lightweight, identified comment thread on ONE shared portfolio item (migration
// 0008_item_comments.sql; docs/kgdj/05-student-portfolio-uiux-review.md §4.2) — the middle
// option between no feedback at all and granting full portfolio access. Used from
// CommonsPage's "Shared items" feed, where every such item already surfaces.
import { useEffect, useState } from "react";
import type { ItemCommentTarget } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { Markdown } from "./Markdown";

export function ItemCommentThread({ target }: { target: ItemCommentTarget }) {
  const api = useApi(); const { profile } = useSession();
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<{ id: string; author_username?: string | null; body_md: string; created_at: string; author_id: string }[] | null>(null);
  const [body, setBody] = useState(""); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = () => api.itemComments(target).then(setComments).catch((e) => setErr((e as Error).message));
  useEffect(() => { if (open && comments === null) load(); }, [open]);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await api.addItemComment(target, body); setBody(""); load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => { try { await api.removeItemComment(id); load(); } catch (e) { setErr((e as Error).message); } };
  return (
    <div style={{ marginTop: 6 }}>
      <button className="btn btn-mini" onClick={() => setOpen(!open)}>{open ? "hide comments" : `comments${comments ? ` (${comments.length})` : ""}`}</button>
      {open && <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: "2px solid var(--border)" }}>
        {comments === null ? <span className="muted">Loading…</span> : comments.length === 0 ? <p className="muted" style={{ margin: "4px 0" }}>No comments yet — the first one on a shared idea, without needing the rest of the portfolio open.</p> : comments.map((c) => (
          <div className="review" key={c.id} style={{ padding: "6px 0" }}>
            <div className="review-head"><span>{c.author_username || "member"}</span><span className="muted">{new Date(c.created_at).toLocaleDateString()}</span>
              {c.author_id === profile?.id && <button className="btn btn-mini" onClick={() => remove(c.id)}>delete</button>}
            </div>
            <Markdown md={c.body_md} />
          </div>
        ))}
        {err && <div className="notice notice-bad">{err}</div>}
        <div className="row" style={{ marginTop: 4 }}>
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && body.trim()) submit(); }} />
          <button className="btn btn-mini" disabled={busy || !body.trim()} onClick={submit}>post</button>
        </div>
      </div>}
    </div>
  );
}
