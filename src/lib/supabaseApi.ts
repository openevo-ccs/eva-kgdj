// supabase-js implementation of Api. Every call runs under the user's JWT;
// Row-Level Security in supabase/migrations/0002_rls.sql is the authority —
// nothing here filters for permission, it only shapes queries.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Api, CitationInput, DecisionInput, ProposalInput, ReviewInput } from "./api";
import type {
  Citation, ConsentPurpose, Department, GraphEdge, GraphNode, LeaderboardRow, Module, NodeDetail, PrivateNode, PrivateNodeType, Profile, Proposal,
  ProposalDetail, ProposalStatus, Review, ReviewFlag, ReviewSummary, ReviewTarget, Session, Subgraph, SubgraphLink, SubgraphNode, Visibility,
} from "./types";

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export class SupabaseApi implements Api {
  readonly mode = "supabase" as const;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private sb: SupabaseClient<any, any, any>;
  constructor(url: string, anonKey: string) {
    if (!url || !anonKey) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing (see .env.example)");
    this.sb = createClient(url, anonKey, { db: { schema: "kgdj" }, auth: { persistSession: true, autoRefreshToken: true } });
  }
  private t(name: string) { return this.sb.from(name); }

  async getSession(): Promise<Session | null> {
    const { data } = await this.sb.auth.getSession();
    return data.session ? { userId: data.session.user.id, email: data.session.user.email ?? null } : null;
  }
  async signInWithEmail(email: string) {
    const { error } = await this.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
    if (error) return { sent: false, message: error.message };
    return { sent: true, message: "Check your inbox for the sign-in link." };
  }
  async signOut() { await this.sb.auth.signOut(); }
  onAuthChange(cb: (s: Session | null) => void) {
    const { data } = this.sb.auth.onAuthStateChange((_e, s) => cb(s ? { userId: s.user.id, email: s.user.email ?? null } : null));
    return () => data.subscription.unsubscribe();
  }
  async me(): Promise<Profile | null> {
    const s = await this.getSession(); if (!s) return null;
    const { data } = await this.t("profiles").select("*").eq("id", s.userId).maybeSingle();
    return (data as Profile) ?? null;
  }
  async profiles(ids: string[]) { if (!ids.length) return []; return must(await this.t("profiles").select("*").in("id", ids)) as Profile[]; }
  async departments() { return must(await this.t("departments").select("*").order("name")) as Department[]; }
  async modules() { return must(await this.t("modules").select("*").order("cohort_year", { ascending: false })) as Module[]; }
  async myModules() {
    const s = await this.getSession(); if (!s) return [];
    const rows = must(await this.t("module_members").select("member_role, modules(*)").eq("profile_id", s.userId)) as unknown as { member_role: string; modules: Module }[];
    return rows.map((r) => ({ module: r.modules, role: r.member_role }));
  }
  async graph() {
    const nodes = must(await this.t("nodes").select("*").neq("status", "archived")) as GraphNode[];
    const edges = must(await this.t("edges").select("*").neq("status", "archived")) as GraphEdge[];
    return { nodes, edges };
  }
  async node(id: string): Promise<NodeDetail> {
    const node = must(await this.t("nodes").select("*").eq("id", id).single()) as GraphNode;
    const cit = must(await this.t("node_citations").select("citations(*)").eq("node_id", id)) as unknown as { citations: Citation }[];
    const reviews = must(await this.t("reviews_visible").select("*").eq("node_id", id).order("created_at")) as Review[];
    const summary = await this.reviewSummary("node", id);
    const proposals = must(await this.t("proposals_visible").select("*").eq("target_node_id", id).in("status", ["pending", "under_review", "revision_requested"])) as Proposal[];
    const edges = must(await this.t("edges").select("*").or(`source_node_id.eq.${id},target_node_id.eq.${id}`).neq("status", "archived")) as GraphEdge[];
    const flags = must(await this.t("review_flags").select("*").eq("target_id", id).is("resolved_at", null)) as ReviewFlag[];
    return { node, citations: cit.map((c) => c.citations), reviews, summary, proposals, edges, flags };
  }
  async searchCitations(q: string) {
    if (!q.trim()) return [];
    return must(await this.t("citations").select("*").or(`doi.ilike.%${q}%,title.ilike.%${q}%`).limit(20)) as Citation[];
  }
  async addCitation(c: CitationInput) {
    const s = await this.getSession();
    return must(await this.t("citations").insert({ ...c, created_by: s?.userId }).select("*").single()) as Citation;
  }
  async proposals(filter?: { status?: ProposalStatus[]; mine?: boolean }) {
    let q = this.t("proposals_visible").select("*").order("updated_at", { ascending: false });
    if (filter?.status?.length) q = q.in("status", filter.status);
    if (filter?.mine) { const s = await this.getSession(); q = q.eq("proposer_id", s?.userId ?? ""); }
    return must(await q) as Proposal[];
  }
  async proposal(id: string): Promise<ProposalDetail> {
    const proposal = must(await this.t("proposals_visible").select("*").eq("id", id).single()) as Proposal;
    const cit = must(await this.t("proposal_citations").select("citations(*)").eq("proposal_id", id)) as unknown as { citations: Citation }[];
    const reviews = must(await this.t("reviews_visible").select("*").eq("proposal_id", id).order("created_at")) as Review[];
    const decisions = must(await this.t("editorial_decisions").select("*").eq("proposal_id", id).order("decided_at")) as ProposalDetail["decisions"];
    const targetNode = proposal.target_node_id ? (must(await this.t("nodes").select("*").eq("id", proposal.target_node_id).single()) as GraphNode) : null;
    let proposerUsername: string | null = null;
    if (proposal.proposer_id) { const p = await this.profiles([proposal.proposer_id]); proposerUsername = p[0]?.username ?? null; }
    return { proposal, citations: cit.map((c) => c.citations), reviews, summary: await this.reviewSummary("proposal", id), decisions, targetNode, proposerUsername };
  }
  async createProposal(p: ProposalInput, submit: boolean) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    const row = must(await this.t("proposed_changes").insert({
      proposer_id: s.userId, change_type: p.change_type, target_node_id: p.target_node_id ?? null, target_edge_id: p.target_edge_id ?? null,
      payload: p.payload, rationale: p.rationale, module_id: p.module_id ?? null, submitter_anonymous: p.submitter_anonymous, status: "draft",
    }).select("id").single()) as { id: string };
    if (p.citation_ids.length) must(await this.t("proposal_citations").insert(p.citation_ids.map((c) => ({ proposal_id: row.id, citation_id: c }))));
    if (submit) await this.submitProposal(row.id);
    return row.id;
  }
  async submitProposal(id: string) { must(await this.t("proposed_changes").update({ status: "pending" }).eq("id", id)); }
  async withdrawProposal(id: string) { must(await this.t("proposed_changes").update({ status: "withdrawn" }).eq("id", id)); }
  async setAnonymity(id: string, anonymous: boolean) { must(await this.sb.rpc("set_submission_anonymity", { pid: id, anonymous })); }
  async review(r: ReviewInput) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    const col = { proposal: "proposal_id", node: "node_id", edge: "edge_id", subgraph: "subgraph_id" }[r.target_kind];
    must(await this.t("reviews").insert({ target_kind: r.target_kind, [col]: r.target_id, reviewer_id: s.userId, rating: r.rating, commentary_md: r.commentary_md, week: r.week ?? null }));
  }
  async reviewSummary(kind: ReviewTarget, id: string) {
    const { data } = await this.t("review_summary").select("*").eq("target_kind", kind).eq("target_id", id).maybeSingle();
    return (data as ReviewSummary) ?? null;
  }
  async reviewsFor(kind: ReviewTarget, id: string) {
    const col = { proposal: "proposal_id", node: "node_id", edge: "edge_id", subgraph: "subgraph_id" }[kind];
    return must(await this.t("reviews_visible").select("*").eq(col, id).order("created_at")) as Review[];
  }
  async decide(d: DecisionInput) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    must(await this.t("editorial_decisions").insert({ proposal_id: d.proposal_id ?? null, node_id: d.node_id ?? null, edge_id: d.edge_id ?? null, editor_id: s.userId, decision: d.decision, feedback: d.feedback ?? "" }));
  }
  async flags() { return must(await this.t("review_flags").select("*").is("resolved_at", null).order("raised_at")) as ReviewFlag[]; }
  async resolveFlag(id: string, note: string) { must(await this.sb.rpc("resolve_review_flag", { flag: id, note_text: note })); }
  async reviewQueue() {
    const proposals = await this.proposals({ status: ["pending", "under_review", "revision_requested"] });
    const rows = must(await this.t("review_summary").select("*").eq("target_kind", "proposal")) as ReviewSummary[];
    return { proposals, summaries: Object.fromEntries(rows.map((r) => [r.target_id, r])) };
  }
  async subgraphs() { return must(await this.t("student_subgraphs").select("*").order("updated_at", { ascending: false })) as Subgraph[]; }
  async subgraph(id: string) {
    const subgraph = must(await this.t("student_subgraphs").select("*").eq("id", id).single()) as Subgraph;
    const nodes = must(await this.t("subgraph_nodes").select("*").eq("subgraph_id", id)) as SubgraphNode[];
    const privateNodes = must(await this.t("subgraph_private_nodes").select("*").eq("subgraph_id", id)) as PrivateNode[];
    const links = must(await this.t("subgraph_links").select("*").eq("subgraph_id", id)) as SubgraphLink[];
    const reviews = must(await this.t("reviews_visible").select("*").eq("subgraph_id", id).order("created_at")) as Review[];
    return { subgraph, nodes, privateNodes, links, reviews };
  }
  async createSubgraph(title: string, module_id: string | null) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    return must(await this.t("student_subgraphs").insert({ owner_id: s.userId, title, module_id }).select("*").single()) as Subgraph;
  }
  async forkNode(subgraph_id: string, node_id: string, annotation: string, week: number | null) {
    must(await this.t("subgraph_nodes").upsert({ subgraph_id, node_id, custom_annotation: annotation, added_week: week }));
  }
  async addPrivateNode(subgraph_id: string, node_type: PrivateNodeType, label: string, source: string | null, week: number | null) {
    return must(await this.t("subgraph_private_nodes").insert({ subgraph_id, node_type, label, source, created_week: week }).select("*").single()) as PrivateNode;
  }
  async addLink(l: Omit<SubgraphLink, "id">) { must(await this.t("subgraph_links").insert(l)); }
  async savePositions(subgraph_id: string, positions: { node_id?: string; private_id?: string; x: number; y: number }[]) {
    for (const p of positions) {
      if (p.node_id) must(await this.t("subgraph_nodes").update({ pos_x: p.x, pos_y: p.y }).eq("subgraph_id", subgraph_id).eq("node_id", p.node_id));
      else if (p.private_id) must(await this.t("subgraph_private_nodes").update({ pos_x: p.x, pos_y: p.y }).eq("id", p.private_id));
    }
  }
  async setVisibility(subgraph_id: string, v: Visibility) { must(await this.t("student_subgraphs").update({ visibility: v }).eq("id", subgraph_id)); }
  async share(subgraph_id: string, username: string) {
    const p = must(await this.t("profiles").select("id").eq("username", username).single()) as { id: string };
    must(await this.t("subgraph_shares").upsert({ subgraph_id, profile_id: p.id, can_review: true }));
  }
  async leaderboard() { return must(await this.t("leaderboard").select("*").order("approved_proposals", { ascending: false })) as LeaderboardRow[]; }
  async consents() {
    const s = await this.getSession(); const out = { portfolio_processing: false, peer_review_visibility: false, leaderboard_display: false, canonical_attribution: false } as Record<ConsentPurpose, boolean>;
    if (!s) return out;
    const rows = must(await this.t("consent_records").select("purpose, granted, withdrawn_at").eq("profile_id", s.userId).order("granted_at")) as { purpose: ConsentPurpose; granted: boolean; withdrawn_at: string | null }[];
    for (const r of rows) out[r.purpose] = r.granted && !r.withdrawn_at;
    return out;
  }
  async setConsent(purpose: ConsentPurpose, granted: boolean) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    must(await this.t("consent_records").insert({ profile_id: s.userId, purpose, granted, policy_version: "2026-09-04-v1" }));
    if (!granted) must(await this.t("consent_records").update({ withdrawn_at: new Date().toISOString() }).eq("profile_id", s.userId).eq("purpose", purpose).eq("granted", true).is("withdrawn_at", null));
  }
  async erase(redactText: boolean) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    must(await this.sb.rpc("erase_profile", { target: s.userId, redact_text: redactText }));
    await this.signOut();
  }
  async exportMyData() {
    const s = await this.getSession(); if (!s) return null;
    const [profile, proposals, reviews, subgraphs, consents] = await Promise.all([
      this.me(), this.proposals({ mine: true }), this.t("reviews").select("*").eq("reviewer_id", s.userId), this.subgraphs(), this.t("consent_records").select("*").eq("profile_id", s.userId),
    ]);
    const detailed = await Promise.all(subgraphs.map((g) => this.subgraph(g.id)));
    return { exported_at: new Date().toISOString(), profile, proposals, reviews: reviews.data, subgraphs: detailed, consents: consents.data };
  }
}
