import { useEffect, useState } from "react";
import { useSession } from "../state/session";
import { takeAuthCallbackError } from "../lib/authCallback";
import { OpenEvoAttribution } from "../components/OpenEvoMark";

// Email + password (2026-09-10, replacing a code-based sign-in built earlier the same
// day, at Dustin's direct request after the code-vs-link mismatch left him unable to
// get into his own live site): "create account, enter your email, enter your
// password, only send emails if they forget their password." Four modes, one page:
//   signin — the default, every day
//   signup — a brand-new address (the domain-allowlist gate still applies; the KGDJ's
//            own before_user_created hook rejects anything not @eva.mpg.de,
//            @uni-leipzig.de, or explicitly invited, with a real, already-readable
//            error message — passed straight through below, not re-translated)
//   forgot — email only; Supabase's own default "Reset Password" template sends the
//            link. Never customised here, unlike the code flow this replaced — nothing
//            for this app to keep paired with the frontend build.
//   reset  — reached only via that email's link (api.onPasswordRecovery fires,
//            switches the page over automatically); sets a first or new password on
//            the account the link belongs to. This is also how an existing
//            code-signed-in account (no password ever set) gets its first one.
type Mode = "signin" | "signup" | "forgot" | "reset";

const MODE_COPY: Record<Mode, { title: string; button: string; needsPassword: boolean }> = {
  signin: { title: "Sign in", button: "Sign in", needsPassword: true },
  signup: { title: "Create account", button: "Create account", needsPassword: true },
  forgot: { title: "Reset your password", button: "Send reset link", needsPassword: false },
  reset: { title: "Set a new password", button: "Set password", needsPassword: false },
};

export default function LoginPage() {
  const { api } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setErr(takeAuthCallbackError()); }, []);
  // A password-reset link lands here with a real (temporary) session already
  // established — this switches the page from "sign in" to "set a new password"
  // automatically rather than the visitor needing to know that's what happened.
  useEffect(() => { if (api) return api.onPasswordRecovery(() => { setMode("reset"); setErr(null); setOk(null); }); }, [api]);

  const copy = MODE_COPY[mode];
  const switchMode = (m: Mode) => { setMode(m); setErr(null); setOk(null); setPassword(""); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!api) return;
    setBusy(true); setErr(null); setOk(null);
    try {
      if (mode === "signin") {
        const r = await api.signInWithPassword(email.trim(), password);
        if (!r.ok) setErr(r.message);
        // success needs no navigation: onAuthChange fires, App swaps this page for the graph.
      } else if (mode === "signup") {
        const r = await api.signUp(email.trim(), password);
        if (!r.ok) setErr(r.message); else setOk(r.message);
      } else if (mode === "forgot") {
        const r = await api.requestPasswordReset(email.trim());
        if (!r.ok) setErr(r.message); else setOk(r.message);
      } else {
        const r = await api.setNewPassword(newPassword);
        if (!r.ok) setErr(r.message);
        // success: the recovery session is already a real session; App swaps this page out.
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="page"><div className="login card">
      <div className="brand" style={{ marginBottom: 10 }}><b>Eva</b> KGDJ</div>
      <h1 style={{ color: "var(--brand-navy)" }}>{copy.title}</h1>

      {mode !== "reset" && <p className="muted">A knowledge graph for MPI-EVA and the Uni-Leipzig MSc Evolutionary Anthropology program, grounded in the institute's real research but assembled with AI help. Almost nothing in it has been checked by a person yet &mdash; that is your job as a member. Accounts are limited to <code>@eva.mpg.de</code>, <code>@uni-leipzig.de</code> and invited addresses.</p>}
      {mode === "reset" && <p className="muted">Choose a new password for your account.</p>}

      {err && <div className="notice notice-bad" role="alert">{err}</div>}
      {ok && !err && <div className="notice notice-ok">{ok}</div>}

      <form onSubmit={submit}>
        {mode !== "reset" && (
          <div className="field">
            <label htmlFor="kgdj-email">Institutional email</label>
            <input id="kgdj-email" type="email" required autoFocus autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@eva.mpg.de" />
          </div>
        )}
        {copy.needsPassword && (
          <div className="field">
            <label htmlFor="kgdj-password">Password</label>
            <input id="kgdj-password" type="password" required minLength={6}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "At least 6 characters" : ""} />
          </div>
        )}
        {mode === "reset" && (
          <div className="field">
            <label htmlFor="kgdj-new-password">New password</label>
            <input id="kgdj-new-password" type="password" required minLength={6} autoFocus autoComplete="new-password"
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
        )}
        <button className="btn btn-primary" disabled={busy}>{busy ? "…" : copy.button}</button>
      </form>

      {mode === "signin" && (
        <div style={{ display: "flex", gap: 14, marginTop: 12, fontSize: 12.5 }}>
          <button type="button" className="btn btn-mini" onClick={() => switchMode("signup")}>Create an account</button>
          <button type="button" className="btn btn-mini" onClick={() => switchMode("forgot")}>Forgot password?</button>
        </div>
      )}
      {(mode === "signup" || mode === "forgot") && (
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <button type="button" className="btn btn-mini" onClick={() => switchMode("signin")}>&larr; Back to sign in</button>
        </div>
      )}

      {mode !== "reset" && <p className="muted" style={{ marginTop: 14 }}>Your email is used only to sign you in and to derive a username; see the privacy notice in Account once signed in.</p>}
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <OpenEvoAttribution />
      </div>
    </div></div>
  );
}
