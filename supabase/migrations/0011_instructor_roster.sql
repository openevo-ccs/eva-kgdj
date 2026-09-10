-- Instructor-facing module roster: RLS gap fix + a read-only summary view.
--
-- Decision record: docs/kgdj/15-instructor-view.md.

-- Found while building this: kgdj.modules.instructor_id (admin-assigned per the
-- roadmap's own decision -- "instructors assigned by admin") does not by itself
-- create a kgdj.module_members row for that person. module_members_read
-- (0002_rls.sql) only grants read via is_module_member() -- which checks
-- module_members directly -- or is_editor(), never is_module_instructor(). So an
-- admin-assigned instructor with no separate module_members row of their own could
-- see every student's portfolio (subgraphs_read already correctly uses
-- is_module_instructor) but not the roster of who those students even are. Same class
-- of fix already applied everywhere else an instructor needs module-scoped access
-- (subgraphs_read, proposed_changes anonymity, reviews visibility) -- this table had
-- just been missed.
drop policy if exists module_members_read on kgdj.module_members;
create policy module_members_read on kgdj.module_members for select to authenticated
  using (profile_id = auth.uid() or kgdj.is_module_member(module_id) or kgdj.is_module_instructor(module_id) or kgdj.is_editor());

-- One row per (module, student subgraph), instructor-readable metrics only -- no
-- portfolio content, matching portfolio_cohort_stats' own existing precedent of
-- calling portfolio_metrics() across subgraphs the caller doesn't individually own.
-- security_invoker so RLS still applies per-caller: a row only returns if the caller
-- can actually read that module_members / student_subgraphs pair. portfolio_metrics()
-- itself performs no separate visibility check (same as when portfolio_cohort_stats
-- calls it), so pairing it behind this view -- itself gated by real table RLS -- is
-- the correctness boundary, not the function.
create or replace view kgdj.module_roster with (security_invoker = true) as
select mm.module_id, mm.profile_id, mm.member_role, mm.joined_at,
       p.username, p.full_name,
       g.id as subgraph_id, g.title as subgraph_title, g.visibility as subgraph_visibility,
       g.last_checkpoint_week, g.updated_at as subgraph_updated_at,
       kgdj.portfolio_metrics(g.id) as metrics
from kgdj.module_members mm
join kgdj.profiles p on p.id = mm.profile_id
left join kgdj.student_subgraphs g on g.owner_id = mm.profile_id and g.module_id = mm.module_id;
grant select on kgdj.module_roster to authenticated;
comment on view kgdj.module_roster is 'Per-student, per-portfolio metrics for one module -- instructor/assistant/editor only in practice, gated by module_members_read + subgraphs_read RLS on the underlying tables, not by this view itself. A student with no portfolio yet still gets one row (subgraph_id null) so "hasn''t started" is visible, not absent.';
