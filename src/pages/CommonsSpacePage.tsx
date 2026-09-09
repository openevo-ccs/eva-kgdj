// One Commons Space (0007_commons.sql; docs/kgdj/04-commons-design.md §4-6): participants,
// durable items/links, and the propose -> review -> decide loop that writes them. Proposal
// review/decide happens on CommonsProposalPage; this page is join/membership + items/links +
// starting new proposals.
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { CommonsItemT, CommonsProposal, CommonsRole, CommonsSpaceDetail } from "../lib/types";
import { COMMONS_CHANGE_LABEL, COMMONS_JOIN_POLICY_LABEL, COMMONS_ROLE_HELP, COMMONS_ROLE_LABEL, PRIVATE_TYPE_HELP } from "../lib/types";
import type { PrivateNodeType } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { StatusChip } from "../components/Chips";
import { Markdown } from "../components/Markdown";
import { Help, Tip } from "../components/Tip";

const KIND_ORDER: PrivateNodeType[] = ["self", "question", "resource", "theory", "method"];
const roleAtLeast = (role: CommonsRole | undefined, need: CommonsRole) => { const order: CommonsRole[] = ["viewer", "contributor", "reviewer", "steward"]; return !!role && order.indexOf(role) >= order.indexOf(need); };

export default function CommonsSpacePage() {
  const { id } = useParams(); const api = useApi(); const { profile } = useSession(); const nav = useNavigate();
  const [d, setD] = useState<CommonsSpaceDetail | null>(null);
  const [proposals, setProposals] = useState<CommonsProposal[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [showNewLink, setShowNewLink] = useState(false);
  const load = () => { api.commonsSpace(id!).then(setD).catch((e) => setErr((e as Error).message)); api.commonsProposals(id!).then(setProposals).catch(() => {}); };
  useEffect(() => { load(); }, [id]);
  if (!d) return <div className="page">{err ? <div className="notice notice-bad">{err}</div> : <span className="muted">Loading…</span>}</div>;
  const myRole = d.myParticipant?.status === "active" ? d.myParticipant.role : undefined;
  const canContribute = roleAtLeast(myRole, "contributor");
  const isSteward = roleAtLeast(myRole, "steward") || (profile && ["editor", "admin"].includes(profile.role));

  const join = async (role: "viewer" | "contributor") => { try { await api.joinCommonsSpace(d.space.id, role); load(); } catch (e) { setErr((e as Error).message); } };
  const leave = async () => { try { await api.leaveCommonsSpace(d.space.id); load(); } catch (e) { setErr((e as Error).message); } };
  const promote = (item: CommonsItemT) => nav("/proposals/new", { state: { prefill: { change_type: "add_node", label: item.label, type_code: item.kind === "theory" ? "theory" : item.kind === "method" ? "method" : "concept", description: item.description || `From the ${d.space.label} commons: ${item.label}`, source_commons_item_id: item.id } } });

  const itemsByKind = (kind: PrivateNodeType) => d.items.filter((i) => i.kind === kind && i.status === "active");
  const itemLabel = (id2: string) => d.items.find((i) => i.id === id2)?.label ?? id2;

  return (
    <div className="page page-narrow">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{d.space.label} <Help text="A joint-curation space: participants propose, review and decide together. Nobody individually owns what lands here." /></h1>
        <span className="chip">{COMMONS_JOIN_POLICY_LABEL[d.space.join_policy]}</span>
      </div>
      <div className="muted">{d.space.description}{d.space.module_name && <> · {d.space.module_name}</>}</div>
      <div className="row" style={{ marginTop: 8, marginBottom: 14 }}>
        {myRole ? <><span className="chip">{COMMONS_ROLE_LABEL[myRole]}</span><button className="btn btn-mini" onClick={leave}>Leave</button></>
          : d.myParticipant?.status === "requested" ? <span className="chip">request pending</span>
          : d.space.join_policy === "invite_only" ? <span className="muted">Invite only — ask a steward.</span>
          : <><button className="btn btn-primary" onClick={() => join("contributor")}>{d.space.join_policy === "request_approval" ? "Request to join" : "Join"}</button><button className="btn btn-mini" onClick={() => join("viewer")}>join as viewer only</button></>}
        <Link className="btn btn-mini" to="/commons">← all spaces</Link>
      </div>
      {err && <div className="notice notice-bad">{err}</div>}

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Participants ({d.participants.length})</h2><button className="btn btn-mini" onClick={() => setShowParticipants(!showParticipants)}>{showParticipants ? "hide" : "show"}</button></div>
        {showParticipants && <table style={{ marginTop: 8 }}><thead><tr><th>Member</th><th>Role</th><th>Status</th>{isSteward && <th /> }</tr></thead><tbody>
          {d.participants.map((p) => <tr key={p.profile_id}>
            <td>{p.username}</td>
            <td>{isSteward ? <Tip text={COMMONS_ROLE_HELP[p.role]}><select value={p.role} onChange={async (e) => { await api.setCommonsParticipant(d.space.id, p.profile_id, { role: e.target.value as CommonsRole }); load(); }}>{Object.entries(COMMONS_ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Tip> : <Tip text={COMMONS_ROLE_HELP[p.role]}>{COMMONS_ROLE_LABEL[p.role]}</Tip>}</td>
            <td>{p.status === "requested" && isSteward ? <button className="btn btn-mini" onClick={async () => { await api.setCommonsParticipant(d.space.id, p.profile_id, { status: "active" }); load(); }}>approve</button> : p.status}</td>
            {isSteward && <td><button className="btn btn-mini btn-danger" onClick={async () => { await api.removeCommonsParticipant(d.space.id, p.profile_id); load(); }}>remove</button></td>}
          </tr>)}
        </tbody></table>}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Items</h2>{canContribute && <button className="btn btn-mini" onClick={() => setShowNewItem(!showNewItem)}>{showNewItem ? "cancel" : "+ new item"}</button>}</div>
        {showNewItem && <NewItemForm spaceId={d.space.id} onDone={() => { setShowNewItem(false); load(); }} />}
        {KIND_ORDER.map((k) => { const rows = itemsByKind(k); if (!rows.length) return null; return (
          <div key={k} style={{ marginTop: 10 }}>
            <div className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}><Tip text={PRIVATE_TYPE_HELP[k]}>{k}</Tip></div>
            {rows.map((it) => <ItemRow key={it.id} item={it} canContribute={!!canContribute} onPromote={() => promote(it)} onChanged={load} spaceId={d.space.id} />)}
          </div>
        ); })}
        {!d.items.some((i) => i.status === "active") && <p className="muted">No items yet. {canContribute ? "Propose the first one." : ""}</p>}
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>Connections</h2>{canContribute && d.items.length >= 2 && <button className="btn btn-mini" onClick={() => setShowNewLink(!showNewLink)}>{showNewLink ? "cancel" : "+ new connection"}</button>}</div>
        {showNewLink && <NewLinkForm spaceId={d.space.id} items={d.items.filter((i) => i.status === "active")} onDone={() => { setShowNewLink(false); load(); }} />}
        {d.links.length ? <ul>{d.links.map((l) => <li key={l.id}><b>{itemLabel(l.source_item_id)}</b> → <b>{itemLabel(l.target_item_id)}</b>{l.lens && <span className="chip" style={{ marginLeft: 6 }}>{l.lens}</span>}<div className="muted">{l.label}</div></li>)}</ul> : <p className="muted">No connections yet.</p>}
      </div>

      <div className="card">
        <h2>Proposals</h2>
        {proposals.length ? <table><thead><tr><th>Change</th><th>Rationale</th><th>Status</th><th>Updated</th></tr></thead><tbody>
          {proposals.map((p) => <tr key={p.id}><td><Link to={`/commons/proposals/${p.id}`}>{COMMONS_CHANGE_LABEL[p.change_type]}</Link></td><td>{p.rationale.slice(0, 90)}{p.rationale.length > 90 ? "…" : ""}</td><td><StatusChip status={p.status} /></td><td className="muted">{new Date(p.updated_at).toLocaleDateString()}</td></tr>)}
        </tbody></table> : <p className="muted">No proposals yet.</p>}
      </div>
    </div>
  );
}

function ItemRow({ item, canContribute, onPromote, onChanged, spaceId }: { item: CommonsItemT; canContribute: boolean; onPromote: () => void; onChanged: () => void; spaceId: string }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(item.label); const [desc, setDesc] = useState(item.description);
  const [rationale, setRationale] = useState(""); const [err, setErr] = useState<string | null>(null);
  const proposeEdit = async () => { try { await api.createCommonsProposal({ commons_space_id: spaceId, change_type: "edit_item", target_item_id: item.id, payload: { label, description: desc }, rationale }, true); setEditing(false); onChanged(); } catch (e) { setErr((e as Error).message); } };
  const proposeArchive = async () => { const r = window.prompt("Why should this item be archived? (rationale)"); if (!r) return; try { await api.createCommonsProposal({ commons_space_id: spaceId, change_type: "archive_item", target_item_id: item.id, payload: {}, rationale: r }, true); onChanged(); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="commons-item">
      <div style={{ flex: 1, minWidth: 0 }}>
        {editing ? <>
          <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ marginBottom: 4, width: "100%" }} />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} style={{ width: "100%" }} />
          <div className="field"><label>Rationale for this edit (≥ 10 characters)</label><input value={rationale} onChange={(e) => setRationale(e.target.value)} /></div>
          {err && <div className="notice notice-bad">{err}</div>}
          <div className="row"><button className="btn btn-primary btn-mini" disabled={rationale.length < 10} onClick={proposeEdit}>Propose edit</button><button className="btn btn-mini" onClick={() => setEditing(false)}>cancel</button></div>
        </> : <>
          <div className="row" style={{ justifyContent: "space-between" }}><b>{item.label}</b>{item.promoted_to_node_id && <Link className="chip chip-verified" to={`/explore/${item.promoted_to_node_id}`}>promoted to canonical →</Link>}</div>
          {item.description && <Markdown md={item.description} />}
          <div className="muted">by {item.created_by_username || "member"} · {new Date(item.created_at).toLocaleDateString()}</div>
          {canContribute && <div className="row" style={{ marginTop: 4 }}>
            <button className="btn btn-mini" onClick={() => setEditing(true)}>propose edit</button>
            <button className="btn btn-mini btn-danger" onClick={proposeArchive}>propose archive</button>
            {!item.promoted_to_node_id && <Tip text="Turn this into a real canonical-graph proposal, peer-reviewed and — if accepted — added to the canonical graph"><button className="btn btn-mini" onClick={onPromote}>propose to canonical →</button></Tip>}
          </div>}
        </>}
      </div>
    </div>
  );
}

