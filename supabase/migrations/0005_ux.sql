-- KGDJ 0005: UX round after the first hands-on review (2026-09-04).
--   * research groups (from the MPG.PuRe OU tree) + self-declared affiliation on profiles
--   * module self-affiliation ('affiliate' member role; grants nothing)
--   * canonical edges adopted into a portfolio (subgraph_links.edge_id)
--   * "helpful" votes on reviews (identified, one per voter, never on one's own review)
--   * leaderboard with many authentic measures (still consent-gated, opt-in)
--   * anonymised cohort statistics for the portfolio comparison report (n >= 3 only)

-- ---------------------------------------------------------------- research groups
create table kgdj.research_groups (
  id              uuid primary key default gen_random_uuid(),
  pure_ou_id      text unique,                       -- MPG.PuRe organizational unit
  name            text not null,
  kind            text not null check (kind in ('department', 'historical-department', 'group', 'other')),
  department_code text,                              -- dag | hbec | dlce | evogen | humor | primevo | ccp | null (institute-level groups)
  status          text not null default 'OPENED',    -- OPENED | CLOSED (as in PuRe)
  parent_name     text,
  created_at      timestamptz not null default now()
);
comment on table kgdj.research_groups is 'Research groups / units for self-declared affiliation. Seeded from eva_literature/data/pure/ou_tree.json (PuRe OU tree, fetched 2026-09-04). Editors may add missing ones.';
insert into kgdj.research_groups (pure_ou_id, name, kind, department_code, status, parent_name) values
  ('ou_3644291', 'Ancient Genomes and Contemporary Health Research Group', 'group', null, 'OPENED', null),
  ('ou_1565177', 'CAS-MPG Joint Laboratory of Human Evolution and Archaeometry', 'group', null, 'OPENED', null),
  ('ou_1497670', 'Chinese Academy of Sciences-Max Planck Partner Institute for Computational Biology', 'group', null, 'OPENED', null),
  ('ou_3222712', 'Department of Archaeogenetics', 'department', 'dag', 'OPENED', null),
  ('ou_3267100', 'Ancient Genomes', 'other', 'dag', 'CLOSED', 'Department of Archaeogenetics'),
  ('ou_3267105', 'Computational Pathogenomics', 'other', 'dag', 'OPENED', 'Department of Archaeogenetics'),
  ('ou_3390632', 'Evolutionary Genomics', 'other', 'dag', 'OPENED', 'Department of Archaeogenetics'),
  ('ou_3390633', 'Genetic History', 'other', 'dag', 'OPENED', 'Department of Archaeogenetics'),
  ('ou_3390634', 'Haplo Group', 'other', 'dag', 'OPENED', 'Department of Archaeogenetics'),
  ('ou_3390638', 'MHAAM', 'other', 'dag', 'OPENED', 'Department of Archaeogenetics'),
  ('ou_3390639', 'Microbiome Sciences', 'other', 'dag', 'OPENED', 'Department of Archaeogenetics'),
  ('ou_3390643', 'Molecular Anthropology', 'other', 'dag', 'OPENED', 'Department of Archaeogenetics'),
  ('ou_3267106', 'Molecular Palaeopathology', 'other', 'dag', 'OPENED', 'Department of Archaeogenetics'),
  ('ou_3267107', 'Population Genetics', 'other', 'dag', 'OPENED', 'Department of Archaeogenetics'),
  ('ou_3040267', 'Department of Comparative Cultural Psychology', 'department', 'ccp', 'OPENED', null),
  ('ou_1497671', 'Department of Developmental and Comparative Psychology', 'historical-department', 'ccp', 'CLOSED', null),
  ('ou_2074302', 'Minerva Research Group Human Origins of Self-Regulation', 'other', 'ccp', 'CLOSED', 'Department of Developmental and Comparative Psychology'),
  ('ou_1497672', 'Department of Evolutionary Genetics', 'department', 'evogen', 'OPENED', null),
  ('ou_2074332', 'Advanced DNA Sequencing Techniques', 'other', 'evogen', 'OPENED', 'Department of Evolutionary Genetics'),
  ('ou_3500944', 'Computational Ancient Genomics', 'other', 'evogen', 'OPENED', 'Department of Evolutionary Genetics'),
  ('ou_2074329', 'Genetic Diversity and Selection', 'other', 'evogen', 'CLOSED', 'Department of Evolutionary Genetics'),
  ('ou_2559696', 'Genetic Diversity through Space and Time', 'other', 'evogen', 'OPENED', 'Department of Evolutionary Genetics'),
  ('ou_3557290', 'Genome Engineering and Repair', 'other', 'evogen', 'OPENED', 'Department of Evolutionary Genetics'),
  ('ou_2074331', 'Genomes', 'other', 'evogen', 'CLOSED', 'Department of Evolutionary Genetics'),
  ('ou_3557289', 'Hominin Palaeogenomics', 'other', 'evogen', 'CLOSED', 'Department of Evolutionary Genetics'),
  ('ou_2074313', 'Human Population History', 'other', 'evogen', 'OPENED', 'Department of Evolutionary Genetics'),
  ('ou_3360383', 'Max Planck Research Group for Ancient Environmental Genomics', 'other', 'evogen', 'OPENED', 'Department of Evolutionary Genetics'),
  ('ou_2477693', 'Modern and Archaic Human Cell Biology', 'other', 'evogen', 'CLOSED', 'Department of Evolutionary Genetics'),
  ('ou_2074328', 'Neandertals and more', 'other', 'evogen', 'OPENED', 'Department of Evolutionary Genetics'),
  ('ou_2074330', 'Selenium and Genome Annotation', 'other', 'evogen', 'CLOSED', 'Department of Evolutionary Genetics'),
  ('ou_2173644', 'Single Cell Genomics', 'other', 'evogen', 'CLOSED', 'Department of Evolutionary Genetics'),
  ('ou_2074303', 'The Minerva Research Group for Bioinformatics', 'other', 'evogen', 'CLOSED', 'Department of Evolutionary Genetics'),
  ('ou_2173689', 'Department of Human Behavior Ecology and Culture', 'department', 'hbec', 'OPENED', null),
  ('ou_3281019', 'Culture Cooperation and Child Development Research Group', 'other', 'hbec', 'OPENED', 'Department of Human Behavior Ecology and Culture'),
  ('ou_3256592', 'ERC - Waves', 'other', 'hbec', 'OPENED', 'Department of Human Behavior Ecology and Culture'),
  ('ou_3525169', 'Theory in Cultural Evolution Lab', 'other', 'hbec', 'OPENED', 'Department of Human Behavior Ecology and Culture'),
  ('ou_1497673', 'Department of Human Evolution', 'historical-department', 'humor', 'CLOSED', null),
  ('ou_3482006', 'Department of Human Origins', 'department', 'humor', 'OPENED', null),
  ('ou_3237541', 'Department of Linguistic and Cultural Evolution', 'department', 'dlce', 'OPENED', null),
  ('ou_3332762', 'CALC', 'other', 'dlce', 'OPENED', 'Department of Linguistic and Cultural Evolution'),
  ('ou_3384318', 'COOL', 'other', 'dlce', 'OPENED', 'Department of Linguistic and Cultural Evolution'),
  ('ou_38005', 'Department of Linguistics', 'historical-department', null, 'CLOSED', null),
  ('ou_3367832', 'Department of Primate Behavior and Evolution', 'department', 'primevo', 'OPENED', null),
  ('ou_1497674', 'Department of Primatology', 'historical-department', 'primevo', 'CLOSED', null),
  ('ou_2149635', 'Bonobos', 'other', 'primevo', 'CLOSED', 'Department of Primatology'),
  ('ou_2149636', 'Chimpanzees', 'other', 'primevo', 'CLOSED', 'Department of Primatology'),
  ('ou_2025298', 'Endocrinology Laboratory', 'other', 'primevo', 'CLOSED', 'Department of Primatology'),
  ('ou_2149637', 'Gorillas', 'other', 'primevo', 'CLOSED', 'Department of Primatology'),
  ('ou_2149638', 'Great Ape Evolutionary Ecology and Conservation', 'other', 'primevo', 'CLOSED', 'Department of Primatology'),
  ('ou_2149639', 'Molecular Genetics Laboratory', 'other', 'primevo', 'CLOSED', 'Department of Primatology'),
  ('ou_1497675', 'Evolutionary Roots of Human Social Interaction', 'group', null, 'CLOSED', null),
  ('ou_1497676', 'Junior Research Group Integrative Primate Socio-Ecology', 'group', null, 'CLOSED', null),
  ('ou_1497677', 'Junior Research Group of Primate Kin Selection', 'group', null, 'CLOSED', null),
  ('ou_1497678', 'Junior Research Group on Cultural Ontogeny', 'group', null, 'CLOSED', null),
  ('ou_1497679', 'Junior Research Group on Cultural Phylogeny', 'group', null, 'CLOSED', null),
  ('ou_1497680', 'Junior Research Group on Molecular Ecology', 'group', null, 'CLOSED', null),
  ('ou_3222265', 'Lise Meitner Group Technological Primates', 'group', null, 'OPENED', null),
  ('ou_3164444', 'Lise Meitner Research Group BirthRites - Cultures of Reproduction', 'group', null, 'OPENED', null),
  ('ou_3644293', 'Lise Meitner Research Group for Hominin Palaeogenomics (HOPE)', 'group', null, 'OPENED', null),
  ('ou_1497681', 'Max Planck Child Study Centre', 'group', null, 'OPENED', null),
  ('ou_3712469', 'Max Planck Research Group Cooperative Cultures', 'group', null, 'OPENED', null),
  ('ou_3728427', 'Max Planck Research Group Genome Engineering and Repair', 'group', null, 'OPENED', null),
  ('ou_1497682', 'Max Planck Research Group for Comparative Cognitive Anthropology', 'group', null, 'CLOSED', null),
  ('ou_1497683', 'Max Planck Research Group on Comparative Population Linguistics', 'group', null, 'CLOSED', null),
  ('ou_1497684', 'Max Planck Research Group on Plant Foods in Hominin Dietary Ecology', 'group', null, 'CLOSED', null),
  ('ou_1497686', 'Max Planck Weizmann Center for integrative Archaeology and Anthropology', 'group', null, 'CLOSED', null),
  ('ou_3482003', 'Otto Hahn Research Group for Tropical Archaeogenomics', 'group', null, 'OPENED', null),
  ('ou_3166785', 'Research Group Primate Behavioural Ecology', 'group', null, 'OPENED', null),
  ('ou_1497687', 'The Cuvette Centrale as reservoir of medicinal plants', 'group', null, 'CLOSED', null),
  ('ou_1497688', 'The Leipzig School of Human Origins (IMPRS)', 'group', null, 'OPENED', null);

alter table kgdj.profiles
  add column research_group_id uuid references kgdj.research_groups (id) on delete set null,
  add column affiliation_note  text check (affiliation_note is null or length(affiliation_note) <= 200);
comment on column kgdj.profiles.research_group_id is 'Self-declared; optional. Not used for any permission.';
comment on column kgdj.profiles.affiliation_note is 'Free text for an affiliation the pick-lists lack (e.g. a Uni-Leipzig chair). Optional, <= 200 chars.';

-- ---------------------------------------------------------------- module self-affiliation
-- 'affiliate' is what a researcher/editor/lecturer registers for themselves; it grants
-- nothing (portfolio visibility stays with the admin-assigned instructor/assistant).
alter table kgdj.module_members drop constraint module_members_member_role_check;
alter table kgdj.module_members add constraint module_members_member_role_check check (member_role in ('student', 'instructor', 'assistant', 'affiliate'));
create policy module_members_self_join on kgdj.module_members for insert to authenticated
  with check (kgdj.is_member() and profile_id = auth.uid() and member_role in ('student', 'affiliate'));
create policy module_members_self_leave on kgdj.module_members for delete to authenticated
  using (profile_id = auth.uid() and member_role in ('student', 'affiliate'));

-- ---------------------------------------------------------------- adopted canonical edges
alter table kgdj.subgraph_links add column edge_id uuid references kgdj.edges (id) on delete set null;
comment on column kgdj.subgraph_links.edge_id is 'Set when the link was adopted from a canonical edge ("add selected nodes and edges"); the student may still rewrite why/lens.';
create index links_edge_idx on kgdj.subgraph_links (edge_id) where edge_id is not null;

-- ---------------------------------------------------------------- helpful votes on reviews
create table kgdj.review_helpful (
  review_id  uuid not null references kgdj.reviews (id) on delete cascade,
  voter_id   uuid not null references kgdj.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, voter_id)
);
comment on table kgdj.review_helpful is 'Identified "this review helped me" marks. One per voter per review; never on one''s own review (trigger).';
alter table kgdj.review_helpful enable row level security;
alter table kgdj.review_helpful force row level security;
grant select, insert, delete on kgdj.review_helpful to authenticated;

