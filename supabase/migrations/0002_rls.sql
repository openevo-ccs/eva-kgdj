-- Eva KGDJ — 0002 row-level security
--
-- Visibility rules as signed off 2026-09-04 (ADR §6.5):
--   * canonical / archived nodes & edges: every active, allowlisted member.
--   * status='proposed' nodes & edges (the imported seed, i.e. the shared
--     review queue): every member — they exist to be reviewed.  [see README Q1]
--   * proposed_changes (submissions): drafts are the proposer's alone; every
--     other status is visible to all members (decision 3, 2026-09-04: anyone
--     may review any proposal/node/edge/subgraph they can see).
--   * student subgraphs: owner; profiles it is explicitly shared with; the
--     module's instructors; visibility 'module' -> all module members,
--     'members' -> all members.
--   * public / anon: NOTHING. No policy grants to `anon`, and RLS is enabled
--     on every table. The frontend is additionally gated at the host (ADR §4).
--
-- Supabase-specific: auth.uid() and the authenticated/anon roles. On another
-- host, replace auth.uid() with whatever the auth proxy sets (e.g. a
-- request.jwt.claim.sub setting) — the helper functions below are the only
-- place it appears.

-- ---------------------------------------------------------------- helpers
create or replace function kgdj.uid() returns uuid language sql stable as $$
  select auth.uid()
$$;

create or replace function kgdj.is_member() returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (select 1 from kgdj.profiles p where p.id = auth.uid() and p.is_active)
$$;

create or replace function kgdj.my_role() returns kgdj.user_role language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select p.role from kgdj.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function kgdj.is_editor() returns boolean language sql stable as $$
  select kgdj.my_role() in ('editor', 'admin')
$$;

create or replace function kgdj.is_admin() returns boolean language sql stable as $$
  select kgdj.my_role() = 'admin'
$$;

