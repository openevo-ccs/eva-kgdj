-- Eva KGDJ — 0004 sign-up gate and profile bootstrap  (SUPABASE-SPECIFIC)
--
-- Default-deny sign-up: a user may be created only if the email's domain is in
-- kgdj.allowed_domains (eva.mpg.de, uni-leipzig.de — decided 2026-09-04) or the
-- exact address is in kgdj.allowlist. Implemented twice, deliberately:
--   1. kgdj.before_user_created(event) — a Supabase Auth "Before User Created"
--      hook (Dashboard > Authentication > Hooks). Rejects at sign-up time.
--   2. kgdj.handle_new_user() — an AFTER INSERT trigger on auth.users that
--      creates the profile and re-checks the gate, so a mis-configured hook
--      cannot silently admit someone: an unlisted user gets NO profile and
--      therefore fails kgdj.is_member() everywhere.
-- On a non-Supabase host, replace both with the auth proxy's equivalent; the
-- table kgdj.allowed_domains / kgdj.allowlist stay as they are.

insert into kgdj.allowed_domains (domain, default_role, institution, note) values
  ('eva.mpg.de',      'researcher',  'mpi-eva',     'MPI-EVA staff and researchers'),
  ('uni-leipzig.de',  'msc_student', 'uni-leipzig', 'Uni-Leipzig accounts (students and staff); students default to msc_student')
on conflict (domain) do nothing;

create or replace function kgdj.email_domain(email text) returns citext language sql immutable as $$
  select lower(split_part(email, '@', 2))::citext
$$;

-- Is this address allowed to sign up? Returns (allowed, role, institution, department_id, module_id)
create or replace function kgdj.signup_lookup(p_email text)
returns table (allowed boolean, role kgdj.user_role, institution kgdj.institution, department_id uuid, module_id uuid)
language plpgsql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare a kgdj.allowlist%rowtype; d kgdj.allowed_domains%rowtype;
begin
  select * into a from kgdj.allowlist al where al.email = p_email::citext;
  if found then
    return query select true, a.role, a.institution, a.department_id, a.module_id; return;
  end if;
  select * into d from kgdj.allowed_domains ad where ad.domain = kgdj.email_domain(p_email);
  if found then
    return query select true, d.default_role, d.institution, null::uuid, null::uuid; return;
  end if;
  return query select false, null::kgdj.user_role, null::kgdj.institution, null::uuid, null::uuid;
end $$;

-- 1. Auth hook (Supabase "Before User Created"): payload {"user": {"email": ...}} -> {} to allow, or an error object to deny.
create or replace function kgdj.before_user_created(event jsonb) returns jsonb language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare em text; ok boolean;
begin
  em := event -> 'user' ->> 'email';
  select allowed into ok from kgdj.signup_lookup(em);
  if coalesce(ok, false) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Sign-up is limited to MPI-EVA and Uni-Leipzig addresses or invited collaborators. Contact the KGDJ editors for an invitation.'));
end $$;
grant execute on function kgdj.before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function kgdj.before_user_created(jsonb) from authenticated, anon, public;
grant usage on schema kgdj to supabase_auth_admin;
grant select on kgdj.allowlist, kgdj.allowed_domains to supabase_auth_admin;

-- 2. Profile bootstrap after auth.users insert (belt and braces)
create or replace function kgdj.handle_new_user() returns trigger language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare l record; uname text; base text; n int := 0;
begin
  select * into l from kgdj.signup_lookup(new.email);
  if not coalesce(l.allowed, false) then
    -- no profile => not a member; the auth account exists but can do nothing.
    insert into kgdj.audit_log (actor_id, action, table_name, row_id, after_row)
    values (new.id, 'signup-denied', 'auth.users', new.id::text, jsonb_build_object('domain', kgdj.email_domain(new.email)));
    return new;
  end if;
  base := regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9._-]', '', 'g');
  if length(base) < 3 then base := 'user'; end if;
  uname := base;
  while exists (select 1 from kgdj.profiles where username = uname::citext) loop
    n := n + 1; uname := base || n::text;
  end loop;
  insert into kgdj.profiles (id, username, role, institution, department_id)
  values (new.id, uname, l.role, l.institution, l.department_id);
  if l.module_id is not null then
    insert into kgdj.module_members (module_id, profile_id, member_role) values (l.module_id, new.id, 'student') on conflict do nothing;
  end if;
  update kgdj.allowlist set used_at = now() where email = new.email::citext;
  return new;
end $$;

drop trigger if exists kgdj_on_auth_user_created on auth.users;
create trigger kgdj_on_auth_user_created after insert on auth.users for each row execute function kgdj.handle_new_user();

-- Erasure helper (GDPR Art. 17): anonymise a profile's personal fields and
-- detach ownership; canonical contributions stay (attributed to "deleted user")
-- because the journal record is the institute's, portfolios are deleted.
create or replace function kgdj.erase_profile(target uuid) returns void language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
begin
  if not kgdj.is_admin() and auth.uid() <> target then
    raise exception 'Only the person themselves or an admin may erase a profile';
  end if;
  delete from kgdj.student_subgraphs where owner_id = target;
  delete from kgdj.consent_records where profile_id = target;
  update kgdj.profiles set username = 'deleted-' || left(target::text, 8), full_name = null, avatar_url = null, is_active = false, department_id = null where id = target;
  insert into kgdj.audit_log (actor_id, action, table_name, row_id) values (auth.uid(), 'erase', 'profiles', target::text);
end $$;
