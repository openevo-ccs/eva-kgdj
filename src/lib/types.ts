// Mirrors apps/kgdj/supabase/migrations/*.sql. Keep in sync by hand
// (no codegen in the MVP); the names are the column names.
export type Role = "researcher" | "msc_student" | "editor" | "admin";
export type Institution = "mpi-eva" | "uni-leipzig" | "external";
export type RecordStatus = "proposed" | "canonical" | "archived";
export type ChangeType = "add_node" | "edit_node" | "archive_node" | "add_edge" | "edit_edge" | "delete_edge";
export type ProposalStatus = "draft" | "pending" | "under_review" | "revision_requested" | "approved" | "rejected" | "withdrawn";
export type Rating = "strongly_reject" | "reject" | "neutral" | "accept" | "strongly_accept";
export type ReviewTarget = "proposal" | "node" | "edge" | "subgraph";
export type Decision = "approve" | "reject" | "request_revision" | "promote" | "archive";
export type Visibility = "private" | "shared" | "module" | "members";
export type ConsentPurpose = "portfolio_processing" | "peer_review_visibility" | "leaderboard_display" | "canonical_attribution";
export type PrivateNodeType = "self" | "question" | "resource" | "theory" | "method";
export type ModuleMemberRole = "student" | "instructor" | "assistant" | "affiliate";

export interface Provenance { source?: string; status?: string; verification?: string[]; assigned_by?: string; retrieved?: string; approved_at?: string; approved_by?: string; [k: string]: unknown }

export interface Department { id: string; code: string; name: string; abbr: string; color_hex: string | null; pure_ou_id?: string | null }
export interface ResearchGroup { id: string; pure_ou_id: string | null; name: string; kind: "department" | "historical-department" | "group" | "other"; department_code: string | null; status: string; parent_name: string | null }
export interface Profile {
  id: string; username: string; full_name: string | null; role: Role; institution: Institution; department_id: string | null; is_active: boolean;
  research_group_id?: string | null; affiliation_note?: string | null;
}
export interface Module { id: string; code: string; name: string; cohort_year: number; term: string; instructor_id: string | null }

export interface GraphNode {
  id: string; slug: string; label: string; type_code: string; description: string; department_id: string | null;
  status: RecordStatus; external_ids: Record<string, unknown>; provenance: Provenance; tags: string[]; version: number;
  created_by: string | null; created_at: string; updated_at: string; canonical_since: string | null;
}
export interface GraphEdge {
  id: string; source_node_id: string; target_node_id: string; relationship_code: string; label: string | null; weight: number;
  status: RecordStatus; provenance: Provenance; version: number; created_by: string | null; created_at: string; updated_at: string; canonical_since: string | null;
}
export interface Citation {
  id: string; doi: string | null; pure_item_id?: string | null; pure_handle?: string | null; openalex_id?: string | null;
  title: string; authors: string[]; year: number | null; venue: string | null; url?: string | null; verification: Record<string, unknown>;
}
// A citation carries a doi/pure id the moment it's created (citation_has_identifier,
// 0001_schema.sql) -- that alone is not verification, just an identifier someone typed
// in. Real verification is a checked claim recorded in the verification field: today,
// a match against the institute's own PuRe CRIS record (build_literature_seed.py). A citation
// added ad hoc through "add a citation not yet in the journal" (NewProposalPage) has a
// doi but an EMPTY verification object -- showing it with the same "verified" styling
// as an institute-confirmed one would be exactly the overclaim 09-trust-and-
// verification.md argues against, just relocated from the graph to the citation list.
export function isVerifiedCitation(c: Pick<Citation, "verification">): boolean {
  const v = c.verification as { pure?: { matched?: boolean } } | undefined;
  return !!v?.pure?.matched;
}
export interface Proposal {
  id: string; proposer_id: string | null; change_type: ChangeType; target_node_id: string | null; target_edge_id: string | null;
  payload: Record<string, unknown>; rationale: string; module_id: string | null; status: ProposalStatus; submitter_anonymous: boolean;
  submitted_at: string | null; updated_at: string; decided_at: string | null; result_node_id: string | null; result_edge_id: string | null;
  // Set when this canonical-graph proposal originated from "propose to canonical" on a Commons item (0007).
  source_commons_item_id?: string | null;
}
export interface Review {
  id: string; target_kind: ReviewTarget; proposal_id: string | null; node_id: string | null; edge_id: string | null; subgraph_id: string | null;
  reviewer_id: string; reviewer_username: string | null; reviewer_active: boolean; rating: Rating; commentary_md: string; week: number | null; created_at: string;
  helpful_count?: number; helpful_by_me?: boolean;
}
export interface ReviewSummary { target_kind: ReviewTarget; target_id: string; n_reviews: number; strongly_accept: number; accept: number; neutral: number; reject: number; strongly_reject: number; mean_score: number | null; credible_reviews: number; all_reviewers_deleted: boolean; last_review_at: string | null }
export interface ReviewFlag { id: string; target_kind: ReviewTarget; target_id: string; reason: string; raised_at: string; resolved_at: string | null; note: string | null }
// A quick "this looks wrong" pointer on a node or edge -- distinct from ReviewFlag
// (editor-only, reviewer-integrity issues like an erased reviewer) and from Review (a
// full identified critique with a rating). See docs/kgdj/10-design-patterns-research.md
// and 0009_content_flags.sql. Always identified, like reviews -- never anonymous.
export type ContentFlagTargetKind = "node" | "edge";
export interface ContentFlag {
  id: string; target_kind: ContentFlagTargetKind; target_id: string; reason: string; created_at: string;
  flagged_by: string; flagged_by_username?: string | null;
  resolved_at: string | null; resolved_by: string | null; resolved_by_username?: string | null; resolution_note: string | null;
}
export interface EditorialDecision { id: string; proposal_id: string | null; node_id: string | null; edge_id: string | null; editor_id: string; decision: Decision; feedback: string; decided_at: string }

