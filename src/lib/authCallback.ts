// Residual sign-in failures arriving on the URL.
//
// KGDJ now signs people in with a 6-digit code typed in the same tab, so there is
// normally no redirect back into the app at all. This module exists for the cases
// where one happens anyway: a magic link issued before the switch, an invitation
// link, or an email-change confirmation. Supabase reports those failures as URL
// parameters — in the hash for the implicit flow, in the query string otherwise.
//
// Nothing in the app used to read them. A student whose link had expired, or whose
// link had already been consumed by an institutional mail scanner, was shown an
// ordinary, pristine sign-in form with no message of any kind (verified against the
// live GitHub Pages build on 2026-09-09: the page was character-identical to a fresh
// visit). They would assume a typo, request another, and hit the 2-per-hour cap.
//
// Read once at startup, BEFORE HashRouter mounts — it treats `#error=...` as a route
// path, which matches nothing and renders a blank page under the nav bar — and clear
// the parameters so a stale error cannot wedge routing on later navigations.
//
// Only error payloads are touched. An `access_token` is left strictly alone for
// supabase-js to consume, so any still-valid link keeps working.

let captured: string | null = null;

function readParams(raw: string): URLSearchParams | null {
  const s = raw.startsWith("#") || raw.startsWith("?") ? raw.slice(1) : raw;
  return s ? new URLSearchParams(s) : null;
}

function describe(p: URLSearchParams): string {
  const code = (p.get("error_code") || "").toLowerCase();
  const desc = (p.get("error_description") || p.get("error") || "").replace(/\+/g, " ");
  const all = (code + " " + desc).toLowerCase();
  // Same three cases friendlyAuthError() covers in supabaseApi.ts, kept separate on
  // purpose: this module must stay importable without pulling in the Supabase client,
  // so the mock build does not carry it.
  if (all.includes("signup") || all.includes("not allowed"))
    return "That address is not on the KGDJ allowlist. Sign-in is open to @eva.mpg.de and @uni-leipzig.de addresses, plus invited ones. Ask an editor for an invitation.";
  if (all.includes("expired") || all.includes("otp"))
    return "That sign-in link has expired or was already used. Links work only once, and some mail systems open them automatically before you do. Ask for a code below instead: a code is typed in, so nothing can use it up before you.";
  return desc
    ? `Sign-in did not complete: ${desc}`
    : "Sign-in did not complete. Ask for a code below.";
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
