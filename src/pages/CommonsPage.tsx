// Commons: two related but distinct things live here (see docs/kgdj/04-commons-design.md §1).
//   "Spaces" (0007_commons.sql, the default tab) — an opt-in, role-gated space where a group
//   jointly curates content nobody individually owns: propose -> review -> decide -> promote,
//   one level down from the canonical graph.
//   "Shared items" (0006, second tab) — the older, cheaper mechanism: one person's portfolio
//   node/idea/connection made visible to their module, a flat chronological feed. Real,
//   already shipped, kept as a secondary tab rather than thrown away.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CommonsItem, CommonsJoinPolicy, CommonsKind, CommonsSpace } from "../lib/types";
import { COMMONS_JOIN_POLICY_LABEL } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { Help } from "../components/Tip";

const KIND_LABEL: Record<CommonsKind, string> = { node: "canonical node, annotated", private_node: "own idea", link: "connection" };
const KIND_ICON: Record<CommonsKind, string> = { node: "●", private_node: "★", link: "→" };
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export default function CommonsPage() {
  const [tab, setTab] = useState<"spaces" | "shared">("spaces");
  return (
    <div className="page page-narrow">
      <h1>Commons <Help text="Spaces: opt-in, role-gated group curation — a third thing between your private portfolio and the canonical graph. Shared items: individual portfolio pieces classmates chose to make visible." /></h1>
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={tab === "spaces" ? "active" : ""} onClick={() => setTab("spaces")}>Spaces</button>
        <button className={tab === "shared" ? "active" : ""} onClick={() => setTab("shared")}>Shared items</button>
      </div>
      {tab === "spaces" ? <SpacesTab /> : <SharedItemsFeed />}
    </div>
  );
}

