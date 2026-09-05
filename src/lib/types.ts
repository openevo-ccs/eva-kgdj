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
export interface Proposal {
  id: string; proposer_id: string | null; change_type: ChangeType; target_node_id: string | null; target_edge_id: string | null;
  payload: Record<string, unknown>; rationale: string; module_id: string | null; status: ProposalStatus; submitter_anonymous: boolean;
  submitted_at: string | null; updated_at: string; decided_at: string | null; result_node_id: string | null; result_edge_id: string | null;
}
export interface Review {
  id: string; target_kind: ReviewTarget; proposal_id: string | null; node_id: string | null; edge_id: string | null; subgraph_id: string | null;
  reviewer_id: string; reviewer_username: string | null; reviewer_active: boolean; rating: Rating; commentary_md: string; week: number | null; created_at: string;
  helpful_count?: number; helpful_by_me?: boolean;
}
export interface ReviewSummary { target_kind: ReviewTarget; target_id: string; n_reviews: number; strongly_accept: number; accept: number; neutral: number; reject: number; strongly_reject: number; mean_score: number | null; credible_reviews: number; all_reviewers_deleted: boolean; last_review_at: string | null }
export interface ReviewFlag { id: string; target_kind: ReviewTarget; target_id: string; reason: string; raised_at: string; resolved_at: string | null; note: string | null }
export interface EditorialDecision { id: string; proposal_id: string | null; node_id: string | null; edge_id: string | null; editor_id: string; decision: Decision; feedback: string; decided_at: string }

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

// One shared node/private-node/link, for the Commons list (pages/CommonsPage.tsx).
export type CommonsKind = "node" | "private_node" | "link";
export interface CommonsItem {
  kind: CommonsKind; subgraph_id: string; subgraph_title: string; owner_username: string; module_name: string | null; shared_at: string;
  label: string; sub_label?: string;                    // sub_label: node's dept/type, or a link's "A → B"
  node_id?: string;                                       // present for kind "node" (open it in the canonical graph)
}

export interface Session { userId: string; email: string | null }
export interface NodeDetail { node: GraphNode; citations: Citation[]; reviews: Review[]; summary: ReviewSummary | null; proposals: Proposal[]; edges: GraphEdge[]; flags: ReviewFlag[] }
export interface EdgeDetail { edge: GraphEdge; source: GraphNode | null; target: GraphNode | null; reviews: Review[]; summary: ReviewSummary | null; citations: Citation[] }
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
