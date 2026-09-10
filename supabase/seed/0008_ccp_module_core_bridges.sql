-- Second pass, same sweep: 13 of the 21 original department-core CCP nodes still had
-- zero connection to the 154-node ccp_module import after the crosswalk-file batch
-- (0007). These aren't from any existing crosswalk file -- found by reading the actual
-- module node descriptions directly against each still-isolated core node's own topic,
-- same discipline as everything else today (real content match, not label similarity).
--
-- Two of the 13 (Computational modeling, Cross-cultural surveys) genuinely have no
-- module-side counterpart -- checked, not forced. Left unconnected, same as ccp<->dag
-- this morning: an honest "no real bridge found" is a finding, not a gap to paper over.

begin;

insert into kgdj.edges (source_node_id, target_node_id, relationship_code, label, provenance)
select s.id, t.id, 'relates-to', 'Moral Cognition''s own description spans exactly this domain''s subject: evaluating actions/agents as morally good or bad, fair or unfair', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-moral-cognition' and t.slug='ccp-domain-moral-development'
union all
select s.id, t.id, 'relates-to', 'Guilt, shame, disgust and moral outrage (Haidt 2001''s social-intuitionist affective states) are a core mechanism within this life-span domain', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-moral-emotions' and t.slug='ccp-domain-moral-development'
union all
select s.id, t.id, 'relates-to', 'Normative Cognition''s own description -- the capacity to represent, internalise and enforce socially shared rules -- is this domain''s subject matter directly', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-normative-cognition' and t.slug='ccp-domain-social-norms'
union all
select s.id, t.id, 'relates-to', 'The developmental process by which the capacity Normative Cognition names actually gets internalised', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-normative-cognition' and t.slug='ccp-topic-norm-acquisition'
union all
select s.id, t.id, 'same-as', 'Near-identical topic: onset ages, clustering and character of capacities varying systematically across cultures (Callaghan et al. 2005)', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-cross-cultural' and t.slug='ccp-topic-cultural-variation-in-cognition'
union all
select s.id, t.id, 'relates-to', 'The ontogenetic pathway (9-month social-cognitive revolution through language explosion) this theory''s own empirical content traces', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-development' and t.slug='ccp-theory-developmental-psychology'
union all
select s.id, t.id, 'relates-to', 'The general communication capacity this topic''s developmental trajectory specifically tracks over childhood', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-communication' and t.slug='ccp-topic-communication-development'
union all
select s.id, t.id, 'same-as', 'Same construct -- the module''s own general Theory of Mind concept and the department''s own Theory of Mind theory node', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-theory-of-mind' and t.slug='ccp-theory-theory-of-mind'
union all
select s.id, t.id, 'relates-to', 'Theory of Mind is a defining component of social cognition broadly, not identical to it -- the department''s own broader umbrella theory', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-theory-of-mind' and t.slug='ccp-theory-social-cognition'
union all
select s.id, t.id, 'applies-to', 'A specific standardised-administration task design within this general method category', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-cross-cultural-field-task' and t.slug='ccp-method-developmental-tasks'
union all
select s.id, t.id, 'relates-to', 'Inequity aversion is the direct psychological mechanism underlying fairness judgments', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-inequity-aversion' and t.slug='ccp-topic-fairness'
union all
select s.id, t.id, 'applies-to', 'Ultimatum, dictator and third-party-punishment games are the field''s standard method for measuring fairness behaviourally', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-economic-game-paradigm' and t.slug='ccp-topic-fairness'
union all
select s.id, t.id, 'relates-to', 'Guided participation and apprenticeship learning (Rogoff) is a caregiver-child interaction concept central to parenting research', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-guided-participation' and t.slug='ccp-domain-parenting'
union all
select s.id, t.id, 'relates-to', 'Nisbett''s holistic-vs-analytic-thinking geography-of-thought work is a canonical cultural-psychology finding', '{"source": "direct content review, 2026-09-10", "status": "draft", "imported_at": "2026-09-10", "note": "ccp_module <-> ccp department-core bridge"}'::jsonb
from kgdj.nodes s, kgdj.nodes t where s.slug='ccpm-holistic-analytic-thinking' and t.slug='ccp-theory-cultural-psychology'
on conflict (source_node_id, target_node_id, relationship_code) do nothing;

commit;
