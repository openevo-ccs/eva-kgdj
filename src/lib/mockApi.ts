// In-memory Api for UI work and screenshot tests. Seeded from src/mock/graph.json
// (scripts/build-mock-data.mjs). Pick a persona with ?as=student|student2|
// researcher|editor|instructor|admin (default student). State lives for the page
// session only. No real people, no network.
import type { Api, CitationInput, CommonsDecisionInput, CommonsProposalInput, CommonsReviewInput, CommonsSpaceInput, DecisionInput, ForkItem, ProfilePatch, ProposalInput, ReviewInput } from "./api";
import type { PortfolioBackup } from "./backup";
import { portfolioMetrics } from "./report";
import type {
  Citation, CitationCoverage, CohortStats, CommonsDecisionRow, CommonsItem, CommonsItemT, CommonsLink, CommonsParticipant, CommonsParticipantStatus, CommonsProposal, CommonsProposalDetail, CommonsReview, CommonsRole,
  CommonsSpace, CommonsSpaceDetail, ConsentPurpose, ContentFlag, ContentFlagTargetKind, Department, EdgeDetail, EditorialDecision, GraphEdge, GraphNode, ItemComment, ItemCommentTarget, LeaderboardRow, MetricKey, Module, ModuleMemberRole,
  NodeDetail, PrivateNode, PrivateNodeType, Profile, Proposal, ProposalDetail, ProposalStatus, ResearchGroup, Review, ReviewFlag, ReviewSummary, ReviewTarget, Session, Subgraph, SubgraphDetail, SubgraphLink, SubgraphNode, Visibility,
} from "./types";
import { isVerifiedCitation } from "./types";

