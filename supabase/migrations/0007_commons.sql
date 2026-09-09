-- Eva KGDJ — 0007 commons spaces
-- Implements docs/kgdj/04-commons-design.md §4-6 (skeleton + all six decisions resolved
-- 2026-09-06) — a genuinely new entity between one student's private portfolio and the
-- institute-wide canonical graph: an opt-in, role-gated space where a group jointly curates
-- content nobody individually owns, via the same propose -> review -> decide -> promote shape
-- the canonical graph already uses (see 0003's apply_editorial_decision() — this migration is
-- structurally that pattern one level down, reusing kgdj.change_type's shape, kgdj.review_rating,
-- kgdj.proposal_status, and the audit_row()/touch_updated_at() triggers directly).
--
-- NOT yet applied to the live project as of writing — this file is a reviewable draft
-- (validated against a local throwaway Postgres, see supabase/test/apply_and_test.py) pending
-- Dustin's sign-off before `supabase db push`.

-- ---------------------------------------------------------------- enums
create type kgdj.commons_join_policy as enum ('invite_only', 'request_approval', 'open_to_module_members');
create type kgdj.commons_role as enum ('viewer', 'contributor', 'reviewer', 'steward');
create type kgdj.commons_participant_status as enum ('invited', 'requested', 'active');
-- Mechanical rename of kgdj.change_type's add/edit/archive shape (decision 1, §4) — a new type
-- because the values themselves differ (add_item vs add_node), not because the idea does.
create type kgdj.commons_change_type as enum ('add_item', 'edit_item', 'archive_item', 'add_link', 'edit_link', 'archive_link');
create type kgdj.commons_decision as enum ('approve', 'reject', 'request_revision', 'archive');
create type kgdj.commons_item_status as enum ('active', 'archived');

