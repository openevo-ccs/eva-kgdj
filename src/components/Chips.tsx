import type { Department, Provenance, Rating, RecordStatus, ProposalStatus } from "../lib/types";
import { RATING_LABEL } from "../lib/types";

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
