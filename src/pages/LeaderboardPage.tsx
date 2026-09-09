// Many boards, not one score. Every measure counts identified, reviewable work
// (never clicks or time on page); a member appears only after opting in.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LeaderboardRow, Role } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { Help } from "../components/Tip";

type Key = Exclude<keyof LeaderboardRow, "profile_id" | "username" | "role" | "department">;
interface Board { key: Key; title: string; blurb: string; group: "Reviewing" | "Contributing" | "Portfolio craft" | "Habits" }
const BOARDS: Board[] = [
  { group: "Reviewing", key: "helpful_votes_received", title: "Most helpful reviewer", blurb: "Reviews that other members marked ▲ helpful" },
  { group: "Reviewing", key: "reviews_upheld", title: "Best judgement", blurb: "Proposal reviews whose verdict matched the editors' final decision (accept ↔ approved, reject ↔ rejected)" },
  { group: "Reviewing", key: "substantive_reviews", title: "Most thorough reviewer", blurb: "Reviews of 300 characters or more" },
  { group: "Reviewing", key: "reviews_written", title: "Most active reviewer", blurb: "Reviews of nodes, edges and proposals" },
  { group: "Reviewing", key: "portfolio_critiques", title: "Most generous critic", blurb: "Critiques written on classmates' portfolios" },
  { group: "Contributing", key: "approved_proposals", title: "Top submitter", blurb: "Proposals approved into the canonical graph" },
  { group: "Contributing", key: "citations_brought", title: "Best sourced", blurb: "Distinct citations brought in through approved proposals" },
  { group: "Contributing", key: "canonical_nodes_authored", title: "Node author", blurb: "Canonical nodes that began as this member's proposal" },
  { group: "Portfolio craft", key: "annotated_nodes", title: "Most annotated portfolio", blurb: "Portfolio nodes with a real annotation (40+ characters)" },
  { group: "Portfolio craft", key: "connections_written", title: "Most connected portfolio", blurb: "'Because' sentences written" },
  { group: "Portfolio craft", key: "cross_dept_connections", title: "Bridge builder", blurb: "Portfolio connections between nodes of different departments" },
  { group: "Portfolio craft", key: "lenses_used", title: "Widest lens", blurb: "Distinct lenses (mechanism, evidence, method…) used on connections" },
  { group: "Portfolio craft", key: "questions_raised", title: "Question raiser", blurb: "Own question nodes" },
  { group: "Portfolio craft", key: "resources_added", title: "Resource finder", blurb: "Own resource nodes, with a source" },
  { group: "Habits", key: "active_days", title: "Steadiest rhythm", blurb: "Distinct days with something added or reviewed" },
];
const GROUPS = ["Reviewing", "Contributing", "Portfolio craft", "Habits"] as const;
const ROLE_LABEL: Record<Role, string> = { msc_student: "student", researcher: "researcher", editor: "editor", admin: "admin" };

export default function LeaderboardPage() {
  const api = useApi(); const { profile } = useSession();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [who, setWho] = useState<"all" | "students" | "researchers">("all");
  useEffect(() => { api.leaderboard().then(setRows); }, []);
  const pool = useMemo(() => rows.filter((r) => who === "all" ? true : who === "students" ? r.role === "msc_student" : r.role !== "msc_student"), [rows, who]);
  const me = rows.find((r) => r.profile_id === profile?.id);
  const top = (k: Key) => pool.filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, 5);
  // Same >=3 threshold as the boards themselves (see the "not shown as a ranked board yet" copy
  // below) — being "#1" out of one or two isn't a meaningful standing to report back to a student.
  const rank = (k: Key) => { if (!me || me[k] <= 0) return null; const sorted = pool.filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k]); if (sorted.length < 3) return null; const i = sorted.findIndex((r) => r.profile_id === me.profile_id); return i < 0 ? null : i + 1; };
  const myBest = BOARDS.map((b) => ({ b, rank: rank(b.key), value: me?.[b.key] ?? 0 })).filter((x) => x.rank).sort((a, b) => a.rank! - b.rank!).slice(0, 3);
  return (
    <div className="page page-narrow">
      <h1>Leaderboards <Help text="Fifteen boards instead of one score, so that different strengths become visible: careful reviewing, well-sourced submissions, deep annotation, bridging departments, asking questions, keeping a rhythm. Every measure counts identified work that others can read; nothing counts clicks." /></h1>
      <p className="muted">Opt-in only: a member appears after granting "leaderboard display" consent in <Link to="/account">Account</Link>. Boards show the top five with a non-zero count. Editors' decisions are not scored.</p>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="seg"><span className="seg-label">show</span>{(["all", "students", "researchers"] as const).map((w) => <button key={w} className={who === w ? "active" : ""} onClick={() => setWho(w)}>{w}</button>)}</span>
        <span className="muted">{rows.length} member{rows.length === 1 ? "" : "s"} opted in</span>
      </div>
      {me ? <div className="card"><h2>Your standing</h2>{myBest.length ? <div className="row" style={{ gap: 14 }}>{myBest.map((x) => <div className="stat" key={x.b.key}><b>#{x.rank}</b><span>{x.b.title}</span><span className="muted" style={{ textTransform: "none", letterSpacing: 0 }}>{x.value} · {x.b.blurb.toLowerCase()}</span></div>)}</div> : <p className="muted">Nothing counted yet — write a review, annotate a node, or connect two ideas.</p>}</div>
        : <div className="card"><h2>Your standing</h2><p className="muted">You are not on the boards. If you would like to be, grant "leaderboard display" in <Link to="/account">Account</Link> — it can be withdrawn at any time.</p></div>}
      {GROUPS.map((g) => <div key={g}>
        <h2 style={{ marginTop: 18 }}>{g}</h2>
        <div className="boards">
          {BOARDS.filter((b) => b.group === g).map((b) => { const t = top(b.key); const max = t[0]?.[b.key] ?? 1; return (
            <div className="board" key={b.key}>
              <div className="board-head"><b>{b.title}</b><span className="muted">{b.blurb}</span></div>
              {t.length >= 3 ? <ol>{t.map((r) => <li key={r.profile_id} className={r.profile_id === profile?.id ? "me" : ""}><span className="who">{r.username}{r.department ? <span className="muted"> · {r.department}</span> : null}<span className="muted"> · {ROLE_LABEL[r.role]}</span></span><span className="bar"><i style={{ width: `${Math.round((r[b.key] / max) * 100)}%` }} /></span><span className="val">{r[b.key]}</span></li>)}</ol>
                : t.length > 0 ? <div className="muted" style={{ padding: "6px 0" }}>Only {t.length} {t.length === 1 ? "person has" : "people have"} anything here yet — not shown as a ranked board until at least 3 do.</div>
                : <div className="muted" style={{ padding: "6px 0" }}>Nobody yet — this one is open.</div>}
            </div>); })}
        </div>
      </div>)}
      {!rows.length && <p className="muted" style={{ marginTop: 12 }}>Nobody has opted in yet.</p>}
    </div>
  );
}
