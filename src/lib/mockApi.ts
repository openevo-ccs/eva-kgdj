// In-memory Api for UI work and screenshot tests. Seeded from src/mock/graph.json
// (scripts/build-mock-data.mjs). Pick a persona with ?as=student|student2|
// researcher|editor|instructor|admin (default student). State lives for the page
// session only. No real people, no network.
import type { Api, CitationInput, DecisionInput, ForkItem, ProfilePatch, ProposalInput, ReviewInput } from "./api";
import type { PortfolioBackup } from "./backup";
import { portfolioMetrics } from "./report";
import type {
  Citation, CohortStats, ConsentPurpose, Department, EdgeDetail, EditorialDecision, GraphEdge, GraphNode, LeaderboardRow, MetricKey, Module, ModuleMemberRole, NodeDetail, PrivateNode, PrivateNodeType,
  Profile, Proposal, ProposalDetail, ProposalStatus, ResearchGroup, Review, ReviewFlag, ReviewSummary, ReviewTarget, Session, Subgraph, SubgraphDetail, SubgraphLink, SubgraphNode, Visibility,
} from "./types";

type Raw = { departments: Department[]; nodes: GraphNode[]; edges: GraphEdge[] };
const PERSONAS: Record<string, Profile> = {
  student: { id: "u-student", username: "alice", full_name: null, role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true, research_group_id: null, affiliation_note: null },
  student2: { id: "u-student2", username: "bob", full_name: null, role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true, research_group_id: null, affiliation_note: null },
  researcher: { id: "u-researcher", username: "carla", full_name: null, role: "researcher", institution: "mpi-eva", department_id: "dept-ccp", is_active: true, research_group_id: null, affiliation_note: null },
  editor: { id: "u-editor", username: "eve", full_name: null, role: "editor", institution: "mpi-eva", department_id: "dept-ccp", is_active: true, research_group_id: null, affiliation_note: null },
  instructor: { id: "u-instructor", username: "daniel", full_name: null, role: "researcher", institution: "mpi-eva", department_id: "dept-ccp", is_active: true, research_group_id: null, affiliation_note: null },
  admin: { id: "u-admin", username: "dustin", full_name: null, role: "admin", institution: "mpi-eva", department_id: "dept-ccp", is_active: true, research_group_id: null, affiliation_note: null },
};
// Two extra classmates that exist only as data (no login persona): they make the
// cohort statistics and the leaderboard non-trivial in mock mode.
const PEERS: Profile[] = [
  { id: "u-peer1", username: "chen", full_name: null, role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true, research_group_id: null, affiliation_note: null },
  { id: "u-peer2", username: "dana", full_name: null, role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true, research_group_id: null, affiliation_note: null },
];
const EVERYONE = [...Object.values(PERSONAS), ...PEERS];
const MODULE: Module = { id: "mod-ccp", code: "ccp-wise-2026-27", name: "Comparative Cultural Psychology", cohort_year: 2026, term: "WiSe", instructor_id: "u-instructor" };
const GROUPS: ResearchGroup[] = [
  { id: "rg-ccp", pure_ou_id: "ou_3040267", name: "Department of Comparative Cultural Psychology", kind: "department", department_code: "ccp", status: "OPENED", parent_name: null },
  { id: "rg-hbec", pure_ou_id: "ou_2173689", name: "Department of Human Behavior Ecology and Culture", kind: "department", department_code: "hbec", status: "OPENED", parent_name: null },
  { id: "rg-tice", pure_ou_id: "ou_3525169", name: "Theory in Cultural Evolution Lab", kind: "other", department_code: "hbec", status: "OPENED", parent_name: "Department of Human Behavior Ecology and Culture" },
  { id: "rg-cccd", pure_ou_id: "ou_3281019", name: "Culture Cooperation and Child Development Research Group", kind: "other", department_code: "hbec", status: "OPENED", parent_name: "Department of Human Behavior Ecology and Culture" },
  { id: "rg-dag", pure_ou_id: "ou_3222712", name: "Department of Archaeogenetics", kind: "department", department_code: "dag", status: "OPENED", parent_name: null },
  { id: "rg-dlce", pure_ou_id: "ou_3237541", name: "Department of Linguistic and Cultural Evolution", kind: "department", department_code: "dlce", status: "OPENED", parent_name: null },
  { id: "rg-evogen", pure_ou_id: "ou_1497672", name: "Department of Evolutionary Genetics", kind: "department", department_code: "evogen", status: "OPENED", parent_name: null },
  { id: "rg-humor", pure_ou_id: "ou_3482006", name: "Department of Human Origins", kind: "department", department_code: "humor", status: "OPENED", parent_name: null },
  { id: "rg-primevo", pure_ou_id: "ou_3367832", name: "Department of Primate Behavior and Evolution", kind: "department", department_code: "primevo", status: "OPENED", parent_name: null },
  { id: "rg-tp", pure_ou_id: "ou_3222265", name: "Lise Meitner Group Technological Primates", kind: "group", department_code: null, status: "OPENED", parent_name: null },
];
let seq = 1000;
const nid = (p: string) => `${p}-${++seq}`;
const now = () => new Date().toISOString();
const SCORE: Record<string, number> = { strongly_reject: -2, reject: -1, neutral: 0, accept: 1, strongly_accept: 2 };
const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (xs: number[], q: number) => { const s = xs.slice().sort((a, b) => a - b); const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); };

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
  private helpful: { review_id: string; voter_id: string }[] = [];
  private decisions: EditorialDecision[] = [];
  private flagList: ReviewFlag[] = [];
  private sgList: Subgraph[] = [];
  private sgNodes: SubgraphNode[] = [];
  private privNodes: PrivateNode[] = [];
  private links: SubgraphLink[] = [];
  private shares: { subgraph_id: string; profile_id: string }[] = [];
  private members: { module_id: string; profile_id: string; role: ModuleMemberRole }[] = [
    { module_id: MODULE.id, profile_id: "u-student", role: "student" }, { module_id: MODULE.id, profile_id: "u-student2", role: "student" },
    { module_id: MODULE.id, profile_id: "u-peer1", role: "student" }, { module_id: MODULE.id, profile_id: "u-peer2", role: "student" },
    { module_id: MODULE.id, profile_id: "u-instructor", role: "instructor" },
  ];
  private consent: Record<ConsentPurpose, boolean> = { portfolio_processing: true, peer_review_visibility: true, leaderboard_display: false, canonical_attribution: false };
  private peerConsent = new Set(["u-student2", "u-researcher", "u-peer1", "u-peer2"]);

  constructor() {
    const as = new URLSearchParams(window.location.search).get("as") || "student";
    this.me_ = { ...(PERSONAS[as] || PERSONAS.student) };
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
    const bySlug = (s: string) => r.nodes.find((n) => n.slug === s) || r.nodes[0];
    const tom = bySlug("ccp-theory-theory-of-mind");
    const pid = "p-demo-1";
    this.propList.push({ id: pid, proposer_id: "u-student2", change_type: "edit_node", target_node_id: tom.id, target_edge_id: null,
      payload: { description: tom.description + " Revised gloss, checked against Tomasello et al. (2005)." }, rationale: "The seed gloss is a single-pass draft; this revision cites the foundational shared-intentionality paper and tightens the definition.",
      module_id: MODULE.id, status: "under_review", submitter_anonymous: false, submitted_at: now(), updated_at: now(), decided_at: null, result_node_id: null, result_edge_id: null });
    this.proposalCitations[pid] = ["c-1"];
    this.reviews.push({ id: "r-demo-1", target_kind: "proposal", proposal_id: pid, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-researcher", reviewer_username: "carla", reviewer_active: true, rating: "accept", commentary_md: "Clear and well sourced. Consider also citing **Rakoczy (2022)** for the developmental timeline.", week: null, created_at: now() });
    this.helpful.push({ review_id: "r-demo-1", voter_id: "u-student2" }, { review_id: "r-demo-1", voter_id: "u-peer1" });
    const pg = bySlug("dag-theory-population-genetics");
    this.reviews.push({ id: "r-demo-2", target_kind: "node", proposal_id: null, node_id: pg.id, edge_id: null, subgraph_id: null, reviewer_id: "u-researcher", reviewer_username: "carla", reviewer_active: true, rating: "strongly_accept", commentary_md: "Accurate gloss; Hartl & Clark would be the defining citation.", week: null, created_at: now() });
    // an approved + a rejected demo proposal by chen, reviewed by dana (so "reviews upheld" is non-zero)
    const p2 = "p-demo-2", p3 = "p-demo-3";
    this.propList.push({ id: p2, proposer_id: "u-peer1", change_type: "add_edge", target_node_id: null, target_edge_id: null, payload: { source_node_id: bySlug("ccp-theory-social-cognition").id, target_node_id: tom.id, relationship_code: "grounds" }, rationale: "Social cognition frames the theory-of-mind work; Tomasello 2005 makes the link explicit.", module_id: MODULE.id, status: "approved", submitter_anonymous: false, submitted_at: now(), updated_at: now(), decided_at: now(), result_node_id: null, result_edge_id: null });
    this.propList.push({ id: p3, proposer_id: "u-peer1", change_type: "archive_node", target_node_id: bySlug("hbec-topic-cooperation").id, target_edge_id: null, payload: {}, rationale: "Duplicate of the cross-department cooperation node; archive this one.", module_id: MODULE.id, status: "rejected", submitter_anonymous: true, submitted_at: now(), updated_at: now(), decided_at: now(), result_node_id: null, result_edge_id: null });
    this.proposalCitations[p2] = ["c-1"]; this.proposalCitations[p3] = [];
    this.reviews.push({ id: "r-demo-3", target_kind: "proposal", proposal_id: p2, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-peer2", reviewer_username: "dana", reviewer_active: true, rating: "accept", commentary_md: "The direction of the edge is right; label it 'frames'.", week: null, created_at: now() });
    this.reviews.push({ id: "r-demo-4", target_kind: "proposal", proposal_id: p3, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-peer2", reviewer_username: "dana", reviewer_active: true, rating: "reject", commentary_md: "Not a duplicate: the HBEC node is about field measures of cooperation, the cross-department one about the concept. Keep both, add an edge.", week: null, created_at: now() });
    // peer portfolios (private; count for cohort statistics and the leaderboard only)
    const mk = (owner: string, title: string, slugs: string[], own: [PrivateNodeType, string][], links: [number, number, string, string | null, number][], ann: string[]) => {
      const g: Subgraph = { id: nid("g"), owner_id: owner, module_id: MODULE.id, title, description: "", visibility: "private", last_checkpoint_week: null, created_at: now() };
      this.sgList.push(g);
      const ids: string[] = [];
      slugs.forEach((s, i) => { const n = bySlug(s); ids.push(n.id); this.sgNodes.push({ subgraph_id: g.id, node_id: n.id, custom_annotation: ann[i] || "", pos_x: null, pos_y: null, added_week: 1 + (i % 3) }); });
      own.forEach(([t, l], i) => { const p: PrivateNode = { id: nid("pn"), subgraph_id: g.id, node_type: t, label: l, source: null, origin: null, created_week: 1 + (i % 4), pos_x: null, pos_y: null }; this.privNodes.push(p); ids.push(p.id); });
      links.forEach(([a, b, why, lens, wk]) => { const fa = a >= slugs.length, fb = b >= slugs.length; this.links.push({ id: nid("l"), subgraph_id: g.id, from_node_id: fa ? null : ids[a], from_private_id: fa ? ids[a] : null, to_node_id: fb ? null : ids[b], to_private_id: fb ? ids[b] : null, why, lens, created_week: wk, edge_id: null }); });
      return g;
    };
    mk("u-student2", "Bob: apes, teaching, culture", ["ccp-theory-theory-of-mind", "primevo-topic-chimpanzee-cultural-diversity", "hbec-topic-cooperation", "ccp-method-eye-tracking"],
      [["self", "me"], ["question", "Do apes teach on purpose?"], ["resource", "Whiten 1999 Nature"]],
      [[4, 0, "I keep coming back to whether reading minds is needed for teaching, which is the hinge of my question.", "mechanism", 1], [5, 1, "My question is really a question about chimpanzee cultural transmission.", "theory", 2], [1, 2, "Cooperation field data from HBEC would let me test whether teaching co-varies with cooperation norms.", "evidence", 3], [6, 1, "The Whiten paper is the classic cultures-in-chimpanzees evidence base.", "evidence", 2]],
      ["Core mechanism, but I doubt apes need full ToM for teaching.", "Cultural variants across communities: my empirical anchor.", "", "Could use gaze-following as a proxy for attention to demonstrators."]);
    mk("u-peer1", "Chen: language and cognition", ["dlce-theory-language-evolution", "ccp-theory-social-cognition", "ccp-theory-theory-of-mind", "dag-theory-population-genetics", "humor-domain-stone-tools", "hbec-theory-cultural-evolution"],
      [["self", "me"], ["question", "Did language need theory of mind, or the reverse?"], ["theory", "Ostensive communication (Sperber & Wilson)"], ["method", "Cross-linguistic phylogenetics"]],
      [[6, 1, "The ostensive-inferential model says communication presupposes intention-reading, which is what social cognition studies.", "theory", 1], [7, 0, "Relevance theory is the bridge between the pragmatic and the cognitive accounts here.", "theory", 2], [0, 5, "Language change is a case of cultural evolution; the HBEC models should apply to phonology.", "mechanism", 2], [3, 0, "Population genetics gives the formal tools that language phylogenetics borrowed.", "method", 3], [4, 0, "Tool traditions are the earliest evidence of cumulative culture, and cumulative culture is where language might have paid off.", "evidence", 4], [9, 0, "My method node is how I would test any of this.", "method", 4]],
      ["My home base: whether language is a product or a driver of social cognition.", "Mind-reading as the substrate of communication.", "The developmental data that anchors the cognitive side.", "Formal models I need to learn to read the phylogenetic work.", "Deep-time evidence; I want to know what tools say about teaching.", "Framework for treating language change as an evolutionary process."]);
    mk("u-peer2", "Dana: cooperation across departments", ["hbec-topic-cooperation", "ccp-theory-social-cognition", "primevo-topic-chimpanzee-cultural-diversity"],
      [["self", "me"], ["question", "Is human cooperation unique in kind or only degree?"]],
      [[4, 0, "This is the question the module opened with and I want to keep it in view.", "theory", 1], [0, 2, "Chimpanzee community-level traditions are the comparison case for norms.", "evidence", 2]],
      ["Field measures of cooperation; I am interested in how they are constructed.", "", "The comparison species case."]);
    this.reviews.push({ id: "r-demo-5", target_kind: "subgraph", proposal_id: null, node_id: null, edge_id: null, subgraph_id: this.sgList[1].id, reviewer_id: "u-peer2", reviewer_username: "dana", reviewer_active: true, rating: "accept", commentary_md: "Your theory chain is strong; the evidence side is thin — add one empirical node per theory.", week: 3, created_at: now() });
  }
  private decorate(rs: Review[]): Review[] { return rs.map((r) => ({ ...r, helpful_count: this.helpful.filter((h) => h.review_id === r.id).length, helpful_by_me: this.helpful.some((h) => h.review_id === r.id && h.voter_id === this.me_.id) })); }
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
  private isInstructor() { return this.members.some((m) => m.profile_id === this.me_.id && ["instructor", "assistant"].includes(m.role)); }

  async getSession() { return this.signedIn ? { userId: this.me_.id, email: `${this.me_.username}@example.invalid` } : null; }
  async signInWithEmail(_email: string) { this.signedIn = true; this.listeners.forEach((l) => l({ userId: this.me_.id, email: null })); return { sent: true, message: "Mock mode: signed in immediately." }; }
  async signOut() { this.signedIn = false; this.listeners.forEach((l) => l(null)); }
  onAuthChange(cb: (s: Session | null) => void) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((l) => l !== cb); }; }
  async me() { return this.signedIn ? this.me_ : null; }
  async profiles(ids: string[]) { return EVERYONE.filter((p) => ids.includes(p.id)); }
  async updateProfile(patch: ProfilePatch) { Object.assign(this.me_, patch); return this.me_; }
  async departments() { return (await this.data()).departments; }
  async researchGroups() { return GROUPS; }
  async modules() { return [MODULE]; }
  async myModules() { return this.members.filter((m) => m.profile_id === this.me_.id).map((m) => ({ module: MODULE, role: m.role })); }
  async joinModule(module_id: string, role: "student" | "affiliate") { if (!this.members.some((m) => m.module_id === module_id && m.profile_id === this.me_.id)) this.members.push({ module_id, profile_id: this.me_.id, role }); }
  async leaveModule(module_id: string) { this.members = this.members.filter((m) => !(m.module_id === module_id && m.profile_id === this.me_.id && ["student", "affiliate"].includes(m.role))); }
  async graph() { const r = await this.data(); return { nodes: r.nodes.filter((n) => n.status !== "archived"), edges: r.edges.filter((e) => e.status !== "archived") }; }
  async node(id: string): Promise<NodeDetail> {
    const r = await this.data(); const node = r.nodes.find((n) => n.id === id); if (!node) throw new Error("node not found");
    return { node, citations: [], reviews: this.decorate(this.reviews.filter((x) => x.node_id === id)), summary: this.summarize("node", id),
      proposals: this.propList.filter((p) => p.target_node_id === id && ["pending", "under_review", "revision_requested"].includes(p.status)).map((p) => this.mask(p)),
      edges: r.edges.filter((e) => (e.source_node_id === id || e.target_node_id === id) && e.status !== "archived"), flags: this.flagList.filter((f) => f.target_id === id && !f.resolved_at) };
  }
  async edge(id: string): Promise<EdgeDetail> {
    const r = await this.data(); const edge = r.edges.find((e) => e.id === id); if (!edge) throw new Error("edge not found");
    return { edge, source: r.nodes.find((n) => n.id === edge.source_node_id) || null, target: r.nodes.find((n) => n.id === edge.target_node_id) || null, reviews: this.decorate(this.reviews.filter((x) => x.edge_id === id)), summary: this.summarize("edge", id), citations: [] };
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
      reviews: this.decorate(this.reviews.filter((x) => x.proposal_id === id)), summary: this.summarize("proposal", id), decisions: this.decisions.filter((d) => d.proposal_id === id),
      targetNode: raw.target_node_id ? r.nodes.find((n) => n.id === raw.target_node_id) || null : null,
      proposerUsername: proposal.proposer_id ? (EVERYONE.find((p) => p.id === proposal.proposer_id)?.username ?? null) : null };
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
    if (rv.target_kind === "edge") { const e = r.edges.find((x) => x.id === rv.target_id)!; if (e.created_by === this.me_.id) throw new Error("Conflict of interest: you authored this edge"); }
    if (rv.target_kind === "subgraph") { const g = this.sgList.find((x) => x.id === rv.target_id)!; if (g.owner_id === this.me_.id) throw new Error("Conflict of interest: you own this portfolio"); }
    if (this.reviews.some((x) => x.reviewer_id === this.me_.id && x.target_kind === rv.target_kind && [x.proposal_id, x.node_id, x.edge_id, x.subgraph_id].includes(rv.target_id))) throw new Error("You already reviewed this; one review per reviewer per target.");
    const col = { proposal: "proposal_id", node: "node_id", edge: "edge_id", subgraph: "subgraph_id" }[rv.target_kind] as "proposal_id" | "node_id" | "edge_id" | "subgraph_id";
    const base: Review = { id: nid("r"), target_kind: rv.target_kind, proposal_id: null, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: this.me_.id, reviewer_username: this.me_.username, reviewer_active: true, rating: rv.rating, commentary_md: rv.commentary_md, week: rv.week ?? null, created_at: now() };
    (base as unknown as Record<string, unknown>)[col] = rv.target_id;
    this.reviews.push(base);
  }
  async markHelpful(review_id: string, helpful: boolean) {
    const rv = this.reviews.find((x) => x.id === review_id); if (!rv) throw new Error("review not found");
    if (rv.reviewer_id === this.me_.id) throw new Error("You cannot mark your own review as helpful");
    this.helpful = this.helpful.filter((h) => !(h.review_id === review_id && h.voter_id === this.me_.id));
    if (helpful) this.helpful.push({ review_id, voter_id: this.me_.id });
  }
  async reviewSummary(kind: ReviewTarget, id: string) { return this.summarize(kind, id); }
  async reviewsFor(kind: ReviewTarget, id: string) { return this.decorate(this.reviews.filter((x) => x.target_kind === kind && [x.proposal_id, x.node_id, x.edge_id, x.subgraph_id].includes(id))); }
  async decide(d: DecisionInput) {
    if (!this.isEditor()) throw new Error("new row violates row-level security policy (editors only)");
    const r = await this.data();
    this.decisions.push({ id: nid("d"), proposal_id: d.proposal_id ?? null, node_id: d.node_id ?? null, edge_id: d.edge_id ?? null, editor_id: this.me_.id, decision: d.decision, feedback: d.feedback ?? "", decided_at: now() });
    if (d.node_id) { const n = r.nodes.find((x) => x.id === d.node_id)!; n.status = d.decision === "archive" ? "archived" : "canonical"; n.version++; n.canonical_since = n.canonical_since || now(); n.provenance = { ...n.provenance, status: n.status, approved_by: this.me_.id, approved_at: now(), assigned_by: "editorial-review" }; return; }
    if (d.edge_id) { const e = r.edges.find((x) => x.id === d.edge_id)!; e.status = d.decision === "archive" ? "archived" : "canonical"; e.version++; e.canonical_since = e.canonical_since || now(); return; }
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
  private canSeeSubgraph(g: Subgraph) { return g.owner_id === this.me_.id || this.isInstructor() || this.shares.some((s) => s.subgraph_id === g.id && s.profile_id === this.me_.id) || g.visibility === "members" || (g.visibility === "module" && this.members.some((m) => m.profile_id === this.me_.id && m.module_id === g.module_id)); }
  private owns(id: string) { const g = this.sgList.find((x) => x.id === id); if (!g || g.owner_id !== this.me_.id) throw new Error("not your portfolio"); return g; }
  async subgraphs() { return this.sgList.filter((g) => this.canSeeSubgraph(g)); }
  async subgraph(id: string): Promise<SubgraphDetail> {
    const subgraph = this.sgList.find((g) => g.id === id); if (!subgraph || !this.canSeeSubgraph(subgraph)) throw new Error("portfolio not found or not visible");
    return { subgraph, nodes: this.sgNodes.filter((n) => n.subgraph_id === id), privateNodes: this.privNodes.filter((n) => n.subgraph_id === id), links: this.links.filter((l) => l.subgraph_id === id), reviews: this.decorate(this.reviews.filter((r) => r.subgraph_id === id)) };
  }
  async createSubgraph(title: string, module_id: string | null) { const g: Subgraph = { id: nid("g"), owner_id: this.me_.id, module_id, title, description: "", visibility: "private", last_checkpoint_week: null, created_at: now() }; this.sgList.push(g); return g; }
  async updateSubgraph(id: string, patch: { title?: string; description?: string; last_checkpoint_week?: number | null }) { Object.assign(this.owns(id), patch); }
  async deleteSubgraph(id: string) { this.owns(id); this.sgList = this.sgList.filter((g) => g.id !== id); this.sgNodes = this.sgNodes.filter((n) => n.subgraph_id !== id); this.privNodes = this.privNodes.filter((n) => n.subgraph_id !== id); this.links = this.links.filter((l) => l.subgraph_id !== id); }
  async forkNode(subgraph_id: string, node_id: string, annotation: string, week: number | null) { this.owns(subgraph_id); const ex = this.sgNodes.find((n) => n.subgraph_id === subgraph_id && n.node_id === node_id); if (ex) { if (annotation) ex.custom_annotation = annotation; return; } this.sgNodes.push({ subgraph_id, node_id, custom_annotation: annotation, pos_x: null, pos_y: null, added_week: week }); }
  async forkNodes(subgraph_id: string, items: ForkItem[]) { for (const it of items) await this.forkNode(subgraph_id, it.node_id, it.annotation, it.week); }
  async updateAnnotation(subgraph_id: string, node_id: string, annotation: string, week: number | null) { this.owns(subgraph_id); const n = this.sgNodes.find((x) => x.subgraph_id === subgraph_id && x.node_id === node_id); if (n) { n.custom_annotation = annotation; n.added_week = week; } }
  async removeNode(subgraph_id: string, node_id: string) { this.owns(subgraph_id); this.sgNodes = this.sgNodes.filter((x) => !(x.subgraph_id === subgraph_id && x.node_id === node_id)); this.links = this.links.filter((l) => l.subgraph_id !== subgraph_id || (l.from_node_id !== node_id && l.to_node_id !== node_id)); }
  async addPrivateNode(subgraph_id: string, node_type: PrivateNodeType, label: string, source: string | null, week: number | null) { this.owns(subgraph_id); const n: PrivateNode = { id: nid("pn"), subgraph_id, node_type, label, source, origin: null, created_week: week, pos_x: null, pos_y: null }; this.privNodes.push(n); return n; }
  async updatePrivateNode(id: string, patch: { label?: string; source?: string | null; node_type?: PrivateNodeType; created_week?: number | null }) { const n = this.privNodes.find((x) => x.id === id); if (!n) return; this.owns(n.subgraph_id); Object.assign(n, patch); }
  async removePrivateNode(id: string) { const n = this.privNodes.find((x) => x.id === id); if (!n) return; this.owns(n.subgraph_id); this.privNodes = this.privNodes.filter((x) => x.id !== id); this.links = this.links.filter((l) => l.from_private_id !== id && l.to_private_id !== id); }
  async addLink(l: Omit<SubgraphLink, "id">) { this.owns(l.subgraph_id); if (l.why.length < 10) throw new Error("The 'because' needs at least 10 characters"); this.links.push({ id: nid("l"), edge_id: null, ...l }); }
  async addLinks(ls: Omit<SubgraphLink, "id">[]) { for (const l of ls) await this.addLink(l); }
  async updateLink(id: string, patch: { why?: string; lens?: string | null; created_week?: number | null }) { const l = this.links.find((x) => x.id === id); if (!l) return; this.owns(l.subgraph_id); if (patch.why != null && patch.why.length < 10) throw new Error("The 'because' needs at least 10 characters"); Object.assign(l, patch); }
  async removeLink(id: string) { const l = this.links.find((x) => x.id === id); if (!l) return; this.owns(l.subgraph_id); this.links = this.links.filter((x) => x.id !== id); }
  async savePositions(subgraph_id: string, positions: { node_id?: string; private_id?: string; x: number; y: number }[]) {
    for (const p of positions) { const t = p.node_id ? this.sgNodes.find((n) => n.subgraph_id === subgraph_id && n.node_id === p.node_id) : this.privNodes.find((n) => n.id === p.private_id); if (t) { t.pos_x = p.x; t.pos_y = p.y; } }
  }
  async setVisibility(subgraph_id: string, v: Visibility) { this.owns(subgraph_id).visibility = v; }
  async share(subgraph_id: string, username: string) { this.owns(subgraph_id); const p = EVERYONE.find((x) => x.username === username); if (!p) throw new Error("no such member"); this.shares.push({ subgraph_id, profile_id: p.id }); }
  async importPortfolio(b: PortfolioBackup, title: string, module_id: string | null) {
    const r = await this.data(); const g = await this.createSubgraph(title, module_id);
    const bySlug = Object.fromEntries(r.nodes.map((n) => [n.slug, n.id])); const map: Record<string, string> = {};
    for (const n of b.nodes) { const id = (n.slug && bySlug[n.slug]) || (r.nodes.some((x) => x.id === n.node_id) ? n.node_id : null); if (!id) continue; map[n.node_id] = id; this.sgNodes.push({ subgraph_id: g.id, node_id: id, custom_annotation: n.custom_annotation || "", pos_x: n.pos_x, pos_y: n.pos_y, added_week: n.added_week }); }
    for (const p of b.private_nodes) { const np = await this.addPrivateNode(g.id, p.node_type, p.label, p.source, p.created_week); np.pos_x = p.pos_x; np.pos_y = p.pos_y; map[p.id] = np.id; }
    for (const l of b.links) { const f = l.from_node_id ? map[l.from_node_id] : map[l.from_private_id!], t = l.to_node_id ? map[l.to_node_id] : map[l.to_private_id!]; if (!f || !t) continue; this.links.push({ id: nid("l"), subgraph_id: g.id, from_node_id: l.from_node_id ? f : null, from_private_id: l.from_private_id ? f : null, to_node_id: l.to_node_id ? t : null, to_private_id: l.to_private_id ? t : null, why: l.why, lens: l.lens, created_week: l.created_week, edge_id: l.edge_id && r.edges.some((e) => e.id === l.edge_id) ? l.edge_id : null }); }
    return g;
  }
  async cohortStats(scope: "module" | "program" | "members", module_id?: string | null): Promise<CohortStats> {
    const r = await this.data(); const byId = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
    const ids = this.sgList.filter((g) => scope === "members" ? true : scope === "program" ? EVERYONE.find((p) => p.id === g.owner_id)?.role === "msc_student" : g.module_id === (module_id ?? MODULE.id)).map((g) => g.id);
    if (ids.length < 3) return { scope, n: ids.length, metrics: null, reason: "fewer than 3 portfolios in scope; no aggregates released" };
    const ms = ids.map((id) => portfolioMetrics({ subgraph: this.sgList.find((g) => g.id === id)!, nodes: this.sgNodes.filter((n) => n.subgraph_id === id), privateNodes: this.privNodes.filter((n) => n.subgraph_id === id), links: this.links.filter((l) => l.subgraph_id === id), reviews: this.reviews.filter((x) => x.subgraph_id === id) }, byId));
    const metrics: CohortStats["metrics"] = {};
    for (const k of Object.keys(ms[0]) as MetricKey[]) { const vs = ms.map((m) => m[k]); metrics[k] = { mean: Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10, median: median(vs), p75: quantile(vs, 0.75), max: Math.max(...vs) }; }
    return { scope, n: ids.length, metrics };
  }
  private rowFor(p: Profile): LeaderboardRow {
    const r = this.raw!; const byId = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
    const mine = this.sgList.filter((g) => g.owner_id === p.id).map((g) => g.id);
    const sn = this.sgNodes.filter((n) => mine.includes(n.subgraph_id)), pn = this.privNodes.filter((n) => mine.includes(n.subgraph_id)), ls = this.links.filter((l) => mine.includes(l.subgraph_id));
    const rv = this.reviews.filter((x) => x.reviewer_id === p.id);
    const weeks = new Set<number>(); ls.forEach((l) => l.created_week && weeks.add(l.created_week)); pn.forEach((n) => n.created_week && weeks.add(n.created_week)); sn.forEach((n) => n.added_week && weeks.add(n.added_week)); rv.forEach((x) => x.week && weeks.add(x.week));
    const approved = this.propList.filter((x) => x.proposer_id === p.id && x.status === "approved");
    return { profile_id: p.id, username: p.username, role: p.role, department: p.department_id ? r.departments.find((d) => d.id === p.department_id)?.abbr ?? null : null,
      approved_proposals: approved.length, open_proposals: this.propList.filter((x) => x.proposer_id === p.id && ["pending", "under_review", "revision_requested"].includes(x.status)).length,
      canonical_nodes_authored: r.nodes.filter((n) => n.created_by === p.id && n.status === "canonical").length, citations_brought: new Set(approved.flatMap((x) => this.proposalCitations[x.id] || [])).size,
      reviews_written: rv.filter((x) => x.target_kind !== "subgraph").length, portfolio_critiques: rv.filter((x) => x.target_kind === "subgraph").length,
      helpful_votes_received: this.helpful.filter((h) => rv.some((x) => x.id === h.review_id)).length,
      reviews_upheld: rv.filter((x) => { const pr = x.proposal_id ? this.propList.find((y) => y.id === x.proposal_id) : null; return pr && ((pr.status === "approved" && SCORE[x.rating] > 0) || (pr.status === "rejected" && SCORE[x.rating] < 0)); }).length,
      substantive_reviews: rv.filter((x) => x.commentary_md.length >= 300).length,
      annotated_nodes: sn.filter((n) => n.custom_annotation.length >= 40).length, annotation_chars: sn.reduce((a, n) => a + n.custom_annotation.length, 0),
      connections_written: ls.length, cross_dept_connections: ls.filter((l) => { const a = l.from_node_id ? byId[l.from_node_id] : null, b = l.to_node_id ? byId[l.to_node_id] : null; return a?.department_id && b?.department_id && a.department_id !== b.department_id; }).length,
      lenses_used: new Set(ls.map((l) => (l.lens || "").trim()).filter(Boolean)).size, questions_raised: pn.filter((n) => n.node_type === "question").length, resources_added: pn.filter((n) => n.node_type === "resource").length, active_weeks: weeks.size };
  }
  async leaderboard(): Promise<LeaderboardRow[]> {
    await this.data();
    return EVERYONE.filter((p) => p.id === this.me_.id ? this.consent.leaderboard_display : this.peerConsent.has(p.id)).map((p) => this.rowFor(p.id === this.me_.id ? this.me_ : p));
  }
  async consents() { return { ...this.consent }; }
  async setConsent(purpose: ConsentPurpose, granted: boolean) { this.consent[purpose] = granted; }
  async erase(_redactText: boolean) { this.signedIn = false; this.listeners.forEach((l) => l(null)); }
  async exportMyData() { return { exported_at: now(), profile: this.me_, proposals: this.propList.filter((p) => p.proposer_id === this.me_.id), reviews: this.reviews.filter((r) => r.reviewer_id === this.me_.id), subgraphs: this.sgList.filter((g) => g.owner_id === this.me_.id) }; }
}
