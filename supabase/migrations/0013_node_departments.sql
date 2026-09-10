-- Real multi-department support. Found live, 2026-09-10: with "none" selected in
-- Explorer's department filter, 18 nodes still showed -- every node whose
-- department_id is null, because the filter's own logic ("!n.department_id ||
-- depts.has(n.department_id)") always lets a department-less node through. Those 18
-- turned out to be exactly mpi-eva-graph's institute-wide layer (theories/domains/
-- topics/scicomm-sensitivities that genuinely span 2-5 departments at once, plus a
-- few fieldsites) -- real multi-department content, but kgdj.nodes.department_id is
-- a single nullable FK with no way to record more than one, so it landed as null and
-- rendered gray ("no department"), not as the multi-department fact it actually is.
--
-- Deliberately NOT replacing nodes.department_id -- dozens of places in the app
-- (filters, DeptSwatch, the department-pair coherence matrix) already correctly read
-- it as "this node's one primary department," and that's still true for the ~442
-- single-department nodes. Adding a join table alongside it, not instead of it:
-- department_id stays the primary/backward-compatible field; node_departments becomes
-- the complete membership (every node gets at least one row here, including the
-- single-department ones, via the backfill in 0010_node_departments_backfill.sql).
create table kgdj.node_departments (
  node_id        uuid not null references kgdj.nodes (id) on delete cascade,
  department_id  uuid not null references kgdj.departments (id) on delete cascade,
  primary key (node_id, department_id)
);
create index node_departments_dept_idx on kgdj.node_departments (department_id);
comment on table kgdj.node_departments is 'Complete department membership per node -- one row per (node, department) pair, including single-department nodes (see backfill seed). nodes.department_id remains the primary/backward-compatible department where one exists; this table is the source of truth for "which departments does this node genuinely belong to," used by multi-department filtering and pie-slice node coloring.';

alter table kgdj.node_departments enable row level security;
alter table kgdj.node_departments force row level security;
grant select, insert, delete on kgdj.node_departments to authenticated;
create policy node_departments_read on kgdj.node_departments for select to authenticated using (kgdj.is_member());
create policy node_departments_admin on kgdj.node_departments for all to authenticated using (kgdj.is_admin()) with check (kgdj.is_admin());
