import { useState } from "react";
import { useSession } from "../state/session";
import { OpenEvoAttribution } from "../components/OpenEvoMark";

export default function LoginPage() {
  const { api } = useSession();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="page"><div className="login card">
      <div className="brand" style={{ marginBottom: 10 }}><b>Eva</b> KGDJ</div>
      <h1 style={{ color: "var(--brand-navy)" }}>Sign in</h1>
      <p className="muted">A private, peer-reviewed knowledge graph for MPI-EVA researchers and the Uni-Leipzig MSc Evolutionary Anthropology program. Sign-in links are sent only to <code>@eva.mpg.de</code>, <code>@uni-leipzig.de</code> and invited addresses.</p>
      <form onSubmit={async (e) => { e.preventDefault(); if (!api) return; setBusy(true); const r = await api.signInWithEmail(email.trim()); setMsg(r.message); setBusy(false); }}>
        <div className="field"><label>Institutional email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@eva.mpg.de" /></div>
        <button className="btn btn-primary" disabled={busy}>Send sign-in link</button>
      </form>
      {msg && <div className="notice" style={{ marginTop: 10 }}>{msg}</div>}
      <p className="muted" style={{ marginTop: 14 }}>No passwords are stored. Your email is used only to sign you in and to derive a username; see the privacy notice in Account once signed in.</p>
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <OpenEvoAttribution />
      </div>
    </div></div>
  );
}
