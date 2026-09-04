// In-memory Api for UI work and screenshot tests. Seeded from src/mock/graph.json
// (scripts/build-mock-data.mjs). Pick a persona with ?as=student|student2|
// researcher|editor|instructor|admin (default student). State lives for the page
// session only. No real people, no network.
import type { Api, CitationInput, DecisionInput, ProposalInput, ReviewInput } from "./api";
import type {
  Citation, ConsentPurpose, Department, EditorialDecision, GraphEdge, GraphNode, LeaderboardRow, Module, NodeDetail, PrivateNode, PrivateNodeType,
  Profile, Proposal, ProposalDetail, ProposalStatus, Review, ReviewFlag, ReviewSummary, ReviewTarget, Session, Subgraph, SubgraphLink, SubgraphNode, Visibility,
} from "./types";

type Raw = { departments: Department[]; nodes: GraphNode[]; edges: GraphEdge[] };
const PERSONAS: Record<string, Profile> = {
  student: { id: "u-student", username: "alice", full_name: null, role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true },
  student2: { id: "u-student2", username: "bob", full_name: null, role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true },
  researcher: { id: "u-researcher", username: "carla", full_name: null, role: "researcher", institution: "mpi-eva", department_id: "dept-ccp", is_active: true },
  editor: { id: "u-editor", username: "eve", full_name: null, role: "editor", institution: "mpi-eva", department_id: "dept-ccp", is_active: true },
  instructor: { id: "u-instructor", username: "daniel", full_name: null, role: "researcher", institution: "mpi-eva", department_id: "dept-ccp", is_active: true },
  admin: { id: "u-admin", username: "dustin", full_name: null, role: "admin", institution: "mpi-eva", department_id: "dept-ccp", is_active: true },
};
const MODULE: Module = { id: "mod-ccp", code: "ccp-wise-2026-27", name: "Comparative Cultural Psychology", cohort_year: 2026, term: "WiSe", instructor_id: "u-instructor" };
let seq = 1000;
const nid = (p: string) => `${p}-${++seq}`;
const now = () => new Date().toISOString();
const SCORE: Record<string, number> = { strongly_reject: -2, reject: -1, neutral: 0, accept: 1, strongly_accept: 2 };

export class MockApi implements Api {
  readonly mode = "mock" as const;
  private raw: Raw | null = null;
  private me_: Profile;
  private listeners: ((s: Session | null) => void)[] = [];
  private signedIn = true;
  private citations: Citation[] = [
    { id: "c-1", doi: "10.1017/s0140525x05000129", openalex_id: "W2106980598", title: "Understanding and sharing intentions: The origins of cultural cognition", authors: ["Tomasello, M.", "Carpenter, M.", "Call, J.", "Behne, T.", "Moll, H."], year: 2005, venue: "Behavioral and Brain Sciences", verification: { crossref: { verdict: "ok" }, pure: { item_id: "item_58292" } } },
    { id: "c-2", doi: "10.1038/21415", openalex_id: "W2028434776", title: "Cultures in chimpanzees", authors: ["Whiten, A.", "Goodall, J.", "McGrew, W. C.", "Boesch, C."], year: 1999, venue: "Nature", verification: { crossref: { verdict: "ok" } } },
  ];
  private propList: Proposal[] = [];
  private proposalCitations: Record<string, string[]> = {};
  private reviews: Review[] = [];
  private decisions: EditorialDecision[] = [];
  private flagList: ReviewFlag[] = [];
  private sgList: Subgraph[] = [];
  private sgNodes: SubgraphNode[] = [];
  private privNodes: PrivateNode[] = [];
  private links: SubgraphLink[] = [];
  private shares: { subgraph_id: string; profile_id: string }[] = [];
  private consent: Record<ConsentPurpose, boolean> = { portfolio_processing: true, peer_review_visibility: true, leaderboard_display: false, canonical_attribution: false };

