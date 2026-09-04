// Mirrors apps/kgdj/supabase/migrations/0001_schema.sql. Keep in sync by hand
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

export interface Provenance { source?: string; status?: string; verification?: string[]; assigned_by?: string; retrieved?: string; approved_at?: string; approved_by?: string; [k: string]: unknown }

export interface Department { id: string; code: string; name: string; abbr: string; color_hex: string | null; pure_ou_id?: string | null }
export interface Profile { id: string; username: string; full_name: string | null; role: Role; institution: Institution; department_id: string | null; is_active: boolean }
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
}
export interface ReviewSummary { target_kind: ReviewTarget; target_id: string; n_reviews: number; strongly_accept: number; accept: number; neutral: number; reject: number; strongly_reject: number; mean_score: number | null; credible_reviews: number; all_reviewers_deleted: boolean; last_review_at: string | null }
export interface ReviewFlag { id: string; target_kind: ReviewTarget; target_id: string; reason: string; raised_at: string; resolved_at: string | null; note: string | null }
export interface EditorialDecision { id: string; proposal_id: string | null; node_id: string | null; edge_id: string | null; editor_id: string; decision: Decision; feedback: string; decided_at: string }

export interface Subgraph { id: string; owner_id: string; module_id: string | null; title: string; description: string; visibility: Visibility; last_checkpoint_week: number | null; created_at: string }
export interface SubgraphNode { subgraph_id: string; node_id: string; custom_annotation: string; pos_x: number | null; pos_y: number | null; added_week: number | null }
export interface PrivateNode { id: string; subgraph_id: string; node_type: PrivateNodeType; label: string; source: string | null; origin: string | null; created_week: number | null; pos_x: number | null; pos_y: number | null }
export interface SubgraphLink { id: string; subgraph_id: string; from_node_id: string | null; from_private_id: string | null; to_node_id: string | null; to_private_id: string | null; why: string; lens: string | null; created_week: number | null }
export interface LeaderboardRow { profile_id: string; username: string; role: Role; department: string | null; approved_proposals: number; open_proposals: number; reviews_written: number; portfolio_critiques: number; canonical_nodes_authored: number }

export interface Session { userId: string; email: string | null }
export interface NodeDetail { node: GraphNode; citations: Citation[]; reviews: Review[]; summary: ReviewSummary | null; proposals: Proposal[]; edges: GraphEdge[]; flags: ReviewFlag[] }
export interface ProposalDetail { proposal: Proposal; citations: Citation[]; reviews: Review[]; summary: ReviewSummary | null; decisions: EditorialDecision[]; targetNode: GraphNode | null; proposerUsername: string | null }

export const RATING_LABEL: Record<Rating, string> = { strongly_reject: "Strongly reject", reject: "Reject", neutral: "Neutral", accept: "Accept", strongly_accept: "Strongly accept" };
export const RATINGS: Rating[] = ["strongly_reject", "reject", "neutral", "accept", "strongly_accept"];
export const CHANGE_LABEL: Record<ChangeType, string> = { add_node: "Add node", edit_node: "Edit node", archive_node: "Archive node", add_edge: "Add edge", edit_edge: "Edit edge", delete_edge: "Delete edge" };
