-- KGDJ 0006: portfolio UX round 2 (2026-09-05).
--   * per-item "share with my module" on a portfolio node/private node/link, independent
--     of the portfolio's own visibility — the parent portfolio becomes visible (metadata
--     only) to module peers once it has at least one shared item; each child table's own
--     read policy grants that ONE row, not the rest of the portfolio.
--   * updated_at (+ touch trigger) on the three child tables, so "last edited" is real.
--   * the week-number input is dropped from the UI; kgdj.leaderboard's activity measure
--     and kgdj.portfolio_metrics() move from the old manual week ints to distinct
--     calendar days derived from real timestamps ("active_days", replacing "active_weeks").
--     The added_week/created_week columns are left in place, nullable, simply unused going
--     forward — old data and old portfolio backups still load.

-- ---------------------------------------------------------------- per-item module sharing
alter table kgdj.subgraph_nodes         add column shared boolean not null default false, add column shared_at timestamptz, add column updated_at timestamptz not null default now();
alter table kgdj.subgraph_private_nodes add column shared boolean not null default false, add column shared_at timestamptz, add column updated_at timestamptz not null default now();
alter table kgdj.subgraph_links         add column shared boolean not null default false, add column shared_at timestamptz, add column updated_at timestamptz not null default now();
comment on column kgdj.subgraph_nodes.shared is 'Visible to the portfolio''s module even while the rest of the portfolio stays private. Set/unset by the owner only; does not grant access to the portfolio''s critique thread (see kgdj.subgraph_visible_via_shared_item).';
comment on column kgdj.subgraph_private_nodes.shared is 'See kgdj.subgraph_nodes.shared.';
comment on column kgdj.subgraph_links.shared is 'See kgdj.subgraph_nodes.shared.';

do $$
declare t text;
begin
  foreach t in array array['subgraph_nodes', 'subgraph_private_nodes', 'subgraph_links']
  loop
    execute format('create trigger %I_touch before update on kgdj.%I for each row execute function kgdj.touch_updated_at()', t, t);
  end loop;
end $$;

