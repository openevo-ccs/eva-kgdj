-- The 17 real ccp_module nodes/links referenced by the crosswalk files (docs/kgdj/
-- 17-ccp-module-core-bridge.md §5) but never imported into KGDJ's own ccp_module
-- seed. Real content pulled directly from ask_eva's ccp_module mirror (content-all.json
-- for the 3 named-researcher nodes; the theory/*.json theory-space files for the other
-- 9), not summarized from the crosswalk labels alone.
--
-- Two of these (hereditarian-hypothesis, population-genetics-consensus) reconstruct a
-- genuinely contested topic -- imported as a PAIR, matching how ccp_module's own authors
-- built them (position and real counter-position, not one side alone), using the
-- already-reviewed edge wording from ccp-module-genetics-scicomm.yml verbatim (a file
-- whose own header explains it was 'handled with extra care', and which lab-manager
-- already reviewed once per docs/mpi-eva-graph-coherence-review-2026-09-09.md Part 2.7).
-- Both source records are explicitly marked 'author-draft... not reviewed by any MPI-EVA
-- researcher' in ccp_module itself -- carried into this import's own provenance, not
-- smoothed over. status stays 'proposed' here exactly as everywhere else in this graph.
--
-- New node_type 'person' added for the three named researchers (Boesch, Luncz,
-- McElreath) -- a genuinely different kind of node than concept/theory/topic, and
-- kgdj.node_types is a plain reference table (like departments), not a hardcoded enum,
-- so this is a safe, low-risk addition, not a schema migration.

begin;

insert into kgdj.node_types (code, label, description, sort_order) values
  ('person', 'Person', 'A named individual -- a researcher, historian, or similar real person referenced by the graph', 95)
on conflict (code) do nothing;

insert into kgdj.nodes (slug, label, type_code, description, department_id, provenance)
select 'ccpm-boesch', 'Christophe Boesch', 'person', 'Founding director of MPI-EVA''s Department of Primatology (PrimEvo''s historical predecessor), now emeritus. Founder and long-time director of the Taï Chimpanzee Project in Côte d''Ivoire, and co-founder of the Wild Chimpanzee Foundation.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Content (eva-mpi-eva-connections cluster); imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported"}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-luncz', 'Lydia Luncz', 'person', 'Head of the Technological Primates research group at MPI-EVA (a Lise Meitner independent group, resident at MPI-EVA since 2020). Applies archaeological excavation and material-analysis techniques to primates'' durable tool remains -- primate archaeology -- across wild chimpanzees, macaques, capuchins, and early hominin sites.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Content (eva-mpi-eva-connections cluster); imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported"}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-mcelreath', 'Richard McElreath', 'person', 'Director of MPI-EVA''s Department of Human Behavior, Ecology and Culture, which he founded on joining the institute in 2015. Research on cultural evolution, social learning, and the evolutionary ecology of human behavior; author of Statistical Rethinking, a widely used Bayesian-statistics textbook.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Content (eva-mpi-eva-connections cluster); imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported"}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-cognitive-mechanism-tomm-module', 'Theory of Mind Mechanism (ToMM)', 'concept', 'An innate, modular cognitive mechanism proposed to compute mental-state attributions, maturing rather than being learned from scratch -- the ''innate module'' side of the innate-module-vs-constructed-theory debate within theory-of-mind research.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Theory/theory-of-mind; imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported"}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-construct-domestication-secondary-modifier', 'Domestication/Self-Domestication (Secondary Modifier, Not Primary Driver)', 'concept', 'Argues cuteness-related cues act as a secondary modifier of domestication once tolerance-based sociality is already established, not as a primary driver -- explicitly hedged as speculative and secondary by its own authors, worth stating precisely so a commentary doesn''t over-attack a stronger claim than the one actually made.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Theory/cuteness; imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported"}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-construct-non-global-north-generalizability', 'Hunter-Gatherer Ethnography Is Not a Neutral Proxy for Ancestral Cognition', 'concept', 'A methodological critique construct: hunter-gatherer ethnography is sometimes invoked as if it were a neutral window onto ancestral human cognition, and cross-cultural variation is sometimes cited rhetorically without naming this limitation.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Theory/cuteness (status: proposed in source, a critique-in-progress); imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported"}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-moderator-population-ancestry-cluster', 'US Social-Racial Categories Treated as Genetically Coherent Ancestry Clusters', 'concept', 'The assumption, central to the hereditarian hypothesis, that socially-defined US racial categories correspond closely enough to genetically coherent ancestry populations for a group-level genetic comparison to be well-formed -- precisely the collapse-of-clinal-variation-into-discrete-categories that dag-scicomm-race-and-ancestry-framing''s guidance warns against.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Theory/genetics; imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported. Race/ancestry/IQ topic -- see dag-scicomm-race-and-ancestry-framing before using in public-facing material."}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-cue-clinal-genetic-variation', 'Clinal, Predominantly Within-Population Human Genetic Variation', 'concept', 'The empirical finding that human genetic variation is predominantly clinal and within-population (Lewontin 1972''s ~85% within-group apportionment, and its modern genomic replications), not organized into discrete clusters matching socially-defined racial categories.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Theory/genetics; imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported. Race/ancestry/IQ topic -- see dag-scicomm-race-and-ancestry-framing before using in public-facing material."}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-hereditarian-hypothesis', 'The Hereditarian Hypothesis of Group Cognitive-Ability Differences', 'theory', 'The claim, held by Jensen, Herrnstein, Murray, Rushton and Cofnas across more than 50 years, that a substantial portion of the mean IQ/cognitive-test-performance difference between socially-defined racial groups is caused by genetic differences between those groups. Reconstructed here as its proponents have actually argued it, not as a caricature -- the position does not deny environmental contribution, and Jensen''s own original claim was explicitly probabilistic (''some portion,'' not ''the entirety''). Primary sources: Jensen (1969), Herrnstein & Murray (1994), Rushton & Jensen (2005), Cofnas (2020). Presented alongside its real counter-position (population-genetics-consensus), not alone. Author-draft in its source repo -- not yet reviewed by any MPI-EVA researcher.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Theory/genetics; imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported. Contested topic, reconstructed fairly per its source record''s own account -- see dag-scicomm-race-and-ancestry-framing. Source record explicitly marked author-draft, unreviewed by any MPI-EVA researcher."}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-population-genetics-consensus', 'Population-Genetics and Behavior-Genetics Consensus: Heritability and Group Differences Are Logically Independent', 'theory', 'The mainstream population- and behavior-genetics position (Lewontin, Turkheimer, Nisbett; ASHG 2018 and AAPA 2019 consensus statements): IQ and most complex behavioral traits are substantially heritable within populations (not disputed), and within-population heritability places no logical constraint on the cause of a between-population mean difference on the same trait. Affirms real, substantial heritability and rejects only the further inferential step the hereditarian hypothesis makes. Author-draft in its source repo -- not yet reviewed by any MPI-EVA researcher.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Theory/genetics; imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported. This institute''s own dag-scicomm-race-and-ancestry-framing node independently states the same race-cluster-vs-cline synthesis. Source record explicitly marked author-draft, unreviewed by any MPI-EVA researcher."}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-output-investment-behavior', 'Engagement, Teaching, Play, Nurturing', 'concept', 'The caregiver-behavior output of the cuteness investment mechanism: engagement, teaching, play, and nurturing.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Theory/cuteness; imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported"}'::jsonb
from kgdj.departments d where d.code = 'ccp'
union all
select 'ccpm-moderator-cultural-ecology', 'Socioecological Conditions (Extrinsic Mortality, Social Complexity, Childhood Length)', 'concept', 'Socioecological conditions that gate how strongly the cuteness investment mechanism operates: in high-mortality, resource-scarce environments cuteness responsiveness is predicted to be de-emphasized or suppressed; in lower-mortality, more socially complex, longer-childhood ecologies the payoff for developmental investment increases.', d.id, '{"source": "ccp_module (via ask_eva mirror)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module/Theory/cuteness; imported into KGDJ 2026-09-10, referenced by crosswalk files but never previously imported"}'::jsonb
from kgdj.departments d where d.code = 'ccp'
on conflict (slug) do nothing;

insert into kgdj.edges (source_node_id, target_node_id, relationship_code, label, provenance)
select s.id, t.id, 'relates-to', 'Four decades of wild chimpanzee behavioral fieldwork at Taï', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-boesch' and t.slug = 'primevo-domain-chimpanzees'
union all
select s.id, t.id, 'relates-to', 'Co-founded the Panda 100 excavation program with Luncz, an early instance of primate archaeology', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-boesch' and t.slug = 'primevo-method-primate-archaeology-excavation'
union all
select s.id, t.id, 'relates-to', 'Founded and long-directed the Taï Chimpanzee Project, still active today', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-boesch' and t.slug = 'fieldsite-tai-national-park'
union all
select s.id, t.id, 'relates-to', 'Fieldwork on the same Taï chimpanzee population, alongside Thailand macaques and Brazilian capuchins', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-luncz' and t.slug = 'fieldsite-tai-national-park'
union all
select s.id, t.id, 'relates-to', 'Head of the Technological Primates group; primate archaeology (excavation of wild tool-use sites) is her defining method', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-luncz' and t.slug = 'primevo-method-primate-archaeology-excavation'
union all
select s.id, t.id, 'relates-to', 'Collaborated on the Panda 100 chimpanzee archaeology excavation project', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-boesch' and t.slug = 'ccpm-luncz'
union all
select s.id, t.id, 'relates-to', 'Author of Statistical Rethinking, the field''s widely used Bayesian-statistics text and course', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-mcelreath' and t.slug = 'hbec-method-bayesian-inference'
union all
select s.id, t.id, 'relates-to', 'Founding director of HBEC (2015-); cultural evolution is the department''s own core theoretical focus', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-mcelreath' and t.slug = 'hbec-theory-cultural-evolution'
union all
select s.id, t.id, 'relates-to', 'One proposed mechanism for how theory of mind is implemented -- the innate-modular side of a live debate within this broader theory', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-cognitive-mechanism-tomm-module' and t.slug = 'ccp-theory-theory-of-mind'
union all
select s.id, t.id, 'relates-to', 'Argues cuteness-related cues act as a secondary modifier of domestication once tolerance-based sociality is established, not a primary driver -- explicitly hedged as speculative by its own authors', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-construct-domestication-secondary-modifier' and t.slug = 'dag-domain-domestication'
union all
select s.id, t.id, 'relates-to', 'A methodological critique of exactly this method: hunter-gatherer ethnography is not a neutral proxy for ancestral cognition', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-construct-non-global-north-generalizability' and t.slug = 'hbec-method-ethnography'
union all
select s.id, t.id, 'relates-to', 'The empirical finding (clinal, predominantly within-population variation) this construct names is exactly what DAG''s own population-genetics theory formalizes', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-cue-clinal-genetic-variation' and t.slug = 'dag-theory-population-genetics'
union all
select s.id, t.id, 'relates-to', 'A minority position within population/behavior genetics, reconstructed by ccp_module in full historical form (not as caricature) for careful academic treatment. Linked here only because it is the kind of contested claim careful science communication has to handle deliberately, which is what this scicomm node''s guidance is for -- this edge does not assert, and the two records do not agree, that the hypothesis itself is an instance of the risk the node names', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-hereditarian-hypothesis' and t.slug = 'dag-scicomm-race-and-ancestry-framing'
union all
select s.id, t.id, 'relates-to', 'Extrinsic mortality, resource scarcity, and childhood length -- this construct''s own named moderators -- are exactly life-history theory''s core variables', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-moderator-cultural-ecology' and t.slug = 'inst-theory-life-history-theory'
union all
select s.id, t.id, 'applies-to', 'Treating socially-defined racial categories as genetically coherent ancestry clusters is precisely the collapse-of-clinal-variation-into-discrete-categories risk this scicomm node names', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-moderator-population-ancestry-cluster' and t.slug = 'dag-scicomm-race-and-ancestry-framing'
union all
select s.id, t.id, 'relates-to', 'One of this construct''s own named outputs (engagement, teaching, play, nurturing) is teaching itself', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-output-investment-behavior' and t.slug = 'hbec-theory-teaching'
union all
select s.id, t.id, 'relates-to', 'This consensus position is reconstructed directly from population-genetics primary literature (Lewontin 1972) and affirms, not denies, substantial within-population heritability -- the same formal framework DAG''s own theory node represents', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-population-genetics-consensus' and t.slug = 'dag-theory-population-genetics'
union all
select s.id, t.id, 'relates-to', 'Both cite the same source (AAPA 2019, ''Statement on Race and Racism'') and make the same core claim: human genetic variation is clinal, with no genetic basis for discrete race categories', '{"source": "ccp_module crosswalk files (via ask_eva mirror), human-curated 2026-09-09/10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module node import + bridge, docs/kgdj/17-ccp-module-core-bridge.md \u00a75"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug = 'ccpm-population-genetics-consensus' and t.slug = 'dag-scicomm-race-and-ancestry-framing'
on conflict (source_node_id, target_node_id, relationship_code) do nothing;

commit;
