-- "At a glance" citation coverage per node/edge -- the same honesty signal
-- isVerifiedCitation() (lib/types.ts) already gives a single citation, one level up.
--
-- Decision record: docs/kgdj/13-literature-integration.md. Right now, telling whether
-- a node is backed by real, institute-confirmed sources means opening it and reading
-- every citation. This view answers it in one row per target, matching kgdj.reviews'
-- own target_kind/target_id addressing (review_summary, 0002_rls.sql) rather than
-- inventing a new shape. "Verified" here means exactly what isVerifiedCitation() checks
-- client-side -- a PuRe-CRIS match recorded in verification->pure->matched -- kept as
-- one definition, not two that could quietly drift apart between server and client.
create or replace view kgdj.citation_coverage with (security_invoker = true) as
select 'node'::kgdj.review_target as target_kind, nc.node_id as target_id,
       count(*)::int as total_citations,
       count(*) filter (where (c.verification #>> '{pure,matched}') = 'true')::int as verified_citations
from kgdj.node_citations nc join kgdj.citations c on c.id = nc.citation_id
group by nc.node_id
union all
select 'edge'::kgdj.review_target, ec.edge_id,
       count(*)::int,
       count(*) filter (where (c.verification #>> '{pure,matched}') = 'true')::int
from kgdj.edge_citations ec join kgdj.citations c on c.id = ec.citation_id
group by ec.edge_id;
grant select on kgdj.citation_coverage to authenticated;
comment on view kgdj.citation_coverage is 'One row per node/edge that has at least one citation: total_citations and verified_citations (PuRe-CRIS-matched, not just DOI-present). Absent target_id = zero citations, not zero rows to filter out -- the frontend treats "no row" and "row with 0" the same way.';
