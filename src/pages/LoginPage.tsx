import { useEffect, useState } from "react";
import { useSession } from "../state/session";
import { takeAuthCallbackError } from "../lib/authCallback";
import { OpenEvoAttribution } from "../components/OpenEvoMark";

// Two steps, one tab: ask for a code, then type it in. Deliberately not a magic
// link — see docs/kgdj/07-sign-in.md. The property that matters for a 300-500
// student cohort is that every failure is visible in the field they just used,
// rather than a silent return to a page that looks like nothing happened.

const PENDING = "kgdj:pending_email";

export default function LoginPage() {
  const { api } = useSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A reload between requesting and typing the code must not strand anyone.
  useEffect(() => {
    setErr(takeAuthCallbackError());
    try {
      const p = sessionStorage.getItem(PENDING);
      if (p) { setEmail(p); setStep("code"); }
    } catch { /* private mode: the flow still works, it just starts over */ }
  }, []);

  async function sendCode(addr: string, resend = false) {
    if (!api) return;
    setBusy(true); setErr(null); setOk(null);
    const r = await api.signInWithEmail(addr);
    setBusy(false);
    if (!r.sent) { setErr(r.message); return; }
    try { sessionStorage.setItem(PENDING, addr); } catch { /* non-fatal */ }
    setStep("code");
    setOk(resend ? `New code sent to ${addr}.` : r.message);
  }

  async function submitCode() {
    if (!api) return;
    setBusy(true); setErr(null);
    const r = await api.verifyEmailCode(email, code);
    setBusy(false);
    if (!r.ok) { setErr(r.message); setCode(""); return; }
    try { sessionStorage.removeItem(PENDING); } catch { /* non-fatal */ }
    // Success needs no navigation: verifyOtp fires onAuthStateChange, SessionProvider
    // reloads, and App swaps this page for the graph.
  }

  function startOver() {
    try { sessionStorage.removeItem(PENDING); } catch { /* non-fatal */ }
    setStep("email"); setCode(""); setErr(null); setOk(null);
  }

  return (
    <div className="page"><div className="login card">
      <div className="brand" style={{ marginBottom: 10 }}><b>Eva</b> KGDJ</div>
      <h1 style={{ color: "var(--brand-navy)" }}>Sign in</h1>
      <p className="muted">A private, peer-reviewed knowledge graph for MPI-EVA researchers and the Uni-Leipzig MSc Evolutionary Anthropology program. Codes are sent only to <code>@eva.mpg.de</code>, <code>@uni-leipzig.de</code> and invited addresses.</p>

      {err && <div className="notice notice-bad" role="alert">{err}</div>}
      {ok && !err && <div className="notice notice-ok">{ok}</div>}

      {step === "email" ? (
        <form onSubmit={(e) => { e.preventDefault(); sendCode(email.trim()); }}>
          <div className="field">
            <label htmlFor="kgdj-email">Institutional email</label>
            <input id="kgdj-email" type="email" required autoFocus autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@eva.mpg.de" />
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Email me a code"}</button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); submitCode(); }}>
          <div className="field">
            <label htmlFor="kgdj-code">6-digit code</label>
            <input id="kgdj-code" inputMode="numeric" autoComplete="one-time-code" autoFocus
              maxLength={6} placeholder="123456"
              style={{ fontSize: 22, letterSpacing: "0.35em", fontVariantNumeric: "tabular-nums" }}
              value={code}
              // Tolerate a pasted code with spaces, and anything non-numeric, rather
              // than failing the round-trip on formatting the student cannot see.
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </div>
          <button className="btn btn-primary" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Sign in"}
          </button>
          <p className="muted" style={{ marginTop: 12 }}>
            The code is in an email to <b>{email}</b>. It is valid for one hour and works once.
            Check your spam folder before requesting another — the limit is 2 emails per hour.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12.5 }}>
            <button type="button" className="btn btn-mini" disabled={busy} onClick={() => sendCode(email, true)}>Send a new code</button>
            <button type="button" className="btn btn-mini" disabled={busy} onClick={startOver}>Use a different address</button>
          </div>
        </form>
      )}

      <p className="muted" style={{ marginTop: 14 }}>No passwords are stored. Your email is used only to sign you in and to derive a username; see the privacy notice in Account once signed in.</p>
      <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <OpenEvoAttribution />
      </div>
    </div></div>
  );
}
