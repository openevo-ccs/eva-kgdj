-- Eva KGDJ — 0014 feedback
--
-- In-app feedback: a small, always-reachable "Feedback" button any signed-in member can
-- use to report a problem, request, or general note, in the actual context of whatever
-- page they're looking at -- port of the same feature built for Me-Mo, Ask Eva and
-- OpenLPM the same week (see lab_manager memory: memo_session_logging_and_feedback_widget,
-- ask_eva_layout_resize_and_feedback_button, openlpm_feedback_widget_2026_09_17), adapted
-- to KGDJ's own kgdj-schema conventions rather than copied blindly.

set search_path = kgdj, public, extensions;

create table kgdj.feedback (
  id              uuid primary key default gen_random_uuid(),
  submitted_by    uuid references kgdj.profiles (id) on delete set null,
  tag             text not null default 'other' check (tag in ('problem', 'request', 'other')),
  comment         text check (char_length(comment) <= 2000),
  -- Read live off the app's own router/state at submit time (current route, page
  -- title, role) -- see buildContext() in FeedbackWidget.tsx. jsonb, never read back
  -- into a trusted context, same discipline as OpenLPM's own feedback.context column.
  context         jsonb not null default '{}'::jsonb,
  -- Path inside the kgdj-feedback-screenshots Storage bucket, NOT the image itself --
  -- keeping binary data out of Postgres is the actual mechanism for staying within
  -- Supabase's storage limits (Storage has its own, separate, cheaper quota).
  screenshot_path text,
  created_at      timestamptz not null default now()
);
create index idx_kgdj_feedback_created_at on kgdj.feedback (created_at desc);
comment on table kgdj.feedback is 'In-app bug/request feedback from signed-in members -- write-only from the app''s own perspective, read via the Supabase dashboard/service role, same as OpenLPM''s counterpart.';

alter table kgdj.feedback enable row level security;

-- Any active member can submit feedback about whatever they're looking at --
-- deliberately not gated to module/department membership, matching OpenLPM's own
-- policy of the same name: a low-stakes "this is confusing" note shouldn't require
-- re-deriving membership rules for a lightweight, casual write.
create policy "Members can submit feedback" on kgdj.feedback
  for insert to authenticated with check (kgdj.is_member() and submitted_by = auth.uid());

-- No select policy at all, on purpose -- feedback is read by whoever maintains KGDJ via
-- the project's service_role key (bypasses RLS entirely, already exists for every
-- Supabase project), not browsable by other members. Some of it may be blunt.

-- Storage bucket for screenshots. Private (not public), 2MB hard cap per file enforced
-- by Supabase itself as a safety net on top of client-side compression
-- (FeedbackWidget.tsx resizes to at most 1600px wide and re-encodes as JPEG before
-- upload, typically well under 500KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kgdj-feedback-screenshots', 'kgdj-feedback-screenshots', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Standard Supabase per-user-folder pattern: a member can only upload into a path
-- starting with their own user id, so one submitter's screenshot can never collide
-- with or overwrite another's.
create policy "Members can upload their own feedback screenshots" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'kgdj-feedback-screenshots'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