// One row per node/edge that has >=1 citation (kgdj.citation_coverage, 0010) — the
// bulk-fetch counterpart to isVerifiedCitation(): lets a list of many nodes/edges show
// "backed by real sources or not" without loading every one's full citation list. A
// target with no row has zero citations, not zero rows filtered out.
export interface CitationCoverage { target_kind: ContentFlagTargetKind; target_id: string; total_citations: number; verified_citations: number }

export interface Subgraph { id: string; owner_id: string; module_id: string | null; title: string; description: string; visibility: Visibility; last_checkpoint_week: number | null; created_at: string }
// added_week/created_week are legacy — the UI no longer asks for them, kept only so old
// backup files (lib/backup.ts) and pre-existing rows still round-trip; added_at/created_at
// are the real, always-populated timestamps. shared/shared_at: see setNodeShared etc. in api.ts.
export interface SubgraphNode { subgraph_id: string; node_id: string; custom_annotation: string; pos_x: number | null; pos_y: number | null; added_week?: number | null; added_at: string; updated_at: string; shared: boolean; shared_at: string | null }
export interface PrivateNode { id: string; subgraph_id: string; node_type: PrivateNodeType; label: string; source: string | null; origin: string | null; created_week?: number | null; pos_x: number | null; pos_y: number | null; created_at: string; updated_at: string; shared: boolean; shared_at: string | null }
export interface SubgraphLink { id: string; subgraph_id: string; from_node_id: string | null; from_private_id: string | null; to_node_id: string | null; to_private_id: string | null; why: string; lens: string | null; created_week?: number | null; edge_id?: string | null; created_at: string; updated_at: string; shared: boolean; shared_at: string | null }
// full_access: whether the viewer can see the whole portfolio (owner/instructor/shared-with/
// members-visibility) vs. only reached it through one shared item (see kgdj.can_see_subgraph
// in 0002_rls.sql) — the UI uses this to hide the critique thread on a partial view.
export interface SubgraphDetail { subgraph: Subgraph; nodes: SubgraphNode[]; privateNodes: PrivateNode[]; links: SubgraphLink[]; reviews: Review[]; full_access: boolean }

// One row per opted-in member; the Leaderboard page derives a separate top list per measure.
export interface LeaderboardRow {
  profile_id: string; username: string; role: Role; department: string | null;
  approved_proposals: number; open_proposals: number; canonical_nodes_authored: number; citations_brought: number;
  reviews_written: number; portfolio_critiques: number; helpful_votes_received: number; reviews_upheld: number; substantive_reviews: number;
  annotated_nodes: number; annotation_chars: number; connections_written: number; cross_dept_connections: number; lenses_used: number;
  questions_raised: number; resources_added: number; active_days: number;
}

