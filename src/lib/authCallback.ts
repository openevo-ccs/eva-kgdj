// Residual auth failures arriving on the URL.
//
// KGDJ signs people in with an email + password (2026-09-10) — no redirect, no link,
// nothing here to fail for the everyday case. The one path that still sends someone a
// link is "forgot password" (Supabase's own default Reset Password template). This
// module handles that link failing: expired, or already used. Supabase reports the
// failure as URL parameters — in the hash for the implicit flow, in the query string
// otherwise.
//
// The earlier code-based sign-in this replaced had the same silent failure this module
// was built to fix: a failed link left an ordinary, pristine sign-in form with no
// message of any kind (verified against the live GitHub Pages build on 2026-09-09).
// That discipline carries over even though the trigger is now narrower — a failed
// password-reset link should be exactly as visible as a failed sign-in link was made
// to be.
//
// Read once at startup, BEFORE HashRouter mounts — it treats `#error=...` as a route
// path, which matches nothing and renders a blank page under the nav bar — and clear
// the parameters so a stale error cannot wedge routing on later navigations.
//
// Only error payloads are touched. An `access_token` is left strictly alone for
// supabase-js to consume, so a still-valid reset link keeps working.

let captured: string | null = null;

function readParams(raw: string): URLSearchParams | null {
  const s = raw.startsWith("#") || raw.startsWith("?") ? raw.slice(1) : raw;
  return s ? new URLSearchParams(s) : null;
}

function describe(p: URLSearchParams): string {
  const code = (p.get("error_code") || "").toLowerCase();
  const desc = (p.get("error_description") || p.get("error") || "").replace(/\+/g, " ");
  const all = (code + " " + desc).toLowerCase();
  // Same cases friendlyAuthError() covers in supabaseApi.ts, kept separate on purpose:
  // this module must stay importable without pulling in the Supabase client, so the
  // mock build does not carry it.
  if (all.includes("signup") || all.includes("not allowed"))
    return "That address is not on the KGDJ allowlist. Accounts are limited to @eva.mpg.de and @uni-leipzig.de addresses, plus invited ones. Ask an editor for an invitation.";
  if (all.includes("expired") || all.includes("otp"))
    return "That password-reset link has expired or was already used. Links work only once. Use \"Forgot password\" again to send a fresh one.";
  return desc
    ? `That didn't complete: ${desc}`
    : "That didn't complete. Try again below.";
}

/** Call once, before rendering. Captures and clears any auth error on the URL. */
export function captureAuthCallbackError(): void {
  if (typeof window === "undefined") return;
  for (const raw of [window.location.hash, window.location.search]) {
    const p = readParams(raw);
    if (!p || p.get("access_token")) continue; // never touch a live token
    if (!p.get("error") && !p.get("error_description")) continue;
    captured = describe(p);
    // Drop the parameters, keep the page. replaceState avoids a reload and, unlike
    // assigning location.hash, leaves no stray '#' for the router to parse.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    break;
  }
}

/** Returns the captured message once, then forgets it. */
export function takeAuthCallbackError(): string | null {
  const m = captured;
  captured = null;
  return m;
}
