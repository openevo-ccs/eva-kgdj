import { useEffect, useMemo, useState } from "react";
import type { ConsentPurpose, Module, ResearchGroup } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { Help, Tip } from "../components/Tip";
import { setTourDone, tourDone } from "../components/Tour";

const PURPOSES: { key: ConsentPurpose; label: string; text: string }[] = [
  { key: "portfolio_processing", label: "Portfolio processing", text: "Store my portfolio (nodes, annotations, connections) so that it can be assessed as part of my module." },
  { key: "peer_review_visibility", label: "Portfolio visible to classmates I share it with", text: "Let classmates I explicitly share with read and critique my portfolio." },
  { key: "leaderboard_display", label: "Leaderboard display", text: "Show my username and contribution counts on the Leaderboards page (many boards; identified work only)." },
  { key: "canonical_attribution", label: "Attribution by name", text: "Show my full name (if given) rather than only my username on canonical contributions." },
];

export default function AccountPage() {
  const api = useApi(); const { profile, session, departments, myModules, refresh } = useSession();
  const [consents, setConsents] = useState<Record<ConsentPurpose, boolean> | null>(null);
  const [redact, setRedact] = useState(false); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  const [groups, setGroups] = useState<ResearchGroup[]>([]); const [modules, setModules] = useState<Module[]>([]);
  const [fullName, setFullName] = useState(profile?.full_name ?? ""); const [dept, setDept] = useState(profile?.department_id ?? ""); const [rg, setRg] = useState(profile?.research_group_id ?? ""); const [note, setNote] = useState(profile?.affiliation_note ?? "");
  const [rgQuery, setRgQuery] = useState(""); const [showTour, setShowTour] = useState(!tourDone());
  useEffect(() => { api.consents().then(setConsents); api.researchGroups().then(setGroups); api.modules().then(setModules); }, []);
  useEffect(() => { if (profile) { setFullName(profile.full_name ?? ""); setDept(profile.department_id ?? ""); setRg(profile.research_group_id ?? ""); setNote(profile.affiliation_note ?? ""); } }, [profile]);
  const deptCode = departments.find((d) => d.id === dept)?.code ?? null;
  const groupOpts = useMemo(() => { const q = rgQuery.trim().toLowerCase(); return groups.filter((g) => (!deptCode || !g.department_code || g.department_code === deptCode) && (!q || g.name.toLowerCase().includes(q))).sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "OPENED" ? -1 : 1)); }, [groups, deptCode, rgQuery]);
  if (!profile) return null;
  const student = profile.role === "msc_student";
  const dirty = fullName !== (profile.full_name ?? "") || dept !== (profile.department_id ?? "") || rg !== (profile.research_group_id ?? "") || note !== (profile.affiliation_note ?? "");
  const save = async () => { setErr(null); try { await api.updateProfile({ full_name: fullName || null, department_id: dept || null, research_group_id: rg || null, affiliation_note: note || null }); await refresh(); setMsg("Affiliation saved."); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="page page-narrow">
      <h1>Account</h1>
      {msg && <div className="notice notice-ok">{msg}</div>}{err && <div className="notice notice-bad">{err}</div>}
      <div className="card"><h2>You</h2>
        <table><tbody><tr><th>username</th><td>{profile.username}</td></tr><tr><th>email</th><td>{session?.email || "—"} <span className="muted">(used only for sign-in; never shown to members)</span></td></tr><tr><th>role</th><td>{profile.role.replace("_", " ")} <Help text="Roles are assigned by an admin: researcher, MSc student, editor, admin. Module instructors are researchers whom an admin has designated on the module." /></td></tr><tr><th>institution</th><td>{profile.institution}</td></tr></tbody></table>
      </div>
      <div className="card" data-tour="affiliation"><h2>Affiliation <Help text="Self-declared and optional. It appears next to your username on reviews and boards; it grants no permission. Students usually register only their module." /></h2>
        <div className="row"><div className="field" style={{ flex: 1 }}><label>Full name (optional)</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="shown only if you grant attribution by name" /></div></div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Department</label><select value={dept} onChange={(e) => { setDept(e.target.value); setRg(""); }}><option value="">— none / not applicable —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div className="field" style={{ flex: 1 }}><label>Research group / unit <Help text="From the MPG.PuRe organisational tree of the institute (closed units included, for alumni). Type to filter. If yours is missing, say so in the note; an editor can add it." /></label>
            <input value={rgQuery} onChange={(e) => setRgQuery(e.target.value)} placeholder="filter groups…" style={{ marginBottom: 4 }} />
            <select value={rg} onChange={(e) => setRg(e.target.value)} size={Math.min(6, Math.max(2, groupOpts.length + 1))}><option value="">— none —</option>{groupOpts.map((g) => <option key={g.id} value={g.id}>{g.name}{g.status !== "OPENED" ? " (closed)" : ""}{g.parent_name ? ` — ${g.parent_name}` : ""}</option>)}</select></div>
        </div>
        <div className="field"><label>Note (optional, ≤ 200 characters)</label><input value={note} onChange={(e) => setNote(e.target.value.slice(0, 200))} placeholder="e.g. Uni-Leipzig, Institute of Biology; or a group not in the list" /></div>
        <div className="row"><button className="btn btn-primary" disabled={!dirty} onClick={save}>Save affiliation</button>{dirty && <span className="muted">unsaved changes</span>}</div>
        <h3 style={{ marginTop: 16 }}>MSc modules <Help text="Students are enrolled by the instructor's allowlist; researchers, editors and lecturers may register as affiliated with a module (this grants no access to portfolios — only an admin can designate the instructor)." /></h3>
        <table><thead><tr><th>Module</th><th>Term</th><th>Your role</th><th></th></tr></thead><tbody>
          {modules.map((m) => { const mine = myModules.find((x) => x.module.id === m.id); return <tr key={m.id}><td>{m.name} <span className="muted">{m.code}</span></td><td>{m.term} {m.cohort_year}</td><td>{mine ? mine.role : <span className="muted">—</span>}</td><td>
            {!mine && <button className="btn" onClick={async () => { try { await api.joinModule(m.id, student ? "student" : "affiliate"); await refresh(); setMsg(`Registered with ${m.name}.`); } catch (e) { setErr((e as Error).message); } }}>{student ? "Join as student" : "Register as affiliated"}</button>}
            {mine && ["student", "affiliate"].includes(mine.role) && <button className="btn" onClick={async () => { try { await api.leaveModule(m.id); await refresh(); setMsg(`Left ${m.name}.`); } catch (e) { setErr((e as Error).message); } }}>Leave</button>}
            {mine && ["instructor", "assistant"].includes(mine.role) && <span className="muted">assigned by admin</span>}
          </td></tr>; })}
          {!modules.length && <tr><td colSpan={4} className="muted">No modules yet.</td></tr>}
        </tbody></table>
      </div>
      <div className="card"><h2>Consent</h2><p className="muted">Each choice is recorded with the privacy-notice version and can be withdrawn here at any time (GDPR Art. 7).</p>
        {consents && PURPOSES.map((p) => <label key={p.key} className="row" style={{ marginBottom: 8, alignItems: "flex-start" }}><input type="checkbox" checked={consents[p.key]} onChange={async (e) => { await api.setConsent(p.key, e.target.checked); setConsents(await api.consents()); }} /><span><b>{p.label}</b><br /><span className="muted">{p.text}</span></span></label>)}
      </div>
      <div className="card"><h2>Guided tour and help</h2>
        <div className="row"><button className="btn" onClick={() => window.dispatchEvent(new CustomEvent("kgdj:tour"))}>Run the guided tour</button>
          <label className="row muted" style={{ cursor: "pointer" }}><input type="checkbox" checked={showTour} onChange={(e) => { setShowTour(e.target.checked); setTourDone(!e.target.checked); }} /> show the tour automatically on my next visit</label></div>
        <p className="muted" style={{ marginTop: 8 }}>Keyboard: <code>Esc</code> closes panels or clears a selection · <code>Ctrl</code>+click selects several nodes · <code>←</code>/<code>→</code> step through the tour. Hover any control for a hint.</p>
      </div>
      <div className="card"><h2>Your data</h2>
        <div className="row"><Tip text="Everything the journal holds about you, as one JSON file (GDPR Art. 20)"><button className="btn" onClick={async () => { const d = await api.exportMyData(); const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `kgdj-export-${profile.username}.json`; a.click(); }}>Export everything about me (JSON)</button></Tip></div>
        <p className="muted">Portability (GDPR Art. 20): profile, proposals, reviews, portfolios and consent records. Portfolio backups for restoring are on the Portfolio page.</p>
      </div>
      <div className="card" style={{ borderColor: "#f0b8b8" }}><h2>Delete my account</h2>
        <p>Deletes your sign-in account and email, replaces your username with a "deleted user" placeholder everywhere (including audit records), and removes your portfolios. Your proposals, reviews and canonical contributions remain in the journal, attributed to "deleted user"; a review by a deleted account no longer counts as a credible review.</p>
        <label className="row"><input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} /> also withdraw the free text I wrote (review commentary and proposal rationales) — recommended if it could identify you</label>
        <div className="row" style={{ marginTop: 8 }}><button className="btn btn-danger" onClick={async () => { if (!confirm("Delete your account now? This cannot be undone. Did you download your portfolio backups?")) return; await api.erase(redact); setMsg("Your account has been deleted."); }}>Delete my account</button></div>
      </div>
      <div className="card"><h2>Privacy notice (v2026-09-04-v1)</h2>
        <p className="muted">Controller: Max Planck Society, acting through MPI-EVA's Department of Comparative Cultural Psychology (responsible person: the module lead) — to be confirmed by the data protection officer; processor: Supabase (EU, Frankfurt) under a data processing agreement. Data held: your email (sign-in only), username, role, institution, self-declared affiliation, and what you contribute. Legal basis: the module's assessment requirements (students) and legitimate academic interest (researchers); consent for the optional purposes above. Peer comparisons in portfolio reports use aggregates over at least three portfolios. No analytics, no third-party trackers, no data leaves the EU. Full text: docs/kgdj/02-gdpr-compliance.md.</p>
      </div>
    </div>
  );
}
