-- Real facts for the WiSe 2026/27 CCP pilot module, given by Dustin directly
-- (relayed via lab-manager, 2026-09-10): id ccp-wise-2026-27, runs
-- 2026-10-12 to 2027-02-01, led by Daniel Haun and Katja Liebal, coordination
-- by Dustin Eirdosh, lectures given by CCP researchers.
--
-- Daniel Haun and Katja Liebal do NOT have KGDJ accounts yet (checked live:
-- only one real profile exists on this project, Dustin's own). Not
-- fabricated here -- instructor_id is set to Dustin (the one real account,
-- and a legitimate real role: "coordination"), and he can add Haun/Liebal
-- as module_members with role 'instructor' himself, as admin, the moment
-- either of them signs up. "Lectures given by CCP researchers" names no
-- specific individuals, so nothing was invented for that part either.
begin;

insert into kgdj.modules (id, code, name, cohort_year, term, department_id, instructor_id, starts_on, ends_on)
select gen_random_uuid(), 'ccp-wise-2026-27', 'Comparative Cultural Psychology', 2026, 'WiSe',
       (select id from kgdj.departments where code = 'ccp'),
       (select id from kgdj.profiles where username = 'dustin.eirdosh'),
       '2026-10-12', '2027-02-01'
where not exists (select 1 from kgdj.modules where code = 'ccp-wise-2026-27');

insert into kgdj.module_members (module_id, profile_id, member_role)
select m.id, p.id, 'instructor'
from kgdj.modules m, kgdj.profiles p
where m.code = 'ccp-wise-2026-27' and p.username = 'dustin.eirdosh'
on conflict (module_id, profile_id) do update set member_role = 'instructor';

commit;