create or replace function kgdj.is_module_instructor(m uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select m is not null and (
    exists (select 1 from kgdj.modules x where x.id = m and x.instructor_id = auth.uid())
    or exists (select 1 from kgdj.module_members mm where mm.module_id = m and mm.profile_id = auth.uid() and mm.member_role in ('instructor', 'assistant'))
  )
$$;

create or replace function kgdj.is_module_member(m uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select m is not null and exists (select 1 from kgdj.module_members mm where mm.module_id = m and mm.profile_id = auth.uid())
$$;

create or replace function kgdj.can_see_subgraph(s uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (
    select 1 from kgdj.student_subgraphs g
    where g.id = s and (
      g.owner_id = auth.uid()
      or kgdj.is_module_instructor(g.module_id)
      or exists (select 1 from kgdj.subgraph_shares sh where sh.subgraph_id = g.id and sh.profile_id = auth.uid())
      or (g.visibility = 'module' and kgdj.is_module_member(g.module_id))
      or (g.visibility = 'members' and kgdj.is_member())
    )
  )
$$;

create or replace function kgdj.owns_subgraph(s uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (select 1 from kgdj.student_subgraphs g where g.id = s and g.owner_id = auth.uid())
$$;

create or replace function kgdj.can_see_proposal(pid uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (
    select 1 from kgdj.proposed_changes pc
    where pc.id = pid and (
      pc.proposer_id = auth.uid()
      or kgdj.is_editor()
      or kgdj.is_module_instructor(pc.module_id)
      or (pc.status in ('pending', 'under_review', 'revision_requested') and kgdj.is_module_member(pc.module_id))
      or exists (select 1 from kgdj.reviews r where r.proposal_id = pc.id and r.reviewer_id = auth.uid())
    )
  )
$$;

-- Cross-table lookups used INSIDE policies must not re-enter another table's
-- RLS (Postgres reports "infinite recursion detected in policy" when
-- proposals_read looks at peer_reviews whose policy looks at proposals).
-- These security-definer helpers read the sibling table directly.
create or replace function kgdj.reviewed_by_me(pid uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (select 1 from kgdj.reviews r where r.proposal_id = pid and r.reviewer_id = auth.uid())
$$;
create or replace function kgdj.proposal_proposer(pid uuid) returns uuid language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select pc.proposer_id from kgdj.proposed_changes pc where pc.id = pid
$$;
create or replace function kgdj.can_unmask_proposer(pid uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (select 1 from kgdj.proposed_changes pc where pc.id = pid and (pc.proposer_id = auth.uid() or not pc.submitter_anonymous or kgdj.is_editor() or kgdj.is_module_instructor(pc.module_id)))
$$;
create or replace function kgdj.subgraph_owner(s uuid) returns uuid language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select g.owner_id from kgdj.student_subgraphs g where g.id = s
$$;
create or replace function kgdj.proposal_module(pid uuid) returns uuid language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select pc.module_id from kgdj.proposed_changes pc where pc.id = pid
$$;
create or replace function kgdj.proposal_open_for(pid uuid, reviewer uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (select 1 from kgdj.proposed_changes pc where pc.id = pid and pc.proposer_id <> reviewer and pc.status in ('pending', 'under_review'))
$$;
create or replace function kgdj.subgraph_module(s uuid) returns uuid language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select g.module_id from kgdj.student_subgraphs g where g.id = s
$$;
create or replace function kgdj.shared_with_me(s uuid, need_review boolean) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (select 1 from kgdj.subgraph_shares sh where sh.subgraph_id = s and sh.profile_id = auth.uid() and (not need_review or sh.can_review))
$$;

-- ---------------------------------------------------------------- enable RLS everywhere
do $$
declare t text;
begin
  foreach t in array array['departments', 'node_types', 'relationship_types', 'profiles', 'allowed_domains', 'allowlist', 'modules',
                           'module_members', 'citations', 'nodes', 'edges', 'node_citations', 'edge_citations', 'proposed_changes',
                           'proposal_citations', 'reviews', 'editorial_decisions', 'student_subgraphs', 'subgraph_nodes',
                           'subgraph_private_nodes', 'subgraph_links', 'subgraph_shares', 'review_flags', 'audit_log', 'consent_records']
  loop
    execute format('alter table kgdj.%I enable row level security', t);
    execute format('alter table kgdj.%I force row level security', t);  -- applies to the table owner too (belt and braces)
  end loop;
end $$;

grant usage on schema kgdj to authenticated;
grant select, insert, update, delete on all tables in schema kgdj to authenticated;
grant select on kgdj.leaderboard to authenticated;
-- anon gets nothing: no grants, no policies.

-- ---------------------------------------------------------------- reference tables: readable by members, editable by admins
create policy ref_read_departments on kgdj.departments for select to authenticated using (kgdj.is_member());
create policy ref_write_departments on kgdj.departments for all to authenticated using (kgdj.is_admin()) with check (kgdj.is_admin());
create policy ref_read_node_types on kgdj.node_types for select to authenticated using (kgdj.is_member());
create policy ref_write_node_types on kgdj.node_types for all to authenticated using (kgdj.is_admin()) with check (kgdj.is_admin());
create policy ref_read_rel_types on kgdj.relationship_types for select to authenticated using (kgdj.is_member());
create policy ref_write_rel_types on kgdj.relationship_types for all to authenticated using (kgdj.is_admin()) with check (kgdj.is_admin());

-- ---------------------------------------------------------------- identity
-- profiles: members see username/role/department of other members (needed to
-- attribute contributions); full_name/avatar are exposed through the
-- profiles_public view only when the owner chose canonical_attribution consent.
create policy profiles_read on kgdj.profiles for select to authenticated using (kgdj.is_member());
create policy profiles_update_own on kgdj.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from kgdj.profiles where id = auth.uid()));  -- cannot self-promote
create policy profiles_admin on kgdj.profiles for all to authenticated using (kgdj.is_admin()) with check (kgdj.is_admin());

create policy allowlist_admin on kgdj.allowlist for all to authenticated using (kgdj.is_editor()) with check (kgdj.is_editor());
create policy allowed_domains_admin on kgdj.allowed_domains for all to authenticated using (kgdj.is_admin()) with check (kgdj.is_admin());

create policy modules_read on kgdj.modules for select to authenticated using (kgdj.is_member());
create policy modules_write on kgdj.modules for all to authenticated using (kgdj.is_editor()) with check (kgdj.is_editor());
create policy module_members_read on kgdj.module_members for select to authenticated
  using (profile_id = auth.uid() or kgdj.is_module_member(module_id) or kgdj.is_editor());
create policy module_members_write on kgdj.module_members for all to authenticated
  using (kgdj.is_editor() or kgdj.is_module_instructor(module_id)) with check (kgdj.is_editor() or kgdj.is_module_instructor(module_id));

-- ---------------------------------------------------------------- citations: members read, members add, creator/editor edit
create policy citations_read on kgdj.citations for select to authenticated using (kgdj.is_member());
create policy citations_insert on kgdj.citations for insert to authenticated with check (kgdj.is_member() and created_by = auth.uid());
create policy citations_update on kgdj.citations for update to authenticated
  using (kgdj.is_editor() or created_by = auth.uid()) with check (kgdj.is_editor() or created_by = auth.uid());
create policy citations_delete on kgdj.citations for delete to authenticated using (kgdj.is_editor());

-- ---------------------------------------------------------------- canonical graph: read for members, WRITE ONLY VIA APPROVAL
-- No insert/update/delete policies for authenticated users on nodes/edges:
-- kgdj.apply_editorial_decision() (0003) runs as security definer and is the
-- only write path. Admins may correct records directly.
create policy nodes_read on kgdj.nodes for select to authenticated using (kgdj.is_member());
create policy nodes_admin on kgdj.nodes for all to authenticated using (kgdj.is_admin()) with check (kgdj.is_admin());
create policy edges_read on kgdj.edges for select to authenticated using (kgdj.is_member());
create policy edges_admin on kgdj.edges for all to authenticated using (kgdj.is_admin()) with check (kgdj.is_admin());
create policy node_citations_read on kgdj.node_citations for select to authenticated using (kgdj.is_member());
create policy node_citations_admin on kgdj.node_citations for all to authenticated using (kgdj.is_admin()) with check (kgdj.is_admin());
create policy edge_citations_read on kgdj.edge_citations for select to authenticated using (kgdj.is_member());
create policy edge_citations_admin on kgdj.edge_citations for all to authenticated using (kgdj.is_admin()) with check (kgdj.is_admin());

-- ---------------------------------------------------------------- proposals
-- Written against the row's own columns (not kgdj.can_see_proposal(id)):
-- INSERT ... RETURNING evaluates the SELECT policy, and a STABLE helper that
-- re-reads the table runs in the statement's start snapshot, where the new
-- row does not exist yet (found live 2026-09-04). Same rule for subgraphs.
create policy proposals_read on kgdj.proposed_changes for select to authenticated using (
  proposer_id = auth.uid()
  or kgdj.is_editor()
  or (status <> 'draft' and kgdj.is_member())
);
-- Submitter anonymity: the frontend lists proposals through this view, which
-- nulls proposer_id unless the viewer is the proposer, an editor, or the
-- module's instructor. (The raw table still exposes proposer_id to members —
-- the app must use the view; a later hardening step can move the column.)
create or replace view kgdj.proposals_visible with (security_invoker = true) as
select pc.id, pc.change_type, pc.target_node_id, pc.target_edge_id, pc.payload, pc.rationale, pc.module_id, pc.status,
       pc.submitted_at, pc.updated_at, pc.decided_at, pc.result_node_id, pc.result_edge_id, pc.submitter_anonymous,
       case when kgdj.can_unmask_proposer(pc.id) then pc.proposer_id end as proposer_id
from kgdj.proposed_changes pc;
grant select on kgdj.proposals_visible to authenticated;
create policy proposals_insert on kgdj.proposed_changes for insert to authenticated
  with check (kgdj.is_member() and proposer_id = auth.uid() and status in ('draft', 'pending'));
-- proposer edits only while draft / revision_requested, and may withdraw; status
-- transitions beyond that are made by the workflow functions (0003).
create policy proposals_update_own on kgdj.proposed_changes for update to authenticated
  using (proposer_id = auth.uid() and status in ('draft', 'revision_requested', 'pending'))
  with check (proposer_id = auth.uid() and status in ('draft', 'pending', 'withdrawn'));
create policy proposals_editor on kgdj.proposed_changes for update to authenticated using (kgdj.is_editor()) with check (kgdj.is_editor());
create policy proposals_delete_draft on kgdj.proposed_changes for delete to authenticated using (proposer_id = auth.uid() and status = 'draft');

create policy proposal_citations_read on kgdj.proposal_citations for select to authenticated using (kgdj.can_see_proposal(proposal_id));
create policy proposal_citations_write on kgdj.proposal_citations for all to authenticated
  using (exists (select 1 from kgdj.proposed_changes pc where pc.id = proposal_id and pc.proposer_id = auth.uid() and pc.status in ('draft', 'revision_requested')) or kgdj.is_editor())
  with check (exists (select 1 from kgdj.proposed_changes pc where pc.id = proposal_id and pc.proposer_id = auth.uid() and pc.status in ('draft', 'revision_requested')) or kgdj.is_editor());

-- ---------------------------------------------------------------- reviews (decision 3)
-- Anyone may review anything they can see, except their own work (conflict of
-- interest — also enforced by a trigger in 0003). Proposal reviews only while
-- the proposal is open; node/edge reviews on non-archived records; subgraph
-- reviews when the portfolio is visible to the reviewer.
create policy reviews_insert on kgdj.reviews for insert to authenticated
  with check (
    reviewer_id = auth.uid() and kgdj.is_member() and (
      (target_kind = 'proposal' and kgdj.proposal_open_for(proposal_id, auth.uid()) and kgdj.can_see_proposal(proposal_id))
      or (target_kind = 'node' and exists (select 1 from kgdj.nodes n where n.id = node_id and n.status <> 'archived' and coalesce(n.created_by, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid()))
      or (target_kind = 'edge' and exists (select 1 from kgdj.edges e where e.id = edge_id and e.status <> 'archived' and coalesce(e.created_by, '00000000-0000-0000-0000-000000000000'::uuid) <> auth.uid()))
      or (target_kind = 'subgraph' and kgdj.subgraph_owner(subgraph_id) <> auth.uid() and (kgdj.shared_with_me(subgraph_id, true) or kgdj.is_module_instructor(kgdj.subgraph_module(subgraph_id)) or kgdj.can_see_subgraph(subgraph_id)))
    )
  );
create policy reviews_update_own on kgdj.reviews for update to authenticated using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
create policy reviews_delete_own on kgdj.reviews for delete to authenticated using (reviewer_id = auth.uid() or kgdj.is_editor());
-- Reviewers are ALWAYS identified (2026-09-04): a review is visible, with its
-- reviewer, to everyone who can see its target.
create policy reviews_read on kgdj.reviews for select to authenticated
  using (
    reviewer_id = auth.uid() or (kgdj.is_editor() and target_kind <> 'subgraph')   -- decision 4: editors do not see portfolios unless they are the module's instructor
    or (target_kind in ('node', 'edge') and kgdj.is_member())
    or (target_kind = 'proposal' and kgdj.can_see_proposal(proposal_id))
    or (target_kind = 'subgraph' and kgdj.can_see_subgraph(subgraph_id))
  );
-- Kept as a stable name for the frontend; adds reviewer status so a review by
-- an erased (tombstoned) account is visibly not a credible one.
create or replace view kgdj.reviews_visible with (security_invoker = true) as
select r.id, r.target_kind, r.proposal_id, r.node_id, r.edge_id, r.subgraph_id, r.rating, r.commentary_md, r.week, r.created_at, r.updated_at,
       r.reviewer_id, p.username as reviewer_username, p.is_active as reviewer_active
from kgdj.reviews r
left join kgdj.profiles p on p.id = r.reviewer_id;
grant select on kgdj.reviews_visible to authenticated;

create policy review_flags_read on kgdj.review_flags for select to authenticated using (kgdj.is_member());
create policy review_flags_write on kgdj.review_flags for all to authenticated using (kgdj.is_editor()) with check (kgdj.is_editor());

-- Editors'' readiness view: how much review a target has attracted (decision 3: editors decide when it is enough)
create or replace view kgdj.review_summary with (security_invoker = true) as
select target_kind, coalesce(proposal_id, node_id, edge_id, subgraph_id) as target_id,
       count(*) as n_reviews,
       count(*) filter (where rating = 'strongly_accept') as strongly_accept,
       count(*) filter (where rating = 'accept') as accept,
       count(*) filter (where rating = 'neutral') as neutral,
       count(*) filter (where rating = 'reject') as reject,
       count(*) filter (where rating = 'strongly_reject') as strongly_reject,
       round(avg(case rating when 'strongly_reject' then -2 when 'reject' then -1 when 'neutral' then 0 when 'accept' then 1 else 2 end), 2) as mean_score,
       count(*) filter (where p.is_active) as credible_reviews,        -- reviews by identifiable, non-erased reviewers
       (count(*) filter (where p.is_active)) = 0 as all_reviewers_deleted,
       max(r.created_at) as last_review_at
from kgdj.reviews r
left join kgdj.profiles p on p.id = r.reviewer_id
group by target_kind, coalesce(proposal_id, node_id, edge_id, subgraph_id);
grant select on kgdj.review_summary to authenticated;

-- ---------------------------------------------------------------- editorial decisions
create policy decisions_read on kgdj.editorial_decisions for select to authenticated
  using (kgdj.is_editor() or (proposal_id is not null and kgdj.can_see_proposal(proposal_id)) or (proposal_id is null and kgdj.is_member()));
create policy decisions_insert on kgdj.editorial_decisions for insert to authenticated
  with check (kgdj.is_editor() and editor_id = auth.uid());

-- ---------------------------------------------------------------- student portfolios
create policy subgraphs_read on kgdj.student_subgraphs for select to authenticated using (
  owner_id = auth.uid()
  or kgdj.is_module_instructor(module_id)
  or kgdj.shared_with_me(id, false)
  or (visibility = 'module' and kgdj.is_module_member(module_id))
  or (visibility = 'members' and kgdj.is_member())
);
create policy subgraphs_insert on kgdj.student_subgraphs for insert to authenticated with check (kgdj.is_member() and owner_id = auth.uid());
create policy subgraphs_update on kgdj.student_subgraphs for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy subgraphs_delete on kgdj.student_subgraphs for delete to authenticated using (owner_id = auth.uid());

create policy subgraph_nodes_read on kgdj.subgraph_nodes for select to authenticated using (kgdj.can_see_subgraph(subgraph_id));
create policy subgraph_nodes_write on kgdj.subgraph_nodes for all to authenticated using (kgdj.owns_subgraph(subgraph_id)) with check (kgdj.owns_subgraph(subgraph_id));
create policy private_nodes_read on kgdj.subgraph_private_nodes for select to authenticated using (kgdj.can_see_subgraph(subgraph_id));
create policy private_nodes_write on kgdj.subgraph_private_nodes for all to authenticated using (kgdj.owns_subgraph(subgraph_id)) with check (kgdj.owns_subgraph(subgraph_id));
create policy links_read on kgdj.subgraph_links for select to authenticated using (kgdj.can_see_subgraph(subgraph_id));
create policy links_write on kgdj.subgraph_links for all to authenticated using (kgdj.owns_subgraph(subgraph_id)) with check (kgdj.owns_subgraph(subgraph_id));
create policy shares_read on kgdj.subgraph_shares for select to authenticated using (kgdj.owns_subgraph(subgraph_id) or profile_id = auth.uid());
create policy shares_write on kgdj.subgraph_shares for all to authenticated using (kgdj.owns_subgraph(subgraph_id)) with check (kgdj.owns_subgraph(subgraph_id));
-- (portfolio critiques: see the reviews policies above, target_kind = 'subgraph')

-- ---------------------------------------------------------------- accountability
create policy audit_read_admin on kgdj.audit_log for select to authenticated using (kgdj.is_admin());
-- inserts happen only through the security-definer audit trigger; no insert policy for users.
create policy consent_own on kgdj.consent_records for all to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy consent_admin_read on kgdj.consent_records for select to authenticated using (kgdj.is_admin());
