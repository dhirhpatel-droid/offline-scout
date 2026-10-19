-- Milestone 7: Custom questions (GLOSSARY.md).
--
-- A Lead adds an extra question for their own Scouting group to one period of
-- the match ("Did they cycle from the far side?"). Answers are stored in the
-- Submission's "values" like every other answer (key "<section>.custom-<id>"),
-- so sync needs no change, and they never add to Estimated points because
-- scoring only reads the Game config's fields.
--
-- A question is never deleted, only hidden (hidden_at), so answers already
-- given keep their wording.

create table public.custom_questions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  section text not null check (section ~ '^[a-z][a-z0-9_]{0,30}$'), -- a section id from the Game config
  type text not null check (type in ('toggle', 'counter', 'choice', 'rating', 'text')),
  label text not null check (char_length(btrim(label)) between 1 and 80),
  options jsonb,                         -- for 'choice': ["Left", "Right"]
  position integer not null default 0,   -- order within the section
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  check (type <> 'choice' or (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 6))
);
create index custom_questions_group on public.custom_questions (group_id);

alter table public.custom_questions enable row level security;

-- Everyone in the group sees the questions (their phones show them).
-- Only Leads add them, change their wording, or hide them.
create policy "members see their group's questions" on public.custom_questions
  for select to authenticated using (public.is_member(group_id));
create policy "Leads add questions" on public.custom_questions
  for insert to authenticated with check (public.is_lead(group_id) and created_by = auth.uid());
create policy "Leads change questions" on public.custom_questions
  for update to authenticated using (public.is_lead(group_id)) with check (public.is_lead(group_id));

-- No delete: hiding keeps old answers readable.
grant select, insert on public.custom_questions to authenticated;
grant update (label, options, position, hidden_at) on public.custom_questions to authenticated;
