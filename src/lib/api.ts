// The one seam between UI and backend. Two implementations:
//   supabaseApi.ts — supabase-js against the kgdj schema (RLS does the gating)
//   mockApi.ts     — in-memory, seeded from src/mock/graph.json, for UI work
//                    and screenshot tests without a project (VITE_KGDJ_MODE=mock)
import type {
  Citation, CohortStats, CommonsItem, ConsentPurpose, Decision, Department, EdgeDetail, EditorialDecision, GraphEdge, GraphNode, LeaderboardRow, Module, ModuleMemberRole, NodeDetail,
  PrivateNode, PrivateNodeType, Profile, Proposal, ProposalDetail, ProposalStatus, Rating, ResearchGroup, Review, ReviewFlag, ReviewSummary,
  ReviewTarget, Session, Subgraph, SubgraphDetail, SubgraphLink, Visibility, ChangeType,
} from "./types";
import type { PortfolioBackup } from "./backup";

export interface ProposalInput { change_type: ChangeType; target_node_id?: string | null; target_edge_id?: string | null; payload: Record<string, unknown>; rationale: string; module_id?: string | null; submitter_anonymous: boolean; citation_ids: string[] }
export interface CitationInput { doi?: string | null; pure_handle?: string | null; title: string; authors: string[]; year?: number | null; venue?: string | null; url?: string | null }
export interface ReviewInput { target_kind: ReviewTarget; target_id: string; rating: Rating; commentary_md: string; week?: number | null }
export interface DecisionInput { proposal_id?: string | null; node_id?: string | null; edge_id?: string | null; decision: Decision; feedback?: string }
export interface ProfilePatch { full_name?: string | null; department_id?: string | null; research_group_id?: string | null; affiliation_note?: string | null }
export interface ForkItem { node_id: string; annotation: string }

export interface Api {
  readonly mode: "supabase" | "mock";
  // auth
  getSession(): Promise<Session | null>;
  signInWithEmail(email: string): Promise<{ sent: boolean; message: string }>;
  signOut(): Promise<void>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  me(): Promise<Profile | null>;
  profiles(ids: string[]): Promise<Profile[]>;
  updateProfile(patch: ProfilePatch): Promise<Profile>;
  // reference
  departments(): Promise<Department[]>;
  researchGroups(): Promise<ResearchGroup[]>;
  modules(): Promise<Module[]>;
  myModules(): Promise<{ module: Module; role: ModuleMemberRole }[]>;
  joinModule(module_id: string, role: "student" | "affiliate"): Promise<void>;
  leaveModule(module_id: string): Promise<void>;
  // graph
  graph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  node(id: string): Promise<NodeDetail>;
  edge(id: string): Promise<EdgeDetail>;
  // citations
  searchCitations(q: string): Promise<Citation[]>;
  addCitation(c: CitationInput): Promise<Citation>;
  // proposals
  proposals(filter?: { status?: ProposalStatus[]; mine?: boolean }): Promise<Proposal[]>;
  proposal(id: string): Promise<ProposalDetail>;
  createProposal(p: ProposalInput, submit: boolean): Promise<string>;
  submitProposal(id: string): Promise<void>;
  withdrawProposal(id: string): Promise<void>;
  setAnonymity(id: string, anonymous: boolean): Promise<void>;
  // reviews + editorial
  review(r: ReviewInput): Promise<void>;
  markHelpful(review_id: string, helpful: boolean): Promise<void>;
  reviewSummary(kind: ReviewTarget, id: string): Promise<ReviewSummary | null>;
  reviewsFor(kind: ReviewTarget, id: string): Promise<Review[]>;
  decide(d: DecisionInput): Promise<void>;
  flags(): Promise<ReviewFlag[]>;
  resolveFlag(id: string, note: string): Promise<void>;
  reviewQueue(): Promise<{ proposals: Proposal[]; summaries: Record<string, ReviewSummary> }>;
  // portfolios
  subgraphs(): Promise<Subgraph[]>;
  subgraph(id: string): Promise<SubgraphDetail>;
  createSubgraph(title: string, module_id: string | null): Promise<Subgraph>;
  updateSubgraph(id: string, patch: { title?: string; description?: string; last_checkpoint_week?: number | null }): Promise<void>;
  deleteSubgraph(id: string): Promise<void>;
  forkNode(subgraph_id: string, node_id: string, annotation: string): Promise<void>;
  forkNodes(subgraph_id: string, items: ForkItem[]): Promise<void>;
  updateAnnotation(subgraph_id: string, node_id: string, annotation: string): Promise<void>;
  removeNode(subgraph_id: string, node_id: string): Promise<void>;
  setNodeShared(subgraph_id: string, node_id: string, shared: boolean): Promise<void>;
  addPrivateNode(subgraph_id: string, node_type: PrivateNodeType, label: string, source: string | null): Promise<PrivateNode>;
  updatePrivateNode(id: string, patch: { label?: string; source?: string | null; node_type?: PrivateNodeType }): Promise<void>;
  removePrivateNode(id: string): Promise<void>;
  setPrivateNodeShared(id: string, shared: boolean): Promise<void>;
  addLink(l: Omit<SubgraphLink, "id" | "created_at" | "updated_at" | "shared" | "shared_at">): Promise<void>;
  addLinks(ls: Omit<SubgraphLink, "id" | "created_at" | "updated_at" | "shared" | "shared_at">[]): Promise<void>;
  updateLink(id: string, patch: { why?: string; lens?: string | null }): Promise<void>;
  removeLink(id: string): Promise<void>;
  setLinkShared(id: string, shared: boolean): Promise<void>;
  savePositions(subgraph_id: string, positions: { node_id?: string; private_id?: string; x: number; y: number }[]): Promise<void>;
  setVisibility(subgraph_id: string, v: Visibility): Promise<void>;
  share(subgraph_id: string, username: string): Promise<void>;
  importPortfolio(b: PortfolioBackup, title: string, module_id: string | null): Promise<Subgraph>;
  cohortStats(scope: "module" | "program" | "members", module_id?: string | null): Promise<CohortStats>;
  commonsItems(module_id?: string | null): Promise<CommonsItem[]>;
  // account
  leaderboard(): Promise<LeaderboardRow[]>;
  consents(): Promise<Record<ConsentPurpose, boolean>>;
  setConsent(purpose: ConsentPurpose, granted: boolean): Promise<void>;
  erase(redactText: boolean): Promise<void>;
  exportMyData(): Promise<unknown>;
}

export async function createApi(): Promise<Api> {
  const mode = (import.meta.env.VITE_KGDJ_MODE || "mock") as "supabase" | "mock";
  if (mode === "supabase") {
    const { SupabaseApi } = await import("./supabaseApi");
    return new SupabaseApi(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
  }
  const { MockApi } = await import("./mockApi");
  return new MockApi();
}

export type { EditorialDecision };
