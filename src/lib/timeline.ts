// A student's own record of their portfolio, not a schedule for it.
//
// Dustin corrected the original "this week, do X" idea directly (2026-09-09): the
// CCP module's sequence is deliberately flexible, students drive their own learning
// and their own metacognitive reflection, so the app should never tell them what week
// to be on. What he actually wants: every piece of their work already carries a
// reliable, server-set creation timestamp (checked against the schema, not assumed —
// see docs/kgdj/08-product-vision.md's correction), so their own path can be
// reconstructed and looked back on. This module turns those timestamps into that
// record. Pure function, no fetch of its own — the caller already has everything
// (PortfolioPage's own SubgraphDetail load, plus one cheap `mine: true` proposals
// fetch) needed to build it.
import type { GraphNode, PrivateNode, Proposal, SubgraphDetail, SubgraphLink } from "./types";
import { CHANGE_LABEL, PRIVATE_TYPE_HELP } from "./types";

export type TimelineKind = "forked" | "own-node" | "connection" | "proposal";

export interface TimelineEntry {
  at: string; // ISO timestamp, always server-set -- see the tables below, never client-supplied
  kind: TimelineKind;
  label: string;
  detail?: string;
  linkTo?: string; // a route, if this entry can be opened
}

/**
 * Chronological (oldest first): a narrative of how the portfolio grew, matching the
 * framing this is a story to read back, not a recent-activity feed to scan for what
 * needs attention. Flip to a `.sort()` reverse if that framing turns out wrong in
 * practice -- nothing else about the data model assumes either order.
 *
 * Known, honest gap: `subgraph_nodes` has no `updated_at`, only `added_at` -- so a
 * later edit to a node's annotation has no timestamp of its own and cannot appear
 * here. This reflects what the schema actually tracks, not an oversight in this
 * function; extending it needs a migration, not more code here.
 */
export function buildPortfolioTimeline(data: SubgraphDetail, nodesById: Record<string, GraphNode>, myProposals: Proposal[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];

  for (const sn of data.nodes) {
    const n = nodesById[sn.node_id];
    out.push({ at: sn.added_at, kind: "forked", label: n ? n.label : sn.node_id, linkTo: `/explore/${sn.node_id}` });
  }
  for (const p of data.privateNodes as PrivateNode[]) {
    out.push({ at: p.created_at, kind: "own-node", label: p.label, detail: PRIVATE_TYPE_HELP[p.node_type] });
  }
  for (const l of data.links as SubgraphLink[]) {
    out.push({ at: l.created_at, kind: "connection", label: l.why, detail: l.lens || undefined });
  }
  // Proposals aren't tied to a specific portfolio in the schema (proposed_changes has
  // no subgraph_id) -- they belong to the profile, not the fork. `mine: true` is
  // therefore every proposal this student has ever submitted, not only ones that
  // started here. Callers with more than one portfolio should say so in the UI
  // (see PortfolioPage) rather than let this look like an undercount or an error.
  for (const p of myProposals) {
    if (!p.submitted_at) continue; // drafts are private work-in-progress, not yet a real event
    out.push({
      at: p.submitted_at, kind: "proposal", label: CHANGE_LABEL[p.change_type],
      detail: p.rationale.slice(0, 100) + (p.rationale.length > 100 ? "…" : ""),
      linkTo: `/proposals/${p.id}`,
    });
  }

  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export const TIMELINE_KIND_LABEL: Record<TimelineKind, string> = {
  forked: "forked a canonical node", "own-node": "added your own node", connection: "made a connection", proposal: "submitted a proposal",
};