-- Lets the PARENT portfolio row (metadata only: title/visibility/owner/module — not its
-- children) be read by a module peer once at least one of that portfolio's rows is shared.
-- Deliberately does not touch kgdj.can_see_subgraph() or the reviews policies: seeing a
-- shared idea does not unlock the portfolio's own peer-critique thread (that needs a
-- proper per-item review target, planned for the commons-space phase, not this one).
create or replace function kgdj.subgraph_visible_via_shared_item(s uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (
    select 1 from kgdj.student_subgraphs g
    where g.id = s and kgdj.is_module_member(g.module_id) and (
      exists (select 1 from kgdj.subgraph_nodes sn where sn.subgraph_id = g.id and sn.shared)
      or exists (select 1 from kgdj.subgraph_private_nodes pn where pn.subgraph_id = g.id and pn.shared)
      or exists (select 1 from kgdj.subgraph_links l where l.subgraph_id = g.id and l.shared)
    )
  )
$$;

drop policy subgraphs_read on kgdj.student_subgraphs;
create policy subgraphs_read on kgdj.student_subgraphs for select to authenticated using (
  owner_id = auth.uid()
  or kgdj.is_module_instructor(module_id)
  or kgdj.shared_with_me(id, false)
  or (visibility = 'module' and kgdj.is_module_member(module_id))
  or (visibility = 'members' and kgdj.is_member())
  or kgdj.subgraph_visible_via_shared_item(id)
);

-- Row-level, not subgraph-level: sharing one item never unlocks the rest of the portfolio.
drop policy subgraph_nodes_read on kgdj.subgraph_nodes;
create policy subgraph_nodes_read on kgdj.subgraph_nodes for select to authenticated using (
  kgdj.can_see_subgraph(subgraph_id) or (shared and kgdj.is_module_member(kgdj.subgraph_module(subgraph_id)))
);
drop policy private_nodes_read on kgdj.subgraph_private_nodes;
create policy private_nodes_read on kgdj.subgraph_private_nodes for select to authenticated using (
  kgdj.can_see_subgraph(subgraph_id) or (shared and kgdj.is_module_member(kgdj.subgraph_module(subgraph_id)))
);
drop policy links_read on kgdj.subgraph_links;
create policy links_read on kgdj.subgraph_links for select to authenticated using (
  kgdj.can_see_subgraph(subgraph_id) or (shared and kgdj.is_module_member(kgdj.subgraph_module(subgraph_id)))
);
-- (subgraph_nodes_write / private_nodes_write / links_write already cover UPDATE of any
-- column, including shared/shared_at, via owns_subgraph — no write-policy change needed.)

-- ---------------------------------------------------------------- active days, not weeks
-- Same shape as kgdj.can_see_subgraph(): the frontend needs to know whether IT reached a
-- portfolio through full visibility or only through a shared item, so it doesn't offer a
-- critique form (or leak the parent's own review thread) on a partial, shared-item view.
-- can_see_subgraph() already has default PUBLIC execute (like the rest of 0002's helpers,
-- callable via RPC the same way portfolio_cohort_stats already is) — no new function needed.

drop view kgdj.leaderboard;
create view kgdj.leaderboard as
with mine as (select g.id, g.owner_id from kgdj.student_subgraphs g),
     link_depts as (
       select l.subgraph_id, l.id as link_id, a.department_id as da, b.department_id as db, length(l.why) as why_len, l.lens, l.created_at
       from kgdj.subgraph_links l
       left join kgdj.nodes a on a.id = l.from_node_id
       left join kgdj.nodes b on b.id = l.to_node_id)
select p.id as profile_id, p.username, p.role, d.abbr as department,
  -- canonical contributions
  (select count(*) from kgdj.proposed_changes pc where pc.proposer_id = p.id and pc.status = 'approved')                                                     as approved_proposals,
  (select count(*) from kgdj.proposed_changes pc where pc.proposer_id = p.id and pc.status in ('pending', 'under_review', 'revision_requested'))             as open_proposals,
  (select count(*) from kgdj.nodes n where n.created_by = p.id and n.status = 'canonical')                                                                  as canonical_nodes_authored,
  (select count(distinct pcit.citation_id) from kgdj.proposal_citations pcit join kgdj.proposed_changes pc on pc.id = pcit.proposal_id
     where pc.proposer_id = p.id and pc.status = 'approved')                                                                                                as citations_brought,
  -- reviewing
  (select count(*) from kgdj.reviews r where r.reviewer_id = p.id and r.target_kind <> 'subgraph')                                                          as reviews_written,
  (select count(*) from kgdj.reviews r where r.reviewer_id = p.id and r.target_kind = 'subgraph')                                                           as portfolio_critiques,
  (select count(*) from kgdj.review_helpful h join kgdj.reviews r on r.id = h.review_id where r.reviewer_id = p.id)                                          as helpful_votes_received,
  (select count(*) from kgdj.reviews r join kgdj.proposed_changes pc on pc.id = r.proposal_id
     where r.reviewer_id = p.id and pc.status in ('approved', 'rejected')
       and ((pc.status = 'approved' and r.rating in ('accept', 'strongly_accept')) or (pc.status = 'rejected' and r.rating in ('reject', 'strongly_reject')))) as reviews_upheld,
  (select count(*) from kgdj.reviews r where r.reviewer_id = p.id and length(r.commentary_md) >= 300)                                                       as substantive_reviews,
  -- portfolio craft (own portfolios)
  (select count(*) from kgdj.subgraph_nodes sn join mine g on g.id = sn.subgraph_id where g.owner_id = p.id and length(sn.custom_annotation) >= 40)          as annotated_nodes,
  (select coalesce(sum(length(sn.custom_annotation)), 0) from kgdj.subgraph_nodes sn join mine g on g.id = sn.subgraph_id where g.owner_id = p.id)          as annotation_chars,
  (select count(*) from link_depts ld join mine g on g.id = ld.subgraph_id where g.owner_id = p.id)                                                          as connections_written,
  (select count(*) from link_depts ld join mine g on g.id = ld.subgraph_id where g.owner_id = p.id and ld.da is not null and ld.db is not null and ld.da <> ld.db) as cross_dept_connections,
  (select count(distinct ld.lens) from link_depts ld join mine g on g.id = ld.subgraph_id where g.owner_id = p.id and ld.lens is not null and ld.lens <> '') as lenses_used,
  (select count(*) from kgdj.subgraph_private_nodes pn join mine g on g.id = pn.subgraph_id where g.owner_id = p.id and pn.node_type = 'question')          as questions_raised,
  (select count(*) from kgdj.subgraph_private_nodes pn join mine g on g.id = pn.subgraph_id where g.owner_id = p.id and pn.node_type = 'resource')          as resources_added,
  (select count(distinct d) from (
      select ld.created_at::date as d from link_depts ld join mine g on g.id = ld.subgraph_id where g.owner_id = p.id
      union select pn.created_at::date from kgdj.subgraph_private_nodes pn join mine g on g.id = pn.subgraph_id where g.owner_id = p.id
      union select sn.added_at::date from kgdj.subgraph_nodes sn join mine g on g.id = sn.subgraph_id where g.owner_id = p.id
      union select r.created_at::date from kgdj.reviews r where r.reviewer_id = p.id) t)                                                                      as active_days
from kgdj.profiles p
left join kgdj.departments d on d.id = p.department_id
where p.is_active
  and exists (select 1 from kgdj.consent_records c where c.profile_id = p.id and c.purpose = 'leaderboard_display' and c.granted and c.withdrawn_at is null);
comment on view kgdj.leaderboard is 'Opt-in (leaderboard_display consent). One row per member with many authentic measures; the UI shows a separate top list per measure so different strengths surface.';
grant select on kgdj.leaderboard to authenticated;

create or replace function kgdj.portfolio_metrics(g uuid) returns jsonb language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  with n as (select count(*) c from kgdj.subgraph_nodes where subgraph_id = g),
       ann as (select count(*) filter (where length(custom_annotation) >= 40) c, coalesce(avg(length(custom_annotation)), 0) avg_len from kgdj.subgraph_nodes where subgraph_id = g),
       pn as (select count(*) c, count(*) filter (where node_type = 'question') q, count(*) filter (where node_type = 'resource') r,
                     count(*) filter (where node_type = 'theory') t, count(*) filter (where node_type = 'method') m from kgdj.subgraph_private_nodes where subgraph_id = g),
       l as (select count(*) c, coalesce(avg(length(why)), 0) avg_why, count(distinct nullif(lens, '')) lenses, count(*) filter (where edge_id is not null) adopted,
                    count(*) filter (where a.department_id is not null and b.department_id is not null and a.department_id <> b.department_id) cross_dept
             from kgdj.subgraph_links x left join kgdj.nodes a on a.id = x.from_node_id left join kgdj.nodes b on b.id = x.to_node_id where x.subgraph_id = g),
       d as (select count(distinct nd.department_id) c from kgdj.subgraph_nodes sn join kgdj.nodes nd on nd.id = sn.node_id where sn.subgraph_id = g and nd.department_id is not null),
       ty as (select count(distinct nd.type_code) c from kgdj.subgraph_nodes sn join kgdj.nodes nd on nd.id = sn.node_id where sn.subgraph_id = g),
       ad as (select count(distinct d) c from (select added_at::date d from kgdj.subgraph_nodes where subgraph_id = g union select created_at::date from kgdj.subgraph_private_nodes where subgraph_id = g union select created_at::date from kgdj.subgraph_links where subgraph_id = g) t),
       cr as (select count(*) c from kgdj.reviews where subgraph_id = g)
  select jsonb_build_object(
    'canonical_nodes', n.c, 'annotated_nodes', ann.c, 'avg_annotation_len', round(ann.avg_len), 'own_nodes', pn.c, 'questions', pn.q, 'resources', pn.r, 'theories', pn.t, 'methods', pn.m,
    'connections', l.c, 'avg_why_len', round(l.avg_why), 'lenses', l.lenses, 'adopted_edges', l.adopted, 'cross_dept_connections', l.cross_dept,
    'departments_covered', d.c, 'node_types_covered', ty.c, 'active_days', ad.c, 'critiques_received', cr.c)
  from n, ann, pn, l, d, ty, ad, cr
$$;
