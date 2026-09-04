-- Eva KGDJ — 0001 schema
-- Ask Eva Knowledge Graph Data Journal: identity, canonical graph, citations,
-- editorial workflow, student portfolios, audit, consent.
--
-- Plain Postgres wherever possible. Supabase-specific pieces are confined to:
--   * references to auth.users (profiles.id)                      [this file]
--   * auth.uid()-based RLS policies                                [0002_rls.sql]
--   * the before-user-created auth hook + new-user trigger         [0004_auth.sql]
-- Everything else (tables, enums, triggers, the approval function) runs on any
-- Postgres 15+, so a later move to MPCDF is a dump/restore plus re-implementing
-- those three pieces (see docs/kgdj/01-architecture-decision.md §5.4).
--
-- Design decisions recorded in apps/kgdj/supabase/README.md.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;     -- case-insensitive emails/usernames/DOIs

create schema if not exists kgdj;
comment on schema kgdj is 'Eva Knowledge Graph Data Journal — canonical graph, editorial workflow, student portfolios';

-- ---------------------------------------------------------------- enums
create type kgdj.user_role as enum ('researcher', 'msc_student', 'editor', 'admin');
create type kgdj.institution as enum ('mpi-eva', 'uni-leipzig', 'external');
create type kgdj.record_status as enum ('proposed', 'canonical', 'archived');
create type kgdj.change_type as enum ('add_node', 'edit_node', 'archive_node', 'add_edge', 'edit_edge', 'delete_edge');
create type kgdj.proposal_status as enum ('draft', 'pending', 'under_review', 'revision_requested', 'approved', 'rejected', 'withdrawn');
create type kgdj.review_recommendation as enum ('accept', 'revise', 'reject');
create type kgdj.decision as enum ('approve', 'reject', 'request_revision');
create type kgdj.subgraph_visibility as enum ('private', 'shared', 'module', 'members');
create type kgdj.consent_purpose as enum ('portfolio_processing', 'peer_review_visibility', 'leaderboard_display', 'canonical_attribution');
create type kgdj.private_node_type as enum ('self', 'question', 'resource', 'theory', 'method');

-- ---------------------------------------------------------------- reference tables
create table kgdj.departments (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                 -- dag | hbec | dlce | evogen | humor | primevo | ccp
  name          text not null,
  abbr          text not null,
  description   text,
  color_hex     text check (color_hex ~ '^#[0-9a-fA-F]{6}$'),
  pure_ou_id    text,                                 -- MPG.PuRe organizational unit, e.g. ou_3040267
  created_at    timestamptz not null default now()
);
comment on table kgdj.departments is 'MPI-EVA departments (mirrors mpi-eva-graph/sub-units/schema/department-schema.json departments map).';

create table kgdj.node_types (
  code        text primary key,      -- theory | domain | method | topic | finding | concept | scicomm-sensitivity | fieldsite | ethics-note
  label       text not null,
  description text,
  sort_order  int not null default 100
);

create table kgdj.relationship_types (
  code        text primary key,      -- grounds | enables | applies-to | measures | informs | contrasts-with | relates-to | cross-dept | cites | ...
  label       text not null,
  description text,
  directed    boolean not null default true
);

-- ---------------------------------------------------------------- identity
create table kgdj.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       citext not null unique check (length(username) between 3 and 40 and username ~ '^[a-z0-9._-]+$'),
  full_name      text,                                -- optional; students may leave it empty (data minimisation)
  role           kgdj.user_role not null default 'msc_student',
  institution    kgdj.institution not null default 'external',
  department_id  uuid references kgdj.departments (id) on delete set null,
  avatar_url     text,
  is_active      boolean not null default true,       -- soft deactivation; erasure is a separate procedure (README)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table kgdj.profiles is 'One row per authenticated user. Personal data kept to username/role/department; full_name optional.';

-- Who may sign up at all (GDPR: default-deny, explicit allowlisting). Domain
-- rules live in kgdj.allowed_domains; individual invitations here.
create table kgdj.allowed_domains (
  domain       citext primary key,                    -- eva.mpg.de | uni-leipzig.de
  default_role kgdj.user_role not null default 'msc_student',
  institution  kgdj.institution not null,
  note         text
);

