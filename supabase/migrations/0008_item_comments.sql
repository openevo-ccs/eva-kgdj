-- KGDJ 0008: per-item comments on shared portfolio items (2026-09-09).
-- Closes docs/kgdj/05-student-portfolio-uiux-review.md §4.2: sharing one node/private-node/
-- link with your module (0006's per-item "shared" flag) opens zero feedback mechanism today —
-- not even a single free-text comment — unless the sharer also grants full portfolio access
-- (visibility='module'/'members' or share()). A commons space (0007) is the right home for a
-- genuinely joint space; this is the lighter-weight middle option named in §4.2 for a student
-- who wants one comment on one idea without opening the rest of their portfolio.
--
-- Deliberately NOT a rating/review (no kgdj.review_rating column) — a plain identified comment
-- thread, closer to kgdj.reviews' commentary_md than a whole review pipeline. Deliberately not
-- folded into kgdj.reviews itself: that table's target_kind check constraint and per-target
-- "one review per reviewer" unique index both assume a single rating per target, which doesn't
-- fit an open-ended back-and-forth thread.

create table kgdj.item_comments (
  id            uuid primary key default gen_random_uuid(),
  subgraph_id   uuid not null references kgdj.student_subgraphs (id) on delete cascade,
  item_kind     text not null check (item_kind in ('node', 'private_node', 'link')),
  node_id       uuid references kgdj.nodes (id) on delete cascade,                 -- set when item_kind = 'node' (subgraph_nodes has no own id; (subgraph_id, node_id) is its key)
  private_id    uuid references kgdj.subgraph_private_nodes (id) on delete cascade,
  link_id       uuid references kgdj.subgraph_links (id) on delete cascade,
  author_id     uuid not null references kgdj.profiles (id) on delete set null,
  body_md       text not null check (length(body_md) >= 1),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint item_comments_target_one check (
    (item_kind = 'node'         and node_id    is not null and private_id is null and link_id is null) or
    (item_kind = 'private_node' and private_id is not null and node_id    is null and link_id is null) or
    (item_kind = 'link'         and link_id    is not null and node_id    is null and private_id is null)
  )
);
comment on table kgdj.item_comments is 'A lightweight, identified comment thread on ONE shared portfolio item (node/private_node/link) — see 05-student-portfolio-uiux-review.md §4.2. Not a rating; see kgdj.reviews for the target_kind=''subgraph'' full-portfolio critique thread.';
create index item_comments_subgraph_idx on kgdj.item_comments (subgraph_id);
create index item_comments_node_idx on kgdj.item_comments (subgraph_id, node_id) where node_id is not null;
create index item_comments_private_idx on kgdj.item_comments (private_id) where private_id is not null;
create index item_comments_link_idx on kgdj.item_comments (link_id) where link_id is not null;

create trigger item_comments_touch before update on kgdj.item_comments for each row execute function kgdj.touch_updated_at();
create trigger item_comments_audit after insert or update or delete on kgdj.item_comments for each row execute function kgdj.audit_row();

-- Visible under the exact same rule 0006 already uses to grant a shared row's own read policy
-- (kgdj.can_see_subgraph OR (that one row is shared AND viewer is a module member)) — a comment
-- thread never opens access to anything the item's own read policy wouldn't already show.
create or replace function kgdj.can_see_item_comment(sg uuid, kind text, nid uuid, pid uuid, lid uuid) returns boolean language sql stable security definer set search_path = kgdj, public, extensions, pg_temp as $$
  select kgdj.can_see_subgraph(sg) or (
    kgdj.is_module_member(kgdj.subgraph_module(sg)) and (
      (kind = 'node'         and exists (select 1 from kgdj.subgraph_nodes sn where sn.subgraph_id = sg and sn.node_id = nid and sn.shared)) or
      (kind = 'private_node' and exists (select 1 from kgdj.subgraph_private_nodes pn where pn.id = pid and pn.shared)) or
      (kind = 'link'         and exists (select 1 from kgdj.subgraph_links l where l.id = lid and l.shared))
    )
  )
$$;

alter table kgdj.item_comments enable row level security;
alter table kgdj.item_comments force row level security;
grant select, insert, update, delete on kgdj.item_comments to authenticated;

create policy item_comments_read on kgdj.item_comments for select to authenticated
  using (kgdj.can_see_item_comment(subgraph_id, item_kind, node_id, private_id, link_id));
-- Anyone who can currently see the item may comment on it — including the owner, replying to
-- a classmate's comment on their own shared idea (kgdj.can_see_subgraph already covers owners).
create policy item_comments_insert on kgdj.item_comments for insert to authenticated
  with check (author_id = auth.uid() and kgdj.can_see_item_comment(subgraph_id, item_kind, node_id, private_id, link_id));
create policy item_comments_update_own on kgdj.item_comments for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy item_comments_delete on kgdj.item_comments for delete to authenticated using (author_id = auth.uid() or kgdj.is_editor());
