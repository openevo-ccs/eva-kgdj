import type { Department, Provenance, Rating, RecordStatus, ProposalStatus } from "../lib/types";
import { RATING_LABEL } from "../lib/types";

// The same "verified means checked, not just present" honesty signal
// isVerifiedCitation() applies to one citation (docs/kgdj/13-literature-integration.md),
// at a glance for a whole node/edge -- so a list of cards doesn't require opening each
// one to tell a real-sources record from an empty one. `total`/`verified` come either
// from summing a loaded Citation[] client-side (cheap: the drawer already has them) or
// from kgdj.citation_coverage in bulk (Explorer/cards, which never load full citation
// lists for nodes it isn't showing the drawer for).
export function CitationCoverageChip({ total, verified }: { total: number; verified: number }) {
  if (total === 0) return <span className="chip" title="No citations yet — a proposal adding one is a real contribution.">no sources yet</span>;
  if (verified === total) return <span className="chip chip-verified" title={`All ${total} citation${total === 1 ? "" : "s"} matched against the institute's own PuRe repository record.`}>✓ {total} verified</span>;
  if (verified > 0) return <span className="chip" title={`${verified} of ${total} citations matched against the institute's own PuRe repository record; the rest have an identifier but haven't been confirmed yet.`}>{verified}/{total} verified</span>;
  return <span className="chip" title="Has a citation, but nothing has been confirmed against the institute's own records yet — not wrong, just not yet verified.">{total} unverified</span>;
}

export function StatusChip({ status }: { status: RecordStatus | ProposalStatus | string }) {
  return <span className={`chip chip-${status}`}><span className="dot" />{status.replace(/_/g, " ")}</span>;
}
export function RatingBadge({ rating }: { rating: Rating }) { return <span className={`rating rating-${rating}`}>{RATING_LABEL[rating]}</span>; }
export function DeptSwatch({ dept }: { dept: Department | null | undefined }) {
  return <span className="dept-sw" style={{ background: dept?.color_hex || "#999" }} title={dept?.name || "cross-department"} />;
}
export function ProvenanceChip({ prov, status }: { prov: Provenance; status?: string }) {
  const st = status || prov.status || "draft";
  const cls = ["canonical", "verified", "accepted", "stable"].includes(st) ? "chip-verified" : st === "reviewed" ? "chip-reviewed" : st === "computed" ? "chip-proposed" : "chip-draft";
  const tip = [prov.source && `source: ${prov.source}`, `status: ${st}`, prov.verification?.length && `verified via: ${prov.verification.join(", ")}`, prov.assigned_by && `assigned by: ${prov.assigned_by}`, prov.approved_at && `approved: ${String(prov.approved_at).slice(0, 10)}`, prov.retrieved && `as of: ${prov.retrieved}`].filter(Boolean).join("\n");
  return <span className={`chip ${cls}`} title={tip}><span className="dot" />{st} · {String(prov.source || "kgdj").split("/").slice(-1)[0]}</span>;
}