// Same keys as kgdj.portfolio_metrics() in 0005/0006_*.sql; computed client-side for the reader's own portfolio (lib/report.ts).
export type MetricKey = "canonical_nodes" | "annotated_nodes" | "avg_annotation_len" | "own_nodes" | "questions" | "resources" | "theories" | "methods"
  | "connections" | "avg_why_len" | "lenses" | "adopted_edges" | "cross_dept_connections" | "departments_covered" | "node_types_covered" | "active_days" | "critiques_received";
export type PortfolioMetrics = Record<MetricKey, number>;
export interface CohortStats { scope: "module" | "program" | "members"; n: number; metrics: Record<string, { mean: number; median: number; p75: number; max: number }> | null; reason?: string }

// One row per (module, student), for the instructor-facing view (kgdj.module_roster,
// 0011_instructor_roster.sql). subgraph_id null means the student hasn't started a
// portfolio yet -- a real, distinct state from "started but empty," not absent data.
export interface RosterRow {
  profile_id: string; username: string; full_name: string | null; member_role: ModuleMemberRole; joined_at: string;
  subgraph_id: string | null; subgraph_title: string | null; subgraph_visibility: string | null;
  last_checkpoint_week: number | null; subgraph_updated_at: string | null; metrics: PortfolioMetrics | null;
}

// One shared node/private-node/link — the older, per-item "share with my module" feed
// (migration 0006, pages/CommonsPage.tsx's "Shared items" tab). Distinct from Commons
// Spaces below (migration 0007): this is one person's portfolio item made visible;
// a Commons Space is a genuinely new, jointly-owned entity nobody individually owns
// (see docs/kgdj/04-commons-design.md §1).
export type CommonsKind = "node" | "private_node" | "link";
export interface CommonsItem {
  kind: CommonsKind; subgraph_id: string; subgraph_title: string; owner_username: string; module_name: string | null; shared_at: string;
  label: string; sub_label?: string;                    // sub_label: node's dept/type, or a link's "A → B"
  node_id?: string;                                       // present for kind "node" (open it in the canonical graph)
  private_id?: string; link_id?: string;                  // present for kind "private_node" / "link" respectively — addresses the row for item_comments (0008)
}

// A comment thread scoped to ONE shared item (migration 0008_item_comments.sql; docs/kgdj/
// 05-student-portfolio-uiux-review.md §4.2) — the lighter-weight middle option between "no
// feedback at all" and granting full portfolio access. `item_kind` reuses CommonsKind's shape
// (same three kinds subgraph rows come in), not the same values as CommonsRole/PrivateNodeType.
export type ItemCommentKind = CommonsKind;
export interface ItemCommentTarget { subgraph_id: string; item_kind: ItemCommentKind; node_id?: string | null; private_id?: string | null; link_id?: string | null }
export interface ItemComment extends ItemCommentTarget { id: string; author_id: string; author_username?: string | null; body_md: string; created_at: string; updated_at: string }

// Commons Spaces (migration 0007_commons.sql; docs/kgdj/04-commons-design.md §4-6): an
// opt-in, role-gated space where a group jointly curates content nobody individually
// owns, via the same propose -> review -> decide -> promote shape as the canonical graph.
export type CommonsJoinPolicy = "invite_only" | "request_approval" | "open_to_module_members";
export type CommonsRole = "viewer" | "contributor" | "reviewer" | "steward";
export type CommonsParticipantStatus = "invited" | "requested" | "active";
export type CommonsChangeType = "add_item" | "edit_item" | "archive_item" | "add_link" | "edit_link" | "archive_link";
export type CommonsDecisionOutcome = "approve" | "reject" | "request_revision" | "archive";
export type CommonsItemStatus = "active" | "archived";

