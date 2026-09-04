// The one seam between UI and backend. Two implementations:
//   supabaseApi.ts — supabase-js against the kgdj schema (RLS does the gating)
//   mockApi.ts     — in-memory, seeded from src/mock/graph.json, for UI work
//                    and screenshot tests without a project (VITE_KGDJ_MODE=mock)
import type {
  Citation, ConsentPurpose, Decision, Department, EditorialDecision, GraphEdge, GraphNode, LeaderboardRow, Module, NodeDetail,
  PrivateNode, PrivateNodeType, Profile, Proposal, ProposalDetail, ProposalStatus, Rating, Review, ReviewFlag, ReviewSummary,
  ReviewTarget, Session, Subgraph, SubgraphLink, SubgraphNode, Visibility, ChangeType,
} from "./types";

export interface ProposalInput { change_type: ChangeType; target_node_id?: string | null; target_edge_id?: string | null; payload: Record<string, unknown>; rationale: string; module_id?: string | null; submitter_anonymous: boolean; citation_ids: string[] }
export interface CitationInput { doi?: string | null; pure_handle?: string | null; title: string; authors: string[]; year?: number | null; venue?: string | null; url?: string | null }
export interface ReviewInput { target_kind: ReviewTarget; target_id: string; rating: Rating; commentary_md: string; week?: number | null }
export interface DecisionInput { proposal_id?: string | null; node_id?: string | null; edge_id?: string | null; decision: Decision; feedback?: string }

export interface Api {
  readonly mode: "supabase" | "mock";
  // auth
  getSession(): Promise<Session | null>;
  signInWithEmail(email: string): Promise<{ sent: boolean; message: string }>;
  signOut(): Promise<void>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  me(): Promise<Profile | null>;
  profiles(ids: string[]): Promise<Profile[]>;
  // reference
  departments(): Promise<Department[]>;
  modules(): Promise<Module[]>;
  myModules(): Promise<{ module: Module; role: string }[]>;
  // graph
  graph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  node(id: string): Promise<NodeDetail>;
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
  reviewSummary(kind: ReviewTarget, id: string): Promise<ReviewSummary | null>;
  reviewsFor(kind: ReviewTarget, id: string): Promise<Review[]>;
  decide(d: DecisionInput): Promise<void>;
  flags(): Promise<ReviewFlag[]>;
  resolveFlag(id: string, note: string): Promise<void>;
  reviewQueue(): Promise<{ proposals: Proposal[]; summaries: Record<string, ReviewSummary> }>;
  // portfolios
  subgraphs(): Promise<Subgraph[]>;
  subgraph(id: string): Promise<{ subgraph: Subgraph; nodes: SubgraphNode[]; privateNodes: PrivateNode[]; links: SubgraphLink[]; reviews: Review[] }>;
  createSubgraph(title: string, module_id: string | null): Promise<Subgraph>;
  forkNode(subgraph_id: string, node_id: string, annotation: string, week: number | null): Promise<void>;
  addPrivateNode(subgraph_id: string, node_type: PrivateNodeType, label: string, source: string | null, week: number | null): Promise<PrivateNode>;
  addLink(l: Omit<SubgraphLink, "id">): Promise<void>;
  savePositions(subgraph_id: string, positions: { node_id?: string; private_id?: string; x: number; y: number }[]): Promise<void>;
  setVisibility(subgraph_id: string, v: Visibility): Promise<void>;
  share(subgraph_id: string, username: string): Promise<void>;
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