  constructor() {
    const as = new URLSearchParams(window.location.search).get("as") || "student";
    this.me_ = PERSONAS[as] || PERSONAS.student;
  }
  private async data(): Promise<Raw> {
    if (!this.raw) {
      const mod = await import("../mock/graph.json");
      this.raw = (mod.default || mod) as unknown as Raw;
      this.seedDemo();
    }
    return this.raw;
  }
  private seedDemo() {
    const r = this.raw!;
    const tom = r.nodes.find((n) => n.slug === "ccp-theory-theory-of-mind") || r.nodes[0];
    const pid = "p-demo-1";
    this.propList.push({ id: pid, proposer_id: "u-student2", change_type: "edit_node", target_node_id: tom.id, target_edge_id: null,
      payload: { description: tom.description + " Revised gloss, checked against Tomasello et al. (2005)." }, rationale: "The seed gloss is a single-pass draft; this revision cites the foundational shared-intentionality paper and tightens the definition.",
      module_id: MODULE.id, status: "under_review", submitter_anonymous: false, submitted_at: now(), updated_at: now(), decided_at: null, result_node_id: null, result_edge_id: null });
    this.proposalCitations[pid] = ["c-1"];
    this.reviews.push({ id: "r-demo-1", target_kind: "proposal", proposal_id: pid, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-researcher", reviewer_username: "carla", reviewer_active: true, rating: "accept", commentary_md: "Clear and well sourced. Consider also citing **Rakoczy (2022)** for the developmental timeline.", week: null, created_at: now() });
    const pg = r.nodes.find((n) => n.slug === "dag-theory-population-genetics");
    if (pg) this.reviews.push({ id: "r-demo-2", target_kind: "node", proposal_id: null, node_id: pg.id, edge_id: null, subgraph_id: null, reviewer_id: "u-researcher", reviewer_username: "carla", reviewer_active: true, rating: "strongly_accept", commentary_md: "Accurate gloss; Hartl & Clark would be the defining citation.", week: null, created_at: now() });
  }
  private summarize(kind: ReviewTarget, id: string): ReviewSummary | null {
    const rs = this.reviews.filter((x) => x.target_kind === kind && (x.proposal_id === id || x.node_id === id || x.edge_id === id || x.subgraph_id === id));
    if (!rs.length) return null;
    const cnt = (k: string) => rs.filter((x) => x.rating === k).length;
    const credible = rs.filter((x) => x.reviewer_active).length;
    return { target_kind: kind, target_id: id, n_reviews: rs.length, strongly_accept: cnt("strongly_accept"), accept: cnt("accept"), neutral: cnt("neutral"), reject: cnt("reject"), strongly_reject: cnt("strongly_reject"),
      mean_score: Math.round((rs.reduce((a, x) => a + SCORE[x.rating], 0) / rs.length) * 100) / 100, credible_reviews: credible, all_reviewers_deleted: credible === 0, last_review_at: rs[rs.length - 1].created_at };
  }
  private mask(p: Proposal): Proposal {
    const canSee = p.proposer_id === this.me_.id || !p.submitter_anonymous || ["editor", "admin"].includes(this.me_.role) || this.me_.id === MODULE.instructor_id;
    return canSee ? p : { ...p, proposer_id: null };
  }
  private isEditor() { return ["editor", "admin"].includes(this.me_.role); }

  async getSession() { return this.signedIn ? { userId: this.me_.id, email: `${this.me_.username}@example.invalid` } : null; }
  async signInWithEmail(_email: string) { this.signedIn = true; this.listeners.forEach((l) => l({ userId: this.me_.id, email: null })); return { sent: true, message: "Mock mode: signed in immediately." }; }
  async signOut() { this.signedIn = false; this.listeners.forEach((l) => l(null)); }
  onAuthChange(cb: (s: Session | null) => void) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((l) => l !== cb); }; }
  async me() { return this.signedIn ? this.me_ : null; }
  async profiles(ids: string[]) { return Object.values(PERSONAS).filter((p) => ids.includes(p.id)); }
  async departments() { return (await this.data()).departments; }
  async modules() { return [MODULE]; }
  async myModules() { return this.me_.role === "msc_student" ? [{ module: MODULE, role: "student" }] : this.me_.id === MODULE.instructor_id ? [{ module: MODULE, role: "instructor" }] : []; }
  async graph() { const r = await this.data(); return { nodes: r.nodes.filter((n) => n.status !== "archived"), edges: r.edges.filter((e) => e.status !== "archived") }; }
  async node(id: string): Promise<NodeDetail> {
    const r = await this.data(); const node = r.nodes.find((n) => n.id === id); if (!node) throw new Error("node not found");
    return { node, citations: [], reviews: this.reviews.filter((x) => x.node_id === id), summary: this.summarize("node", id),
      proposals: this.propList.filter((p) => p.target_node_id === id && ["pending", "under_review", "revision_requested"].includes(p.status)).map((p) => this.mask(p)),
      edges: r.edges.filter((e) => (e.source_node_id === id || e.target_node_id === id) && e.status !== "archived"), flags: this.flagList.filter((f) => f.target_id === id && !f.resolved_at) };
  }
  async searchCitations(q: string) { const s = q.toLowerCase(); return this.citations.filter((c) => (c.doi || "").includes(s) || c.title.toLowerCase().includes(s)); }
  async addCitation(c: CitationInput) { const cit: Citation = { id: nid("c"), doi: c.doi ?? null, pure_handle: c.pure_handle ?? null, title: c.title, authors: c.authors, year: c.year ?? null, venue: c.venue ?? null, url: c.url ?? null, verification: {} }; this.citations.push(cit); return cit; }
  async proposals(filter?: { status?: ProposalStatus[]; mine?: boolean }) {
    return this.propList.filter((p) => (p.status !== "draft" || p.proposer_id === this.me_.id || this.isEditor()) && (!filter?.status || filter.status.includes(p.status)) && (!filter?.mine || p.proposer_id === this.me_.id)).map((p) => this.mask(p));
  }
  async proposal(id: string): Promise<ProposalDetail> {
    const r = await this.data(); const raw = this.propList.find((p) => p.id === id); if (!raw) throw new Error("proposal not found");
    const proposal = this.mask(raw);
    return { proposal, citations: (this.proposalCitations[id] || []).map((c) => this.citations.find((x) => x.id === c)!).filter(Boolean),
      reviews: this.reviews.filter((x) => x.proposal_id === id), summary: this.summarize("proposal", id), decisions: this.decisions.filter((d) => d.proposal_id === id),
      targetNode: raw.target_node_id ? r.nodes.find((n) => n.id === raw.target_node_id) || null : null,
      proposerUsername: proposal.proposer_id ? (Object.values(PERSONAS).find((p) => p.id === proposal.proposer_id)?.username ?? null) : null };
  }
  async createProposal(p: ProposalInput, submit: boolean) {
    if (submit && p.rationale.length < 20) throw new Error("A proposal needs a rationale of at least 20 characters before submission");
    if (submit && ["add_node", "edit_node", "add_edge", "edit_edge"].includes(p.change_type) && !p.citation_ids.length) throw new Error(`A ${p.change_type} proposal must reference at least one citation before submission`);
    const id = nid("p");
    this.propList.push({ id, proposer_id: this.me_.id, change_type: p.change_type, target_node_id: p.target_node_id ?? null, target_edge_id: p.target_edge_id ?? null, payload: p.payload, rationale: p.rationale, module_id: p.module_id ?? null, status: submit ? "pending" : "draft", submitter_anonymous: p.submitter_anonymous, submitted_at: submit ? now() : null, updated_at: now(), decided_at: null, result_node_id: null, result_edge_id: null });
    this.proposalCitations[id] = p.citation_ids; return id;
  }
  async submitProposal(id: string) { const p = this.propList.find((x) => x.id === id)!; if (p.rationale.length < 20) throw new Error("A proposal needs a rationale of at least 20 characters before submission"); p.status = "pending"; p.submitted_at = now(); }
  async withdrawProposal(id: string) { const p = this.propList.find((x) => x.id === id)!; p.status = "withdrawn"; }
  async setAnonymity(id: string, anonymous: boolean) { const p = this.propList.find((x) => x.id === id)!; if (p.proposer_id !== this.me_.id) throw new Error("Only the submitter can change the anonymity of a submission"); p.submitter_anonymous = anonymous; }
  async review(rv: ReviewInput) {
    const r = await this.data();
    if (rv.target_kind === "proposal") { const p = this.propList.find((x) => x.id === rv.target_id)!; if (p.proposer_id === this.me_.id) throw new Error("Conflict of interest: a proposer cannot review their own proposal"); if (p.status === "pending") p.status = "under_review"; }
    if (rv.target_kind === "node") { const n = r.nodes.find((x) => x.id === rv.target_id)!; if (n.created_by === this.me_.id) throw new Error("Conflict of interest: you authored this node"); }
    if (rv.target_kind === "subgraph") { const g = this.sgList.find((x) => x.id === rv.target_id)!; if (g.owner_id === this.me_.id) throw new Error("Conflict of interest: you own this portfolio"); }
    const col = { proposal: "proposal_id", node: "node_id", edge: "edge_id", subgraph: "subgraph_id" }[rv.target_kind] as "proposal_id" | "node_id" | "edge_id" | "subgraph_id";
    const base: Review = { id: nid("r"), target_kind: rv.target_kind, proposal_id: null, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: this.me_.id, reviewer_username: this.me_.username, reviewer_active: true, rating: rv.rating, commentary_md: rv.commentary_md, week: rv.week ?? null, created_at: now() };
    (base as unknown as Record<string, unknown>)[col] = rv.target_id;
    this.reviews.push(base);
  }
  async reviewSummary(kind: ReviewTarget, id: string) { return this.summarize(kind, id); }
  async reviewsFor(kind: ReviewTarget, id: string) { return this.reviews.filter((x) => x.target_kind === kind && [x.proposal_id, x.node_id, x.edge_id, x.subgraph_id].includes(id)); }
  async decide(d: DecisionInput) {
    if (!this.isEditor()) throw new Error("new row violates row-level security policy (editors only)");
    const r = await this.data();
    this.decisions.push({ id: nid("d"), proposal_id: d.proposal_id ?? null, node_id: d.node_id ?? null, edge_id: d.edge_id ?? null, editor_id: this.me_.id, decision: d.decision, feedback: d.feedback ?? "", decided_at: now() });
    if (d.node_id) { const n = r.nodes.find((x) => x.id === d.node_id)!; n.status = d.decision === "archive" ? "archived" : "canonical"; n.version++; n.canonical_since = n.canonical_since || now(); n.provenance = { ...n.provenance, status: n.status, approved_by: this.me_.id, approved_at: now(), assigned_by: "editorial-review" }; return; }
    if (d.edge_id) { const e = r.edges.find((x) => x.id === d.edge_id)!; e.status = d.decision === "archive" ? "archived" : "canonical"; e.version++; return; }
    const p = this.propList.find((x) => x.id === d.proposal_id)!;
    if (d.decision === "reject") { p.status = "rejected"; p.decided_at = now(); return; }
    if (d.decision === "request_revision") { p.status = "revision_requested"; return; }
    p.status = "approved"; p.decided_at = now();
    const pl = p.payload as Record<string, string>;
    if (p.change_type === "add_node") {
      const dept = r.departments.find((x) => x.code === pl.department_code);
      const n: GraphNode = { id: nid("n"), slug: (pl.slug || pl.label).toLowerCase().replace(/[^a-z0-9]+/g, "-"), label: pl.label, type_code: pl.type_code || "concept", description: pl.description || "", department_id: dept?.id ?? null, status: "canonical", external_ids: {}, provenance: { source: "kgdj", status: "canonical", proposal_id: p.id, proposer_id: p.proposer_id, approved_by: this.me_.id, approved_at: now(), assigned_by: "editorial-review" }, tags: [], version: 1, created_by: p.proposer_id, created_at: now(), updated_at: now(), canonical_since: now() };
      r.nodes.push(n); p.result_node_id = n.id;
    } else if (p.change_type === "edit_node") {
      const n = r.nodes.find((x) => x.id === p.target_node_id)!; Object.assign(n, { label: pl.label ?? n.label, description: pl.description ?? n.description, type_code: pl.type_code ?? n.type_code, status: "canonical", version: n.version + 1, canonical_since: n.canonical_since || now(), provenance: { ...n.provenance, status: "canonical", approved_by: this.me_.id, approved_at: now(), assigned_by: "editorial-review" } }); p.result_node_id = n.id;
    } else if (p.change_type === "archive_node") { const n = r.nodes.find((x) => x.id === p.target_node_id)!; n.status = "archived"; }
    else if (p.change_type === "add_edge") { const e: GraphEdge = { id: nid("e"), source_node_id: pl.source_node_id, target_node_id: pl.target_node_id, relationship_code: pl.relationship_code, label: pl.label || null, weight: Number(pl.weight || 3), status: "canonical", provenance: { source: "kgdj", status: "canonical", proposal_id: p.id }, version: 1, created_by: p.proposer_id, created_at: now(), updated_at: now(), canonical_since: now() }; r.edges.push(e); p.result_edge_id = e.id; }
    else if (p.change_type === "delete_edge") { const e = r.edges.find((x) => x.id === p.target_edge_id)!; e.status = "archived"; }
    else if (p.change_type === "edit_edge") { const e = r.edges.find((x) => x.id === p.target_edge_id)!; Object.assign(e, { relationship_code: pl.relationship_code ?? e.relationship_code, label: pl.label ?? e.label, weight: pl.weight ? Number(pl.weight) : e.weight, status: "canonical", version: e.version + 1 }); }
  }
  async flags() { return this.flagList.filter((f) => !f.resolved_at); }
  async resolveFlag(id: string, note: string) { const f = this.flagList.find((x) => x.id === id)!; f.resolved_at = now(); f.note = note; }
  async reviewQueue() {
    const proposals = await this.proposals({ status: ["pending", "under_review", "revision_requested"] });
    const summaries: Record<string, ReviewSummary> = {}; for (const p of proposals) { const s = this.summarize("proposal", p.id); if (s) summaries[p.id] = s; }
    return { proposals, summaries };
  }
  private canSeeSubgraph(g: Subgraph) { return g.owner_id === this.me_.id || this.me_.id === MODULE.instructor_id || this.shares.some((s) => s.subgraph_id === g.id && s.profile_id === this.me_.id) || g.visibility === "members" || (g.visibility === "module" && this.me_.role === "msc_student"); }
  async subgraphs() { return this.sgList.filter((g) => this.canSeeSubgraph(g)); }
  async subgraph(id: string) {
    const subgraph = this.sgList.find((g) => g.id === id); if (!subgraph || !this.canSeeSubgraph(subgraph)) throw new Error("portfolio not found or not visible");
    return { subgraph, nodes: this.sgNodes.filter((n) => n.subgraph_id === id), privateNodes: this.privNodes.filter((n) => n.subgraph_id === id), links: this.links.filter((l) => l.subgraph_id === id), reviews: this.reviews.filter((r) => r.subgraph_id === id) };
  }
  async createSubgraph(title: string, module_id: string | null) { const g: Subgraph = { id: nid("g"), owner_id: this.me_.id, module_id, title, description: "", visibility: "private", last_checkpoint_week: null, created_at: now() }; this.sgList.push(g); return g; }
  async forkNode(subgraph_id: string, node_id: string, annotation: string, week: number | null) { const ex = this.sgNodes.find((n) => n.subgraph_id === subgraph_id && n.node_id === node_id); if (ex) { ex.custom_annotation = annotation; return; } this.sgNodes.push({ subgraph_id, node_id, custom_annotation: annotation, pos_x: null, pos_y: null, added_week: week }); }
  async addPrivateNode(subgraph_id: string, node_type: PrivateNodeType, label: string, source: string | null, week: number | null) { const n: PrivateNode = { id: nid("pn"), subgraph_id, node_type, label, source, origin: null, created_week: week, pos_x: null, pos_y: null }; this.privNodes.push(n); return n; }
  async addLink(l: Omit<SubgraphLink, "id">) { if (l.why.length < 10) throw new Error("The 'because' needs at least 10 characters"); this.links.push({ id: nid("l"), ...l }); }
  async savePositions(subgraph_id: string, positions: { node_id?: string; private_id?: string; x: number; y: number }[]) {
    for (const p of positions) { const t = p.node_id ? this.sgNodes.find((n) => n.subgraph_id === subgraph_id && n.node_id === p.node_id) : this.privNodes.find((n) => n.id === p.private_id); if (t) { t.pos_x = p.x; t.pos_y = p.y; } }
  }
  async setVisibility(subgraph_id: string, v: Visibility) { this.sgList.find((g) => g.id === subgraph_id)!.visibility = v; }
  async share(subgraph_id: string, username: string) { const p = Object.values(PERSONAS).find((x) => x.username === username); if (!p) throw new Error("no such member"); this.shares.push({ subgraph_id, profile_id: p.id }); }
  async leaderboard(): Promise<LeaderboardRow[]> {
    if (!this.consent.leaderboard_display) return [];
    return [{ profile_id: this.me_.id, username: this.me_.username, role: this.me_.role, department: null, approved_proposals: this.propList.filter((p) => p.proposer_id === this.me_.id && p.status === "approved").length, open_proposals: this.propList.filter((p) => p.proposer_id === this.me_.id && ["pending", "under_review", "revision_requested"].includes(p.status)).length, reviews_written: this.reviews.filter((r) => r.reviewer_id === this.me_.id && r.target_kind !== "subgraph").length, portfolio_critiques: this.reviews.filter((r) => r.reviewer_id === this.me_.id && r.target_kind === "subgraph").length, canonical_nodes_authored: 0 }];
  }
  async consents() { return { ...this.consent }; }
  async setConsent(purpose: ConsentPurpose, granted: boolean) { this.consent[purpose] = granted; }
  async erase(_redactText: boolean) { this.signedIn = false; this.listeners.forEach((l) => l(null)); }
  async exportMyData() { return { exported_at: now(), profile: this.me_, proposals: this.propList.filter((p) => p.proposer_id === this.me_.id), reviews: this.reviews.filter((r) => r.reviewer_id === this.me_.id), subgraphs: this.sgList.filter((g) => g.owner_id === this.me_.id) }; }
}