export interface CommonsSpace { id: string; module_id: string | null; module_name?: string | null; label: string; description: string; join_policy: CommonsJoinPolicy; created_by: string; created_at: string; updated_at: string }
export interface CommonsParticipant { commons_space_id: string; profile_id: string; username?: string; role: CommonsRole; status: CommonsParticipantStatus; invited_by: string | null; joined_at: string | null; created_at: string }
export interface CommonsItemT {
  id: string; commons_space_id: string; kind: PrivateNodeType; label: string; description: string; content: Record<string, unknown>; status: CommonsItemStatus;
  created_by: string; created_by_username?: string | null; updated_by: string | null; provenance: Record<string, unknown>; promoted_to_node_id: string | null; created_at: string; updated_at: string;
}
export interface CommonsLink { id: string; commons_space_id: string; source_item_id: string; target_item_id: string; label: string; lens: string | null; created_by: string; created_at: string }
export interface CommonsProposal {
  id: string; commons_space_id: string; proposed_by: string | null; change_type: CommonsChangeType; target_item_id: string | null; target_link_id: string | null;
  payload: Record<string, unknown>; rationale: string; status: ProposalStatus; review_restricted_to_role: CommonsRole | null;
  submitted_at: string | null; updated_at: string; decided_at: string | null; result_item_id: string | null; result_link_id: string | null;
}
export interface CommonsReview { id: string; proposal_id: string; reviewer_id: string; reviewer_username?: string | null; rating: Rating; commentary_md: string; created_at: string; updated_at: string }
export interface CommonsDecisionRow { id: string; proposal_id: string; decided_by: string; outcome: CommonsDecisionOutcome; rationale: string; decided_at: string }

export interface CommonsSpaceDetail { space: CommonsSpace; myParticipant: CommonsParticipant | null; participants: CommonsParticipant[]; items: CommonsItemT[]; links: CommonsLink[] }
export interface CommonsProposalDetail { proposal: CommonsProposal; citations: Citation[]; reviews: CommonsReview[]; decisions: CommonsDecisionRow[]; targetItem: CommonsItemT | null; targetLink: CommonsLink | null; proposedByUsername: string | null }

export const COMMONS_CHANGE_LABEL: Record<CommonsChangeType, string> = { add_item: "Add item", edit_item: "Edit item", archive_item: "Archive item", add_link: "Add link", edit_link: "Edit link", archive_link: "Archive link" };
export const COMMONS_ROLE_LABEL: Record<CommonsRole, string> = { viewer: "Viewer", contributor: "Contributor", reviewer: "Reviewer", steward: "Steward" };
export const COMMONS_ROLE_HELP: Record<CommonsRole, string> = {
  viewer: "Can read items, links and proposals. Cannot propose or review.",
  contributor: "Can propose new items/links and edits. Reviewing is open to any active participant unless a proposal restricts it.",
  reviewer: "Everything a contributor can do, plus can review proposals a contributor restricted to 'reviewer and up'.",
  steward: "Manages membership, decides proposals (approve/reject/request revision/archive), can always review regardless of restriction.",
};
export const COMMONS_JOIN_POLICY_LABEL: Record<CommonsJoinPolicy, string> = { invite_only: "Invite only", request_approval: "Request to join", open_to_module_members: "Open to module members" };

export interface Session { userId: string; email: string | null }
export interface NodeDetail { node: GraphNode; citations: Citation[]; reviews: Review[]; summary: ReviewSummary | null; proposals: Proposal[]; edges: GraphEdge[]; flags: ReviewFlag[]; contentFlags: ContentFlag[] }
export interface EdgeDetail { edge: GraphEdge; source: GraphNode | null; target: GraphNode | null; reviews: Review[]; summary: ReviewSummary | null; citations: Citation[]; contentFlags: ContentFlag[] }
export interface ProposalDetail { proposal: Proposal; citations: Citation[]; reviews: Review[]; summary: ReviewSummary | null; decisions: EditorialDecision[]; targetNode: GraphNode | null; proposerUsername: string | null }

export const RATING_LABEL: Record<Rating, string> = { strongly_reject: "Strongly reject", reject: "Reject", neutral: "Neutral", accept: "Accept", strongly_accept: "Strongly accept" };
export const RATINGS: Rating[] = ["strongly_reject", "reject", "neutral", "accept", "strongly_accept"];
export const CHANGE_LABEL: Record<ChangeType, string> = { add_node: "Add node", edit_node: "Edit node", archive_node: "Archive node", add_edge: "Add edge", edit_edge: "Edit edge", delete_edge: "Delete edge" };
export const PRIVATE_TYPE_HELP: Record<PrivateNodeType, string> = {
  self: "You: your interests, background, or a stance you hold. Usually one per portfolio.",
  question: "A question you genuinely have. Connect it to the canonical nodes it grows out of.",
  resource: "A paper, dataset, talk or site you found (give the source). Not yet in the canonical graph.",
  theory: "A theoretical idea you are working with that the canonical graph lacks.",
  method: "A method or measure you want to learn or used.",
};
