import { useEffect, useState } from "react";
import type { CohortStats, RosterRow } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { Help } from "../components/Tip";

// Per-module class view for an instructor/assistant — the one place a named student's
// own progress is meant to be visible to a specific person by role, RLS-gated to
// kgdj.is_module_instructor() (module_members_read, subgraphs_read). Distinct from
// the Leaderboard (opt-in, anonymised-by-default, cross-module) and cohortStats
// (aggregate-only, no names) already elsewhere in the app — this is the identified
// counterpart, scoped to exactly the people this person actually teaches.
export default function InstructorPage() {
  const api = useApi(); const { myModules } = useSession();
  const mine = myModules.filter((m) => m.role === "instructor" || m.role === "assistant");
  const [moduleId, setModuleId] = useState<string>(mine[0]?.module.id ?? "");
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [cohort, setCohort] = useState<CohortStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (mine.length && !moduleId) setModuleId(mine[0].module.id); }, [mine]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!moduleId) return;
    setLoading(true);
    Promise.all([api.instructorRoster(moduleId), api.cohortStats("module", moduleId)])
      .then(([r, c]) => { setRows(r); setCohort(c); })
      .finally(() => setLoading(false));
  }, [moduleId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!mine.length) return <div className="page page-narrow"><div className="card"><h1>Class view</h1><p className="muted">You're not registered as an instructor or assistant on any module. Register in <a href="#/account">Account</a>, or ask an admin to assign you.</p></div></div>;

  // Instructors/assistants show up in their own module_roster row (they're module_members
  // too) but "not started a portfolio" about yourself, in your own class list, is just
  // self-referential noise, not a fact about a student -- table stays student-only,
  // matching what the stat cards above already count.
  const students = rows.filter((r) => r.member_role === "student");
  const started = students.filter((r) => r.subgraph_id);
  const notStarted = students.filter((r) => !r.subgraph_id);
  const m = (k: string) => cohort?.metrics?.[k];

  return (
    <div className="page page-narrow">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Class view <Help text="Your own module(s) only, and only because you're the instructor or a teaching assistant on it — this is real, identified per-student visibility, not the anonymised leaderboard or cohort comparison every member sees." /></h1>
        {mine.length > 1 && <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}>{mine.map((m) => <option key={m.module.id} value={m.module.id}>{m.module.name} — {m.module.term} {m.module.cohort_year}</option>)}</select>}
      </div>
      {loading && <p className="muted">Loading…</p>}
      {!loading && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <div className="stat"><b>{students.length}</b><span>students</span></div>
            <div className="stat"><b>{started.length}</b><span>have started a portfolio</span></div>
            <div className="stat" style={notStarted.length ? { borderColor: "#e9cf95" } : {}}><b>{notStarted.length}</b><span>haven't started yet</span></div>
          </div>
          {cohort?.metrics && <p className="muted" style={{ marginTop: -6, marginBottom: 12 }}>Module average: {m("canonical_nodes")?.mean ?? 0} canonical nodes, {m("connections")?.mean ?? 0} connections, {m("active_days")?.mean ?? 0} active days per portfolio.</p>}
          <table>
            <thead><tr><th>Student</th><th>Portfolio</th><th>Checkpoint</th><th>Canonical nodes</th><th>Own nodes</th><th>Connections</th><th>Active days</th><th>Critiques received</th><th>Updated</th></tr></thead>
            <tbody>
              {students.map((r) => (
                <tr key={r.profile_id}>
                  <td>{r.full_name ? <>{r.full_name} <span className="muted">{r.username}</span></> : r.username}</td>
                  <td>{r.subgraph_id ? r.subgraph_title : <span className="muted">not started</span>}</td>
                  <td className="muted">{r.last_checkpoint_week ?? "—"}</td>
                  <td>{r.metrics?.canonical_nodes ?? "—"}</td>
                  <td>{r.metrics?.own_nodes ?? "—"}</td>
                  <td>{r.metrics?.connections ?? "—"}</td>
                  <td>{r.metrics?.active_days ?? "—"}</td>
                  <td>{r.metrics?.critiques_received ?? "—"}</td>
                  <td className="muted">{r.subgraph_updated_at ? new Date(r.subgraph_updated_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {!students.length && <tr><td colSpan={9} className="muted">No students registered on this module yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