function NewItemForm({ spaceId, onDone }: { spaceId: string; onDone: () => void }) {
  const api = useApi();
  const [kind, setKind] = useState<PrivateNodeType>("question");
  const [label, setLabel] = useState(""); const [desc, setDesc] = useState(""); const [rationale, setRationale] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await api.createCommonsProposal({ commons_space_id: spaceId, change_type: "add_item", payload: { kind, label, description: desc }, rationale }, true); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="row"><div className="field" style={{ flex: 1 }}><label>Kind</label><select value={kind} onChange={(e) => setKind(e.target.value as PrivateNodeType)}>{Object.keys(PRIVATE_TYPE_HELP).map((k) => <option key={k} value={k}>{k}</option>)}</select></div></div>
      <div className="field"><label>Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
      <div className="field"><label>Description</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} /></div>
      <div className="field"><label>Rationale (≥ 10 characters) <Help text="Commons proposals need a short rationale, not a full citation set — citation rigor belongs at the promote-to-canonical step." /></label><input value={rationale} onChange={(e) => setRationale(e.target.value)} /></div>
      {err && <div className="notice notice-bad">{err}</div>}
      <button className="btn btn-primary" disabled={busy || !label.trim() || rationale.length < 10} onClick={submit}>Submit proposal</button>
    </div>
  );
}

