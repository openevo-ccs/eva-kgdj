-- Content flags: "something looks wrong here", separate from a full review.
--
-- Decision record: docs/kgdj/10-design-patterns-research.md's top recommendation
-- (Wikipedia's citation-needed banners) and docs/kgdj/09-trust-and-verification.md's
-- framing -- the graph is grounded in real sources but was substantially AI-assembled
-- and mostly unchecked, and finding what's wrong is the actual point of this course.
-- kgdj.reviews already exists for that, but a full review (a five-point rating plus
-- required commentary) is real friction for a two-second "I think this is wrong"
-- catch. Deliberately NOT the same table as review_flags: that table is editor-only,
-- automated (reviewer-integrity issues -- an erased reviewer, a COI), and neither
-- created nor read the way a member-facing content flag needs to be. Conflating the
-- two would either make integrity flags member-writable (wrong) or make content
-- flags editor-only-to-create (defeats the entire point of lowering the friction).
--
-- Scope: node and edge only, enforced by the check constraint below, not left to
-- convention. A flag is a claim about the SHAPE of the canonical graph's content --
-- proposals and portfolios already have their own, more specific mechanisms (a
-- proposal is reviewed directly; a portfolio's critique thread is not a public claim
-- about correctness).

create table kgdj.content_flags (
  id              uuid primary key default gen_random_uuid(),
  target_kind     kgdj.review_target not null check (target_kind in ('node', 'edge')),
  target_id       uuid not null,
  flagged_by      uuid not null references kgdj.profiles (id) on delete cascade,
  reason          text not null check (length(reason) between 5 and 500),  -- a pointer, not a review: short by design
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid references kgdj.profiles (id) on delete set null,
  resolution_note text  -- required by the resolve function below when marking resolved, not by this column alone
);
create index content_flags_open_idx on kgdj.content_flags (target_kind, target_id) where resolved_at is null;
comment on table kgdj.content_flags is 'Low-friction "this looks wrong" pointers on a node or edge, distinct from kgdj.reviews (a full identified critique) and kgdj.review_flags (editor-only reviewer-integrity issues). Always identified: flagged_by is never anonymous, matching reviews.';

alter table kgdj.content_flags enable row level security;
alter table kgdj.content_flags force row level security;
grant select, insert, delete on kgdj.content_flags to authenticated;
-- No direct update grant: resolving goes through kgdj.resolve_content_flag() below,
-- exactly like review_flags' own resolve_review_flag() -- a controlled mutation, not
-- an open column write, so "resolved" always carries an editor's note.

-- Anyone who is a member can see and raise a flag on any node/edge -- both are
-- already visible to every member regardless of status (proposed or canonical), so
-- this adds no new exposure. Matches reviews_read's own 'node'/'edge' branch.
create policy content_flags_read on kgdj.content_flags for select to authenticated
  using (kgdj.is_member());
create policy content_flags_insert on kgdj.content_flags for insert to authenticated
  with check (flagged_by = auth.uid() and kgdj.is_member());
-- The flagger may withdraw their own still-open flag (found the answer themselves,
-- posted by mistake); an editor may remove any flag as part of normal triage.
create policy content_flags_delete on kgdj.content_flags for delete to authenticated
  using ((flagged_by = auth.uid() and resolved_at is null) or kgdj.is_editor());

-- Matches reviews_visible's own shape: flags are identified (never anonymous), so
-- the frontend gets the flagger's username the same way it already gets a reviewer's.
create or replace view kgdj.content_flags_visible with (security_invoker = true) as
select f.id, f.target_kind, f.target_id, f.reason, f.created_at, f.resolved_at, f.resolution_note,
       f.flagged_by, p.username as flagged_by_username,
       f.resolved_by, rp.username as resolved_by_username
from kgdj.content_flags f
left join kgdj.profiles p on p.id = f.flagged_by
left join kgdj.profiles rp on rp.id = f.resolved_by;
grant select on kgdj.content_flags_visible to authenticated;

create or replace function kgdj.resolve_content_flag(flag uuid, note_text text) returns void
language plpgsql security definer set search_path = kgdj, public, extensions, pg_temp as $$
begin
  if not kgdj.is_editor() then raise exception 'Only editors resolve content flags'; end if;
  if note_text is null or length(trim(note_text)) < 3 then
    raise exception 'A resolution needs a short note -- what was checked, and what the answer was. See docs/kgdj/12-graph-coherence.md on recording a reviewed "no" as real information, not a bare boolean.';
  end if;
  update kgdj.content_flags set resolved_at = now(), resolved_by = auth.uid(), resolution_note = note_text
  where id = flag and resolved_at is null;
end $$;
revoke execute on function kgdj.resolve_content_flag(uuid, text) from public, anon;
grant execute on function kgdj.resolve_content_flag(uuid, text) to authenticated;
