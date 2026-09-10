// supabase-js implementation of Api. Every call runs under the user's JWT;
// Row-Level Security in supabase/migrations/0002_rls.sql (+ 0005_ux.sql) is the
// authority — nothing here filters for permission, it only shapes queries.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Api, CitationInput, CommonsDecisionInput, CommonsProposalInput, CommonsReviewInput, CommonsSpaceInput, DecisionInput, ForkItem, ProfilePatch, ProposalInput, ReviewInput } from "./api";
import type { PortfolioBackup } from "./backup";
import type {
  Citation, CohortStats, CommonsItem, CommonsItemT, CommonsLink, CommonsParticipant, CommonsParticipantStatus, CommonsProposal, CommonsProposalDetail, CommonsReview, CommonsRole, CommonsSpace,
  CitationCoverage, CommonsSpaceDetail, ConsentPurpose, ContentFlag, ContentFlagTargetKind, Department, EdgeDetail, GraphEdge, GraphNode, ItemComment, ItemCommentTarget, LeaderboardRow, Module, ModuleMemberRole, NodeDetail, PrivateNode, PrivateNodeType,
  Profile, Proposal, ProposalDetail, ProposalStatus, ResearchGroup, Review, ReviewFlag, ReviewSummary, ReviewTarget, Session, Subgraph, SubgraphDetail, SubgraphLink, SubgraphNode, Visibility, RosterRow,
} from "./types";

