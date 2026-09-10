-- Real, human-curated CCP<->department connections already vetted in
-- ask_eva/eva-graph-pilot-app/ask-eva-app/data/crosswalks/{ccp-module-mpi-eva-connections,
-- ccp-module-candidate-review,ccp-module-genetics-scicomm}.yml -- built by eva-graph-66/
-- eva-graph-d2's coherence work, never imported into KGDJ's own copy of this graph.
-- Dustin's direct request after seeing the CCP cluster still read as visually separate:
-- a comprehensive sweep of CCP nodes for real connections, not just the two department-pair
-- bridges from this morning. Cross-checked every crosswalk entry against KGDJ's live node
-- set first (53 candidate links extracted; 34 have both endpoints already in KGDJ and no
-- existing edge between them -- these; 2 already linked; 17 reference ccp_module nodes
-- (named researchers: Boesch, Luncz, McElreath; a few scicomm/construct nodes) that were
-- never imported into KGDJ's own ccp_module seed at all -- not fabricated here, flagged
-- separately, not silently skipped).
--
-- Relationship types remapped to KGDJ's own smaller enum (checked each mapping's direction
-- against how that type is already used in the live graph, not assumed): sameAs->same-as,
-- instantiates/motivates->applies-to/informs (same direction as the crosswalk's own ccp->meg
-- reading), groundedIn->grounds (direction REVERSED: grounds reads source-is-the-foundation,
-- groundedIn reads target-is-the-foundation). The real claim's full wording stays in the
-- edge label verbatim from the crosswalk, so nothing is lost in the remap.
--
-- Same discipline as this morning's ccp<->humor/evogen bridges: status stays 'proposed',
-- created_by stays null, provenance says plainly where this came from -- matches how every
-- other edge already in this graph arrived, no fabricated human author.

begin;