create table kgdj.allowlist (
  email          citext primary key,
  role           kgdj.user_role not null default 'msc_student',
  institution    kgdj.institution not null default 'external',
  department_id  uuid references kgdj.departments (id) on delete set null,
  module_id      uuid,                                -- fk added after modules exists
  invited_by     uuid references kgdj.profiles (id) on delete set null,
  note           text,
  created_at     timestamptz not null default now(),
  used_at        timestamptz
);

create table kgdj.modules (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique,                -- ccp-wise-2026-27
  name           text not null,                       -- Comparative Cultural Psychology
  cohort_year    int not null,
  term           text not null check (term in ('WiSe', 'SoSe')),
  department_id  uuid references kgdj.departments (id) on delete set null,
  instructor_id  uuid references kgdj.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
alter table kgdj.allowlist add constraint allowlist_module_fk foreign key (module_id) references kgdj.modules (id) on delete set null;

create table kgdj.module_members (
  module_id   uuid not null references kgdj.modules (id) on delete cascade,
  profile_id  uuid not null references kgdj.profiles (id) on delete cascade,
  member_role text not null default 'student' check (member_role in ('student', 'instructor', 'assistant')),
  joined_at   timestamptz not null default now(),
  primary key (module_id, profile_id)
);

-- ---------------------------------------------------------------- citations (normalised)
create table kgdj.citations (
  id             uuid primary key default gen_random_uuid(),
  doi            citext unique,                       -- required unless a PuRe handle is given (check below)
  pure_item_id   text,                                -- item_1234567
  pure_handle    text,                                -- hdl:21.11116/...
  openalex_id    text,                                -- W1234567
  title          text not null,
  authors        text[] not null default '{}',
  year           int check (year between 1500 and 2100),
  venue          text,
  url            text,
  verification   jsonb not null default '{}'::jsonb,  -- {crossref: {verdict, checked_at, title_score}, pure: {...}}
  created_by     uuid references kgdj.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint citation_has_identifier check (doi is not null or pure_handle is not null or pure_item_id is not null)
);
comment on table kgdj.citations is 'Structured bibliographic records. DOI-first; PuRe handle accepted for DOI-less items. Verification verdicts are stored, never trusted implicitly.';
create index citations_openalex_idx on kgdj.citations (openalex_id);

-- ---------------------------------------------------------------- canonical graph
create table kgdj.nodes (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,              -- stable human id, e.g. ccp-theory-shared-intentionality
  label            text not null,
  type_code        text not null references kgdj.node_types (code),
  description      text not null default '',
  department_id    uuid references kgdj.departments (id) on delete set null,
  status           kgdj.record_status not null default 'proposed',
  external_ids     jsonb not null default '{}'::jsonb, -- {meg: "...", conceptBaseId: "OE-CONCEPT-…", wikidata: "Q…"}
  provenance       jsonb not null default '{}'::jsonb, -- {source, status, verification[], assigned_by, retrieved}
  tags             text[] not null default '{}',
  version          int not null default 1,
  created_by       uuid references kgdj.profiles (id) on delete set null,
  updated_by       uuid references kgdj.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  canonical_since  timestamptz
);
create index nodes_status_idx on kgdj.nodes (status);
create index nodes_department_idx on kgdj.nodes (department_id);
create index nodes_type_idx on kgdj.nodes (type_code);
create index nodes_label_trgm_idx on kgdj.nodes using gin (to_tsvector('simple', label || ' ' || description));

create table kgdj.edges (
  id                 uuid primary key default gen_random_uuid(),
  source_node_id     uuid not null references kgdj.nodes (id) on delete cascade,
  target_node_id     uuid not null references kgdj.nodes (id) on delete cascade,
  relationship_code  text not null references kgdj.relationship_types (code),
  label              text,
  weight             numeric(3,1) not null default 3 check (weight between 0 and 5),
  status             kgdj.record_status not null default 'proposed',
  provenance         jsonb not null default '{}'::jsonb,
  version            int not null default 1,
  created_by         uuid references kgdj.profiles (id) on delete set null,
  updated_by         uuid references kgdj.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  canonical_since    timestamptz,
  constraint edge_not_self_loop check (source_node_id <> target_node_id),
  constraint edge_unique unique (source_node_id, target_node_id, relationship_code)
);
create index edges_source_idx on kgdj.edges (source_node_id);
create index edges_target_idx on kgdj.edges (target_node_id);

create table kgdj.node_citations (
  node_id      uuid not null references kgdj.nodes (id) on delete cascade,
  citation_id  uuid not null references kgdj.citations (id) on delete restrict,
  role         text not null default 'supports' check (role in ('defines', 'supports', 'contrasts', 'reviews', 'exemplifies')),
  note         text,
  added_by     uuid references kgdj.profiles (id) on delete set null,
  added_at     timestamptz not null default now(),
  primary key (node_id, citation_id)
);

create table kgdj.edge_citations (
  edge_id      uuid not null references kgdj.edges (id) on delete cascade,
  citation_id  uuid not null references kgdj.citations (id) on delete restrict,
  role         text not null default 'supports' check (role in ('supports', 'contrasts')),
  note         text,
  added_by     uuid references kgdj.profiles (id) on delete set null,
  added_at     timestamptz not null default now(),
  primary key (edge_id, citation_id)
);

-- ---------------------------------------------------------------- editorial workflow
create table kgdj.proposed_changes (
  id              uuid primary key default gen_random_uuid(),
  proposer_id     uuid not null references kgdj.profiles (id) on delete cascade,
  change_type     kgdj.change_type not null,
  target_node_id  uuid references kgdj.nodes (id) on delete cascade,
  target_edge_id  uuid references kgdj.edges (id) on delete cascade,
  payload         jsonb not null default '{}'::jsonb,   -- fields to create/overwrite; see README for the per-type contract
  rationale       text not null default '',
  module_id       uuid references kgdj.modules (id) on delete set null,  -- course context, if submitted as coursework
  status          kgdj.proposal_status not null default 'draft',
  submitted_at    timestamptz,
  updated_at      timestamptz not null default now(),
  decided_at      timestamptz,
  result_node_id  uuid references kgdj.nodes (id) on delete set null,
  result_edge_id  uuid references kgdj.edges (id) on delete set null,
  constraint proposal_target check (
    (change_type in ('add_node', 'add_edge') and target_node_id is null and target_edge_id is null) or
    (change_type in ('edit_node', 'archive_node') and target_node_id is not null and target_edge_id is null) or
    (change_type in ('edit_edge', 'delete_edge') and target_edge_id is not null and target_node_id is null)
  )
);
create index proposals_status_idx on kgdj.proposed_changes (status);
create index proposals_proposer_idx on kgdj.proposed_changes (proposer_id);
create index proposals_module_idx on kgdj.proposed_changes (module_id);

create table kgdj.proposal_citations (
  proposal_id  uuid not null references kgdj.proposed_changes (id) on delete cascade,
  citation_id  uuid not null references kgdj.citations (id) on delete restrict,
  role         text not null default 'supports' check (role in ('defines', 'supports', 'contrasts', 'reviews', 'exemplifies')),
  note         text,
  primary key (proposal_id, citation_id)
);

create table kgdj.peer_reviews (
  id              uuid primary key default gen_random_uuid(),
  proposal_id     uuid not null references kgdj.proposed_changes (id) on delete cascade,
  reviewer_id     uuid not null references kgdj.profiles (id) on delete cascade,
  rating          smallint check (rating between 1 and 5),
  recommendation  kgdj.review_recommendation not null,
  critique_text   text not null check (length(critique_text) >= 20),
  is_blind        boolean not null default true,      -- reviewer identity hidden from the proposer (see README: open pedagogical question)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (proposal_id, reviewer_id)
);

create table kgdj.editorial_decisions (
  id           uuid primary key default gen_random_uuid(),
  proposal_id  uuid not null references kgdj.proposed_changes (id) on delete cascade,
  editor_id    uuid not null references kgdj.profiles (id) on delete set null,
  decision     kgdj.decision not null,
  feedback     text not null default '',
  decided_at   timestamptz not null default now()
);
create index decisions_proposal_idx on kgdj.editorial_decisions (proposal_id);

-- ---------------------------------------------------------------- student portfolios / subgraphs
create table kgdj.student_subgraphs (
  id                     uuid primary key default gen_random_uuid(),
  owner_id               uuid not null references kgdj.profiles (id) on delete cascade,
  module_id              uuid references kgdj.modules (id) on delete set null,
  title                  text not null,
  description            text not null default '',
  visibility             kgdj.subgraph_visibility not null default 'private',
  last_checkpoint_week   int check (last_checkpoint_week between 1 and 15),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index subgraphs_owner_idx on kgdj.student_subgraphs (owner_id);
create index subgraphs_module_idx on kgdj.student_subgraphs (module_id);

-- canonical (or proposed) graph nodes placed in a portfolio, with the student's own annotation/position
create table kgdj.subgraph_nodes (
  subgraph_id        uuid not null references kgdj.student_subgraphs (id) on delete cascade,
  node_id            uuid not null references kgdj.nodes (id) on delete cascade,
  custom_annotation  text not null default '',
  pos_x              real,
  pos_y              real,
  added_week         int check (added_week between 1 and 15),
  added_at           timestamptz not null default now(),
  primary key (subgraph_id, node_id)
);

-- the student's own nodes (self / question / resource / theory / method) — ccp_module personal-graph.schema.json node types
create table kgdj.subgraph_private_nodes (
  id            uuid primary key default gen_random_uuid(),
  subgraph_id   uuid not null references kgdj.student_subgraphs (id) on delete cascade,
  node_type     kgdj.private_node_type not null,
  label         text not null,
  source        text,                                  -- e.g. reading-list reference for a resource
  origin        text,                                  -- e.g. "week-1 wildcard", "merge with <partner>"
  created_week  int check (created_week between 1 and 15),
  pos_x         real,
  pos_y         real,
  created_at    timestamptz not null default now()
);
create index private_nodes_subgraph_idx on kgdj.subgraph_private_nodes (subgraph_id);

-- "This week, I'm connecting ___ to ___, because ___" — either end may be a canonical node or a private node
create table kgdj.subgraph_links (
  id                uuid primary key default gen_random_uuid(),
  subgraph_id       uuid not null references kgdj.student_subgraphs (id) on delete cascade,
  from_node_id      uuid references kgdj.nodes (id) on delete cascade,
  from_private_id   uuid references kgdj.subgraph_private_nodes (id) on delete cascade,
  to_node_id        uuid references kgdj.nodes (id) on delete cascade,
  to_private_id     uuid references kgdj.subgraph_private_nodes (id) on delete cascade,
  why               text not null check (length(why) >= 10),
  lens              text,                              -- mechanism | evidence | theory | method | field site | ...
  created_week      int check (created_week between 1 and 15),
  created_at        timestamptz not null default now(),
  constraint link_from_one check ((from_node_id is null) <> (from_private_id is null)),
  constraint link_to_one   check ((to_node_id is null) <> (to_private_id is null))
);
create index links_subgraph_idx on kgdj.subgraph_links (subgraph_id);

create table kgdj.subgraph_shares (
  subgraph_id  uuid not null references kgdj.student_subgraphs (id) on delete cascade,
  profile_id   uuid not null references kgdj.profiles (id) on delete cascade,
  can_review   boolean not null default true,
  shared_at    timestamptz not null default now(),
  primary key (subgraph_id, profile_id)
);

-- classmate critique of a portfolio (the personal-graph merge_log.critique, made first-class)
create table kgdj.subgraph_reviews (
  id           uuid primary key default gen_random_uuid(),
  subgraph_id  uuid not null references kgdj.student_subgraphs (id) on delete cascade,
  reviewer_id  uuid not null references kgdj.profiles (id) on delete cascade,
  week         int check (week between 1 and 15),
  critique     text not null check (length(critique) between 5 and 2000),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- accountability
create table kgdj.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,                                     -- auth.uid() at the time; null for system/seed
  action      text not null,                            -- insert | update | delete | approve | reject | ...
  table_name  text not null,
  row_id      text not null,
  before_row  jsonb,
  after_row   jsonb,
  at          timestamptz not null default now()
);
create index audit_row_idx on kgdj.audit_log (table_name, row_id);

create table kgdj.consent_records (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references kgdj.profiles (id) on delete cascade,
  purpose       kgdj.consent_purpose not null,
  granted       boolean not null,
  policy_version text not null,                         -- which privacy notice text was shown
  granted_at    timestamptz not null default now(),
  withdrawn_at  timestamptz
);
create index consent_profile_idx on kgdj.consent_records (profile_id, purpose);

-- ---------------------------------------------------------------- housekeeping triggers
create or replace function kgdj.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'citations', 'nodes', 'edges', 'proposed_changes', 'peer_reviews', 'student_subgraphs']
  loop
    execute format('create trigger %I_touch before update on kgdj.%I for each row execute function kgdj.touch_updated_at()', t, t);
  end loop;
end $$;

-- generic audit trigger (attached in 0003 after the approval function, so approvals are logged too)
create or replace function kgdj.audit_row() returns trigger language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
declare j jsonb; rid text;
begin
  -- Works for any table: prefer an `id` column, else the natural keys the
  -- KGDJ uses (email; subgraph_id:profile_id), else a hash of the row.
  j := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  rid := coalesce(j ->> 'id', j ->> 'email',
                  case when j ? 'subgraph_id' and j ? 'profile_id' then (j ->> 'subgraph_id') || ':' || (j ->> 'profile_id') end,
                  md5(j::text));
  insert into kgdj.audit_log (actor_id, action, table_name, row_id, before_row, after_row)
  values (nullif(current_setting('request.jwt.claim.sub', true), '')::uuid, lower(tg_op), tg_table_name, rid,
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------- leaderboard (opt-in via consent)
create or replace view kgdj.leaderboard as
select p.id as profile_id, p.username, p.role, d.abbr as department,
       (select count(*) from kgdj.proposed_changes pc where pc.proposer_id = p.id and pc.status = 'approved') as approved_proposals,
       (select count(*) from kgdj.proposed_changes pc where pc.proposer_id = p.id and pc.status in ('pending', 'under_review', 'revision_requested')) as open_proposals,
       (select count(*) from kgdj.peer_reviews r where r.reviewer_id = p.id) as reviews_written,
       (select count(*) from kgdj.subgraph_reviews r where r.reviewer_id = p.id) as portfolio_critiques,
       (select count(*) from kgdj.nodes n where n.created_by = p.id and n.status = 'canonical') as canonical_nodes_authored
from kgdj.profiles p
left join kgdj.departments d on d.id = p.department_id
where p.is_active
  and exists (select 1 from kgdj.consent_records c where c.profile_id = p.id and c.purpose = 'leaderboard_display' and c.granted and c.withdrawn_at is null);
comment on view kgdj.leaderboard is 'Only profiles that granted leaderboard_display consent appear (GDPR Art. 7); gamification is opt-in.';

-- ---------------------------------------------------------------- seed reference vocabularies
insert into kgdj.node_types (code, label, description, sort_order) values
  ('theory',               'Theory',               'A named theoretical framework or model',                        10),
  ('domain',               'Domain',               'A research domain / object of study',                          20),
  ('method',               'Method',               'A research method, instrument or analytical technique',        30),
  ('topic',                'Topic',                'A recurring research topic or question',                       40),
  ('finding',              'Finding',              'An empirical finding or claim with citations',                 50),
  ('concept',              'Concept',              'A defined concept (may point to ConceptBase)',                 60),
  ('scicomm-sensitivity',  'Scicomm sensitivity',  'A science-communication / ethics sensitivity to handle with care', 70),
  ('ethics-note',          'Ethics note',          'Research-ethics or community-consent note',                    80),
  ('fieldsite',            'Field site',           'A geolocated field site',                                      90);

insert into kgdj.relationship_types (code, label, description, directed) values
  ('grounds',        'grounds',          'theory/concept provides the formal backbone for',           true),
  ('enables',        'enables',          'method/domain makes possible',                              true),
  ('applies-to',     'applies to',       'method/theory is applied to a domain/topic',                true),
  ('measures',       'measures',         'method measures a construct/topic',                         true),
  ('informs',        'informs',          'finding/topic informs a theory/domain',                     true),
  ('contrasts-with', 'contrasts with',   'competing or contrasting positions',                        false),
  ('relates-to',     'relates to',       'generic association',                                       false),
  ('cross-dept',     'cross-department', 'link between two departments'' vocabularies',               false),
  ('represents',     'represents',       'department-level node instantiates an institute-level one', true),
  ('evidences',      'evidences',        'field site / finding evidences a topic or theory',           true),
  ('scicomm-relevant-to', 'scicomm-relevant to', 'a sensitivity that bears on communicating this',    true),
  ('cites',          'cites',            'publication cites publication',                             true),
  ('same-as',        'same as',          'cross-repository identity (ConceptBase, PuRe, Wikidata…)',   false);
