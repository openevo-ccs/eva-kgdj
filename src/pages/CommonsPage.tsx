// Commons: everything a classmate has chosen to share with a module — one node, one
// connection, or a whole cluster — without exposing the rest of their (private) portfolio.
// Phase 1 is a flat, readable feed; Phase 2 turns this into the full peer-portfolio graph
// space (shared portfolios overlaid on the canonical graph, module/program scope, canonical
// nodes rolling up student questions) — this page is the entry point that gets upgraded then.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { CommonsItem, CommonsKind } from "../lib/types";
import { useApi, useSession } from "../state/session";
import { Help } from "../components/Tip";

const KIND_LABEL: Record<CommonsKind, string> = { node: "canonical node, annotated", private_node: "own idea", link: "connection" };
const KIND_ICON: Record<CommonsKind, string> = { node: "●", private_node: "★", link: "→" };
const ago = (iso: string) => { const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

export default function CommonsPage() {
  const api = useApi(); const { myModules } = useSession();
  const [items, setItems] = useState<CommonsItem[]>([]);
  const [moduleId, setModuleId] = useState<string>("");
  const [kind, setKind] = useState<CommonsKind | "all">("all");
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api.commonsItems(moduleId || undefined).then(setItems).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, [moduleId]);
  const filtered = useMemo(() => items.filter((it) => kind === "all" || it.kind === kind), [items, kind]);
  const byOwner = useMemo(() => { const m = new Map<string, number>(); items.forEach((it) => m.set(it.owner_username, (m.get(it.owner_username) || 0) + 1)); return m; }, [items]);

  return (
    <div className="page page-narrow">
      <h1>Commons <Help text="Ideas classmates chose to share with a module — one node, one connection, or a cluster — while keeping the rest of their portfolio private. Share your own from a node/connection's right-click menu, or the panel that opens when you select something in your portfolio." /></h1>
      <p className="muted">Nothing here is automatic — every item was deliberately shared by its owner. {items.length > 0 && <>{items.length} item{items.length === 1 ? "" : "s"} from {byOwner.size} member{byOwner.size === 1 ? "" : "s"}.</>}</p>
      <div className="row" style={{ marginBottom: 12 }}>
        {myModules.length > 1 && <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} aria-label="Module"><option value="">all my modules</option>{myModules.map((m) => <option key={m.module.id} value={m.module.id}>{m.module.name}</option>)}</select>}
        <span className="seg" role="group" aria-label="Filter by kind">
          <span className="seg-label">show</span>
          {(["all", "node", "private_node", "link"] as const).map((k) => <button key={k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>{k === "all" ? "everything" : KIND_LABEL[k]}</button>)}
        </span>
      </div>
      {loading ? <p className="muted">Loading…</p> : filtered.length ? <div className="commons-list">
        {filtered.map((it, i) => <div className="commons-item" key={i}>
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
      </div> : <p className="muted">Nothing shared into {moduleId ? "this module" : "your modules"} yet. Share a node, connection or cluster from your own portfolio to start the commons.</p>}
    </div>
  );
}
