import { useEffect, useState } from "react";
import type { ConsentPurpose } from "../lib/types";
import { useApi, useSession } from "../state/session";

const PURPOSES: { key: ConsentPurpose; label: string; text: string }[] = [
  { key: "portfolio_processing", label: "Portfolio processing", text: "Store my portfolio (nodes, annotations, connections) so that it can be assessed as part of my module." },
  { key: "peer_review_visibility", label: "Portfolio visible to classmates I share it with", text: "Let classmates I explicitly share with read and critique my portfolio." },
  { key: "leaderboard_display", label: "Leaderboard display", text: "Show my username and contribution counts on the Contributions page." },
  { key: "canonical_attribution", label: "Attribution by name", text: "Show my full name (if given) rather than only my username on canonical contributions." },
];

export default function AccountPage() {
  const api = useApi(); const { profile, session } = useSession();
  const [consents, setConsents] = useState<Record<ConsentPurpose, boolean> | null>(null);
  const [redact, setRedact] = useState(false); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { api.consents().then(setConsents); }, []);
  if (!profile) return null;
  return (
    <div className="page page-narrow">
      <h1>Account</h1>
      <div className="card"><h2>You</h2>
        <table><tbody><tr><th>username</th><td>{profile.username}</td></tr><tr><th>email</th><td>{session?.email || "—"} <span className="muted">(used only for sign-in; never shown to members)</span></td></tr><tr><th>role</th><td>{profile.role.replace("_", " ")}</td></tr><tr><th>institution</th><td>{profile.institution}</td></tr></tbody></table>
      </div>
      <div className="card"><h2>Consent</h2><p className="muted">Each choice is recorded with the privacy-notice version and can be withdrawn here at any time (GDPR Art. 7).</p>
        {consents && PURPOSES.map((p) => <label key={p.key} className="row" style={{ marginBottom: 8, alignItems: "flex-start" }}><input type="checkbox" checked={consents[p.key]} onChange={async (e) => { await api.setConsent(p.key, e.target.checked); setConsents(await api.consents()); }} /><span><b>{p.label}</b><br /><span className="muted">{p.text}</span></span></label>)}
      </div>
      <div className="card"><h2>Your data</h2>
        <div className="row"><button className="btn" onClick={async () => { const d = await api.exportMyData(); const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `kgdj-export-${profile.username}.json`; a.click(); }}>Export everything about me (JSON)</button></div>
        <p className="muted">Portability (GDPR Art. 20): profile, proposals, reviews, portfolios and consent records.</p>
      </div>
      <div className="card" style={{ borderColor: "#f0b8b8" }}><h2>Delete my account</h2>
        <p>Deletes your sign-in account and email, replaces your username with a "deleted user" placeholder everywhere (including audit records), and removes your portfolios. Your proposals, reviews and canonical contributions remain in the journal, attributed to "deleted user"; a review by a deleted account no longer counts as a credible review.</p>
        <label className="row"><input type="checkbox" checked={redact} onChange={(e) => setRedact(e.target.checked)} /> also withdraw the free text I wrote (review commentary and proposal rationales) — recommended if it could identify you</label>
        <div className="row" style={{ marginTop: 8 }}><button className="btn btn-danger" onClick={async () => { if (!confirm("Delete your account now? This cannot be undone.")) return; await api.erase(redact); setMsg("Your account has been deleted."); }}>Delete my account</button></div>
        {msg && <div className="notice notice-ok">{msg}</div>}
      </div>
      <div className="card"><h2>Privacy notice (v2026-09-04-v1)</h2>
        <p className="muted">Controller: MPI-EVA (Department of Comparative Cultural Psychology) for the KGDJ; processor: Supabase (EU, Frankfurt) under a data processing agreement. Data held: your email (sign-in only), username, role, institution, department, and what you contribute. Legal basis: the module's assessment requirements (students) and legitimate academic interest (researchers); consent for the optional purposes above. No analytics, no third-party trackers, no data leaves the EU. Full text: docs/kgdj/02-gdpr-compliance.md.</p>
      </div>
    </div>
  );
}