-- ---------------------------------------------------------------- tables
create table kgdj.commons_spaces (
  id           uuid primary key default gen_random_uuid(),
  module_id    uuid references kgdj.modules (id) on delete set null,   -- null = free-standing (decision-doc §4)
  label        text not null,
  description  text not null default '',
  join_policy  kgdj.commons_join_policy not null default 'open_to_module_members',
  created_by   uuid not null references kgdj.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table kgdj.commons_spaces is 'A joint-curation space (a module''s, or a free-standing cross-department one) — see 04-commons-design.md.';
comment on column kgdj.commons_spaces.module_id is 'Single nullable parent, not multi-parent (YAGNI per §7); null = not tied to a teaching module.';
create index commons_spaces_module_idx on kgdj.commons_spaces (module_id);

create table kgdj.commons_participants (
  commons_space_id  uuid not null references kgdj.commons_spaces (id) on delete cascade,
  profile_id        uuid not null references kgdj.profiles (id) on delete cascade,
  role              kgdj.commons_role not null default 'contributor',
  status            kgdj.commons_participant_status not null default 'invited',
  invited_by        uuid references kgdj.profiles (id) on delete set null,
  joined_at         timestamptz,
  created_at        timestamptz not null default now(),
  primary key (commons_space_id, profile_id)
);
comment on table kgdj.commons_participants is 'Opt-in membership + role, independently settable (NOT auto-derived from module_members.member_role — §5). Only status=active grants real access.';

create table kgdj.commons_items (
  id                   uuid primary key default gen_random_uuid(),
  commons_space_id     uuid not null references kgdj.commons_spaces (id) on delete cascade,
  kind                 kgdj.private_node_type not null,   -- reuses the vocabulary students already use in portfolios (decision 2, §6.2)
  label                text not null,
  description          text not null default '',
  content              jsonb not null default '{}'::jsonb,
  status               kgdj.commons_item_status not null default 'active',
  created_by           uuid not null references kgdj.profiles (id) on delete set null,
  updated_by           uuid references kgdj.profiles (id) on delete set null,
  provenance           jsonb not null default '{}'::jsonb,
  promoted_to_node_id  uuid references kgdj.nodes (id) on delete set null,   -- built in now, not deferred (decision 5, §6.5)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table kgdj.commons_items is 'Durable current-state content — the missing piece the first joint draft lacked (a decision log is not the same as queryable state, the way nodes/edges are separate from proposed_changes). Written ONLY by kgdj.apply_commons_decision(); see the RLS section below.';
comment on column kgdj.commons_items.promoted_to_node_id is 'Set by kgdj.link_commons_promotion() once a proposed_changes row whose source_commons_item_id points here is approved — reuses the existing add_node/edit_node canonical-graph pipeline rather than a separate promotion path.';
create index commons_items_space_idx on kgdj.commons_items (commons_space_id);

create table kgdj.commons_links (
  id                uuid primary key default gen_random_uuid(),
  commons_space_id  uuid not null references kgdj.commons_spaces (id) on delete cascade,
  source_item_id    uuid not null references kgdj.commons_items (id) on delete cascade,
  target_item_id    uuid not null references kgdj.commons_items (id) on delete cascade,
  label             text not null check (length(label) >= 10),   -- "I'm connecting X to Y because ..." — same bar as subgraph_links.why
  lens              text,
  created_by        uuid not null references kgdj.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint commons_link_not_self check (source_item_id <> target_item_id)
);
comment on table kgdj.commons_links is 'Same spirit as subgraph_links, one level up: a connection between two commons items, with a reason.';
create index commons_links_space_idx on kgdj.commons_links (commons_space_id);
create index commons_links_source_idx on kgdj.commons_links (source_item_id);
create index commons_links_target_idx on kgdj.commons_links (target_item_id);

create table kgdj.commons_proposals (
  id                         uuid primary key default gen_random_uuid(),
  commons_space_id           uuid not null references kgdj.commons_spaces (id) on delete cascade,
  proposed_by                uuid not null references kgdj.profiles (id) on delete cascade,
  change_type                kgdj.commons_change_type not null,
  target_item_id             uuid references kgdj.commons_items (id) on delete cascade,
  target_link_id             uuid references kgdj.commons_links (id) on delete cascade,
  payload                    jsonb not null default '{}'::jsonb,
  rationale                  text not null default '',
  status                     kgdj.proposal_status not null default 'draft',   -- reused directly (decision 1, §4) — no new enum
  -- NULL (default) = any active participant may review, matching KGDJ's existing canonical-graph
  -- norm; a role value = only participants holding at least that role may (decision 3, §5/§6.3;
  -- chosen by the proposer per-submission, never a space-wide gate).
  review_restricted_to_role  kgdj.commons_role check (review_restricted_to_role is null or review_restricted_to_role in ('reviewer', 'steward')),
  submitted_at               timestamptz,
  updated_at                 timestamptz not null default now(),
  decided_at                 timestamptz,
  result_item_id             uuid references kgdj.commons_items (id) on delete set null,
  result_link_id             uuid references kgdj.commons_links (id) on delete set null,
  constraint commons_proposal_target check (
    (change_type in ('add_item', 'add_link') and target_item_id is null and target_link_id is null) or
    (change_type in ('edit_item', 'archive_item') and target_item_id is not null and target_link_id is null) or
    (change_type in ('edit_link', 'archive_link') and target_link_id is not null and target_item_id is null)
  )
);
create index commons_proposals_space_idx on kgdj.commons_proposals (commons_space_id);
create index commons_proposals_status_idx on kgdj.commons_proposals (status);

-- Citations optional (decision 4, §6.4) — plain join table, no submission-gate requirement
-- (contrast kgdj.check_proposal_submission()'s hard citation requirement for the canonical graph).
create table kgdj.commons_proposal_citations (
  proposal_id  uuid not null references kgdj.commons_proposals (id) on delete cascade,
  citation_id  uuid not null references kgdj.citations (id) on delete restrict,
  primary key (proposal_id, citation_id)
);

create table kgdj.commons_reviews (
  id            uuid primary key default gen_random_uuid(),
  proposal_id   uuid not null references kgdj.commons_proposals (id) on delete cascade,
  reviewer_id   uuid not null references kgdj.profiles (id) on delete cascade,
  rating        kgdj.review_rating not null,   -- reused directly (decision 1, §4)
  commentary_md text not null check (length(commentary_md) >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index commons_reviews_one_per_reviewer on kgdj.commons_reviews (proposal_id, reviewer_id);

create table kgdj.commons_decisions (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references kgdj.commons_proposals (id) on delete cascade,
  decided_by   uuid not null references kgdj.profiles (id) on delete set null,
  outcome      kgdj.commons_decision not null,
  rationale    text not null default '',
  decided_at   timestamptz not null default now()
);
create index commons_decisions_proposal_idx on kgdj.commons_decisions (proposal_id);

-- ---------------------------------------------------------------- reimport into portfolio
-- Reference-not-copy, the same shape subgraph_nodes already uses for canonical nodes (§4) — one
-- new nullable FK, provenance-only. Added to BOTH tables since a commons item a student pulls in
-- is often not yet promoted (subgraph_private_nodes: same kind vocabulary, no canonical node
-- exists yet) as well as the already-promoted case (subgraph_nodes: the canonical fork, with a
-- trail back to the commons item that introduced it). The design note named subgraph_nodes only;
-- both are added here because the not-yet-promoted case is, if anything, the more common one.
alter table kgdj.subgraph_nodes         add column source_commons_item_id uuid references kgdj.commons_items (id) on delete set null;
alter table kgdj.subgraph_private_nodes add column source_commons_item_id uuid references kgdj.commons_items (id) on delete set null;
comment on column kgdj.subgraph_nodes.source_commons_item_id is 'Set when this fork was reimported from a commons item that has since been promoted to this canonical node — provenance only, does not gate anything.';
comment on column kgdj.subgraph_private_nodes.source_commons_item_id is 'Set when this private node was reimported from a not-yet-promoted commons item — provenance only.';

-- Closes the loop portfolio -> commons -> canonical (decision 5, §6.5) by reusing the existing
-- add_node/edit_node proposal pipeline (0003) instead of a separate promotion mechanism: a steward
-- (or the item's own contributor) proposes the item to the canonical graph exactly as a portfolio
-- private node already can, tagging the proposal with source_commons_item_id; once approved,
-- link_commons_promotion() (below) stamps commons_items.promoted_to_node_id back.
alter table kgdj.proposed_changes add column source_commons_item_id uuid references kgdj.commons_items (id) on delete set null;
comment on column kgdj.proposed_changes.source_commons_item_id is 'Set when this canonical-graph proposal originated from "propose to canonical" on a commons item. See kgdj.link_commons_promotion().';

-- ---------------------------------------------------------------- RLS helpers
create or replace function kgdj.is_commons_participant(cs uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (select 1 from kgdj.commons_participants cp where cp.commons_space_id = cs and cp.profile_id = auth.uid() and cp.status = 'active')
$$;

create or replace function kgdj.has_commons_participant_row(cs uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  -- Any status, including invited/requested — otherwise an invited-but-not-yet-active member
  -- could never even see the space well enough to accept the invitation.
  select exists (select 1 from kgdj.commons_participants cp where cp.commons_space_id = cs and cp.profile_id = auth.uid())
$$;

create or replace function kgdj.commons_role_at_least(cs uuid, need kgdj.commons_role) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (
    select 1 from kgdj.commons_participants cp where cp.commons_space_id = cs and cp.profile_id = auth.uid() and cp.status = 'active'
      and case need
            when 'viewer' then true
            when 'contributor' then cp.role in ('contributor', 'reviewer', 'steward')
            when 'reviewer' then cp.role in ('reviewer', 'steward')
            when 'steward' then cp.role = 'steward'
          end
  )
$$;

create or replace function kgdj.commons_space_join_policy(cs uuid) returns kgdj.commons_join_policy language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select join_policy from kgdj.commons_spaces where id = cs
$$;
create or replace function kgdj.commons_space_module(cs uuid) returns uuid language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select module_id from kgdj.commons_spaces where id = cs
$$;
create or replace function kgdj.commons_proposal_space(pid uuid) returns uuid language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select commons_space_id from kgdj.commons_proposals where id = pid
$$;

create or replace function kgdj.can_see_commons_space(cs uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select exists (
    select 1 from kgdj.commons_spaces s where s.id = cs and (
      kgdj.has_commons_participant_row(s.id)
      or (s.module_id is not null and kgdj.is_module_member(s.module_id))
      or kgdj.is_editor()
    )
  )
$$;

-- ---------------------------------------------------------------- enable RLS + grants
do $$
declare t text;
begin
  foreach t in array array['commons_spaces', 'commons_participants', 'commons_items', 'commons_links',
                           'commons_proposals', 'commons_proposal_citations', 'commons_reviews', 'commons_decisions']
  loop
    execute format('alter table kgdj.%I enable row level security', t);
    execute format('alter table kgdj.%I force row level security', t);
  end loop;
end $$;
grant select, insert, update, delete on kgdj.commons_spaces, kgdj.commons_participants, kgdj.commons_items, kgdj.commons_links,
  kgdj.commons_proposals, kgdj.commons_proposal_citations, kgdj.commons_reviews, kgdj.commons_decisions to authenticated;

-- ---------------------------------------------------------------- policies: spaces
create policy commons_spaces_read on kgdj.commons_spaces for select to authenticated using (kgdj.can_see_commons_space(id));
create policy commons_spaces_insert on kgdj.commons_spaces for insert to authenticated with check (kgdj.is_member() and created_by = auth.uid());
create policy commons_spaces_update on kgdj.commons_spaces for update to authenticated
  using (kgdj.commons_role_at_least(id, 'steward')) with check (kgdj.commons_role_at_least(id, 'steward'));
create policy commons_spaces_admin on kgdj.commons_spaces for all to authenticated using (kgdj.is_editor()) with check (kgdj.is_editor());

-- Founding steward: without this, nobody could pass commons_participants' own insert checks
-- for the very first row in a brand-new space (steward-write needs an existing steward; the
-- creator isn't a participant yet at all). Security definer so it can act before any policy
-- of the creator's own would otherwise allow it.
create or replace function kgdj.commons_space_bootstrap_steward() returns trigger language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
begin
  insert into kgdj.commons_participants (commons_space_id, profile_id, role, status, joined_at)
  values (new.id, new.created_by, 'steward', 'active', now());
  return new;
end $$;
create trigger commons_space_bootstrap after insert on kgdj.commons_spaces
  for each row execute function kgdj.commons_space_bootstrap_steward();

-- ---------------------------------------------------------------- policies: participants
create policy commons_participants_read on kgdj.commons_participants for select to authenticated using (
  profile_id = auth.uid() or kgdj.is_commons_participant(commons_space_id) or kgdj.commons_role_at_least(commons_space_id, 'steward') or kgdj.is_editor()
);
-- Self-service, gated by the space's own join_policy — a self-joiner can only grant themselves
-- viewer/contributor, never reviewer/steward (a steward must promote them via the write policy below).
create policy commons_participants_self_join on kgdj.commons_participants for insert to authenticated with check (
  kgdj.is_member() and profile_id = auth.uid() and invited_by is null and role in ('viewer', 'contributor') and (
    (kgdj.commons_space_join_policy(commons_space_id) = 'open_to_module_members' and kgdj.is_module_member(kgdj.commons_space_module(commons_space_id)) and status = 'active')
    or (kgdj.commons_space_join_policy(commons_space_id) = 'request_approval' and status = 'requested')
  )
);
-- Stewards manage membership end to end: invite (any role/status), approve a request (update
-- status to active), change a role, remove someone.
create policy commons_participants_steward_write on kgdj.commons_participants for all to authenticated
  using (kgdj.commons_role_at_least(commons_space_id, 'steward') or kgdj.is_editor())
  with check (kgdj.commons_role_at_least(commons_space_id, 'steward') or kgdj.is_editor());
create policy commons_participants_self_leave on kgdj.commons_participants for delete to authenticated using (profile_id = auth.uid());

-- ---------------------------------------------------------------- policies: items & links
-- No general insert/update for authenticated users — kgdj.apply_commons_decision() (below) is
-- the only write path, exactly mirroring nodes_read/nodes_admin's "write only via approval" (0002).
create policy commons_items_read on kgdj.commons_items for select to authenticated using (kgdj.is_commons_participant(commons_space_id) or kgdj.is_editor());
create policy commons_items_admin on kgdj.commons_items for all to authenticated using (kgdj.is_editor()) with check (kgdj.is_editor());
create policy commons_links_read on kgdj.commons_links for select to authenticated using (kgdj.is_commons_participant(commons_space_id) or kgdj.is_editor());
create policy commons_links_admin on kgdj.commons_links for all to authenticated using (kgdj.is_editor()) with check (kgdj.is_editor());

-- ---------------------------------------------------------------- policies: proposals
create policy commons_proposals_read on kgdj.commons_proposals for select to authenticated using (kgdj.is_commons_participant(commons_space_id) or kgdj.is_editor());
create policy commons_proposals_insert on kgdj.commons_proposals for insert to authenticated
  with check (kgdj.commons_role_at_least(commons_space_id, 'contributor') and proposed_by = auth.uid() and status in ('draft', 'pending'));
create policy commons_proposals_update_own on kgdj.commons_proposals for update to authenticated
  using (proposed_by = auth.uid() and status in ('draft', 'revision_requested', 'pending'))
  with check (proposed_by = auth.uid() and status in ('draft', 'pending', 'withdrawn'));
create policy commons_proposals_steward on kgdj.commons_proposals for update to authenticated
  using (kgdj.commons_role_at_least(commons_space_id, 'steward') or kgdj.is_editor())
  with check (kgdj.commons_role_at_least(commons_space_id, 'steward') or kgdj.is_editor());
create policy commons_proposals_delete_draft on kgdj.commons_proposals for delete to authenticated using (proposed_by = auth.uid() and status = 'draft');

create policy commons_proposal_citations_read on kgdj.commons_proposal_citations for select to authenticated using (
  exists (select 1 from kgdj.commons_proposals cp where cp.id = proposal_id and (kgdj.is_commons_participant(cp.commons_space_id) or kgdj.is_editor()))
);
create policy commons_proposal_citations_write on kgdj.commons_proposal_citations for all to authenticated
  using (exists (select 1 from kgdj.commons_proposals cp where cp.id = proposal_id and cp.proposed_by = auth.uid() and cp.status in ('draft', 'revision_requested')))
  with check (exists (select 1 from kgdj.commons_proposals cp where cp.id = proposal_id and cp.proposed_by = auth.uid() and cp.status in ('draft', 'revision_requested')));

-- ---------------------------------------------------------------- policies: reviews & decisions
create policy commons_reviews_read on kgdj.commons_reviews for select to authenticated using (
  reviewer_id = auth.uid() or exists (select 1 from kgdj.commons_proposals cp where cp.id = proposal_id and (kgdj.is_commons_participant(cp.commons_space_id) or kgdj.is_editor()))
);
create policy commons_reviews_insert on kgdj.commons_reviews for insert to authenticated with check (
  reviewer_id = auth.uid() and exists (
    select 1 from kgdj.commons_proposals cp where cp.id = proposal_id
      and cp.proposed_by <> auth.uid()
      and cp.status in ('pending', 'under_review')
      and kgdj.is_commons_participant(cp.commons_space_id)
      and (cp.review_restricted_to_role is null or kgdj.commons_role_at_least(cp.commons_space_id, cp.review_restricted_to_role))
  )
);
create policy commons_reviews_update_own on kgdj.commons_reviews for update to authenticated using (reviewer_id = auth.uid()) with check (reviewer_id = auth.uid());
create policy commons_reviews_delete_own on kgdj.commons_reviews for delete to authenticated using (reviewer_id = auth.uid() or kgdj.is_editor());

create policy commons_decisions_read on kgdj.commons_decisions for select to authenticated using (
  exists (select 1 from kgdj.commons_proposals cp where cp.id = proposal_id and (kgdj.is_commons_participant(cp.commons_space_id) or kgdj.is_editor()))
);
create policy commons_decisions_insert on kgdj.commons_decisions for insert to authenticated with check (
  decided_by = auth.uid() and exists (select 1 from kgdj.commons_proposals cp where cp.id = proposal_id and (kgdj.commons_role_at_least(cp.commons_space_id, 'steward') or kgdj.is_editor()))
);

-- ---------------------------------------------------------------- submission gate + COI (mirrors 0003)
create or replace function kgdj.check_commons_submission() returns trigger language plpgsql as $$
begin
  if new.status = 'pending' and (old.status is null or old.status in ('draft', 'revision_requested')) then
    -- Lower bar than the canonical graph's 20 chars: Commons is deliberately lower-stakes and
    -- more casual/iterative (decision 4, §6.4) — citation rigor belongs at promotion, not entry.
    if length(coalesce(new.rationale, '')) < 10 then
      raise exception 'A commons proposal needs a short rationale before submission';
    end if;
    if new.change_type = 'add_item' and ((new.payload ->> 'kind') is null or (new.payload ->> 'label') is null) then
      raise exception 'add_item payload needs at least {kind, label}';
    end if;
    if new.change_type = 'add_link' and ((new.payload ->> 'source_item_id') is null or (new.payload ->> 'target_item_id') is null or (new.payload ->> 'label') is null) then
      raise exception 'add_link payload needs {source_item_id, target_item_id, label}';
    end if;
    new.submitted_at := coalesce(new.submitted_at, now());
  end if;
  return new;
end $$;
create trigger commons_submission_gate before insert or update on kgdj.commons_proposals
  for each row execute function kgdj.check_commons_submission();

create or replace function kgdj.check_commons_review_coi() returns trigger language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare proposer uuid; st kgdj.proposal_status;
begin
  select proposed_by, status into proposer, st from kgdj.commons_proposals where id = new.proposal_id;
  if proposer = new.reviewer_id then raise exception 'Conflict of interest: a proposer cannot review their own commons proposal'; end if;
  if st not in ('pending', 'under_review') then raise exception 'Commons proposal is not open for review (status %)', st; end if;
  update kgdj.commons_proposals set status = 'under_review' where id = new.proposal_id and status = 'pending';
  return new;
end $$;
create trigger commons_review_coi before insert on kgdj.commons_reviews for each row execute function kgdj.check_commons_review_coi();

create or replace function kgdj.check_commons_promotion_source() returns trigger language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
begin
  if new.source_commons_item_id is not null and (tg_op = 'INSERT' or new.source_commons_item_id is distinct from old.source_commons_item_id) then
    if not exists (select 1 from kgdj.commons_items ci where ci.id = new.source_commons_item_id and (kgdj.is_commons_participant(ci.commons_space_id) or kgdj.is_editor())) then
      raise exception 'source_commons_item_id must reference a commons item you can see';
    end if;
  end if;
  return new;
end $$;
create trigger check_commons_promotion_source before insert or update on kgdj.proposed_changes
  for each row execute function kgdj.check_commons_promotion_source();

-- ---------------------------------------------------------------- approval: commons_proposal -> commons_items/links
-- Security definer, same reason as apply_editorial_decision(): commons_items/commons_links have
-- no general write policy for authenticated users, so this is the only path onto them.
create or replace function kgdj.apply_commons_decision() returns trigger language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare
  cp          kgdj.commons_proposals%rowtype;
  p           jsonb;
  new_item_id uuid;
  new_link_id uuid;
begin
  select * into cp from kgdj.commons_proposals where id = new.proposal_id for update;
  if not found then raise exception 'Commons proposal % not found', new.proposal_id; end if;
  if cp.status not in ('pending', 'under_review', 'revision_requested') then
    raise exception 'Commons proposal % is not decidable in status %', cp.id, cp.status;
  end if;
  p := coalesce(cp.payload, '{}'::jsonb);

  if new.outcome = 'reject' then
    update kgdj.commons_proposals set status = 'rejected', decided_at = now() where id = cp.id;
    return new;
  elsif new.outcome = 'request_revision' then
    update kgdj.commons_proposals set status = 'revision_requested', decided_at = null where id = cp.id;
    return new;
  elsif new.outcome = 'archive' then
    -- A steward may decide to archive the target item outright instead of doing what the
    -- proposal asked (e.g. an edit_item proposal on something that should just go away).
    if cp.target_item_id is null then raise exception 'archive outcome needs a proposal with a target item'; end if;
    update kgdj.commons_items set status = 'archived', updated_by = new.decided_by, updated_at = now() where id = cp.target_item_id;
    update kgdj.commons_proposals set status = 'approved', decided_at = now(), result_item_id = cp.target_item_id where id = cp.id;
    insert into kgdj.audit_log (actor_id, action, table_name, row_id, after_row)
    values (new.decided_by, 'archive:' || cp.change_type::text, 'commons_items', cp.target_item_id::text, jsonb_build_object('decision_id', new.id));
    return new;
  end if;

  -- outcome = approve ------------------------------------------------------
  case cp.change_type
    when 'add_item' then
      insert into kgdj.commons_items (commons_space_id, kind, label, description, content, created_by, updated_by, provenance)
      values (cp.commons_space_id, (p ->> 'kind')::kgdj.private_node_type, p ->> 'label', coalesce(p ->> 'description', ''),
              coalesce(p -> 'content', '{}'::jsonb), cp.proposed_by, new.decided_by,
              jsonb_build_object('proposal_id', cp.id, 'approved_by', new.decided_by, 'approved_at', now()))
      returning id into new_item_id;
      update kgdj.commons_proposals set status = 'approved', decided_at = now(), result_item_id = new_item_id where id = cp.id;

    when 'edit_item' then
      update kgdj.commons_items i set
        label       = coalesce(p ->> 'label', i.label),
        description = coalesce(p ->> 'description', i.description),
        content     = i.content || coalesce(p -> 'content', '{}'::jsonb),
        updated_by  = new.decided_by, updated_at = now(),
        provenance  = i.provenance || jsonb_build_object('last_proposal_id', cp.id, 'approved_by', new.decided_by, 'approved_at', now())
      where i.id = cp.target_item_id;
      update kgdj.commons_proposals set status = 'approved', decided_at = now(), result_item_id = cp.target_item_id where id = cp.id;

    when 'archive_item' then
      update kgdj.commons_items set status = 'archived', updated_by = new.decided_by, updated_at = now() where id = cp.target_item_id;
      update kgdj.commons_proposals set status = 'approved', decided_at = now(), result_item_id = cp.target_item_id where id = cp.id;

    when 'add_link' then
      insert into kgdj.commons_links (commons_space_id, source_item_id, target_item_id, label, lens, created_by)
      values (cp.commons_space_id, (p ->> 'source_item_id')::uuid, (p ->> 'target_item_id')::uuid, p ->> 'label', p ->> 'lens', cp.proposed_by)
      returning id into new_link_id;
      update kgdj.commons_proposals set status = 'approved', decided_at = now(), result_link_id = new_link_id where id = cp.id;

    when 'edit_link' then
      update kgdj.commons_links set label = coalesce(p ->> 'label', label), lens = coalesce(p ->> 'lens', lens) where id = cp.target_link_id;
      update kgdj.commons_proposals set status = 'approved', decided_at = now(), result_link_id = cp.target_link_id where id = cp.id;

    when 'archive_link' then
      delete from kgdj.commons_links where id = cp.target_link_id;
      update kgdj.commons_proposals set status = 'approved', decided_at = now(), result_link_id = cp.target_link_id where id = cp.id;
  end case;

  insert into kgdj.audit_log (actor_id, action, table_name, row_id, after_row)
  values (new.decided_by, 'approve:' || cp.change_type::text, 'commons_proposals', cp.id::text,
          jsonb_build_object('result_item_id', new_item_id, 'result_link_id', new_link_id));
  return new;
end $$;
create trigger apply_commons_decision after insert on kgdj.commons_decisions
  for each row execute function kgdj.apply_commons_decision();

-- Closes portfolio -> commons -> canonical (decision 5, §6.5). Fires after apply_decision (0003)
-- on the same table/event — Postgres fires same-table/same-event triggers in alphabetical order
-- by trigger name, and 'apply_decision' < 'link_commons_promotion', so result_node_id is already
-- set by the time this reads it.
create or replace function kgdj.link_commons_promotion() returns trigger language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare src uuid; result uuid;
begin
  if new.proposal_id is null then return new; end if;
  select source_commons_item_id, result_node_id into src, result from kgdj.proposed_changes where id = new.proposal_id;
  if src is not null and result is not null then
    update kgdj.commons_items set promoted_to_node_id = result where id = src and promoted_to_node_id is null;
  end if;
  return new;
end $$;
create trigger link_commons_promotion after insert on kgdj.editorial_decisions
  for each row execute function kgdj.link_commons_promotion();

-- ---------------------------------------------------------------- housekeeping: touch + audit
do $$
declare t text;
begin
  foreach t in array array['commons_spaces', 'commons_items', 'commons_proposals', 'commons_reviews']
  loop
    execute format('create trigger %I_touch before update on kgdj.%I for each row execute function kgdj.touch_updated_at()', t, t);
  end loop;
  foreach t in array array['commons_spaces', 'commons_participants', 'commons_items', 'commons_links',
                           'commons_proposals', 'commons_reviews', 'commons_decisions']
  loop
    execute format('create trigger %I_audit after insert or update or delete on kgdj.%I for each row execute function kgdj.audit_row()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------- leaderboard: commons counts toward it (decision 6, §6.6)
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
      union select r.created_at::date from kgdj.reviews r where r.reviewer_id = p.id) t)                                                                      as active_days,
  -- commons (new, decision 6 §6.6)
  (select count(*) from kgdj.commons_items ci where ci.created_by = p.id and ci.status = 'active')                                                          as commons_items_contributed
from kgdj.profiles p
left join kgdj.departments d on d.id = p.department_id
where p.is_active
  and exists (select 1 from kgdj.consent_records c where c.profile_id = p.id and c.purpose = 'leaderboard_display' and c.granted and c.withdrawn_at is null);
comment on view kgdj.leaderboard is 'Opt-in (leaderboard_display consent). One row per member with many authentic measures; the UI shows a separate top list per measure so different strengths surface.';
grant select on kgdj.leaderboard to authenticated;
