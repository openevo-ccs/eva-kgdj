// A quick "this looks wrong" pointer, shared by NodeDrawer and EdgeDrawer. Deliberately
// NOT a review: no rating, a short reason instead of a full commentary, no conflict-of-
// interest check (the person who wrote a node is exactly who might later realise a
// problem with it, and blocking that would work against the whole point of asking
// everyone to look critically — see docs/kgdj/09-trust-and-verification.md).
// Resolution is editor-only (kgdj.resolve_content_flag requires a real note) so an open
// flag always ends in a citable answer, not a silent disappearance; the flagger may
// withdraw their own still-open flag if they find the answer themselves.
import { useState } from "react";
import type { ContentFlag, ContentFlagTargetKind } from "../lib/types";
import { isEditor, useApi, useSession } from "../state/session";
import { Help } from "./Tip";

export function ContentFlags({ kind, targetId, flags, onChanged }: { kind: ContentFlagTargetKind; targetId: string; flags: ContentFlag[]; onChanged: () => void }) {
  const api = useApi(); const { profile } = useSession();
  const [adding, setAdding] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const editor = isEditor(profile);
  const open = flags.filter((f) => !f.resolved_at);
  const resolved = flags.filter((f) => f.resolved_at);

  const submit = async () => {
    setBusy(true); setErr(null);
    try { await api.addContentFlag(kind, targetId, reason.trim()); setReason(""); setAdding(false); onChanged(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const resolve = async (id: string) => {
    setBusy(true); setErr(null);
    try { await api.resolveContentFlag(id, note.trim()); setNote(""); setResolvingId(null); onChanged(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const withdraw = async (id: string) => {
    setBusy(true); setErr(null);
    try { await api.withdrawContentFlag(id); onChanged(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <h3 style={{ marginTop: 12 }}>Reported issues ({open.length}) <Help text="A quick 'this looks wrong' pointer from any member — not a full review, no rating. An editor resolves it with a short note on what was checked; you can withdraw your own if you find the answer yourself." /></h3>
      {open.length > 0 && <ul>
        {open.map((f) => {
          const mine = f.flagged_by === profile?.id;
          return (
            <li key={f.id}>
              <span className="chip chip-flag" style={{ marginRight: 6 }}>⚑</span>{f.reason}
              <span className="muted"> — {f.flagged_by_username ?? "member"}</span>
              {mine && <button className="btn btn-mini" style={{ marginLeft: 6 }} disabled={busy} onClick={() => withdraw(f.id)}>withdraw</button>}
              {editor && (resolvingId === f.id ? (
                <div className="row" style={{ marginTop: 4 }}>
                  <input placeholder="what did you check, and what's the answer?" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
                  <button className="btn btn-mini btn-primary" disabled={busy || note.trim().length < 3} onClick={() => resolve(f.id)}>resolve</button>
                  <button className="btn btn-mini" onClick={() => { setResolvingId(null); setNote(""); }}>cancel</button>
                </div>
              ) : (
                <button className="btn btn-mini" style={{ marginLeft: 6 }} onClick={() => setResolvingId(f.id)}>resolve…</button>
              ))}
            </li>
          );
        })}
      </ul>}
      {!open.length && <div className="muted">None open.</div>}
      {resolved.length > 0 && <details style={{ marginTop: 6 }}>
        <summary className="muted">{resolved.length} resolved</summary>
        <ul>{resolved.map((f) => <li key={f.id} className="muted">⚑ {f.reason} <b>✓</b> {f.resolution_note} <span>— {f.resolved_by_username ?? "an editor"}</span></li>)}</ul>
      </details>}
      {err && <div className="notice notice-bad" style={{ marginTop: 6 }}>{err}</div>}
      {!adding ? (
        <button className="btn btn-mini" style={{ marginTop: 6 }} onClick={() => setAdding(true)}>⚑ Flag something wrong</button>
      ) : (
        <div className="field" style={{ marginTop: 6 }}>
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What looks wrong or questionable? A sentence is enough." />
          <div className="row"><button className="btn btn-mini btn-primary" disabled={busy || reason.trim().length < 5} onClick={submit}>submit</button><button className="btn btn-mini" onClick={() => { setAdding(false); setReason(""); setErr(null); }}>cancel</button></div>
        </div>
      )}
    </>
  );
}
