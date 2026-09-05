// Portfolio backup file: what a student downloads from the Portfolio page and
// can restore later ("Restore from backup"). The app makes no promise to keep
// portfolios (see the banner); this file is the student's own copy.
//
// Format is plain JSON, human-readable, with canonical nodes referenced by slug
// (stable across re-imports of the seed) as well as id.
import type { GraphNode, PrivateNode, Review, Subgraph, SubgraphDetail, SubgraphLink, SubgraphNode } from "./types";

export const BACKUP_FORMAT = "eva-kgdj-portfolio";
export const BACKUP_VERSION = 1;

export interface PortfolioBackup {
  format: typeof BACKUP_FORMAT; version: number; exported_at: string; app: string;
  subgraph: Pick<Subgraph, "title" | "description" | "visibility" | "module_id" | "last_checkpoint_week"> & { id: string; owner_username: string | null };
  nodes: (SubgraphNode & { slug: string | null; label: string | null; type_code: string | null; department_id: string | null })[];
  private_nodes: PrivateNode[];
  links: SubgraphLink[];
  critiques: Pick<Review, "id" | "reviewer_username" | "rating" | "commentary_md" | "week" | "created_at">[];
}

export function buildBackup(d: SubgraphDetail, nodesById: Record<string, GraphNode>, ownerUsername: string | null): PortfolioBackup {
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: new Date().toISOString(), app: "Eva KGDJ",
    subgraph: { id: d.subgraph.id, title: d.subgraph.title, description: d.subgraph.description, visibility: d.subgraph.visibility, module_id: d.subgraph.module_id, last_checkpoint_week: d.subgraph.last_checkpoint_week, owner_username: ownerUsername },
    nodes: d.nodes.map((sn) => { const n = nodesById[sn.node_id]; return { ...sn, slug: n?.slug ?? null, label: n?.label ?? null, type_code: n?.type_code ?? null, department_id: n?.department_id ?? null }; }),
    private_nodes: d.privateNodes,
    links: d.links,
    critiques: d.reviews.map((r) => ({ id: r.id, reviewer_username: r.reviewer_username, rating: r.rating, commentary_md: r.commentary_md, week: r.week, created_at: r.created_at })),
  };
}

export function parseBackup(text: string): PortfolioBackup {
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new Error("Not a JSON file."); }
  const b = j as Partial<PortfolioBackup>;
  if (b.format !== BACKUP_FORMAT) throw new Error("Not an Eva KGDJ portfolio backup (missing format marker).");
  if (!b.subgraph || !Array.isArray(b.nodes) || !Array.isArray(b.private_nodes) || !Array.isArray(b.links)) throw new Error("Backup file is incomplete.");
  return b as PortfolioBackup;
}

// Browser download helpers (no server involved).
export function downloadText(filename: string, text: string, type = "application/json") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function safeFilename(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60) || "portfolio"; }

// Last-backup bookkeeping, per portfolio, in this browser only.
const KEY = (id: string) => `kgdj.backup.${id}`;
export function lastBackupAt(id: string): Date | null { try { const v = localStorage.getItem(KEY(id)); return v ? new Date(v) : null; } catch { return null; } }
export function noteBackup(id: string) { try { localStorage.setItem(KEY(id), new Date().toISOString()); sessionStorage.setItem(KEY(id) + ".session", "1"); } catch { /* private mode */ } }
export function backedUpThisSession(id: string) { try { return sessionStorage.getItem(KEY(id) + ".session") === "1"; } catch { return false; } }
