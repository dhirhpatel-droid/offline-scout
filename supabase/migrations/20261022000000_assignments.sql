-- Milestone 5: Assignments (GLOSSARY.md: Assignment, Position shift, Team watch).
--
-- Leads store two kinds of instruction. Assignments themselves are NOT stored:
-- each phone works them out from these plus the Event's schedule (js/assignments.js),
-- so a Lead's change is one small row and phones keep working offline.

-- "Maya watches Red 1 for Q1–Q20."
create table public.position_shifts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  scout_id uuid not null references auth.users (id) on delete cascade,
  position text not null check (position ~ '^(red|blue)[1-3]$'),
  from_match integer not null check (from_match >= 1),
  to_match integer not null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (to_match >= from_match)
);
create index position_shifts_group_event on public.position_shifts (group_id, event_id);

-- "Maya follows 23810 in every match they play, playoffs included."
create table public.team_watches (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  scout_id uuid not null references auth.users (id) on delete cascade,
  team_number integer not null check (team_number between 1 and 99999),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, event_id, scout_id, team_number)
);
create index team_watches_group_event on public.team_watches (group_id, event_id);

alter table public.position_shifts enable row level security;
alter table public.team_watches enable row level security;

-- Everyone in the group sees who is watching what (so Scouts can swap and
-- Leads can plan). Only Leads make or remove them, and only for members.
create function public.is_member_of(g uuid, person uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$ select exists (select 1 from public.memberships m where m.group_id = g and m.user_id = person) $$;

create policy "members see the plan" on public.position_shifts
  for select to authenticated using (public.is_member(group_id));
create policy "Leads add shifts for members" on public.position_shifts
  for insert to authenticated with check (public.is_lead(group_id) and public.is_member_of(group_id, scout_id) and created_by = auth.uid());
create policy "Leads remove shifts" on public.position_shifts
  for delete to authenticated using (public.is_lead(group_id));

create policy "members see the plan" on public.team_watches
  for select to authenticated using (public.is_member(group_id));
create policy "Leads add watches for members" on public.team_watches
  for insert to authenticated with check (public.is_lead(group_id) and public.is_member_of(group_id, scout_id) and created_by = auth.uid());
create policy "Leads remove watches" on public.team_watches
  for delete to authenticated using (public.is_lead(group_id));

-- Changing a shift = remove it and add a new one (keeps the rules simple).
grant select, insert, delete on public.position_shifts, public.team_watches to authenticated;