type Raw = { departments: Department[]; nodes: GraphNode[]; edges: GraphEdge[] };
// Five students with deliberately different disciplinary portfolios (genetics, primatology,
// linguistics, child development, cross-cultural psychology) — all loggable via ?as=, so the
// UI can actually be reviewed from each of their points of view, not just read as data.
const PERSONAS: Record<string, Profile> = {
  student: { id: "u-student", username: "priya", full_name: "Priya Raghavan", role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true, research_group_id: "rg-evogen", affiliation_note: "Co-supervised with Archaeogenetics for ancient-DNA method training." },
  student2: { id: "u-student2", username: "bram", full_name: "Bram de Wilde", role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true, research_group_id: "rg-primevo", affiliation_note: "Remote data access to the Amboseli long-term baboon project." },
  student3: { id: "u-student3", username: "linh", full_name: "Linh Tran", role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true, research_group_id: "rg-dlce", affiliation_note: null },
  student4: { id: "u-student4", username: "amara", full_name: "Amara Okafor", role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true, research_group_id: "rg-ccp", affiliation_note: "Also auditing HBEC's cross-cultural database methods sessions." },
  student5: { id: "u-student5", username: "sofia", full_name: "Sofia Marchetti", role: "msc_student", institution: "uni-leipzig", department_id: null, is_active: true, research_group_id: "rg-cccd", affiliation_note: "Fieldwork placement with the Culture, Cooperation and Child Development group." },
  researcher: { id: "u-researcher", username: "carla", full_name: null, role: "researcher", institution: "mpi-eva", department_id: "dept-ccp", is_active: true, research_group_id: null, affiliation_note: null },
  editor: { id: "u-editor", username: "eve", full_name: null, role: "editor", institution: "mpi-eva", department_id: "dept-ccp", is_active: true, research_group_id: null, affiliation_note: null },
  instructor: { id: "u-instructor", username: "daniel", full_name: null, role: "researcher", institution: "mpi-eva", department_id: "dept-ccp", is_active: true, research_group_id: null, affiliation_note: null },
  admin: { id: "u-admin", username: "dustin", full_name: null, role: "admin", institution: "mpi-eva", department_id: "dept-ccp", is_active: true, research_group_id: null, affiliation_note: null },
};
const EVERYONE = Object.values(PERSONAS);
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
  // verification shapes match build_literature_seed.py's real import, not an
  // invented mock-only convention -- see isVerifiedCitation() in lib/types.ts. Four
  // of these five are genuine, well-known MPI-EVA-affiliated papers that would
  // plausibly PuRe-match for real; c-3 (Zeberg & Pääbo) is left unverified on purpose,
  // to demo the "has an identifier, not yet confirmed" case honestly rather than
  // making every mock citation look equally trustworthy.
  private citations: Citation[] = [
    { id: "c-1", doi: "10.1017/s0140525x05000129", openalex_id: "W2106980598", title: "Understanding and sharing intentions: The origins of cultural cognition", authors: ["Tomasello, M.", "Carpenter, M.", "Call, J.", "Behne, T.", "Moll, H."], year: 2005, venue: "Behavioral and Brain Sciences", verification: { source: "eva_literature", pure: { matched: true, method: "doi", item_id: "item_58292" } } },
    { id: "c-2", doi: "10.1038/21415", openalex_id: "W2028434776", title: "Cultures in chimpanzees", authors: ["Whiten, A.", "Goodall, J.", "McGrew, W. C.", "Boesch, C."], year: 1999, venue: "Nature", verification: { source: "eva_literature", pure: { matched: true, method: "doi", item_id: "item_61140" } } },
    { id: "c-3", doi: "10.1038/s41586-020-2818-3", title: "The major genetic risk factor for severe COVID-19 is inherited from Neanderthals", authors: ["Zeberg, H.", "Pääbo, S."], year: 2020, venue: "Nature", verification: {} },
    { id: "c-4", doi: "10.1017/s0140525x0999152x", title: "The weirdest people in the world?", authors: ["Henrich, J.", "Heine, S. J.", "Norenzayan, A."], year: 2010, venue: "Behavioral and Brain Sciences", verification: { source: "eva_literature", pure: { matched: true, method: "doi", item_id: "item_70213" } } },
    { id: "c-6", doi: "10.1073/pnas.0610848104", title: "Linguistic tone is related to the population frequency of the adaptive haplogroups of two brain size genes, ASPM and Microcephalin", authors: ["Dediu, D.", "Ladd, D. R."], year: 2007, venue: "PNAS", verification: { source: "eva_literature", pure: { matched: true, method: "doi", item_id: "item_44981" } } },
  ];
  // Real topical matches, not arbitrary: theory-of-mind really is grounded by the
  // shared-intentionality paper, cultural-traditions-in-primates by Cultures in
  // Chimpanzees. The third is deliberately the UNVERIFIED citation (c-3) on a node
  // where it's genuinely the live open question -- lets the coverage chip demo both
  // states against believable content rather than needing a "no sources" hunt.
  private nodeCitationLinks: { node_id: string; citation_id: string }[] = [
    { node_id: "n-246", citation_id: "c-1" }, // Theory of mind <- Tomasello et al. 2005
    { node_id: "n-232", citation_id: "c-2" }, // Cultural traditions in primates <- Cultures in Chimpanzees
    { node_id: "n-155", citation_id: "c-3" }, // COVID-Neanderthal haplotypes <- Zeberg & Pääbo (unverified)
  ];
  private propList: Proposal[] = [];
  private proposalCitations: Record<string, string[]> = {};
  private reviews: Review[] = [];
  private commonsSpacesList: CommonsSpace[] = [];
  private commonsParticipantsList: CommonsParticipant[] = [];
  private commonsItemsList: CommonsItemT[] = [];
  private commonsLinksList: CommonsLink[] = [];
  private commonsProposalsList: CommonsProposal[] = [];
  private commonsProposalCitations: Record<string, string[]> = {};
  private commonsReviewsList: CommonsReview[] = [];
  private commonsDecisionsList: CommonsDecisionRow[] = [];
  private itemCommentsList: ItemComment[] = [];
  private helpful: { review_id: string; voter_id: string }[] = [];
  private decisions: EditorialDecision[] = [];
  private flagList: ReviewFlag[] = [];
  private contentFlagList: ContentFlag[] = [];
  private sgList: Subgraph[] = [];
  private sgNodes: SubgraphNode[] = [];
  private privNodes: PrivateNode[] = [];
  private links: SubgraphLink[] = [];
  private shares: { subgraph_id: string; profile_id: string; shared_at: string }[] = [];
  private members: { module_id: string; profile_id: string; role: ModuleMemberRole }[] = [
    { module_id: MODULE.id, profile_id: "u-student", role: "student" }, { module_id: MODULE.id, profile_id: "u-student2", role: "student" },
    { module_id: MODULE.id, profile_id: "u-student3", role: "student" }, { module_id: MODULE.id, profile_id: "u-student4", role: "student" },
    { module_id: MODULE.id, profile_id: "u-student5", role: "student" }, { module_id: MODULE.id, profile_id: "u-instructor", role: "instructor" },
  ];
  private consent: Record<ConsentPurpose, boolean> = { portfolio_processing: true, peer_review_visibility: true, leaderboard_display: false, canonical_attribution: false };
  private peerConsent = new Set(["u-student2", "u-student3", "u-student4", "u-student5", "u-researcher"]);

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
    const day = (offset: number) => new Date(Date.now() - offset * 86400000).toISOString();

    // The imported mpi-eva-graph seed ships with every node status "proposed" (dashed) — accurate
    // to a fresh import, but it means a first-time student sees a canonical graph that is 100%
    // "pending review", which reads as broken/empty rather than as an established knowledge base.
    // Simulate a term's worth of prior curation: foundational vocabulary (theory/domain nodes) is
    // already peer-reviewed and canonical; frontier topics, methods, field sites and scicomm framings
    // stay proposed, which is also what gives the five portfolios below live material to review.
    const CANON_EXTRA = new Set(["primevo-topic-chimpanzee-cultural-diversity", "hbec-topic-cooperation"]);
    const priorTerm = day(70);
    for (const n of r.nodes) {
      if (n.type_code === "theory" || n.type_code === "domain" || CANON_EXTRA.has(n.slug)) {
        n.status = "canonical"; n.canonical_since = n.canonical_since || priorTerm;
        n.provenance = { ...n.provenance, status: "canonical", approved_by: "u-editor", approved_at: priorTerm, assigned_by: "editorial-review" };
      }
    }

    const tom = bySlug("ccp-theory-theory-of-mind");
    const pid = "p-demo-1";
    this.propList.push({ id: pid, proposer_id: "u-student2", change_type: "edit_node", target_node_id: tom.id, target_edge_id: null,
      payload: { description: tom.description + " Revised gloss, checked against Tomasello et al. (2005)." }, rationale: "The seed gloss is a single-pass draft; this revision cites the foundational shared-intentionality paper and tightens the definition.",
      module_id: MODULE.id, status: "under_review", submitter_anonymous: false, submitted_at: day(6), updated_at: day(6), decided_at: null, result_node_id: null, result_edge_id: null });
    this.proposalCitations[pid] = ["c-1"];
    this.reviews.push({ id: "r-demo-1", target_kind: "proposal", proposal_id: pid, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-researcher", reviewer_username: "carla", reviewer_active: true, rating: "accept", commentary_md: "Clear and well sourced. Consider also citing **Rakoczy (2022)** for the developmental timeline.", week: null, created_at: day(5) });
    this.helpful.push({ review_id: "r-demo-1", voter_id: "u-student2" }, { review_id: "r-demo-1", voter_id: "u-student3" });

    // approved + rejected demo proposals, deliberately assigned across students rather than to the
    // topic-matching specialist: Sofia (child development) editing a theory-of-mind edge and Priya
    // (genetics, anonymous — she isn't sure of her footing outside her own field) proposing a cleanup
    // that Bram, who actually knows the primatology literature, correctly catches as wrong.
    const p2 = "p-demo-2", p3 = "p-demo-3";
    this.propList.push({ id: p2, proposer_id: "u-student5", change_type: "add_edge", target_node_id: null, target_edge_id: null, payload: { source_node_id: bySlug("ccp-theory-social-cognition").id, target_node_id: tom.id, relationship_code: "grounds" }, rationale: "Social cognition frames the theory-of-mind work; Tomasello 2005 makes the link explicit.", module_id: MODULE.id, status: "approved", submitter_anonymous: false, submitted_at: day(20), updated_at: day(18), decided_at: day(18), result_node_id: null, result_edge_id: null });
    this.propList.push({ id: p3, proposer_id: "u-student", change_type: "archive_node", target_node_id: bySlug("hbec-topic-cooperation").id, target_edge_id: null, payload: {}, rationale: "Duplicate of the cross-department cooperation node; archive this one.", module_id: MODULE.id, status: "rejected", submitter_anonymous: true, submitted_at: day(15), updated_at: day(13), decided_at: day(13), result_node_id: null, result_edge_id: null });
    this.proposalCitations[p2] = ["c-1"]; this.proposalCitations[p3] = [];
    this.reviews.push({ id: "r-demo-3", target_kind: "proposal", proposal_id: p2, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-student4", reviewer_username: "amara", reviewer_active: true, rating: "accept", commentary_md: "The direction of the edge is right; label it 'frames'.", week: null, created_at: day(19) });
    this.reviews.push({ id: "r-demo-4", target_kind: "proposal", proposal_id: p3, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-student2", reviewer_username: "bram", reviewer_active: true, rating: "reject", commentary_md: "Not a duplicate: the HBEC node is about field measures of cooperation, the cross-department one about the concept. Keep both, add an edge.", week: null, created_at: day(14) });

    // three more open proposals spanning "no reviews yet", "reviewers disagree", and "one strong accept"
    const p6 = "p-demo-6";
    const covid = bySlug("evogen-topic-covid19-neanderthal-haplotypes");
    this.propList.push({ id: p6, proposer_id: "u-student", change_type: "edit_node", target_node_id: covid.id, target_edge_id: null,
      payload: { description: covid.description + " Note the OAS1-locus mechanism and that the risk haplotype's frequency varies substantially by population — both matter for how this gets discussed publicly." },
      rationale: "The current gloss states the association but not the mechanism, and public 'Neanderthal gene' framing tends to skip the population-frequency caveat entirely (Zeberg & Pääbo 2020).",
      module_id: MODULE.id, status: "pending", submitter_anonymous: false, submitted_at: day(1), updated_at: day(1), decided_at: null, result_node_id: null, result_edge_id: null });
    this.proposalCitations[p6] = ["c-3"];

    const p7 = "p-demo-7";
    this.propList.push({ id: p7, proposer_id: "u-student3", change_type: "add_edge", target_node_id: null, target_edge_id: null,
      payload: { source_node_id: bySlug("dlce-topic-gene-language-correlation").id, target_node_id: bySlug("evogen-topic-introgression-from-archaic-hominins").id, relationship_code: "informed_by" },
      rationale: "Priya's genomics portfolio raises whether introgressed regulatory variants could sit near language-relevant regions. Dediu & Ladd (2007) is the classic precedent for a genetic–linguistic correlational claim, so I want the canonical graph to at least carry the connection as a hypothesis, clearly hedged.",
      module_id: MODULE.id, status: "under_review", submitter_anonymous: false, submitted_at: day(9), updated_at: day(3), decided_at: null, result_node_id: null, result_edge_id: null });
    this.proposalCitations[p7] = ["c-6"];
    this.reviews.push({ id: "r-demo-6", target_kind: "proposal", proposal_id: p7, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-researcher", reviewer_username: "carla", reviewer_active: true, rating: "accept", commentary_md: "The Dediu & Ladd precedent is real and 'informed_by' is an appropriately cautious label — this is a hypothesis edge, not a settled mechanism.", week: null, created_at: day(6) });
    this.reviews.push({ id: "r-demo-7", target_kind: "proposal", proposal_id: p7, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-instructor", reviewer_username: "daniel", reviewer_active: true, rating: "reject", commentary_md: "This correlational literature (Dediu & Ladd 2007 and the debate that followed it) has a contested replication history. Before this becomes a canonical edge I'd want the proposal to name that contestation explicitly, not just cite the original finding — otherwise we're presenting a disputed correlation as settled input to language-evolution theory.", week: null, created_at: day(3) });

    const p8 = "p-demo-8";
    this.propList.push({ id: p8, proposer_id: "u-student4", change_type: "edit_node", target_node_id: bySlug("hbec-topic-cross-cultural-generalizability").id, target_edge_id: null,
      payload: { description: bySlug("hbec-topic-cross-cultural-generalizability").description + " A finding cannot be judged culture-general or culture-specific without first establishing measurement invariance across the samples compared (Henrich, Heine & Norenzayan 2010)." },
      rationale: "This node badly needed the WEIRD citation — it names the problem without naming the discipline-defining paper that raised it.",
      module_id: MODULE.id, status: "under_review", submitter_anonymous: false, submitted_at: day(7), updated_at: day(4), decided_at: null, result_node_id: null, result_edge_id: null });
    this.proposalCitations[p8] = ["c-4"];
    this.reviews.push({ id: "r-demo-8", target_kind: "proposal", proposal_id: p8, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-researcher", reviewer_username: "carla", reviewer_active: true, rating: "strongly_accept", commentary_md: "Overdue. This is the single most-cited critique in the area and the gloss read strangely without it.", week: null, created_at: day(4) });

    // a full loop closed end to end: proposal -> review -> editorial decision -> canonical edit,
    // so at least one of the five students' proposals shows the whole workflow resolved, not just open
    const p9 = "p-demo-9", play = bySlug("hbec-topic-childrens-play");
    const revisedPlay = play.description + " Cross-species comparison (Bram, primatology review) suggests rule-following precursors also appear in great-ape play, so the human-specific claim here is about degree and content, not the mere presence of rule-governed play.";
    this.propList.push({ id: p9, proposer_id: "u-student5", change_type: "edit_node", target_node_id: play.id, target_edge_id: null,
      payload: { description: revisedPlay }, rationale: "Play is where a lot of early cooperative and rule-following behaviour actually happens, informally, before anyone calls it 'teaching' — the gloss should say so and flag the comparative angle a classmate raised.",
      module_id: MODULE.id, status: "approved", submitter_anonymous: false, submitted_at: day(11), updated_at: day(2), decided_at: day(2), result_node_id: play.id, result_edge_id: null });
    this.proposalCitations[p9] = ["c-1"];
    this.reviews.push({ id: "r-demo-9", target_kind: "proposal", proposal_id: p9, node_id: null, edge_id: null, subgraph_id: null, reviewer_id: "u-student2", reviewer_username: "bram", reviewer_active: true, rating: "accept", commentary_md: "As a primatologist I'd flag that some rule-following precursors in play show up in great apes too — your gloss is specifically about human variation, so that's fine as long as the human-specific claim stays about degree, not presence. Accept.", week: null, created_at: day(4) });
    this.decisions.push({ id: "ed-demo-1", proposal_id: p9, node_id: null, edge_id: null, editor_id: "u-editor", decision: "approve", feedback: "Good tightening — and it's nice that a classmate's cross-species review is what pushed this past 'looks fine to me' into something actually checked against the comparative literature. Approved.", decided_at: day(2) });
    play.description = revisedPlay; play.status = "canonical"; play.version += 1; play.canonical_since = day(2);
    play.provenance = { ...play.provenance, status: "canonical", proposal_id: p9, proposer_id: "u-student5", approved_by: "u-editor", approved_at: day(2), assigned_by: "editorial-review" };

    // identified node-level reviews on still-"proposed" (dashed) topic nodes each student engaged
    // with directly — this is exactly what the Editorial dashboard's "seed nodes ready to promote"
    // table is for, and it's populated with reviewers who actually have a stake in the topic.
    this.reviews.push({ id: "r-demo-10", target_kind: "node", proposal_id: null, node_id: bySlug("primevo-topic-social-play-and-cooperation").id, edge_id: null, subgraph_id: null, reviewer_id: "u-student2", reviewer_username: "bram", reviewer_active: true, rating: "strongly_accept", commentary_md: "Matches my own field questions about play as cooperation scaffolding directly; gloss is accurate and well scoped.", week: null, created_at: day(10) });
    this.reviews.push({ id: "r-demo-11", target_kind: "node", proposal_id: null, node_id: bySlug("ccp-topic-cross-cultural-norm-enforcement").id, edge_id: null, subgraph_id: null, reviewer_id: "u-student4", reviewer_username: "amara", reviewer_active: true, rating: "accept", commentary_md: "Precisely the topic anchoring my own question, though 'enforcement' should distinguish caregiver-mediated from peer-mediated cases eventually.", week: null, created_at: day(9) });
    this.reviews.push({ id: "r-demo-12", target_kind: "node", proposal_id: null, node_id: bySlug("evogen-topic-pain-sensitivity-introgression").id, edge_id: null, subgraph_id: null, reviewer_id: "u-student", reviewer_username: "priya", reviewer_active: true, rating: "accept", commentary_md: "Solid summary of the introgression case; I'd add a caveat that functional validation (CRISPR allele-reversion) is still limited to a handful of variants, not a general result.", week: null, created_at: day(8) });
    this.reviews.push({ id: "r-demo-13", target_kind: "node", proposal_id: null, node_id: bySlug("dlce-topic-coevolution-of-language-and-culture").id, edge_id: null, subgraph_id: null, reviewer_id: "u-student3", reviewer_username: "linh", reviewer_active: true, rating: "accept", commentary_md: "Good general statement, though it reads as a claim about correlated structure — worth being explicit that correlation is all the current cross-linguistic evidence actually supports.", week: null, created_at: day(7) });

    // ---- five portfolios: genetics, primatology, linguistics, cross-cultural psychology, child development ----
    const mk = (owner: string, title: string, slugs: string[], own: [PrivateNodeType, string][], links: [number, number, string, string | null][], ann: string[], sharedIdx: { node?: number[]; own?: number[]; link?: number[] } = {}) => {
      const g: Subgraph = { id: nid("g"), owner_id: owner, module_id: MODULE.id, title, description: "", visibility: "private", last_checkpoint_week: null, created_at: day(45) };
      this.sgList.push(g);
      const ids: string[] = [];
      const sharedNode = new Set(sharedIdx.node || []), sharedOwn = new Set(sharedIdx.own || []), sharedLink = new Set(sharedIdx.link || []);
      slugs.forEach((s, i) => { const n = bySlug(s); ids.push(n.id); const at = day(40 - i * 4); this.sgNodes.push({ subgraph_id: g.id, node_id: n.id, custom_annotation: ann[i] || "", pos_x: null, pos_y: null, added_week: null, added_at: at, updated_at: at, shared: sharedNode.has(i), shared_at: sharedNode.has(i) ? at : null }); });
      own.forEach(([t, l], i) => { const at = day(34 - i * 6); const p: PrivateNode = { id: nid("pn"), subgraph_id: g.id, node_type: t, label: l, source: null, origin: null, created_week: null, pos_x: null, pos_y: null, created_at: at, updated_at: at, shared: sharedOwn.has(i), shared_at: sharedOwn.has(i) ? at : null }; this.privNodes.push(p); ids.push(p.id); });
      links.forEach(([a, b, why, lens], i) => { const fa = a >= slugs.length, fb = b >= slugs.length; const at = day(30 - i * 3); this.links.push({ id: nid("l"), subgraph_id: g.id, from_node_id: fa ? null : ids[a], from_private_id: fa ? ids[a] : null, to_node_id: fb ? null : ids[b], to_private_id: fb ? ids[b] : null, why, lens, created_week: null, edge_id: null, created_at: at, updated_at: at, shared: sharedLink.has(i), shared_at: sharedLink.has(i) ? at : null }); });
      return g;
    };

    // Priya — evolutionary/archaeogenetics: archaic introgression and its behavioural/ethical edges
    mk("u-student", "Priya: what introgressed DNA actually did",
      ["evogen-topic-introgression-from-archaic-hominins", "evogen-topic-covid19-neanderthal-haplotypes", "evogen-topic-pain-sensitivity-introgression", "dag-topic-neanderthal-admixture", "dag-method-shotgun-sequencing", "evogen-method-selection-scans", "evogen-theory-coalescent-theory", "dag-scicomm-race-and-ancestry-framing", "dlce-topic-gene-language-correlation", "hbec-theory-gene-culture-coevolution"],
      [["self", "me"], ["question", "If a Neanderthal-introgressed haplotype changes pain sensitivity, does it also shape behaviour — or am I pattern-matching a good story onto a noisy GWAS hit?"], ["resource", "Zeberg & Pääbo (2020) — Neanderthal haplotype and severe COVID-19 risk"], ["method", "Selection scans (iHS / XP-EHH) — I can cite a 'signal of selection', I can't run one yet"]],
      [[2, 11, "This is the concrete case my question is actually about — a haplotype with a specific, testable phenotype, not just a frequency difference.", "mechanism"],
       [1, 5, "If the COVID-risk haplotype really was under recent selection in some populations, a selection scan is the actual test — not just noting that it's introgressed.", "method"],
       [3, 6, "Every admixture-timing estimate for this pulse is a coalescent-model output; the topic node states a date without showing the machinery producing it.", "theory"],
       [6, 4, "Coalescent models are only as good as the genotype calls under them, and low-coverage ancient shotgun data has real error modes that propagate downstream.", "method"],
       [0, 8, "If any introgressed regulatory variants sit near language-relevant regions, that's a genetic channel into language evolution — Linh's linguistics portfolio has the other half of this question.", "theory"],
       [0, 9, "Archaic introgression is a case where a genetic input clearly precedes a behavioural outcome, which is the whole claim gene-culture coevolution needs to make precise.", "theory"],
       [7, 11, "Popular 'percent Neanderthal' framing is exactly the ancestry essentialism this node warns about — I need to phrase my own question so it can't be misread as biological race science.", "ethics"]],
      ["The introgression literature is where 'ancient DNA' stops being about ancestry maps and starts being about function — which variants actually did something once they were in modern humans.",
       "The clearest case I have of an introgressed haplotype with a plausible, testable phenotype — and one everyone already has an opinion about, which is a good test of my own reasoning.",
       "My question node, basically: a specific, falsifiable instance of the bigger 'so what' question about archaic introgression.",
       "Still coming to terms with how a single admixture pulse ~50-60kya produces the patchwork of introgressed segments we see today — the gloss undersells how contested the modelling still is.",
       "The workhorse method behind every ancient-DNA claim in this portfolio; I want to understand the coverage/damage tradeoffs, not cite 'shotgun sequencing' as a black box.",
       "Selection scans are how you'd actually test whether an introgressed variant was adaptive rather than just present — the missing link between my question and a real analysis.",
       "The formal foundation under every admixture-timing and phylogenetic claim I keep citing without deriving myself.",
       "The node that keeps me honest: 'percent Neanderthal' framing slides very easily into ancestry essentialism, and my own question is one bad headline away from doing exactly that.",
       "Linh's linguistics portfolio has a version of this same question from the other side — worth reading together, not separately.",
       "The theoretical bridge my whole portfolio is implicitly leaning on: genes and culture are not two separate evolutionary tracks."],
      { node: [7, 8], own: [1], link: [6] });

    // Bram — primatology: chimpanzee culture, teaching, and whether cooperation research travels across species
    const bram = mk("u-student2", "Bram: culture, teaching, and what counts as correction",
      ["primevo-topic-chimpanzee-cultural-diversity", "primevo-topic-cooperation-and-alliances", "primevo-topic-social-play-and-cooperation", "primevo-topic-primate-archaeology", "primevo-method-camera-trap-citizen-science", "primevo-theory-cooperation-and-conflict", "ccp-theory-theory-of-mind", "hbec-theory-teaching", "primevo-topic-attachment-in-primates"],
      [["self", "me"], ["question", "Do wild chimpanzees ever actively correct a juvenile's technique, or does the culture spread purely through exposure and practice, with 'teaching' added afterward by us?"], ["resource", "Whiten et al. (1999) Nature — Cultures in chimpanzees"], ["theory", "Natural pedagogy (Csibra & Gergely) — is ostensive, corrective teaching human-specific, or a matter of degree?"]],
      [[0, 9, "This is the empirical case that got me into the whole question: real behavioural variants across chimpanzee communities that look, from the outside, exactly like traditions.", "evidence"],
       [0, 10, "Cultural variation across communities is the evidence base my question is trying to explain a mechanism for — variation alone doesn't tell you how it spreads.", "evidence"],
       [7, 6, "Teaching, if it means intentionally structuring another's learning, plausibly requires some minimal mind-reading — that's the hinge connecting these two theory nodes.", "theory"],
       [10, 12, "Natural pedagogy is the strongest existing answer to my question, but it was built to explain human infants, not wild apes.", "theory"],
       [1, 5, "Alliance formation only makes sense against a background theory of when cooperation is stable versus when it tips into conflict.", "theory"],
       [4, 10, "Camera traps let me see repeated dyadic interactions without an observer changing the group's behaviour — the only realistic way I can imagine testing 'correction' rigorously.", "method"],
       [8, 9, "Comparing early attachment across primates is my check against over-reading intentionality into ordinary primate social development.", "comparative"]],
      ["Whiten 1999. My anchor.", "Alliance formation is the clearest case where 'cooperation' in primates has real fitness stakes, not just a nice story we tell about chimps.", "Interesting, thin notes so far.",
       "Primate archaeology gives me a materially dated record of tool traditions, which is as close as this field gets to a fossilised 'lesson plan'.",
       "The only method I can imagine actually testing repeated dyadic 'correction' events without an observer changing the group's behaviour.",
       "Formal vocabulary for when alliance-building shades into conflict — useful, but almost too general to test against my specific question.",
       "My hinge, basically: does teaching require reading intentions, or can culture spread through simpler biases without any mind-reading at all?",
       "Teaching, defined as intentionally structuring another's learning, plausibly needs some minimal mind-reading — exactly what the ToM node is about.",
       "Sofia's child-development portfolio has the human side of this; comparing early attachment across primates keeps me honest about what's actually human-specific."],
      { node: [0, 8], own: [1], link: [2] });
    bram.visibility = "module";

    // Linh — linguistics: whether phylogenetic method actually tests what it claims to, and the ethics of tree-thinking about living languages
    mk("u-student3", "Linh: trees, correlations, and what the method can actually claim",
      ["dlce-theory-language-evolution", "dlce-theory-phylogenetics", "dlce-topic-cultural-phylogenies", "dlce-topic-gene-language-correlation", "dlce-topic-coevolution-of-language-and-culture", "dlce-method-bayesian-phylogenetics", "dlce-scicomm-language-death-deficit-framing", "hbec-theory-cultural-transmission"],
      [["self", "me"], ["question", "Are Bayesian phylogenetic trees of languages recovering a real historical process, or just finding whatever tree-like structure exists in any correlated dataset?"], ["resource", "Gray & Atkinson (2003) Nature — Indo-European origin from Bayesian phylogenetics"], ["method", "Want to actually learn coalescent-style population models, to sanity-check what 'phylogenetic signal' means outside genetics"]],
      [[0, 8, "Everything else here is downstream of taking 'language evolves' as more than a metaphor.", "theory"],
       [5, 9, "Bayesian phylogenetics is exactly the method my question is skeptical of — I want to trust it, but I need to know what it would look like if the method were wrong.", "method"],
       [3, 9, "This node is where my skepticism about tree methods meets an even bigger claim — that language capacity itself has population-genetic correlates. If real, that raises the stakes on getting the tree method right.", "evidence"],
       [4, 7, "Co-evolution of language and culture is cultural-transmission theory applied specifically to linguistic variants — I don't think DLCE and HBEC are describing different processes here.", "theory"],
       [5, 11, "I keep hearing that phylogenetic methods borrowed their formal structure from population genetics; I want to trace that borrowing instead of taking it on faith.", "method"],
       [6, 9, "Treating a dying language as a data point in a tree model, without naming what its loss costs the community, is a framing choice — not a neutral analytical default.", "ethics"],
       [2, 1, "Cultural phylogenies is the applied case; phylogenetics theory is the machinery — I keep needing to go back and forth between the two.", "method"]],
      ["Language evolution is the umbrella everything else in this portfolio hangs off — but it's really several different claims (origins, change, diversification) bundled under one label.",
       "Standard toolkit, still learning it.", "Thin so far.",
       "Priya's genomics portfolio raises whether introgressed regulatory variants shaped language-relevant regions; this is the linguistics-side node for that exact question.",
       "The strongest general theory I have for why language and culture keep showing correlated structure without one simply causing the other.",
       "This is the actual machinery behind every 'language family tree' figure I've been citing without fully trusting.",
       "If the tree model quietly treats language death as mere data loss rather than a loss with real communities behind it, my formal question needs an ethical caveat too.",
       "Cultural transmission theory generalises the exact process (with modification, with selection among variants) that language change is supposed to be one instance of."],
      { node: [3, 6], link: [3] });

    // Amara — cross-cultural psychology: measurement invariance as the question underneath every cross-cultural finding
    const amara = mk("u-student4", "Amara: does the measure mean the same thing everywhere",
      ["ccp-theory-cultural-psychology", "ccp-theory-individual-differences-approach", "ccp-domain-cross-cultural-samples", "ccp-domain-global-child-study-network", "ccp-topic-cross-cultural-norm-enforcement", "ccp-topic-fairness", "hbec-method-cross-cultural-databases", "hbec-topic-cross-cultural-generalizability", "hbec-domain-kinship-systems"],
      [["self", "me — grew up across three countries, and got tired of hearing 'culture' used as if it were one variable"], ["question", "When a cross-cultural study finds a difference, how do we rule out that we mismeasured the construct in one of the cultures, rather than finding a genuine difference?"], ["resource", "Henrich, Heine & Norenzayan (2010) — The weirdest people in the world?"], ["method", "Measurement invariance testing — I can cite the concern, I can't yet run the actual statistical test for it"]],
      [[0, 9, "This field is the reason I stopped assuming 'the cross-cultural difference' means what a headline says it means.", "theory"],
       [2, 10, "If the samples aren't actually equivalent on the construct being measured, 'cross-cultural sample' is doing a lot of unexamined work in every finding built on it.", "method"],
       [6, 12, "Cross-cultural databases are where the measurement-invariance problem shows up at scale — I want to learn the actual test, not just gesture at the concern.", "method"],
       [1, 5, "An individual-differences approach to fairness would ask what varies within a culture, not just what differs between national averages.", "theory"],
       [7, 10, "This is, almost exactly, my question already stated as an open topic in the graph — which tells me the field hasn't closed this gap, not that I'm missing something obvious.", "theory"],
       [4, 8, "Norm enforcement that looks 'universal' in a lab task might just be reproducing whatever kinship-structured obligations already exist in that community.", "evidence"],
       [11, 10, "The WEIRD critique raised an institutional version of my exact question over a decade before I had it — worth reading as a citation, not a slogan.", "history"]],
      ["Cultural psychology takes seriously that cognition might not be substrate-independent of the culture doing the cognising — a bigger claim than most intro material lets on.",
       "An individual-differences approach is the honest alternative to comparing crude national averages, but it needs the measurement work to actually be trustworthy.",
       "Every claim in this portfolio depends on the sample being comparable across sites — this node is where that assumption either holds or doesn't.",
       "The infrastructure question, not the content question: what does it take to run the same developmental task across dozens of very different field sites and trust the result?",
       "Enforcement looks different depending on whether it's caregiver-mediated or peer-mediated, and I don't think the gloss distinguishes those yet.",
       "Fairness intuitions are the test case everyone reaches for first in cross-cultural work, probably because the paradigms travel well — which might be exactly the problem.",
       "Cross-cultural databases are only as good as the coding decisions behind them, and those decisions are usually made by people from one cultural background.",
       "This node is, almost word for word, my own question — either reassuring (I'm not asking something silly) or worrying (it's still open after decades of work).",
       "Kinship systems are the anthropological ground truth that a lot of psychology's 'cultural variables' are actually standing in for, often without saying so."],
      { node: [7], own: [2], link: [4] });

    // Sofia — child development: how much of early cooperation/fairness is culturally scaffolded vs. species-typical
    const sofia = mk("u-student5", "Sofia: sharing before you're taught to share",
      ["ccp-theory-developmental-psychology", "ccp-domain-children", "ccp-topic-cooperation-development", "ccp-topic-norm-acquisition", "ccp-domain-parenting", "hbec-topic-childrens-play", "hbec-topic-autonomy-socialization", "ccp-method-developmental-tasks", "primevo-topic-attachment-in-primates"],
      [["self", "me — interested in how much of 'moral development' is culturally scaffolded versus species-typical"], ["question", "Is children's spontaneous resource-sharing already present before explicit norm-teaching, or does it only appear once caregivers start teaching fairness directly?"], ["resource", "Rakoczy — developmental timeline for shared intentionality and norm understanding (followed up after a reviewer flagged it on a classmate's proposal)"], ["theory", "Ontogenetic ritualisation / scaffolded autonomy — is the HBEC autonomy-socialisation timeline universal, or does it vary by community?"]],
      [[0, 9, "This is the field-level version of the question I actually have about my own subject.", "theory"],
       [1, 10, "The children domain node is the population my question is actually about, not an abstraction.", "evidence"],
       [2, 3, "I think these are the same developmental process described from two angles — cooperating and following a norm are hard to cleanly separate in a 3-year-old.", "mechanism"],
       [5, 6, "A lot of what gets called 'autonomy socialisation' at the community level is visible first, informally, in what children are allowed to do during play.", "theory"],
       [8, 9, "Comparing my question to Bram's primate-attachment angle keeps me honest about what's actually developmentally distinctive to humans versus general to primates.", "comparative"],
       [4, 6, "Parenting style and community-level autonomy socialisation are probably measuring overlapping things at different grain sizes, and the current nodes don't make that overlap explicit.", "evidence"],
       [11, 10, "Rakoczy's developmental timeline is the piece I was missing to date when norm-sensitive sharing shows up relative to explicit teaching.", "evidence"]],
      ["Developmental psychology gives me the timeline; the harder question is how much of it is species-typical versus scaffolded by a specific kind of childhood.",
       "The domain node undersells how much 'children' as a research population varies by who is doing the caregiving, which is exactly what I want to compare.",
       "Cooperation development is where my question lives operationally — the actual behaviours (sharing, helping) I'd need to code and compare.",
       "Norm acquisition and cooperation development are often treated as two literatures; I think they're two names for overlapping developmental data.",
       "Parenting style is usually the implicit variable behind 'cultural differences' in child outcomes, but it's rarely measured with the same care as the outcome itself.",
       "Play is where a lot of the earliest cooperative and rule-following behaviour actually happens, informally, before anyone calls it 'teaching'.",
       "The HBEC node that most directly challenges a WEIRD-default developmental timeline — worth reading against my own question.",
       "The standard experimental tasks are well validated in a narrow set of populations; I don't yet know how much that limits what they can tell me.",
       "Bram's primatology portfolio has the comparative case; keeping his attachment question next to mine stops me from over-crediting humans with something more general to primates."],
      { node: [6, 8], own: [2], link: [4] });
    sofia.visibility = "module";

    // Amara's whole (private) portfolio, shared directly with Priya by name — the other access
    // pathway alongside per-item sharing and module-wide visibility.
    this.shares.push({ subgraph_id: amara.id, profile_id: "u-student", shared_at: day(9) });

    // portfolio-level critiques: only available in full on the two module-visible portfolios
    // (Bram's, Sofia's) — the three "private" portfolios above can only be reached item-by-item
    // through Commons, which is itself one of the sharpest UX gaps this data surfaces.
    this.reviews.push({ id: "r-demo-20", target_kind: "subgraph", proposal_id: null, node_id: null, edge_id: null, subgraph_id: bram.id, reviewer_id: "u-instructor", reviewer_username: "daniel", reviewer_active: true, rating: "accept",
      commentary_md: "Strong portfolio: the chimpanzee-culture evidence is doing real work, and the ToM–teaching connection is the right hinge to worry about. I'd push you to make the 'correction vs. exposure' distinction operational — what would count as evidence of intentional correction that isn't just increased attention after a juvenile's mistake? Your camera-trap method note is heading there but doesn't close the loop yet. Also: two of your annotations are still one-liners — they're the two nodes doing the least work in the argument, which is probably not a coincidence.", week: 4, created_at: day(9) });
    this.reviews.push({ id: "r-demo-21", target_kind: "subgraph", proposal_id: null, node_id: null, edge_id: null, subgraph_id: bram.id, reviewer_id: "u-student4", reviewer_username: "amara", reviewer_active: true, rating: "accept",
      commentary_md: "I don't have the primate background to judge the empirical claims, but from a measurement standpoint: 'active correction' is exactly the kind of construct that needs an explicit operational definition before any comparison (cross-study or cross-species) means anything. Your camera-trap idea is a good start on that.", week: 5, created_at: day(6) });
    this.reviews.push({ id: "r-demo-22", target_kind: "subgraph", proposal_id: null, node_id: null, edge_id: null, subgraph_id: sofia.id, reviewer_id: "u-instructor", reviewer_username: "daniel", reviewer_active: true, rating: "accept",
      commentary_md: "The cooperation-development/norm-acquisition overlap is the strongest single move in this portfolio. I'd want to see it cash out in a specific comparative study rather than staying at the level of 'these might be the same process' — which cross-cultural sharing paradigm would actually distinguish the two developmental accounts?", week: 5, created_at: day(8) });
    this.reviews.push({ id: "r-demo-23", target_kind: "subgraph", proposal_id: null, node_id: null, edge_id: null, subgraph_id: sofia.id, reviewer_id: "u-researcher", reviewer_username: "carla", reviewer_active: true, rating: "strongly_accept",
      commentary_md: "Following up the Rakoczy reference properly rather than leaving it as a comment on someone else's proposal is exactly the right instinct. If you want a specific comparative measure to anchor the timeline against, ask me about the Global Child Study Network's shared protocols before you commit to a design.", week: 6, created_at: day(5) });
    this.reviews.push({ id: "r-demo-24", target_kind: "subgraph", proposal_id: null, node_id: null, edge_id: null, subgraph_id: sofia.id, reviewer_id: "u-student3", reviewer_username: "linh", reviewer_active: true, rating: "accept",
      commentary_md: "This connects to something Amara raised in her own portfolio about measurement invariance: if 'autonomy socialisation' timelines are being compared across communities, I'd want to know the developmental tasks were actually validated in each site, not just translated.", week: 6, created_at: day(4) });
    this.helpful.push({ review_id: "r-demo-20", voter_id: "u-student2" }, { review_id: "r-demo-23", voter_id: "u-student5" }, { review_id: "r-demo-8", voter_id: "u-student4" });

    // ---- Commons space: the CCP module's own joint-curation space (0007) — a third thing
    // between one student's private portfolio and the institute-wide canonical graph; see
    // docs/kgdj/04-commons-design.md §1. Daniel (instructor) is the founding steward, the five
    // students are active contributors, Carla (a researcher outside the module) an invited
    // reviewer — exercising the "not auto-derived from module_members" role model (§5).
    const csId = "cs-ccp";
    this.commonsSpacesList.push({ id: csId, module_id: MODULE.id, label: "CCP commons", description: "Where the WiSe 2026/27 cohort jointly curates open questions, resources and connections that don't belong to any one portfolio.", join_policy: "open_to_module_members", created_by: "u-instructor", created_at: day(40), updated_at: day(40) });
    this.commonsParticipantsList.push(
      { commons_space_id: csId, profile_id: "u-instructor", role: "steward", status: "active", invited_by: null, joined_at: day(40), created_at: day(40) },
      { commons_space_id: csId, profile_id: "u-student", role: "contributor", status: "active", invited_by: "u-instructor", joined_at: day(38), created_at: day(38) },
      { commons_space_id: csId, profile_id: "u-student2", role: "contributor", status: "active", invited_by: "u-instructor", joined_at: day(38), created_at: day(38) },
      { commons_space_id: csId, profile_id: "u-student3", role: "contributor", status: "active", invited_by: "u-instructor", joined_at: day(38), created_at: day(38) },
      { commons_space_id: csId, profile_id: "u-student4", role: "contributor", status: "active", invited_by: "u-instructor", joined_at: day(38), created_at: day(38) },
      { commons_space_id: csId, profile_id: "u-student5", role: "contributor", status: "active", invited_by: "u-instructor", joined_at: day(38), created_at: day(38) },
      { commons_space_id: csId, profile_id: "u-researcher", role: "reviewer", status: "active", invited_by: "u-instructor", joined_at: day(35), created_at: day(36) },
    );
    const ci1 = "ci-1", ci2 = "ci-2", ci3 = "ci-3";
    this.commonsItemsList.push(
      { id: ci1, commons_space_id: csId, kind: "question", label: "Is cooperation unique in kind or only degree?", description: "Raised in discussion of Bram's and Amara's portfolios — does human cooperation differ from other primates categorically, or only in degree?", content: {}, status: "active", created_by: "u-student4", updated_by: "u-instructor", provenance: { source: "seed", approved_by: "u-instructor", approved_at: day(20) }, promoted_to_node_id: null, created_at: day(20), updated_at: day(20) },
      { id: ci2, commons_space_id: csId, kind: "resource", label: "Whiten et al. (1999) — Cultures in chimpanzees", description: "Nature. The empirical anchor for the cooperation-in-degree-vs-kind question above.", content: { doi: "10.1038/21415" }, status: "active", created_by: "u-student2", updated_by: "u-instructor", provenance: { source: "seed", approved_by: "u-instructor", approved_at: day(19) }, promoted_to_node_id: null, created_at: day(19), updated_at: day(19) },
      { id: ci3, commons_space_id: csId, kind: "theory", label: "Measurement invariance as a precondition for cross-cultural claims", description: "A finding cannot be judged culture-general or culture-specific without first establishing the measure means the same thing in every sample compared.", content: {}, status: "active", created_by: "u-student4", updated_by: "u-instructor", provenance: { source: "seed", approved_by: "u-instructor", approved_at: day(15) }, promoted_to_node_id: null, created_at: day(15), updated_at: day(15) },
    );
    this.commonsLinksList.push({ id: "cl-1", commons_space_id: csId, source_item_id: ci1, target_item_id: ci2, label: "The Whiten evidence is the comparison case for whether cooperation is unique to humans.", lens: "evidence", created_by: "u-student4", created_at: day(18) });
    // an open proposal, awaiting review — exercises the propose/review UI against a live target
    const cp1 = "cp-1";
    this.commonsProposalsList.push({ id: cp1, commons_space_id: csId, proposed_by: "u-student5", change_type: "add_item", target_item_id: null, target_link_id: null,
      payload: { kind: "question", label: "Does norm-sensitive sharing appear before or only after explicit fairness teaching?" }, rationale: "Follows directly from my own portfolio question — worth the group's attention since it bears on Amara's measurement-invariance item too.",
      status: "pending", review_restricted_to_role: null, submitted_at: day(2), updated_at: day(2), decided_at: null, result_item_id: null, result_link_id: null });
    this.commonsProposalCitations[cp1] = [];

    // ---- per-item comments (0008) on a shared item — Priya's and Linh's independent shares
    // both landed on gene-language-correlation (the "shared by multiple members" convergence
    // case above); a real comment thread on Priya's share is the concrete demonstration of
    // §4.2's "one comment on one idea" middle option, short of opening Priya's whole portfolio.
    const priyaSg = this.sgList.find((g) => g.owner_id === "u-student")!;
    const geneLang = bySlug("dlce-topic-gene-language-correlation");
    this.itemCommentsList.push(
      { id: nid("ic"), subgraph_id: priyaSg.id, item_kind: "node", node_id: geneLang.id, private_id: null, link_id: null, author_id: "u-student3", author_username: "linh", body_md: "I shared this exact node from the other side (linguistics) — did you mean the correlation itself, or the introgression-timing angle specifically?", created_at: day(6), updated_at: day(6) },
      { id: nid("ic"), subgraph_id: priyaSg.id, item_kind: "node", node_id: geneLang.id, private_id: null, link_id: null, author_id: "u-student", author_username: "priya", body_md: "Introgression-timing, mostly — I want to know whether any of the introgressed regulatory variants actually sit near the language-relevant regions Dediu & Ladd flagged, not the correlation as a whole.", created_at: day(5), updated_at: day(5) },
    );
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
  async signInWithEmail(_email: string) { this.signedIn = true; this.listeners.forEach((l) => l({ userId: this.me_.id, email: null })); return { sent: true, message: "Mock mode: signed in immediately, no code needed." }; }
  async verifyEmailCode(_email: string, _code: string) { return { ok: true, message: "" }; }
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
  private citationsFor(node_id: string): Citation[] {
    return this.nodeCitationLinks.filter((l) => l.node_id === node_id).map((l) => this.citations.find((c) => c.id === l.citation_id)).filter((c): c is Citation => !!c);
  }
  async node(id: string): Promise<NodeDetail> {
    const r = await this.data(); const node = r.nodes.find((n) => n.id === id); if (!node) throw new Error("node not found");
    return { node, citations: this.citationsFor(id), reviews: this.decorate(this.reviews.filter((x) => x.node_id === id)), summary: this.summarize("node", id),
      proposals: this.propList.filter((p) => p.target_node_id === id && ["pending", "under_review", "revision_requested"].includes(p.status)).map((p) => this.mask(p)),
      edges: r.edges.filter((e) => (e.source_node_id === id || e.target_node_id === id) && e.status !== "archived"), flags: this.flagList.filter((f) => f.target_id === id && !f.resolved_at),
      contentFlags: this.contentFlagList.filter((f) => f.target_id === id) };
  }
  async edge(id: string): Promise<EdgeDetail> {
    const r = await this.data(); const edge = r.edges.find((e) => e.id === id); if (!edge) throw new Error("edge not found");
    return { edge, source: r.nodes.find((n) => n.id === edge.source_node_id) || null, target: r.nodes.find((n) => n.id === edge.target_node_id) || null, reviews: this.decorate(this.reviews.filter((x) => x.edge_id === id)), summary: this.summarize("edge", id), citations: [],
      contentFlags: this.contentFlagList.filter((f) => f.target_id === id) };
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
    if (p.source_commons_item_id && !this.commonsItemsList.some((i) => i.id === p.source_commons_item_id && this.commonsIsParticipant(i.commons_space_id))) throw new Error("source_commons_item_id must reference a commons item you can see");
    const id = nid("p");
    this.propList.push({ id, proposer_id: this.me_.id, change_type: p.change_type, target_node_id: p.target_node_id ?? null, target_edge_id: p.target_edge_id ?? null, payload: p.payload, rationale: p.rationale, module_id: p.module_id ?? null, status: submit ? "pending" : "draft", submitter_anonymous: p.submitter_anonymous, submitted_at: submit ? now() : null, updated_at: now(), decided_at: null, result_node_id: null, result_edge_id: null, source_commons_item_id: p.source_commons_item_id ?? null });
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
      // link_commons_promotion() (0007): stamp the source commons item back once its "propose to canonical" lands.
      if (p.source_commons_item_id) { const src = this.commonsItemsList.find((i) => i.id === p.source_commons_item_id); if (src && !src.promoted_to_node_id) src.promoted_to_node_id = n.id; }
    } else if (p.change_type === "edit_node") {
      const n = r.nodes.find((x) => x.id === p.target_node_id)!; Object.assign(n, { label: pl.label ?? n.label, description: pl.description ?? n.description, type_code: pl.type_code ?? n.type_code, status: "canonical", version: n.version + 1, canonical_since: n.canonical_since || now(), provenance: { ...n.provenance, status: "canonical", approved_by: this.me_.id, approved_at: now(), assigned_by: "editorial-review" } }); p.result_node_id = n.id;
    } else if (p.change_type === "archive_node") { const n = r.nodes.find((x) => x.id === p.target_node_id)!; n.status = "archived"; }
    else if (p.change_type === "add_edge") { const e: GraphEdge = { id: nid("e"), source_node_id: pl.source_node_id, target_node_id: pl.target_node_id, relationship_code: pl.relationship_code, label: pl.label || null, weight: Number(pl.weight || 3), status: "canonical", provenance: { source: "kgdj", status: "canonical", proposal_id: p.id }, version: 1, created_by: p.proposer_id, created_at: now(), updated_at: now(), canonical_since: now() }; r.edges.push(e); p.result_edge_id = e.id; }
    else if (p.change_type === "delete_edge") { const e = r.edges.find((x) => x.id === p.target_edge_id)!; e.status = "archived"; }
    else if (p.change_type === "edit_edge") { const e = r.edges.find((x) => x.id === p.target_edge_id)!; Object.assign(e, { relationship_code: pl.relationship_code ?? e.relationship_code, label: pl.label ?? e.label, weight: pl.weight ? Number(pl.weight) : e.weight, status: "canonical", version: e.version + 1 }); }
  }
  async flags() { return this.flagList.filter((f) => !f.resolved_at); }
  async resolveFlag(id: string, note: string) { const f = this.flagList.find((x) => x.id === id)!; f.resolved_at = now(); f.note = note; }
  async contentFlagQueue() { return this.contentFlagList.filter((f) => !f.resolved_at); }
  async addContentFlag(target_kind: ContentFlagTargetKind, target_id: string, reason: string) {
    this.contentFlagList.push({ id: nid("cf"), target_kind, target_id, flagged_by: this.me_.id, flagged_by_username: this.me_.username, reason, created_at: now(), resolved_at: null, resolved_by: null, resolved_by_username: null, resolution_note: null });
  }
  async resolveContentFlag(id: string, note: string) {
    if (!this.isEditor()) throw new Error("Only editors resolve content flags");
    if (!note || note.trim().length < 3) throw new Error("A resolution needs a short note");
    const f = this.contentFlagList.find((x) => x.id === id)!; f.resolved_at = now(); f.resolved_by = this.me_.id; f.resolved_by_username = this.me_.username; f.resolution_note = note;
  }
  async withdrawContentFlag(id: string) {
    const f = this.contentFlagList.find((x) => x.id === id);
    if (!f || f.resolved_at) return;  // matches RLS: nothing to do once resolved
    if (f.flagged_by !== this.me_.id && !this.isEditor()) throw new Error("only the flagger or an editor may withdraw a flag");
    this.contentFlagList = this.contentFlagList.filter((x) => x.id !== id);
  }
  async citationCoverage(): Promise<CitationCoverage[]> {
    const byNode = new Map<string, string[]>();
    for (const l of this.nodeCitationLinks) (byNode.get(l.node_id) ?? byNode.set(l.node_id, []).get(l.node_id)!).push(l.citation_id);
    return [...byNode.entries()].map(([target_id, citIds]) => {
      const cits = citIds.map((id) => this.citations.find((c) => c.id === id)).filter((c): c is Citation => !!c);
      return { target_kind: "node" as const, target_id, total_citations: cits.length, verified_citations: cits.filter(isVerifiedCitation).length };
    });
  }
  async reviewQueue() {
    const proposals = await this.proposals({ status: ["pending", "under_review", "revision_requested"] });
    const summaries: Record<string, ReviewSummary> = {}; for (const p of proposals) { const s = this.summarize("proposal", p.id); if (s) summaries[p.id] = s; }
    return { proposals, summaries };
  }
  private isModuleMemberOf(module_id: string | null) { return !!module_id && this.members.some((m) => m.profile_id === this.me_.id && m.module_id === module_id); }
  private canSeeSubgraph(g: Subgraph) { return g.owner_id === this.me_.id || this.isInstructor() || this.shares.some((s) => s.subgraph_id === g.id && s.profile_id === this.me_.id) || g.visibility === "members" || (g.visibility === "module" && this.isModuleMemberOf(g.module_id)); }
  // Per-item "share with my module" (0006): the parent portfolio becomes visible (metadata
  // only, via this check) once at least one of its rows is shared — mirrors
  // kgdj.subgraph_visible_via_shared_item. Row-level filtering happens in subgraph() below.
  private visibleViaSharedItem(g: Subgraph) {
    if (!this.isModuleMemberOf(g.module_id)) return false;
    return this.sgNodes.some((n) => n.subgraph_id === g.id && n.shared) || this.privNodes.some((n) => n.subgraph_id === g.id && n.shared) || this.links.some((l) => l.subgraph_id === g.id && l.shared);
  }
  private owns(id: string) { const g = this.sgList.find((x) => x.id === id); if (!g || g.owner_id !== this.me_.id) throw new Error("not your portfolio"); return g; }
  async subgraphs() { return this.sgList.filter((g) => this.canSeeSubgraph(g) || this.visibleViaSharedItem(g)); }
  async subgraph(id: string): Promise<SubgraphDetail> {
    const subgraph = this.sgList.find((g) => g.id === id); if (!subgraph) throw new Error("portfolio not found or not visible");
    const full = this.canSeeSubgraph(subgraph);
    if (!full && !this.visibleViaSharedItem(subgraph)) throw new Error("portfolio not found or not visible");
    const canRow = (r: { shared: boolean }) => full || (r.shared && this.isModuleMemberOf(subgraph.module_id));
    return {
      subgraph, full_access: full,
      nodes: this.sgNodes.filter((n) => n.subgraph_id === id && canRow(n)), privateNodes: this.privNodes.filter((n) => n.subgraph_id === id && canRow(n)), links: this.links.filter((l) => l.subgraph_id === id && canRow(l)),
      reviews: full ? this.decorate(this.reviews.filter((r) => r.subgraph_id === id)) : [],
    };
  }
  async createSubgraph(title: string, module_id: string | null) { const g: Subgraph = { id: nid("g"), owner_id: this.me_.id, module_id, title, description: "", visibility: "private", last_checkpoint_week: null, created_at: now() }; this.sgList.push(g); return g; }
  async updateSubgraph(id: string, patch: { title?: string; description?: string; last_checkpoint_week?: number | null }) { Object.assign(this.owns(id), patch); }
  async deleteSubgraph(id: string) { this.owns(id); this.sgList = this.sgList.filter((g) => g.id !== id); this.sgNodes = this.sgNodes.filter((n) => n.subgraph_id !== id); this.privNodes = this.privNodes.filter((n) => n.subgraph_id !== id); this.links = this.links.filter((l) => l.subgraph_id !== id); }
  async forkNode(subgraph_id: string, node_id: string, annotation: string) { this.owns(subgraph_id); const ex = this.sgNodes.find((n) => n.subgraph_id === subgraph_id && n.node_id === node_id); if (ex) { if (annotation) { ex.custom_annotation = annotation; ex.updated_at = now(); } return; } this.sgNodes.push({ subgraph_id, node_id, custom_annotation: annotation, pos_x: null, pos_y: null, added_week: null, added_at: now(), updated_at: now(), shared: false, shared_at: null }); }
  async forkNodes(subgraph_id: string, items: ForkItem[]) { for (const it of items) await this.forkNode(subgraph_id, it.node_id, it.annotation); }
  async updateAnnotation(subgraph_id: string, node_id: string, annotation: string) { this.owns(subgraph_id); const n = this.sgNodes.find((x) => x.subgraph_id === subgraph_id && x.node_id === node_id); if (n) { n.custom_annotation = annotation; n.updated_at = now(); } }
  async removeNode(subgraph_id: string, node_id: string) { this.owns(subgraph_id); this.sgNodes = this.sgNodes.filter((x) => !(x.subgraph_id === subgraph_id && x.node_id === node_id)); this.links = this.links.filter((l) => l.subgraph_id !== subgraph_id || (l.from_node_id !== node_id && l.to_node_id !== node_id)); }
  async setNodeShared(subgraph_id: string, node_id: string, shared: boolean) { this.owns(subgraph_id); const n = this.sgNodes.find((x) => x.subgraph_id === subgraph_id && x.node_id === node_id); if (n) { n.shared = shared; n.shared_at = shared ? now() : null; } }
  async addPrivateNode(subgraph_id: string, node_type: PrivateNodeType, label: string, source: string | null) { this.owns(subgraph_id); const n: PrivateNode = { id: nid("pn"), subgraph_id, node_type, label, source, origin: null, created_week: null, pos_x: null, pos_y: null, created_at: now(), updated_at: now(), shared: false, shared_at: null }; this.privNodes.push(n); return n; }
  async updatePrivateNode(id: string, patch: { label?: string; source?: string | null; node_type?: PrivateNodeType }) { const n = this.privNodes.find((x) => x.id === id); if (!n) return; this.owns(n.subgraph_id); Object.assign(n, patch); n.updated_at = now(); }
  async removePrivateNode(id: string) { const n = this.privNodes.find((x) => x.id === id); if (!n) return; this.owns(n.subgraph_id); this.privNodes = this.privNodes.filter((x) => x.id !== id); this.links = this.links.filter((l) => l.from_private_id !== id && l.to_private_id !== id); }
  async setPrivateNodeShared(id: string, shared: boolean) { const n = this.privNodes.find((x) => x.id === id); if (!n) return; this.owns(n.subgraph_id); n.shared = shared; n.shared_at = shared ? now() : null; }
  async addLink(l: Omit<SubgraphLink, "id" | "created_at" | "updated_at" | "shared" | "shared_at">) { this.owns(l.subgraph_id); if (l.why.length < 10) throw new Error("The 'because' needs at least 10 characters"); this.links.push({ id: nid("l"), edge_id: null, created_at: now(), updated_at: now(), shared: false, shared_at: null, ...l }); }
  async addLinks(ls: Omit<SubgraphLink, "id" | "created_at" | "updated_at" | "shared" | "shared_at">[]) { for (const l of ls) await this.addLink(l); }
  async updateLink(id: string, patch: { why?: string; lens?: string | null }) { const l = this.links.find((x) => x.id === id); if (!l) return; this.owns(l.subgraph_id); if (patch.why != null && patch.why.length < 10) throw new Error("The 'because' needs at least 10 characters"); Object.assign(l, patch); l.updated_at = now(); }
  async removeLink(id: string) { const l = this.links.find((x) => x.id === id); if (!l) return; this.owns(l.subgraph_id); this.links = this.links.filter((x) => x.id !== id); }
  async setLinkShared(id: string, shared: boolean) { const l = this.links.find((x) => x.id === id); if (!l) return; this.owns(l.subgraph_id); l.shared = shared; l.shared_at = shared ? now() : null; }
  async savePositions(subgraph_id: string, positions: { node_id?: string; private_id?: string; x: number; y: number }[]) {
    for (const p of positions) { const t = p.node_id ? this.sgNodes.find((n) => n.subgraph_id === subgraph_id && n.node_id === p.node_id) : this.privNodes.find((n) => n.id === p.private_id); if (t) { t.pos_x = p.x; t.pos_y = p.y; } }
  }
  async setVisibility(subgraph_id: string, v: Visibility) { this.owns(subgraph_id).visibility = v; }
  async share(subgraph_id: string, username: string) { this.owns(subgraph_id); const p = EVERYONE.find((x) => x.username === username); if (!p) throw new Error("no such member"); this.shares = this.shares.filter((s) => !(s.subgraph_id === subgraph_id && s.profile_id === p.id)); this.shares.push({ subgraph_id, profile_id: p.id, shared_at: now() }); }
  async sharesFor(subgraph_id: string) {
    this.owns(subgraph_id);
    return this.shares.filter((s) => s.subgraph_id === subgraph_id).map((s) => ({ username: EVERYONE.find((p) => p.id === s.profile_id)?.username ?? s.profile_id, shared_at: s.shared_at })).sort((a, b) => a.shared_at.localeCompare(b.shared_at));
  }
  async unshare(subgraph_id: string, username: string) { this.owns(subgraph_id); const p = EVERYONE.find((x) => x.username === username); if (!p) return; this.shares = this.shares.filter((s) => !(s.subgraph_id === subgraph_id && s.profile_id === p.id)); }
  async importPortfolio(b: PortfolioBackup, title: string, module_id: string | null) {
    const r = await this.data(); const g = await this.createSubgraph(title, module_id);
    const bySlug = Object.fromEntries(r.nodes.map((n) => [n.slug, n.id])); const map: Record<string, string> = {};
    for (const n of b.nodes) { const id = (n.slug && bySlug[n.slug]) || (r.nodes.some((x) => x.id === n.node_id) ? n.node_id : null); if (!id) continue; map[n.node_id] = id; const at = n.added_at || now(); this.sgNodes.push({ subgraph_id: g.id, node_id: id, custom_annotation: n.custom_annotation || "", pos_x: n.pos_x, pos_y: n.pos_y, added_week: null, added_at: at, updated_at: n.updated_at || at, shared: false, shared_at: null }); }
    for (const p of b.private_nodes) { const np = await this.addPrivateNode(g.id, p.node_type, p.label, p.source); np.pos_x = p.pos_x; np.pos_y = p.pos_y; if (p.created_at) { np.created_at = p.created_at; np.updated_at = p.updated_at || p.created_at; } map[p.id] = np.id; }
    for (const l of b.links) { const f = l.from_node_id ? map[l.from_node_id] : map[l.from_private_id!], t = l.to_node_id ? map[l.to_node_id] : map[l.to_private_id!]; if (!f || !t) continue; const at = l.created_at || now(); this.links.push({ id: nid("l"), subgraph_id: g.id, from_node_id: l.from_node_id ? f : null, from_private_id: l.from_private_id ? f : null, to_node_id: l.to_node_id ? t : null, to_private_id: l.to_private_id ? t : null, why: l.why, lens: l.lens, created_week: null, edge_id: l.edge_id && r.edges.some((e) => e.id === l.edge_id) ? l.edge_id : null, created_at: at, updated_at: l.updated_at || at, shared: false, shared_at: null }); }
    return g;
  }
  async cohortStats(scope: "module" | "program" | "members", module_id?: string | null): Promise<CohortStats> {
    const r = await this.data(); const byId = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
    const ids = this.sgList.filter((g) => scope === "members" ? true : scope === "program" ? EVERYONE.find((p) => p.id === g.owner_id)?.role === "msc_student" : g.module_id === (module_id ?? MODULE.id)).map((g) => g.id);
    if (ids.length < 3) return { scope, n: ids.length, metrics: null, reason: "fewer than 3 portfolios in scope; no aggregates released" };
    const ms = ids.map((id) => portfolioMetrics({ subgraph: this.sgList.find((g) => g.id === id)!, nodes: this.sgNodes.filter((n) => n.subgraph_id === id), privateNodes: this.privNodes.filter((n) => n.subgraph_id === id), links: this.links.filter((l) => l.subgraph_id === id), reviews: this.reviews.filter((x) => x.subgraph_id === id), full_access: true }, byId));
    const metrics: CohortStats["metrics"] = {};
    for (const k of Object.keys(ms[0]) as MetricKey[]) { const vs = ms.map((m) => m[k]); metrics[k] = { mean: Math.round((vs.reduce((a, b) => a + b, 0) / vs.length) * 10) / 10, median: median(vs), p75: quantile(vs, 0.75), max: Math.max(...vs) }; }
    return { scope, n: ids.length, metrics };
  }
  async commonsItems(module_id?: string | null): Promise<CommonsItem[]> {
    const r = await this.data(); const byId = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
    const myModuleIds = new Set(this.members.filter((m) => m.profile_id === this.me_.id).map((m) => m.module_id));
    const relevant = this.sgList.filter((g) => g.module_id && myModuleIds.has(g.module_id) && (!module_id || g.module_id === module_id));
    const label = (nid: string | null, pid: string | null) => nid ? byId[nid]?.label ?? nid : (this.privNodes.find((p) => p.id === pid)?.label ?? pid ?? "?");
    const out: CommonsItem[] = [];
    for (const g of relevant) {
      const owner = EVERYONE.find((p) => p.id === g.owner_id)?.username ?? "member";
      for (const n of this.sgNodes.filter((x) => x.subgraph_id === g.id && x.shared)) { const node = byId[n.node_id]; out.push({ kind: "node", subgraph_id: g.id, subgraph_title: g.title, owner_username: owner, module_name: MODULE.name, shared_at: n.shared_at || n.added_at, label: node?.label ?? n.node_id, sub_label: n.custom_annotation || undefined, node_id: n.node_id }); }
      for (const p of this.privNodes.filter((x) => x.subgraph_id === g.id && x.shared)) out.push({ kind: "private_node", subgraph_id: g.id, subgraph_title: g.title, owner_username: owner, module_name: MODULE.name, shared_at: p.shared_at || p.created_at, label: p.label, sub_label: p.node_type, private_id: p.id });
      for (const l of this.links.filter((x) => x.subgraph_id === g.id && x.shared)) out.push({ kind: "link", subgraph_id: g.id, subgraph_title: g.title, owner_username: owner, module_name: MODULE.name, shared_at: l.shared_at || l.created_at, label: l.why, sub_label: `${label(l.from_node_id, l.from_private_id)} → ${label(l.to_node_id, l.to_private_id)}`, link_id: l.id });
    }
    return out.sort((a, b) => b.shared_at.localeCompare(a.shared_at));
  }
  // ---------------------------------------------------------------- per-item comments (0008)
  // kgdj.can_see_item_comment(): full access to the subgraph, or that ONE row is shared and the
  // viewer is a module member — the exact same rule that already gates the item's own read policy.
  private canSeeItem(t: ItemCommentTarget) {
    const g = this.sgList.find((x) => x.id === t.subgraph_id); if (!g) return false;
    if (this.canSeeSubgraph(g)) return true;
    if (!this.isModuleMemberOf(g.module_id)) return false;
    if (t.item_kind === "node") return this.sgNodes.some((n) => n.subgraph_id === t.subgraph_id && n.node_id === t.node_id && n.shared);
    if (t.item_kind === "private_node") return this.privNodes.some((n) => n.id === t.private_id && n.shared);
    return this.links.some((l) => l.id === t.link_id && l.shared);
  }
  async itemComments(target: ItemCommentTarget): Promise<ItemComment[]> {
    if (!this.canSeeItem(target)) throw new Error("item not found or not visible");
    return this.itemCommentsList
      .filter((c) => c.subgraph_id === target.subgraph_id && c.item_kind === target.item_kind && c.node_id === (target.node_id ?? null) && c.private_id === (target.private_id ?? null) && c.link_id === (target.link_id ?? null))
      .map((c) => ({ ...c, author_username: this.withUsername(c.author_id) }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  async addItemComment(target: ItemCommentTarget, body_md: string) {
    if (!body_md.trim()) throw new Error("A comment needs some text");
    if (!this.canSeeItem(target)) throw new Error("new row violates row-level security policy (item not visible)");
    this.itemCommentsList.push({ id: nid("ic"), subgraph_id: target.subgraph_id, item_kind: target.item_kind, node_id: target.node_id ?? null, private_id: target.private_id ?? null, link_id: target.link_id ?? null, author_id: this.me_.id, body_md, created_at: now(), updated_at: now() });
  }
  async removeItemComment(id: string) {
    const c = this.itemCommentsList.find((x) => x.id === id); if (!c) return;
    if (c.author_id !== this.me_.id && !this.isEditor()) throw new Error("new row violates row-level security policy (author or editor only)");
    this.itemCommentsList = this.itemCommentsList.filter((x) => x.id !== id);
  }
  // ---------------------------------------------------------------- commons spaces (0007)
  private myCommonsParticipant(space_id: string) { return this.commonsParticipantsList.find((p) => p.commons_space_id === space_id && p.profile_id === this.me_.id); }
  private commonsIsParticipant(space_id: string) { const p = this.myCommonsParticipant(space_id); return !!p && p.status === "active"; }
  private commonsRoleAtLeast(space_id: string, need: CommonsRole) {
    const p = this.myCommonsParticipant(space_id); if (!p || p.status !== "active") return false;
    const order: CommonsRole[] = ["viewer", "contributor", "reviewer", "steward"];
    return order.indexOf(p.role) >= order.indexOf(need);
  }
  private canSeeCommonsSpace(s: CommonsSpace) { return !!this.myCommonsParticipant(s.id) || (s.module_id != null && this.isModuleMemberOf(s.module_id)) || this.isEditor(); }
  private withUsername(id: string | null) { return id ? EVERYONE.find((p) => p.id === id)?.username ?? null : null; }
  async commonsSpaces(): Promise<CommonsSpace[]> {
    await this.data();
    return this.commonsSpacesList.filter((s) => this.canSeeCommonsSpace(s)).map((s) => ({ ...s, module_name: s.module_id ? MODULE.name : null }));
  }
  async commonsSpace(id: string): Promise<CommonsSpaceDetail> {
    await this.data();
    const space = this.commonsSpacesList.find((s) => s.id === id); if (!space) throw new Error("commons space not found or not visible");
    if (!this.canSeeCommonsSpace(space)) throw new Error("commons space not found or not visible");
    const canParticipate = this.commonsIsParticipant(id) || this.isEditor();
    const items = canParticipate ? this.commonsItemsList.filter((i) => i.commons_space_id === id).map((i) => ({ ...i, created_by_username: this.withUsername(i.created_by) })) : [];
    const links = canParticipate ? this.commonsLinksList.filter((l) => l.commons_space_id === id) : [];
    const participants = this.commonsParticipantsList.filter((p) => p.commons_space_id === id).map((p) => ({ ...p, username: this.withUsername(p.profile_id) ?? p.profile_id }));
    const myParticipant = participants.find((p) => p.profile_id === this.me_.id) ?? null;
    return { space: { ...space, module_name: space.module_id ? MODULE.name : null }, myParticipant, participants, items, links };
  }
  async createCommonsSpace(input: CommonsSpaceInput) {
    const id = nid("cs");
    const space: CommonsSpace = { id, module_id: input.module_id ?? null, label: input.label, description: input.description ?? "", join_policy: input.join_policy, created_by: this.me_.id, created_at: now(), updated_at: now() };
    this.commonsSpacesList.push(space);
    // commons_space_bootstrap_steward() (0007): the creator becomes the founding steward.
    this.commonsParticipantsList.push({ commons_space_id: id, profile_id: this.me_.id, role: "steward", status: "active", invited_by: null, joined_at: now(), created_at: now() });
    return space;
  }
  async joinCommonsSpace(space_id: string, role: "viewer" | "contributor" = "contributor") {
    const space = this.commonsSpacesList.find((s) => s.id === space_id); if (!space) throw new Error("commons space not found");
    if (this.myCommonsParticipant(space_id)) throw new Error("already a participant");
    let status: CommonsParticipantStatus;
    if (space.join_policy === "open_to_module_members") {
      if (!this.isModuleMemberOf(space.module_id)) throw new Error("new row violates row-level security policy (not a member of this space's module)");
      status = "active";
    } else if (space.join_policy === "request_approval") status = "requested";
    else throw new Error("new row violates row-level security policy (this space is invite only)");
    this.commonsParticipantsList.push({ commons_space_id: space_id, profile_id: this.me_.id, role, status, invited_by: null, joined_at: status === "active" ? now() : null, created_at: now() });
  }
  async leaveCommonsSpace(space_id: string) { this.commonsParticipantsList = this.commonsParticipantsList.filter((p) => !(p.commons_space_id === space_id && p.profile_id === this.me_.id)); }
  async setCommonsParticipant(space_id: string, profile_id: string, patch: { role?: CommonsRole; status?: CommonsParticipantStatus }) {
    if (!this.commonsRoleAtLeast(space_id, "steward") && !this.isEditor()) throw new Error("new row violates row-level security policy (stewards only)");
    const p = this.commonsParticipantsList.find((x) => x.commons_space_id === space_id && x.profile_id === profile_id); if (!p) throw new Error("not a participant");
    if (patch.role) p.role = patch.role;
    if (patch.status) { p.status = patch.status; if (patch.status === "active" && !p.joined_at) p.joined_at = now(); }
  }
  async removeCommonsParticipant(space_id: string, profile_id: string) {
    if (profile_id !== this.me_.id && !this.commonsRoleAtLeast(space_id, "steward") && !this.isEditor()) throw new Error("new row violates row-level security policy");
    this.commonsParticipantsList = this.commonsParticipantsList.filter((p) => !(p.commons_space_id === space_id && p.profile_id === profile_id));
  }
  async commonsProposals(space_id: string) {
    if (!this.commonsIsParticipant(space_id) && !this.isEditor()) throw new Error("commons space not found or not visible");
    return this.commonsProposalsList.filter((p) => p.commons_space_id === space_id).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }
  async commonsProposal(id: string): Promise<CommonsProposalDetail> {
    const p = this.commonsProposalsList.find((x) => x.id === id); if (!p) throw new Error("commons proposal not found");
    if (!this.commonsIsParticipant(p.commons_space_id) && !this.isEditor()) throw new Error("commons space not found or not visible");
    const citations = (this.commonsProposalCitations[id] || []).map((c) => this.citations.find((x) => x.id === c)!).filter(Boolean);
    const reviews = this.commonsReviewsList.filter((r) => r.proposal_id === id).map((r) => ({ ...r, reviewer_username: this.withUsername(r.reviewer_id) }));
    const decisions = this.commonsDecisionsList.filter((d) => d.proposal_id === id);
    const targetItem = p.target_item_id ? this.commonsItemsList.find((i) => i.id === p.target_item_id) ?? null : null;
    const targetLink = p.target_link_id ? this.commonsLinksList.find((l) => l.id === p.target_link_id) ?? null : null;
    return { proposal: p, citations, reviews, decisions, targetItem, targetLink, proposedByUsername: this.withUsername(p.proposed_by) };
  }
  async createCommonsProposal(p: CommonsProposalInput, submit: boolean) {
    if (!this.commonsRoleAtLeast(p.commons_space_id, "contributor")) throw new Error("new row violates row-level security policy (contributor role required)");
    if (submit && p.rationale.length < 10) throw new Error("A commons proposal needs a short rationale before submission");
    if (submit && p.change_type === "add_item" && (!("kind" in p.payload) || !("label" in p.payload))) throw new Error("add_item payload needs at least {kind, label}");
    if (submit && p.change_type === "add_link" && (!("source_item_id" in p.payload) || !("target_item_id" in p.payload) || !("label" in p.payload))) throw new Error("add_link payload needs {source_item_id, target_item_id, label}");
    const id = nid("cp");
    this.commonsProposalsList.push({ id, commons_space_id: p.commons_space_id, proposed_by: this.me_.id, change_type: p.change_type, target_item_id: p.target_item_id ?? null, target_link_id: p.target_link_id ?? null,
      payload: p.payload, rationale: p.rationale, status: submit ? "pending" : "draft", review_restricted_to_role: p.review_restricted_to_role ?? null,
      submitted_at: submit ? now() : null, updated_at: now(), decided_at: null, result_item_id: null, result_link_id: null });
    this.commonsProposalCitations[id] = p.citation_ids ?? [];
    return id;
  }
  async commonsReview(r: CommonsReviewInput) {
    const p = this.commonsProposalsList.find((x) => x.id === r.proposal_id); if (!p) throw new Error("commons proposal not found");
    if (p.proposed_by === this.me_.id) throw new Error("Conflict of interest: a proposer cannot review their own commons proposal");
    if (!["pending", "under_review"].includes(p.status)) throw new Error(`Commons proposal is not open for review (status ${p.status})`);
    if (!this.commonsIsParticipant(p.commons_space_id)) throw new Error("new row violates row-level security policy (must be an active participant)");
    if (p.review_restricted_to_role && !this.commonsRoleAtLeast(p.commons_space_id, p.review_restricted_to_role)) throw new Error("new row violates row-level security policy (restricted to reviewers)");
    if (this.commonsReviewsList.some((x) => x.proposal_id === r.proposal_id && x.reviewer_id === this.me_.id)) throw new Error("You already reviewed this proposal");
    this.commonsReviewsList.push({ id: nid("cr"), proposal_id: r.proposal_id, reviewer_id: this.me_.id, reviewer_username: this.me_.username, rating: r.rating, commentary_md: r.commentary_md, created_at: now(), updated_at: now() });
    if (p.status === "pending") p.status = "under_review";
  }
  async commonsReviewsFor(proposal_id: string) { return this.commonsReviewsList.filter((r) => r.proposal_id === proposal_id).map((r) => ({ ...r, reviewer_username: this.withUsername(r.reviewer_id) })); }
  async commonsDecide(d: CommonsDecisionInput) {
    const p = this.commonsProposalsList.find((x) => x.id === d.proposal_id); if (!p) throw new Error("commons proposal not found");
    if (!this.commonsRoleAtLeast(p.commons_space_id, "steward") && !this.isEditor()) throw new Error("new row violates row-level security policy (stewards only)");
    if (!["pending", "under_review", "revision_requested"].includes(p.status)) throw new Error(`Commons proposal is not decidable in status ${p.status}`);
    this.commonsDecisionsList.push({ id: nid("cd"), proposal_id: d.proposal_id, decided_by: this.me_.id, outcome: d.outcome, rationale: d.rationale ?? "", decided_at: now() });
    const pl = p.payload as Record<string, unknown>;
    if (d.outcome === "reject") { p.status = "rejected"; p.decided_at = now(); return; }
    if (d.outcome === "request_revision") { p.status = "revision_requested"; p.decided_at = null; return; }
    if (d.outcome === "archive") {
      if (!p.target_item_id) throw new Error("archive outcome needs a proposal with a target item");
      const item = this.commonsItemsList.find((i) => i.id === p.target_item_id)!; item.status = "archived"; item.updated_by = this.me_.id; item.updated_at = now();
      p.status = "approved"; p.decided_at = now(); p.result_item_id = p.target_item_id; return;
    }
    // outcome = approve
    if (p.change_type === "add_item") {
      const item: CommonsItemT = { id: nid("ci"), commons_space_id: p.commons_space_id, kind: pl.kind as PrivateNodeType, label: pl.label as string, description: (pl.description as string) ?? "",
        content: (pl.content as Record<string, unknown>) ?? {}, status: "active", created_by: p.proposed_by!, updated_by: this.me_.id,
        provenance: { proposal_id: p.id, approved_by: this.me_.id, approved_at: now() }, promoted_to_node_id: null, created_at: now(), updated_at: now() };
      this.commonsItemsList.push(item); p.result_item_id = item.id;
    } else if (p.change_type === "edit_item") {
      const item = this.commonsItemsList.find((i) => i.id === p.target_item_id)!;
      item.label = (pl.label as string) ?? item.label; item.description = (pl.description as string) ?? item.description;
      item.content = { ...item.content, ...((pl.content as Record<string, unknown>) ?? {}) }; item.updated_by = this.me_.id; item.updated_at = now();
      p.result_item_id = item.id;
    } else if (p.change_type === "archive_item") {
      const item = this.commonsItemsList.find((i) => i.id === p.target_item_id)!; item.status = "archived"; item.updated_by = this.me_.id; item.updated_at = now(); p.result_item_id = item.id;
    } else if (p.change_type === "add_link") {
      const link: CommonsLink = { id: nid("cl"), commons_space_id: p.commons_space_id, source_item_id: pl.source_item_id as string, target_item_id: pl.target_item_id as string, label: pl.label as string, lens: (pl.lens as string) ?? null, created_by: p.proposed_by!, created_at: now() };
      this.commonsLinksList.push(link); p.result_link_id = link.id;
    } else if (p.change_type === "edit_link") {
      const link = this.commonsLinksList.find((l) => l.id === p.target_link_id)!; link.label = (pl.label as string) ?? link.label; link.lens = (pl.lens as string) ?? link.lens; p.result_link_id = link.id;
    } else if (p.change_type === "archive_link") {
      this.commonsLinksList = this.commonsLinksList.filter((l) => l.id !== p.target_link_id); p.result_link_id = p.target_link_id;
    }
    p.status = "approved"; p.decided_at = now();
  }
  private rowFor(p: Profile): LeaderboardRow {
    const r = this.raw!; const byId = Object.fromEntries(r.nodes.map((n) => [n.id, n]));
    const mine = this.sgList.filter((g) => g.owner_id === p.id).map((g) => g.id);
    const sn = this.sgNodes.filter((n) => mine.includes(n.subgraph_id)), pn = this.privNodes.filter((n) => mine.includes(n.subgraph_id)), ls = this.links.filter((l) => mine.includes(l.subgraph_id));
    const rv = this.reviews.filter((x) => x.reviewer_id === p.id);
    const day = (iso: string) => iso.slice(0, 10);
    const days = new Set<string>(); ls.forEach((l) => days.add(day(l.created_at))); pn.forEach((n) => days.add(day(n.created_at))); sn.forEach((n) => days.add(day(n.added_at))); rv.forEach((x) => days.add(day(x.created_at)));
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
      lenses_used: new Set(ls.map((l) => (l.lens || "").trim()).filter(Boolean)).size, questions_raised: pn.filter((n) => n.node_type === "question").length, resources_added: pn.filter((n) => n.node_type === "resource").length, active_days: days.size };
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