// Supabase's auth errors are written for developers ("Invalid login credentials").
// The pilot cohort is ~300-500 students who cannot act on that. Translate the ones that
// actually happen into something a student can do something about; pass anything else
// through unchanged rather than swallowing a message we did not anticipate.
export function friendlyAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("rate limit") || m.includes("only request this after") || m.includes("too many"))
    return "Too many emails have gone to this address recently. Wait a little and try again, or ask an editor to invite you directly.";
  if (m.includes("invalid login credentials"))
    return "That email or password isn't right. If you haven't set a password yet, use \"Forgot password\" below to set one.";
  if (m.includes("already registered") || m.includes("user already exists"))
    return "An account already exists for that address. Sign in instead, or use \"Forgot password\" if you don't have a password set yet.";
  if (m.includes("password") && (m.includes("short") || m.includes("weak") || m.includes("least")))
    return "That password is too short — use at least 6 characters.";
  if (m.includes("not allowed") || m.includes("signup") || m.includes("disabled"))
    return "That address is not on the KGDJ allowlist. Sign-in is open to @eva.mpg.de and @uni-leipzig.de addresses, plus invited ones. Ask an editor for an invitation.";
  return msg;
}

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
  private async uid() { const s = await this.getSession(); if (!s) throw new Error("not signed in"); return s.userId; }

  async getSession(): Promise<Session | null> {
    const { data } = await this.sb.auth.getSession();
    return data.session ? { userId: data.session.user.id, email: data.session.user.email ?? null } : null;
  }
  // Email + password (2026-09-10). No round trip through email for the everyday case —
  // sign-in needs no message to arrive anywhere. Email is used for exactly one thing:
  // resetting a forgotten password, via Supabase's own default "Reset Password"
  // template (never customised here, unlike the code-based flow this replaced), so
  // there is nothing for this app to keep in sync with the frontend build.
  async signUp(email: string, password: string) {
    const { error } = await this.sb.auth.signUp({ email, password });
    if (error) return { ok: false, message: friendlyAuthError(error.message) };
    return { ok: true, message: "Account created — you're signed in." };
  }
  async signInWithPassword(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: friendlyAuthError(error.message) };
    return { ok: true, message: "" };
  }
  async requestPasswordReset(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    if (error) return { ok: false, message: friendlyAuthError(error.message) };
    return { ok: true, message: `If ${email} has an account, a reset link has been sent. It's valid for one hour.` };
  }
  async setNewPassword(password: string) {
    const { error } = await this.sb.auth.updateUser({ password });
    if (error) return { ok: false, message: friendlyAuthError(error.message) };
    return { ok: true, message: "Password set. You're signed in." };
  }
  onPasswordRecovery(cb: () => void) {
    const { data } = this.sb.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") cb(); });
    return () => data.subscription.unsubscribe();
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
  async updateProfile(patch: ProfilePatch) { const id = await this.uid(); return must(await this.t("profiles").update(patch).eq("id", id).select("*").single()) as Profile; }
  async departments() { return must(await this.t("departments").select("*").order("name")) as Department[]; }
  async researchGroups() { return must(await this.t("research_groups").select("*").order("name")) as ResearchGroup[]; }
  async modules() { return must(await this.t("modules").select("*").order("cohort_year", { ascending: false })) as Module[]; }
  async myModules() {
    const s = await this.getSession(); if (!s) return [];
    const rows = must(await this.t("module_members").select("member_role, modules(*)").eq("profile_id", s.userId)) as unknown as { member_role: ModuleMemberRole; modules: Module }[];
    return rows.map((r) => ({ module: r.modules, role: r.member_role }));
  }
  async joinModule(module_id: string, role: "student" | "affiliate") { const id = await this.uid(); must(await this.t("module_members").insert({ module_id, profile_id: id, member_role: role })); }
  async leaveModule(module_id: string) { const id = await this.uid(); must(await this.t("module_members").delete().eq("module_id", module_id).eq("profile_id", id)); }
  async graph() {
    // nodes, edges and department memberships don't depend on each other — fetching them
    // in parallel instead of sequentially is most of what makes the canonical graph "feel
    // slow to load" on first navigation to Explorer.
    const [nodesRes, edgesRes, deptsRes] = await Promise.all([
      this.t("nodes").select("*").neq("status", "archived"),
      this.t("edges").select("*").neq("status", "archived"),
      this.t("node_departments").select("node_id, department_id"),
    ]);
    const nodes = must(nodesRes) as GraphNode[];
    const deptRows = must(deptsRes) as { node_id: string; department_id: string }[];
    const byNode = new Map<string, string[]>();
    for (const r of deptRows) (byNode.get(r.node_id) ?? byNode.set(r.node_id, []).get(r.node_id)!).push(r.department_id);
    for (const n of nodes) n.department_ids = byNode.get(n.id) ?? (n.department_id ? [n.department_id] : []);
    return { nodes, edges: must(edgesRes) as GraphEdge[] };
  }
  async node(id: string): Promise<NodeDetail> {
    const node = must(await this.t("nodes").select("*").eq("id", id).single()) as GraphNode;
    const cit = must(await this.t("node_citations").select("citations(*)").eq("node_id", id)) as unknown as { citations: Citation }[];
    const reviews = must(await this.t("reviews_visible").select("*").eq("node_id", id).order("created_at")) as Review[];
    const summary = await this.reviewSummary("node", id);
    const proposals = must(await this.t("proposals_visible").select("*").eq("target_node_id", id).in("status", ["pending", "under_review", "revision_requested"])) as Proposal[];
    const edges = must(await this.t("edges").select("*").or(`source_node_id.eq.${id},target_node_id.eq.${id}`).neq("status", "archived")) as GraphEdge[];
    const flags = must(await this.t("review_flags").select("*").eq("target_id", id).is("resolved_at", null)) as ReviewFlag[];
    const contentFlags = must(await this.t("content_flags_visible").select("*").eq("target_id", id).order("created_at")) as ContentFlag[];
    return { node, citations: cit.map((c) => c.citations), reviews, summary, proposals, edges, flags, contentFlags };
  }
  async edge(id: string): Promise<EdgeDetail> {
    const edge = must(await this.t("edges").select("*").eq("id", id).single()) as GraphEdge;
    const ends = must(await this.t("nodes").select("*").in("id", [edge.source_node_id, edge.target_node_id])) as GraphNode[];
    const cit = must(await this.t("edge_citations").select("citations(*)").eq("edge_id", id)) as unknown as { citations: Citation }[];
    const reviews = must(await this.t("reviews_visible").select("*").eq("edge_id", id).order("created_at")) as Review[];
    const contentFlags = must(await this.t("content_flags_visible").select("*").eq("target_id", id).order("created_at")) as ContentFlag[];
    return { edge, source: ends.find((n) => n.id === edge.source_node_id) || null, target: ends.find((n) => n.id === edge.target_node_id) || null, reviews, summary: await this.reviewSummary("edge", id), citations: cit.map((c) => c.citations), contentFlags };
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
      source_commons_item_id: p.source_commons_item_id ?? null,
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
  async markHelpful(review_id: string, helpful: boolean) {
    const id = await this.uid();
    if (helpful) must(await this.t("review_helpful").upsert({ review_id, voter_id: id }));
    else must(await this.t("review_helpful").delete().eq("review_id", review_id).eq("voter_id", id));
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
  async contentFlagQueue() { return must(await this.t("content_flags_visible").select("*").is("resolved_at", null).order("created_at")) as ContentFlag[]; }
  async addContentFlag(target_kind: ContentFlagTargetKind, target_id: string, reason: string) {
    const id = await this.uid();
    must(await this.t("content_flags").insert({ target_kind, target_id, flagged_by: id, reason }));
  }
  async resolveContentFlag(id: string, note: string) { must(await this.sb.rpc("resolve_content_flag", { flag: id, note_text: note })); }
  async withdrawContentFlag(id: string) { must(await this.t("content_flags").delete().eq("id", id)); }  // RLS: own-open-flag-or-editor
  async citationCoverage() { return must(await this.t("citation_coverage").select("*")) as CitationCoverage[]; }
  async reviewQueue() {
    const proposals = await this.proposals({ status: ["pending", "under_review", "revision_requested"] });
    const rows = must(await this.t("review_summary").select("*").eq("target_kind", "proposal")) as ReviewSummary[];
    return { proposals, summaries: Object.fromEntries(rows.map((r) => [r.target_id, r])) };
  }
  async subgraphs() { return must(await this.t("student_subgraphs").select("*").order("updated_at", { ascending: false })) as Subgraph[]; }
  async subgraph(id: string): Promise<SubgraphDetail> {
    // can_see_subgraph is a security-definer helper (0002_rls.sql) already callable via RPC
    // like the app's other SQL functions; the frontend uses it to tell "full access" apart
    // from "reached this portfolio through one shared item" (0006_portfolio_ux.sql) so it
    // knows whether to show the critique thread (reviews_visible stays empty either way —
    // RLS alone already withholds it on a partial view, this is only for the UI's own copy).
    const [subgraph, nodes, privateNodes, links, reviews, fullAccess] = await Promise.all([
      this.t("student_subgraphs").select("*").eq("id", id).single().then(must) as Promise<Subgraph>,
      this.t("subgraph_nodes").select("*").eq("subgraph_id", id).then(must) as Promise<SubgraphNode[]>,
      this.t("subgraph_private_nodes").select("*").eq("subgraph_id", id).then(must) as Promise<PrivateNode[]>,
      this.t("subgraph_links").select("*").eq("subgraph_id", id).then(must) as Promise<SubgraphLink[]>,
      this.t("reviews_visible").select("*").eq("subgraph_id", id).order("created_at").then(must) as Promise<Review[]>,
      this.sb.rpc("can_see_subgraph", { s: id }).then(must) as Promise<boolean>,
    ]);
    return { subgraph, nodes, privateNodes, links, reviews, full_access: fullAccess };
  }
  async createSubgraph(title: string, module_id: string | null) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    return must(await this.t("student_subgraphs").insert({ owner_id: s.userId, title, module_id }).select("*").single()) as Subgraph;
  }
  async updateSubgraph(id: string, patch: { title?: string; description?: string; last_checkpoint_week?: number | null }) { must(await this.t("student_subgraphs").update(patch).eq("id", id)); }
  async deleteSubgraph(id: string) { must(await this.t("student_subgraphs").delete().eq("id", id)); }
  async forkNode(subgraph_id: string, node_id: string, annotation: string) {
    must(await this.t("subgraph_nodes").upsert({ subgraph_id, node_id, custom_annotation: annotation }));
  }
  async forkNodes(subgraph_id: string, items: ForkItem[]) {
    if (!items.length) return;
    must(await this.t("subgraph_nodes").upsert(items.map((i) => ({ subgraph_id, node_id: i.node_id, custom_annotation: i.annotation })), { onConflict: "subgraph_id,node_id", ignoreDuplicates: true }));
  }
  async updateAnnotation(subgraph_id: string, node_id: string, annotation: string) { must(await this.t("subgraph_nodes").update({ custom_annotation: annotation }).eq("subgraph_id", subgraph_id).eq("node_id", node_id)); }
  async removeNode(subgraph_id: string, node_id: string) { must(await this.t("subgraph_nodes").delete().eq("subgraph_id", subgraph_id).eq("node_id", node_id)); }
  async setNodeShared(subgraph_id: string, node_id: string, shared: boolean) { must(await this.t("subgraph_nodes").update({ shared, shared_at: shared ? new Date().toISOString() : null }).eq("subgraph_id", subgraph_id).eq("node_id", node_id)); }
  async addPrivateNode(subgraph_id: string, node_type: PrivateNodeType, label: string, source: string | null) {
    return must(await this.t("subgraph_private_nodes").insert({ subgraph_id, node_type, label, source }).select("*").single()) as PrivateNode;
  }
  async updatePrivateNode(id: string, patch: { label?: string; source?: string | null; node_type?: PrivateNodeType }) { must(await this.t("subgraph_private_nodes").update(patch).eq("id", id)); }
  async removePrivateNode(id: string) { must(await this.t("subgraph_private_nodes").delete().eq("id", id)); }
  async setPrivateNodeShared(id: string, shared: boolean) { must(await this.t("subgraph_private_nodes").update({ shared, shared_at: shared ? new Date().toISOString() : null }).eq("id", id)); }
  async addLink(l: Omit<SubgraphLink, "id" | "created_at" | "updated_at" | "shared" | "shared_at">) { must(await this.t("subgraph_links").insert(l)); }
  async addLinks(ls: Omit<SubgraphLink, "id" | "created_at" | "updated_at" | "shared" | "shared_at">[]) { if (ls.length) must(await this.t("subgraph_links").insert(ls)); }
  async updateLink(id: string, patch: { why?: string; lens?: string | null }) { must(await this.t("subgraph_links").update(patch).eq("id", id)); }
  async removeLink(id: string) { must(await this.t("subgraph_links").delete().eq("id", id)); }
  async setLinkShared(id: string, shared: boolean) { must(await this.t("subgraph_links").update({ shared, shared_at: shared ? new Date().toISOString() : null }).eq("id", id)); }
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
  async sharesFor(subgraph_id: string) {
    const rows = must(await this.t("subgraph_shares").select("shared_at, profiles(username)").eq("subgraph_id", subgraph_id).order("shared_at")) as unknown as { shared_at: string; profiles: { username: string } }[];
    return rows.map((r) => ({ username: r.profiles.username, shared_at: r.shared_at }));
  }
  async unshare(subgraph_id: string, username: string) {
    const p = must(await this.t("profiles").select("id").eq("username", username).single()) as { id: string };
    must(await this.t("subgraph_shares").delete().eq("subgraph_id", subgraph_id).eq("profile_id", p.id));
  }
  async importPortfolio(b: PortfolioBackup, title: string, module_id: string | null) {
    const g = await this.createSubgraph(title, module_id);
    const slugs = b.nodes.map((n) => n.slug).filter(Boolean) as string[];
    const found = slugs.length ? (must(await this.t("nodes").select("id, slug").in("slug", slugs)) as { id: string; slug: string }[]) : [];
    const bySlug = Object.fromEntries(found.map((n) => [n.slug, n.id])); const map: Record<string, string> = {};
    const notNull = <T,>(x: T | null): x is T => x != null;
    const rows = b.nodes.map((n) => { const id = (n.slug && bySlug[n.slug]) || null; if (!id) return null; map[n.node_id] = id; return { subgraph_id: g.id, node_id: id, custom_annotation: n.custom_annotation || "", pos_x: n.pos_x, pos_y: n.pos_y }; }).filter(notNull);
    if (rows.length) must(await this.t("subgraph_nodes").upsert(rows, { onConflict: "subgraph_id,node_id", ignoreDuplicates: true }));
    for (const p of b.private_nodes) { const np = must(await this.t("subgraph_private_nodes").insert({ subgraph_id: g.id, node_type: p.node_type, label: p.label, source: p.source, origin: p.origin, pos_x: p.pos_x, pos_y: p.pos_y }).select("id").single()) as { id: string }; map[p.id] = np.id; }
    const links = b.links.map((l) => { const f = l.from_node_id ? map[l.from_node_id] : map[l.from_private_id!], t = l.to_node_id ? map[l.to_node_id] : map[l.to_private_id!]; if (!f || !t) return null; return { subgraph_id: g.id, from_node_id: l.from_node_id ? f : null, from_private_id: l.from_private_id ? f : null, to_node_id: l.to_node_id ? t : null, to_private_id: l.to_private_id ? t : null, why: l.why, lens: l.lens }; }).filter(notNull);
    if (links.length) must(await this.t("subgraph_links").insert(links));
    return g;
  }
  async cohortStats(scope: "module" | "program" | "members", module_id?: string | null) { return must(await this.sb.rpc("portfolio_cohort_stats", { scope, module: module_id ?? null })) as CohortStats; }
  async instructorRoster(module_id: string): Promise<RosterRow[]> {
    return (must(await this.t("module_roster").select("*").eq("module_id", module_id).order("username")) as RosterRow[]);
  }
  async commonsItems(module_id?: string | null): Promise<CommonsItem[]> {
    // RLS on subgraph_nodes/private_nodes/links already restricts .eq("shared", true) rows to
    // "mine, or in a module I'm in" (0006_portfolio_ux.sql) — sequential lookups, not nested
    // embeds, to sidestep ambiguous-FK issues with PostgREST's embed syntax (same convention
    // as proposal()/node() above).
    const [nodeRows, privRows, linkRows] = await Promise.all([
      this.t("subgraph_nodes").select("subgraph_id, node_id, custom_annotation, shared_at").eq("shared", true).then(must) as Promise<{ subgraph_id: string; node_id: string; custom_annotation: string; shared_at: string }[]>,
      this.t("subgraph_private_nodes").select("id, subgraph_id, label, node_type, shared_at").eq("shared", true).then(must) as Promise<{ id: string; subgraph_id: string; label: string; node_type: string; shared_at: string }[]>,
      this.t("subgraph_links").select("id, subgraph_id, from_node_id, from_private_id, to_node_id, to_private_id, why, shared_at").eq("shared", true).then(must) as Promise<{ id: string; subgraph_id: string; from_node_id: string | null; from_private_id: string | null; to_node_id: string | null; to_private_id: string | null; why: string; shared_at: string }[]>,
    ]);
    const sgIds = [...new Set([...nodeRows, ...privRows, ...linkRows].map((r) => r.subgraph_id))];
    if (!sgIds.length) return [];
    const subgraphs = must(await this.t("student_subgraphs").select("id, title, owner_id, module_id").in("id", sgIds)) as { id: string; title: string; owner_id: string; module_id: string | null }[];
    const sgById = Object.fromEntries(subgraphs.map((g) => [g.id, g]));
    const scoped = module_id ? subgraphs.filter((g) => g.module_id === module_id) : subgraphs;
    const scopedIds = new Set(scoped.map((g) => g.id));
    const ownerIds = [...new Set(scoped.map((g) => g.owner_id))];
    const modIds = [...new Set(scoped.map((g) => g.module_id).filter((x): x is string => !!x))];
    const [owners, modules] = await Promise.all([
      ownerIds.length ? (this.t("profiles").select("id, username").in("id", ownerIds).then(must) as Promise<{ id: string; username: string }[]>) : Promise.resolve([]),
      modIds.length ? (this.t("modules").select("id, name").in("id", modIds).then(must) as Promise<{ id: string; name: string }[]>) : Promise.resolve([]),
    ]);
    const ownerName = Object.fromEntries(owners.map((o) => [o.id, o.username])); const moduleName = Object.fromEntries(modules.map((m) => [m.id, m.name]));
    const nodeIds = [...new Set([...nodeRows.map((r) => r.node_id), ...linkRows.flatMap((r) => [r.from_node_id, r.to_node_id]).filter((x): x is string => !!x)])];
    const nodes = nodeIds.length ? (must(await this.t("nodes").select("id, label").in("id", nodeIds)) as { id: string; label: string }[]) : [];
    const nodeLabel = Object.fromEntries(nodes.map((n) => [n.id, n.label]));
    const privLabel = Object.fromEntries(privRows.map((p) => [p.id, p.label]));
    const endpoint = (nid: string | null, pid: string | null) => (nid ? nodeLabel[nid] ?? nid : pid ? privLabel[pid] ?? "a private idea" : "?");
    const out: CommonsItem[] = [];
    for (const r of nodeRows) if (scopedIds.has(r.subgraph_id)) { const g = sgById[r.subgraph_id]; out.push({ kind: "node", subgraph_id: g.id, subgraph_title: g.title, owner_username: ownerName[g.owner_id] ?? "member", module_name: g.module_id ? moduleName[g.module_id] ?? null : null, shared_at: r.shared_at, label: nodeLabel[r.node_id] ?? r.node_id, sub_label: r.custom_annotation || undefined, node_id: r.node_id }); }
    for (const r of privRows) if (scopedIds.has(r.subgraph_id)) { const g = sgById[r.subgraph_id]; out.push({ kind: "private_node", subgraph_id: g.id, subgraph_title: g.title, owner_username: ownerName[g.owner_id] ?? "member", module_name: g.module_id ? moduleName[g.module_id] ?? null : null, shared_at: r.shared_at, label: r.label, sub_label: r.node_type, private_id: r.id }); }
    for (const r of linkRows) if (scopedIds.has(r.subgraph_id)) { const g = sgById[r.subgraph_id]; out.push({ kind: "link", subgraph_id: g.id, subgraph_title: g.title, owner_username: ownerName[g.owner_id] ?? "member", module_name: g.module_id ? moduleName[g.module_id] ?? null : null, shared_at: r.shared_at, label: r.why, sub_label: `${endpoint(r.from_node_id, r.from_private_id)} → ${endpoint(r.to_node_id, r.to_private_id)}`, link_id: r.id }); }
    return out.sort((a, b) => b.shared_at.localeCompare(a.shared_at));
  }
  // ---------------------------------------------------------------- per-item comments (0008)
  private itemFilter(t: ItemCommentTarget) {
    let q = this.t("item_comments").select("*").eq("subgraph_id", t.subgraph_id).eq("item_kind", t.item_kind);
    if (t.node_id) q = q.eq("node_id", t.node_id); if (t.private_id) q = q.eq("private_id", t.private_id); if (t.link_id) q = q.eq("link_id", t.link_id);
    return q;
  }
  async itemComments(target: ItemCommentTarget): Promise<ItemComment[]> {
    const rows = must(await this.itemFilter(target).order("created_at")) as ItemComment[];
    const names = await this.usernames(rows.map((r) => r.author_id));
    return rows.map((r) => ({ ...r, author_username: names[r.author_id] ?? null }));
  }
  async addItemComment(target: ItemCommentTarget, body_md: string) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    must(await this.t("item_comments").insert({ subgraph_id: target.subgraph_id, item_kind: target.item_kind, node_id: target.node_id ?? null, private_id: target.private_id ?? null, link_id: target.link_id ?? null, author_id: s.userId, body_md }));
  }
  async removeItemComment(id: string) { must(await this.t("item_comments").delete().eq("id", id)); }
  // ---------------------------------------------------------------- commons spaces (0007)
  private async usernames(ids: (string | null | undefined)[]) {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return {} as Record<string, string>;
    const rows = must(await this.t("profiles").select("id, username").in("id", uniq)) as { id: string; username: string }[];
    return Object.fromEntries(rows.map((r) => [r.id, r.username]));
  }
  private async moduleNames(ids: (string | null | undefined)[]) {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return {} as Record<string, string>;
    const rows = must(await this.t("modules").select("id, name").in("id", uniq)) as { id: string; name: string }[];
    return Object.fromEntries(rows.map((r) => [r.id, r.name]));
  }
  async commonsSpaces(): Promise<CommonsSpace[]> {
    const spaces = must(await this.t("commons_spaces").select("*").order("updated_at", { ascending: false })) as CommonsSpace[];
    const names = await this.moduleNames(spaces.map((s) => s.module_id));
    return spaces.map((s) => ({ ...s, module_name: s.module_id ? names[s.module_id] ?? null : null }));
  }
  async commonsSpace(id: string): Promise<CommonsSpaceDetail> {
    const s = await this.getSession();
    const [space, participantsRaw, items, links] = await Promise.all([
      this.t("commons_spaces").select("*").eq("id", id).single().then(must) as Promise<CommonsSpace>,
      this.t("commons_participants").select("*").eq("commons_space_id", id).then(must) as Promise<CommonsParticipant[]>,
      this.t("commons_items").select("*").eq("commons_space_id", id).order("created_at").then(must) as Promise<CommonsItemT[]>,
      this.t("commons_links").select("*").eq("commons_space_id", id).then(must) as Promise<CommonsLink[]>,
    ]);
    const names = await this.usernames([...participantsRaw.map((p) => p.profile_id), ...items.map((i) => i.created_by)]);
    const moduleName = space.module_id ? (await this.moduleNames([space.module_id]))[space.module_id] ?? null : null;
    const participants = participantsRaw.map((p) => ({ ...p, username: names[p.profile_id] ?? p.profile_id }));
    const myParticipant = participants.find((p) => p.profile_id === s?.userId) ?? null;
    return { space: { ...space, module_name: moduleName }, myParticipant, participants, items: items.map((i) => ({ ...i, created_by_username: names[i.created_by] ?? null })), links };
  }
  async createCommonsSpace(input: CommonsSpaceInput) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    return must(await this.t("commons_spaces").insert({ label: input.label, description: input.description ?? "", module_id: input.module_id ?? null, join_policy: input.join_policy, created_by: s.userId }).select("*").single()) as CommonsSpace;
  }
  async joinCommonsSpace(space_id: string, role: "viewer" | "contributor" = "contributor") {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    const space = must(await this.t("commons_spaces").select("join_policy").eq("id", space_id).single()) as { join_policy: CommonsSpace["join_policy"] };
    const status = space.join_policy === "open_to_module_members" ? "active" : space.join_policy === "request_approval" ? "requested" : null;
    if (!status) throw new Error("This space is invite only — ask a steward to invite you.");
    must(await this.t("commons_participants").insert({ commons_space_id: space_id, profile_id: s.userId, role, status, joined_at: status === "active" ? new Date().toISOString() : null }));
  }
  async leaveCommonsSpace(space_id: string) { const s = await this.getSession(); if (!s) throw new Error("not signed in"); must(await this.t("commons_participants").delete().eq("commons_space_id", space_id).eq("profile_id", s.userId)); }
  async setCommonsParticipant(space_id: string, profile_id: string, patch: { role?: CommonsRole; status?: CommonsParticipantStatus }) {
    const body: Record<string, unknown> = { ...patch }; if (patch.status === "active") body.joined_at = new Date().toISOString();
    must(await this.t("commons_participants").update(body).eq("commons_space_id", space_id).eq("profile_id", profile_id));
  }
  async removeCommonsParticipant(space_id: string, profile_id: string) { must(await this.t("commons_participants").delete().eq("commons_space_id", space_id).eq("profile_id", profile_id)); }
  async commonsProposals(space_id: string) { return must(await this.t("commons_proposals").select("*").eq("commons_space_id", space_id).order("updated_at", { ascending: false })) as CommonsProposal[]; }
  async commonsProposal(id: string): Promise<CommonsProposalDetail> {
    const proposal = must(await this.t("commons_proposals").select("*").eq("id", id).single()) as CommonsProposal;
    const [cit, reviewsRaw, decisions, targetItem, targetLink] = await Promise.all([
      this.t("commons_proposal_citations").select("citations(*)").eq("proposal_id", id).then(must) as Promise<{ citations: Citation }[]>,
      this.t("commons_reviews").select("*").eq("proposal_id", id).order("created_at").then(must) as Promise<CommonsReview[]>,
      this.t("commons_decisions").select("*").eq("proposal_id", id).order("decided_at").then(must) as Promise<CommonsProposalDetail["decisions"]>,
      proposal.target_item_id ? (this.t("commons_items").select("*").eq("id", proposal.target_item_id).maybeSingle().then((r) => r.data) as Promise<CommonsItemT | null>) : Promise.resolve(null),
      proposal.target_link_id ? (this.t("commons_links").select("*").eq("id", proposal.target_link_id).maybeSingle().then((r) => r.data) as Promise<CommonsLink | null>) : Promise.resolve(null),
    ]);
    const names = await this.usernames([proposal.proposed_by, ...reviewsRaw.map((r) => r.reviewer_id)]);
    return { proposal, citations: cit.map((c) => c.citations), reviews: reviewsRaw.map((r) => ({ ...r, reviewer_username: names[r.reviewer_id] ?? null })), decisions, targetItem, targetLink, proposedByUsername: proposal.proposed_by ? names[proposal.proposed_by] ?? null : null };
  }
  async createCommonsProposal(p: CommonsProposalInput, submit: boolean) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    const row = must(await this.t("commons_proposals").insert({
      commons_space_id: p.commons_space_id, proposed_by: s.userId, change_type: p.change_type, target_item_id: p.target_item_id ?? null, target_link_id: p.target_link_id ?? null,
      payload: p.payload, rationale: p.rationale, review_restricted_to_role: p.review_restricted_to_role ?? null, status: "draft",
    }).select("id").single()) as { id: string };
    if (p.citation_ids?.length) must(await this.t("commons_proposal_citations").insert(p.citation_ids.map((c) => ({ proposal_id: row.id, citation_id: c }))));
    if (submit) must(await this.t("commons_proposals").update({ status: "pending" }).eq("id", row.id));
    return row.id;
  }
  async commonsReview(r: CommonsReviewInput) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    must(await this.t("commons_reviews").insert({ proposal_id: r.proposal_id, reviewer_id: s.userId, rating: r.rating, commentary_md: r.commentary_md }));
  }
  async commonsReviewsFor(proposal_id: string) {
    const rows = must(await this.t("commons_reviews").select("*").eq("proposal_id", proposal_id).order("created_at")) as CommonsReview[];
    const names = await this.usernames(rows.map((r) => r.reviewer_id));
    return rows.map((r) => ({ ...r, reviewer_username: names[r.reviewer_id] ?? null }));
  }
  async commonsDecide(d: CommonsDecisionInput) {
    const s = await this.getSession(); if (!s) throw new Error("not signed in");
    must(await this.t("commons_decisions").insert({ proposal_id: d.proposal_id, decided_by: s.userId, outcome: d.outcome, rationale: d.rationale ?? "" }));
  }
  async leaderboard() { return must(await this.t("leaderboard").select("*")) as LeaderboardRow[]; }
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
