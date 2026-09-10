-- Backfills kgdj.node_departments: every node with a single department_id gets
-- exactly that one row (making the join table a complete membership record, not
-- just a home for the multi-department cases), and the 18 previously department-less
-- institute-wide/fieldsite nodes get their REAL multi-department membership --
-- pulled directly from mpi-eva-graph/eva_institute/nodes/*.json and fieldsites.geojson's
-- own `departments` arrays (matched to KGDJ nodes by exact label, 18 of 18 matched),
-- not guessed from description text.

begin;

-- Single-department nodes: one row each, mirroring the existing department_id.
insert into kgdj.node_departments (node_id, department_id)
select id, department_id from kgdj.nodes where department_id is not null
on conflict (node_id, department_id) do nothing;

-- The 18 real multi-department nodes.
insert into kgdj.node_departments (node_id, department_id)
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-ancient-and-archaic-genomes' and d.code = 'dag'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-ancient-and-archaic-genomes' and d.code = 'evogen'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-ancient-and-archaic-genomes' and d.code = 'humor'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-animal-research-and-public-perception' and d.code = 'ccp'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-animal-research-and-public-perception' and d.code = 'primevo'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-animal-research-and-public-perception' and d.code = 'evogen'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-topic-archaic-introgression' and d.code = 'dag'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-topic-archaic-introgression' and d.code = 'evogen'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-topic-archaic-introgression' and d.code = 'humor'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-community-consent-and-benefit-sharing' and d.code = 'hbec'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-community-consent-and-benefit-sharing' and d.code = 'dlce'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-community-consent-and-benefit-sharing' and d.code = 'ccp'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-community-consent-and-benefit-sharing' and d.code = 'primevo'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-community-consent-and-benefit-sharing' and d.code = 'evogen'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-topic-cooperation-and-fairness' and d.code = 'hbec'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-topic-cooperation-and-fairness' and d.code = 'primevo'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-topic-cooperation-and-fairness' and d.code = 'ccp'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-cultural-transmission-and-social-learning' and d.code = 'hbec'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-cultural-transmission-and-social-learning' and d.code = 'dlce'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-cultural-transmission-and-social-learning' and d.code = 'ccp'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-cultural-transmission-and-social-learning' and d.code = 'primevo'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'fieldsite-denisova-cave' and d.code = 'evogen'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'fieldsite-denisova-cave' and d.code = 'dag'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-human-remains-and-repatriation' and d.code = 'dag'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-human-remains-and-repatriation' and d.code = 'humor'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'fieldsite-ranis-germany' and d.code = 'evogen'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'fieldsite-ranis-germany' and d.code = 'dag'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'fieldsite-ranis-germany' and d.code = 'humor'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-life-history-theory' and d.code = 'hbec'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-life-history-theory' and d.code = 'primevo'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-life-history-theory' and d.code = 'humor'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-migration-and-dispersal' and d.code = 'dag'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-migration-and-dispersal' and d.code = 'hbec'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-migration-and-dispersal' and d.code = 'humor'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-migration-and-dispersal' and d.code = 'primevo'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'fieldsite-motaba-river-bayaka' and d.code = 'hbec'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'fieldsite-motaba-river-bayaka' and d.code = 'ccp'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-oversimplified-genetic-narratives' and d.code = 'dag'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-oversimplified-genetic-narratives' and d.code = 'evogen'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-scicomm-oversimplified-genetic-narratives' and d.code = 'humor'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-method-phylogenetic-tree-based-methods' and d.code = 'dag'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-method-phylogenetic-tree-based-methods' and d.code = 'evogen'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-method-phylogenetic-tree-based-methods' and d.code = 'dlce'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-method-phylogenetic-tree-based-methods' and d.code = 'hbec'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-population-structure-and-demography' and d.code = 'dag'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-population-structure-and-demography' and d.code = 'evogen'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-population-structure-and-demography' and d.code = 'hbec'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-domain-population-structure-and-demography' and d.code = 'primevo'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-cultural-and-behavioral-selection-and-adaptation' and d.code = 'hbec'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-cultural-and-behavioral-selection-and-adaptation' and d.code = 'dlce'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-cultural-and-behavioral-selection-and-adaptation' and d.code = 'ccp'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-selection-and-adaptation' and d.code = 'dag'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-selection-and-adaptation' and d.code = 'evogen'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-selection-and-adaptation' and d.code = 'humor'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'inst-theory-selection-and-adaptation' and d.code = 'primevo'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'fieldsite-tai-national-park' and d.code = 'hbec'
union all
select n.id, d.id from kgdj.nodes n, kgdj.departments d where n.slug = 'fieldsite-tai-national-park' and d.code = 'primevo'
on conflict (node_id, department_id) do nothing;

commit;
