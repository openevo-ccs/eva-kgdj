-- kgdj.modules had no way to store a term's actual start/end date -- only
-- code/name/cohort_year/term (WiSe/SoSe), enough to identify a module but
-- not enough to ever compute "what week is it" automatically. Real dates for
-- the WiSe 2026/27 CCP module arrived (Dustin, via lab-manager, 2026-09-10)
-- the same day the module row itself is finally getting seeded -- adding the
-- columns now rather than losing the information or bolting it on separately
-- later. Nullable: most modules created going forward may not have exact
-- dates decided yet either.
alter table kgdj.modules add column if not exists starts_on date;
alter table kgdj.modules add column if not exists ends_on date;
alter table kgdj.modules add constraint modules_dates_order check (starts_on is null or ends_on is null or ends_on >= starts_on);