function NewLinkForm({ spaceId, items, onDone }: { spaceId: string; items: CommonsItemT[]; onDone: () => void }) {
  const api = useApi();
  const [source, setSource] = useState(items[0]?.id ?? ""); const [target, setTarget] = useState(items[1]?.id ?? "");
  const [label, setLabel] = useState(""); const [lens, setLens] = useState(""); const [rationale, setRationale] = useState("");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await api.createCommonsProposal({ commons_space_id: spaceId, change_type: "add_link", payload: { source_item_id: source, target_item_id: target, label, lens: lens || undefined }, rationale }, true); onDone(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div className="row">
        <div className="field" style={{ flex: 1 }}><label>From</label><select value={source} onChange={(e) => setSource(e.target.value)}>{items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select></div>
        <div className="field" style={{ flex: 1 }}><label>To</label><select value={target} onChange={(e) => setTarget(e.target.value)}>{items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select></div>
      </div>
      <div className="field"><label>Because… (≥ 10 characters)</label><input value={label} onChange={(e) => setLabel(e.target.value)} /></div>
      <div className="field"><label>Lens (optional)</label><input value={lens} onChange={(e) => setLens(e.target.value)} placeholder="mechanism, evidence, theory, method…" /></div>
      <div className="field"><label>Rationale for the proposal (≥ 10 characters)</label><input value={rationale} onChange={(e) => setRationale(e.target.value)} /></div>
      {err && <div className="notice notice-bad">{err}</div>}
      <button className="btn btn-primary" disabled={busy || source === target || label.length < 10 || rationale.length < 10} onClick={submit}>Submit proposal</button>
    </div>
  );
}