insert into kgdj.edges (source_node_id, target_node_id, relationship_code, label, provenance)
select s.id, t.id, 'relates-to', 'The debate is precisely about whether the behavioral variation this MPI-EVA topic tracks constitutes ''culture''', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-chimpanzee-culture-debate' and t.slug = 'primevo-topic-cultural-traditions-in-primates'
union all
select s.id, t.id, 'relates-to', 'Tests whether non-human behavioral variation meets the same variation-selection-inheritance criteria DLCE''s own theory applies to human cultural traits', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-chimpanzee-culture-debate' and t.slug = 'dlce-theory-cultural-evolution'
union all
select s.id, t.id, 'evidences', 'Whiten et al. 1999, Nature 399:682-685 — the founding empirical paper for this MPI-EVA topic', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''evidences'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-cultures-in-chimpanzees-1999' and t.slug = 'primevo-topic-cultural-traditions-in-primates'
union all
select s.id, t.id, 'grounds', 'Boesch''s Taï population supplied one of the paper''s seven pooled field-site datasets', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''groundedIn'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'fieldsite-tai-national-park' and t.slug = 'ccpm-cultures-in-chimpanzees-1999'
union all
select s.id, t.id, 'grounds', 'The Wolfgang Köhler Primate Research Center is the real, geolocated facility this trait names', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''groundedIn'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'fieldsite-wkprc-leipzig-zoo' and t.slug = 'ccpm-evogen-wkprc-genomics'
union all
select s.id, t.id, 'relates-to', 'WKPRC''s living ape population supplies reference material for this EvoGen research domain', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-evogen-wkprc-genomics' and t.slug = 'evogen-domain-comparative-primate-genomics'
union all
select s.id, t.id, 'evidences', 'Sibilsky, Colleran, McElreath & Haun 2022, Scientific Reports 12:6723', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''evidences'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-majority-bias-social-learning-2022' and t.slug = 'hbec-theory-social-learning'
union all
select s.id, t.id, 'evidences', 'Majority-bias is itself a specific learning bias — the paper''s own finding, and a genuine joint CCP/HBEC collaboration', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''evidences'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-majority-bias-social-learning-2022' and t.slug = 'ccp-theory-learning-biases'
union all
select s.id, t.id, 'evidences', 'A 20-year excavation thread (2002-2018) at the Panda 100 and Noulo nut-cracking sites', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''evidences'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-panda-100-chimpanzee-archaeology' and t.slug = 'primevo-topic-primate-archaeology'
union all
select s.id, t.id, 'grounds', null, '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''groundedIn'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'fieldsite-tai-national-park' and t.slug = 'ccpm-panda-100-chimpanzee-archaeology'
union all
select s.id, t.id, 'represents', 'This ccp_module method node names the real, geolocated MPI-EVA field site directly', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''represents'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-tai-chimpanzee-project' and t.slug = 'fieldsite-tai-national-park'
union all
select s.id, t.id, 'applies-to', 'Running continuously since the 1970s-1980s — one of the longest-running instances of this PrimEvo method', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''instantiates'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-tai-chimpanzee-project' and t.slug = 'primevo-method-long-term-field-observation'
union all
select s.id, t.id, 'same-as', 'Same theoretical construct — HBEC''s own ''Teaching'' theory node', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''sameAs'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-teaching' and t.slug = 'hbec-theory-teaching'
union all
select s.id, t.id, 'same-as', 'Same theoretical construct — HBEC''s own ''Cumulative culture'' theory node', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''sameAs'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-cumulative-culture' and t.slug = 'hbec-theory-cumulative-culture'
union all
select s.id, t.id, 'same-as', null, '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''sameAs'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-social-learning' and t.slug = 'hbec-theory-social-learning'
union all
select s.id, t.id, 'same-as', 'Same general theory, DLCE''s own instance specialized to linguistic/cultural-form transmission', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''sameAs'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-social-learning' and t.slug = 'dlce-theory-social-learning'
union all
select s.id, t.id, 'informs', 'The correction this CCP domain''s cross-cultural sampling practice exists to make', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''motivates'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-weird-sampling-bias' and t.slug = 'ccp-domain-cross-cultural-samples'
union all
select s.id, t.id, 'informs', null, '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''motivates'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-weird-sampling-bias' and t.slug = 'ccp-domain-global-child-study-network'
union all
select s.id, t.id, 'evidences', 'Haun & Tomasello (2011): preschoolers who directly observed a correct outcome nonetheless shifted their answer to match a conflicting peer-group majority — the paradigmatic selective-learning-bias case this theory names, and among Haun''s own most-cited results', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''evidences'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-conformity' and t.slug = 'ccp-theory-learning-biases'
union all
select s.id, t.id, 'applies-to', 'A specific, widely-used controlled-task design (a two-handled rope apparatus that only pays off if both partners pull together) that turns voluntary coordination into a directly scoreable behavioral outcome, run with both children and great apes', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''instantiates'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-cooperative-pulling-paradigm' and t.slug = 'ccp-method-behavioral-experiments'
union all
select s.id, t.id, 'relates-to', 'Tomasello''s own proposed extension beyond representing others'' minds individually to representing mental states as jointly held — a related but distinct further claim within the same mental-state-attribution family this theory names', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-shared-intentionality' and t.slug = 'ccp-theory-theory-of-mind'
union all
select s.id, t.id, 'relates-to', 'This construct''s own stated cultural product — cumulative culture, language, and collective normativity — is exactly what this topic''s developmental trajectory studies', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-shared-intentionality' and t.slug = 'ccp-topic-cooperation-development'
union all
select s.id, t.id, 'relates-to', 'Both infer mental representation non-verbally from gaze/looking behavior in infants and children; looking-time paradigms (violation-of-expectation, anticipatory-looking) are the sibling family of methods to gaze-pattern eye-tracking, not identical to it', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-looking-time-paradigm' and t.slug = 'ccp-method-eye-tracking'
union all
select s.id, t.id, 'relates-to', 'This node''s own text names the Global Child Study Network directly as ''the same logic'' applied to the human side — ManyPrimates/ManyDogs (ape/dog-side) and the Global Child Study Network (human-side) are parallel structural answers to the same small-sample, single-site problem', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-multi-site-infrastructure' and t.slug = 'ccp-domain-global-child-study-network'
union all
select s.id, t.id, 'relates-to', 'ManyPrimates is co-led within the department by Christoph Völter, the same researcher this meg node''s own provenance names as leading the Pan Cultures group behind the great-ape comparative sample — one person''s infrastructure-building work spanning both nodes', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-mpi-eva-connections.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-multi-site-infrastructure' and t.slug = 'ccp-domain-great-ape-comparative-sample'
union all
select s.id, t.id, 'applies-to', 'Cross-species communication is a specific case within CCP''s broader Communication domain, not identical to it', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''instantiates'', from file ccp-module-candidate-review.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-animal-communication' and t.slug = 'ccp-domain-communication'
union all
select s.id, t.id, 'applies-to', 'Gricean ostensive communication is a specific mechanism within CCP''s broader Communication domain, not identical to it', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''instantiates'', from file ccp-module-candidate-review.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-ostensive-communication' and t.slug = 'ccp-domain-communication'
union all
select s.id, t.id, 'relates-to', 'Related but not identical — HBEC''s Innovation domain concerns human cultural-evolutionary novelty specifically; this ccp_module concept is the comparative cross-species question of what enables it', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-candidate-review.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-cross-species-innovation' and t.slug = 'hbec-domain-innovation'
union all
select s.id, t.id, 'relates-to', 'Problem-solving and tool innovation is a proximate cognitive mechanism for the cultural-evolutionary innovation HBEC''s domain studies at the population level', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-candidate-review.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-problem-solving' and t.slug = 'hbec-domain-innovation'
union all
select s.id, t.id, 'relates-to', 'A specific studied behavior within CCP''s Children domain, not identical to it', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-candidate-review.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-question-asking' and t.slug = 'ccp-domain-children'
union all
select s.id, t.id, 'same-as', 'Same core methodological orientation — CCP''s own named theoretical approach', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''sameAs'', from file ccp-module-candidate-review.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-individual-differences' and t.slug = 'ccp-theory-individual-differences-approach'
union all
select s.id, t.id, 'relates-to', 'Economic games (ultimatum, dictator, third-party punishment) are the method; punishment is one of several constructs they measure, alongside fairness and cooperation — not identical to the topic', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''relates-to'', from file ccp-module-candidate-review.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-economic-game-paradigm' and t.slug = 'hbec-topic-punishment'
union all
select s.id, t.id, 'applies-to', 'Third-party (costly, disinterested) punishment is a specific, theoretically important form of the general punishment topic, distinguished from second-party/self-interested sanctioning', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''instantiates'', from file ccp-module-candidate-review.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-third-party-punishment' and t.slug = 'hbec-topic-punishment'
union all
select s.id, t.id, 'applies-to', 'A specific, unusual application of cultural-evolutionary theory to science-as-an-institution — a worked example, not the general theory itself', '{"source": "ask_eva/data/crosswalks (human-curated, eva-graph-66/eva-graph-d2, 2026-09-09/10)", "status": "draft", "imported_at": "2026-09-10", "note": "ccp<->department connection, original crosswalk type ''instantiates'', from file ccp-module-candidate-review.yml"}'::jsonb
from kgdj.nodes s, kgdj.nodes t
where s.slug = 'ccpm-cultural-evolution-of-science' and t.slug = 'hbec-theory-cultural-evolution'
on conflict (source_node_id, target_node_id, relationship_code) do nothing;

commit;
