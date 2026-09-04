import { useEffect, useState } from "react";
import type { LeaderboardRow } from "../lib/types";
import { useApi } from "../state/session";

export default function LeaderboardPage() {
  const api = useApi(); const [rows, setRows] = useState<LeaderboardRow[]>([]);
  useEffect(() => { api.leaderboard().then(setRows); }, []);
  return (
    <div className="page page-narrow">
      <h1>Contributions</h1>
      <p className="muted">Opt-in only: a member appears here after granting "leaderboard display" consent in Account. This is an academic tool first; the list is informational, not a ranking of merit.</p>
      <table><thead><tr><th>Member</th><th>Role</th><th>Dept</th><th>Approved</th><th>Open</th><th>Reviews</th><th>Portfolio critiques</th><th>Canonical nodes</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.profile_id}><td>{r.username}</td><td>{r.role.replace("_", " ")}</td><td>{r.department || "—"}</td><td>{r.approved_proposals}</td><td>{r.open_proposals}</td><td>{r.reviews_written}</td><td>{r.portfolio_critiques}</td><td>{r.canonical_nodes_authored}</td></tr>)}{!rows.length && <tr><td colSpan={8} className="muted">Nobody has opted in yet.</td></tr>}</tbody></table>
    </div>
  );
}