function SpacesTab() {
  const api = useApi(); const { myModules } = useSession();
  const [spaces, setSpaces] = useState<CommonsSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [label, setLabel] = useState(""); const [desc, setDesc] = useState("");
  const [moduleId, setModuleId] = useState(myModules[0]?.module.id ?? "");
  const [policy, setPolicy] = useState<CommonsJoinPolicy>("open_to_module_members");
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const load = () => { setLoading(true); api.commonsSpaces().then(setSpaces).finally(() => setLoading(false)); };
  useEffect(load, []);
  const create = async () => {
    setBusy(true); setErr(null);
    try { await api.createCommonsSpace({ label, description: desc, module_id: moduleId || null, join_policy: policy }); setShowNew(false); setLabel(""); setDesc(""); load(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <p className="muted" style={{ margin: 0 }}>A space nobody individually owns — a group proposes, reviews, and decides together, then can promote the best of it into the canonical graph.</p>
        <button className="btn btn-primary" onClick={() => setShowNew(!showNew)}>{showNew ? "Cancel" : "New space"}</button>
      </div>
      {showNew && <div className="card">
        <div className="field"><label>Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. CCP commons" /></div>
        <div className="field"><label>Description</label><textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
        <div className="row">
          <div className="field" style={{ flex: 1 }}><label>Module <Help text="Leave unset for a free-standing space not tied to one teaching module." /></label>
            <select value={moduleId} onChange={(e) => setModuleId(e.target.value)}><option value="">free-standing</option>{myModules.map((m) => <option key={m.module.id} value={m.module.id}>{m.module.name}</option>)}</select>
          </div>
          <div className="field" style={{ flex: 1 }}><label>Join policy</label>
            <select value={policy} onChange={(e) => setPolicy(e.target.value as CommonsJoinPolicy)}>{Object.entries(COMMONS_JOIN_POLICY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
        </div>
        {err && <div className="notice notice-bad">{err}</div>}
        <button className="btn btn-primary" disabled={busy || !label.trim()} onClick={create}>Create — you become its founding steward</button>
      </div>}
      {loading ? <p className="muted">Loading…</p> : spaces.length ? <div className="commons-list">
        {spaces.map((s) => <Link className="commons-item" to={`/commons/spaces/${s.id}`} key={s.id} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="commons-icon" title={COMMONS_JOIN_POLICY_LABEL[s.join_policy]}>◈</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><b>{s.label}</b><span className="muted" style={{ fontSize: 12 }} title="Join policy — see the space to join">{COMMONS_JOIN_POLICY_LABEL[s.join_policy]}</span></div>
            {s.description && <div className="muted">{s.description}</div>}
            {s.module_name && <div className="row" style={{ marginTop: 4 }}><span className="chip">{s.module_name}</span></div>}
          </div>
        </Link>)}
      </div> : <p className="muted">No commons spaces visible yet. Create one, or ask your module's instructor to.</p>}
    </div>
  );
}

function SharedItemsFeed() {
  const api = useApi(); const { myModules } = useSession();
  const [items, setItems] = useState<CommonsItem[]>([]);
  const [moduleId, setModuleId] = useState<string>("");
  const [kind, setKind] = useState<CommonsKind | "all">("all");
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api.commonsItems(moduleId || undefined).then(setItems).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [moduleId]);
  const filtered = useMemo(() => items.filter((it) => kind === "all" || it.kind === kind), [items, kind]);
  const byOwner = useMemo(() => { const m = new Map<string, number>(); items.forEach((it) => m.set(it.owner_username, (m.get(it.owner_username) || 0) + 1)); return m; }, [items]);
  // Two members can independently share their own take on the same canonical node — that
  // convergence is exactly the point of putting differently-focused students in one commons,
  // but a flat chronological feed scatters it apart. Pull those groups to the top; everything
  // else (single-owner shares, own ideas, connections) stays the plain chronological feed below.
  const { converged, flat } = useMemo(() => {
    const byNode = new Map<string, CommonsItem[]>();
    for (const it of filtered) if (it.kind === "node" && it.node_id) { const arr = byNode.get(it.node_id); if (arr) arr.push(it); else byNode.set(it.node_id, [it]); }
    const convergedIds = new Set([...byNode.entries()].filter(([, v]) => v.length > 1).map(([k]) => k));
    const converged = [...byNode.values()].filter((v) => v.length > 1).map((v) => v.slice().sort((a, b) => a.shared_at.localeCompare(b.shared_at)));
    const flat = filtered.filter((it) => !(it.kind === "node" && it.node_id && convergedIds.has(it.node_id)));
    return { converged, flat };
  }, [filtered]);

  return (
    <div>
      <p className="muted">Nothing here is automatic — every item was deliberately shared by its owner. {items.length > 0 && <>{items.length} item{items.length === 1 ? "" : "s"} from {byOwner.size} member{byOwner.size === 1 ? "" : "s"}.</>}</p>
      <div className="row" style={{ marginBottom: 12 }}>
        {myModules.length > 1 && <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} aria-label="Module"><option value="">all my modules</option>{myModules.map((m) => <option key={m.module.id} value={m.module.id}>{m.module.name}</option>)}</select>}
        <span className="seg" role="group" aria-label="Filter by kind">
          <span className="seg-label">show</span>
          {(["all", "node", "private_node", "link"] as const).map((k) => <button key={k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>{k === "all" ? "everything" : KIND_LABEL[k]}</button>)}
        </span>
      </div>
      {loading ? <p className="muted">Loading…</p> : filtered.length ? <>
        {converged.length > 0 && <div className="commons-list" style={{ marginBottom: 18 }}>
          <p className="muted" style={{ margin: "0 0 6px" }}>Shared independently by more than one member — worth reading together:</p>
          {converged.map((group) => <div className="commons-item" key={group[0].node_id}>
            <div className="commons-icon" title="Shared by multiple members">◉</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <b>{group[0].label}</b>
                <span className="chip">{group.length} members</span>
              </div>
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {group.map((it, i) => <li key={i}><Link to={`/portfolio/${it.subgraph_id}`}>{it.owner_username}</Link>{it.sub_label && <>: {it.sub_label}</>} <span className="muted">· {ago(it.shared_at)}</span></li>)}
              </ul>
              {group[0].node_id && <div className="row" style={{ marginTop: 6 }}><Link className="btn btn-mini" to={`/explore/${group[0].node_id}`}>canonical node →</Link></div>}
            </div>
          </div>)}
        </div>}
        <div className="commons-list">
        {flat.map((it, i) => <div className="commons-item" key={i}>
          <div className="commons-icon" title={KIND_LABEL[it.kind]}>{KIND_ICON[it.kind]}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{it.label}</b>
              <span className="muted">{it.owner_username} · {ago(it.shared_at)}</span>
            </div>
            {it.sub_label && <div className="muted">{it.sub_label}</div>}
            <div className="row" style={{ marginTop: 4 }}>
              <span className="chip">{KIND_LABEL[it.kind]}</span>
              {it.module_name && <span className="chip">{it.module_name}</span>}
              <Link className="btn btn-mini" to={`/portfolio/${it.subgraph_id}`}>open in {it.subgraph_title} →</Link>
              {it.node_id && <Link className="btn btn-mini" to={`/explore/${it.node_id}`}>canonical node →</Link>}
            </div>
          </div>
        </div>)}
        </div>
      </> : <p className="muted">Nothing shared into {moduleId ? "this module" : "your modules"} yet. Share a node, connection or cluster from your own portfolio to start the commons.</p>}
    </div>
  );
}