create or replace function kgdj.check_helpful_vote() returns trigger language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare rv kgdj.reviews;
begin
  select * into rv from kgdj.reviews where id = new.review_id;
  if rv.reviewer_id = new.voter_id then raise exception 'You cannot mark your own review as helpful'; end if;
  if new.voter_id <> auth.uid() then raise exception 'A helpful vote must be cast by the signed-in member'; end if;
  return new;
end $$;
create trigger review_helpful_check before insert on kgdj.review_helpful for each row execute function kgdj.check_helpful_vote();

-- one may vote on any review one may read
create or replace function kgdj.can_see_review(r uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (
    select 1 from kgdj.reviews x where x.id = r and (
      x.reviewer_id = auth.uid()
      or (kgdj.is_editor() and x.target_kind <> 'subgraph')
      or (x.target_kind in ('node', 'edge') and kgdj.is_member())
      or (x.target_kind = 'proposal' and kgdj.can_see_proposal(x.proposal_id))
      or (x.target_kind = 'subgraph' and kgdj.can_see_subgraph(x.subgraph_id))))
$$;
create policy helpful_read on kgdj.review_helpful for select to authenticated using (kgdj.can_see_review(review_id));
create policy helpful_insert on kgdj.review_helpful for insert to authenticated with check (voter_id = auth.uid() and kgdj.can_see_review(review_id));
create policy helpful_delete on kgdj.review_helpful for delete to authenticated using (voter_id = auth.uid());

-- reviews_visible gains helpful_count and helpful_by_me (columns appended; the view contract is otherwise unchanged)
create or replace view kgdj.reviews_visible with (security_invoker = true) as
select r.id, r.target_kind, r.proposal_id, r.node_id, r.edge_id, r.subgraph_id, r.rating, r.commentary_md, r.week, r.created_at, r.updated_at,
       r.reviewer_id, p.username as reviewer_username, p.is_active as reviewer_active,
       (select count(*) from kgdj.review_helpful h where h.review_id = r.id) as helpful_count,
       exists (select 1 from kgdj.review_helpful h where h.review_id = r.id and h.voter_id = auth.uid()) as helpful_by_me
from kgdj.reviews r
left join kgdj.profiles p on p.id = r.reviewer_id;

-- ---------------------------------------------------------------- leaderboard: many authentic "bests"
-- Every measure counts identified, reviewable work — never clicks. A member appears only with
-- leaderboard_display consent (GDPR Art. 7). Editors' promotions are not scored (they judge).
drop view kgdj.leaderboard;
create view kgdj.leaderboard as
with mine as (select g.id, g.owner_id from kgdj.student_subgraphs g),
     link_depts as (
       select l.subgraph_id, l.id as link_id, a.department_id as da, b.department_id as db, length(l.why) as why_len, l.lens, l.created_week
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
  (select count(distinct w) from (
      select ld.created_week as w from link_depts ld join mine g on g.id = ld.subgraph_id where g.owner_id = p.id
      union select pn.created_week from kgdj.subgraph_private_nodes pn join mine g on g.id = pn.subgraph_id where g.owner_id = p.id
      union select sn.added_week from kgdj.subgraph_nodes sn join mine g on g.id = sn.subgraph_id where g.owner_id = p.id
      union select r.week from kgdj.reviews r where r.reviewer_id = p.id) t where w is not null)                                                             as active_weeks
from kgdj.profiles p
left join kgdj.departments d on d.id = p.department_id
where p.is_active
  and exists (select 1 from kgdj.consent_records c where c.profile_id = p.id and c.purpose = 'leaderboard_display' and c.granted and c.withdrawn_at is null);
comment on view kgdj.leaderboard is 'Opt-in (leaderboard_display consent). One row per member with many authentic measures; the UI shows a separate top list per measure so different strengths surface.';
grant select on kgdj.leaderboard to authenticated;

-- ---------------------------------------------------------------- cohort statistics (anonymised)
-- Per-portfolio metrics (same definitions as the frontend's report.ts) and aggregates over a scope,
-- released only when at least 3 portfolios qualify. Used by the student's own comparison report.
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
       w as (select count(distinct wk) c from (select added_week wk from kgdj.subgraph_nodes where subgraph_id = g union select created_week from kgdj.subgraph_private_nodes where subgraph_id = g union select created_week from kgdj.subgraph_links where subgraph_id = g) t where wk is not null),
       cr as (select count(*) c from kgdj.reviews where subgraph_id = g)
  select jsonb_build_object(
    'canonical_nodes', n.c, 'annotated_nodes', ann.c, 'avg_annotation_len', round(ann.avg_len), 'own_nodes', pn.c, 'questions', pn.q, 'resources', pn.r, 'theories', pn.t, 'methods', pn.m,
    'connections', l.c, 'avg_why_len', round(l.avg_why), 'lenses', l.lenses, 'adopted_edges', l.adopted, 'cross_dept_connections', l.cross_dept,
    'departments_covered', d.c, 'node_types_covered', ty.c, 'weeks_active', w.c, 'critiques_received', cr.c)
  from n, ann, pn, l, d, ty, w, cr
$$;

create or replace function kgdj.portfolio_cohort_stats(scope text, module uuid default null) returns jsonb language plpgsql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare ids uuid[]; k text; agg jsonb := '{}'::jsonb; n int; one jsonb;
begin
  if not kgdj.is_member() then raise exception 'members only'; end if;
  if scope = 'module' then
    if module is null or not kgdj.is_module_member(module) then raise exception 'not a member of that module'; end if;
    select array_agg(g.id) into ids from kgdj.student_subgraphs g where g.module_id = module;
  elsif scope = 'program' then
    select array_agg(g.id) into ids from kgdj.student_subgraphs g join kgdj.profiles p on p.id = g.owner_id where p.role = 'msc_student' and p.is_active;
  else
    select array_agg(g.id) into ids from kgdj.student_subgraphs g;
  end if;
  n := coalesce(array_length(ids, 1), 0);
  if n < 3 then return jsonb_build_object('scope', scope, 'n', n, 'metrics', null, 'reason', 'fewer than 3 portfolios in scope; no aggregates released'); end if;
  for k in select distinct jsonb_object_keys(kgdj.portfolio_metrics(g)) from unnest(ids) g loop
    select jsonb_build_object('mean', round(avg(v), 1), 'median', percentile_cont(0.5) within group (order by v), 'p75', percentile_cont(0.75) within group (order by v), 'max', max(v))
      into one from (select (kgdj.portfolio_metrics(g) ->> k)::numeric v from unnest(ids) g) t;
    agg := agg || jsonb_build_object(k, one);
  end loop;
  return jsonb_build_object('scope', scope, 'n', n, 'metrics', agg);
end $$;
revoke execute on function kgdj.portfolio_metrics(uuid) from public;
revoke execute on function kgdj.portfolio_cohort_stats(text, uuid) from public;
grant execute on function kgdj.portfolio_metrics(uuid) to authenticated;
grant execute on function kgdj.portfolio_cohort_stats(text, uuid) to authenticated;

-- research groups: readable by members, maintained by editors
alter table kgdj.research_groups enable row level security;
alter table kgdj.research_groups force row level security;
grant select, insert, update on kgdj.research_groups to authenticated;
create policy research_groups_read on kgdj.research_groups for select to authenticated using (kgdj.is_member());
create policy research_groups_write on kgdj.research_groups for all to authenticated using (kgdj.is_editor()) with check (kgdj.is_editor());

-- audit the new table like the others
create trigger review_helpful_audit after insert or delete on kgdj.review_helpful for each row execute function kgdj.audit_row();
