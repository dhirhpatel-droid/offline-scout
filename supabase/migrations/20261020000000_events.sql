-- Milestone 4: Events from FIRST.
-- Words follow GLOSSARY.md (Event, Current event, Match, Alliance position).
--
-- FIRST's event data is public, so it is stored once and shared by every group.
-- Only the server function (supabase/functions/event-data) writes it, using the
-- secret key, which skips these rules; signed-in people can only read it.
-- Each Scouting group picks the Events it attends; a Lead sets one as Current.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  program text not null check (program in ('FTC', 'FRC')),
  season integer not null,                 -- FTC 2026–27 = 2026
  code text not null,                      -- FIRST's event code, e.g. CAONBOQ
  name text not null,
  starts_on date,
  ends_on date,
  timezone text,
  city text,
  region text,
  fetched_at timestamptz,                  -- when the server last fetched it from FIRST data
  unique (program, season, code)
);

create table public.event_teams (
  event_id uuid not null references public.events (id) on delete cascade,
  team_number integer not null,
  team_name text,
  primary key (event_id, team_number)
);

-- One row per Match. Playoff matches are known only once alliances are picked.
create table public.event_matches (
  event_id uuid not null references public.events (id) on delete cascade,
  level text not null check (level in ('qual', 'playoff')),
  number integer not null,                 -- qual: match number; playoff: series
  game integer not null default 1,         -- playoff series can have several games
  scheduled_at timestamptz,
  red integer[] not null default '{}',     -- team numbers by position: red[1] = Red 1
  blue integer[] not null default '{}',
  red_score integer,                       -- official score, once played
  blue_score integer,
  played boolean not null default false,
  primary key (event_id, level, number, game)
);

-- The Events a group attends, and which one is Current.
create table public.group_events (
  group_id uuid not null references public.groups (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  is_current boolean not null default false,
  added_by uuid references auth.users (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (group_id, event_id)
);
create unique index group_events_one_current on public.group_events (group_id) where is_current;

-- Submissions remember which Event they were scouted at.
alter table public.submissions add column event_id uuid references public.events (id) on delete set null;

-- ---------------------------------------------------------------- rules (RLS)

alter table public.events enable row level security;
alter table public.event_teams enable row level security;
alter table public.event_matches enable row level security;
alter table public.group_events enable row level security;

create policy "signed-in people read events" on public.events for select to authenticated using (true);
create policy "signed-in people read event teams" on public.event_teams for select to authenticated using (true);
create policy "signed-in people read schedules" on public.event_matches for select to authenticated using (true);
create policy "members see their group's events" on public.group_events
  for select to authenticated using (public.is_member(group_id));

grant select on public.events, public.event_teams, public.event_matches, public.group_events to authenticated;

-- ---------------------------------------------------------------- functions

-- A Lead makes an Event the group's Current event (adding it if it's new).
create function public.set_current_event(p_group uuid, p_event uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_lead(p_group) then raise exception 'Only a Lead can choose the event'; end if;
  update public.group_events set is_current = false where group_id = p_group and is_current;
  insert into public.group_events (group_id, event_id, is_current, added_by)
  values (p_group, p_event, true, auth.uid())
  on conflict (group_id, event_id) do update set is_current = true;
end
$$;
revoke execute on function public.set_current_event from public, anon;
grant execute on function public.set_current_event to authenticated;

-- save_submission now also keeps the Event (event_id).
create or replace function public.save_submission(s jsonb)
returns text
language plpgsql security invoker
set search_path = ''
as $$
declare
  incoming timestamptz := (s ->> 'updated_at')::timestamptz;
begin
  update public.submissions set
    scout_name = s ->> 'scout_name',
    event = coalesce(s ->> 'event', ''),
    event_id = (s ->> 'event_id')::uuid,
    config_id = s ->> 'config_id',
    config_version = (s ->> 'config_version')::integer,
    match_level = s ->> 'match_level',
    match_number = (s ->> 'match_number')::integer,
    team_number = (s ->> 'team_number')::integer,
    alliance_position = s ->> 'alliance_position',
    "values" = s -> 'values',
    estimated_points = coalesce((s ->> 'estimated_points')::integer, 0),
    updated_at = incoming,
    submitted_at = (s ->> 'submitted_at')::timestamptz,
    deleted_at = (s ->> 'deleted_at')::timestamptz
  where id = (s ->> 'id')::uuid and updated_at < incoming;
  if found then return 'saved'; end if;

  if exists (select 1 from public.submissions where id = (s ->> 'id')::uuid) then
    return 'older';
  end if;

  insert into public.submissions (
    id, group_id, scout_id, scout_name, event, event_id, config_id, config_version, match_level, match_number,
    team_number, alliance_position, "values", estimated_points, created_at, updated_at, submitted_at, deleted_at
  ) values (
    (s ->> 'id')::uuid, (s ->> 'group_id')::uuid, auth.uid(), s ->> 'scout_name', coalesce(s ->> 'event', ''),
    (s ->> 'event_id')::uuid, s ->> 'config_id', (s ->> 'config_version')::integer, s ->> 'match_level',
    (s ->> 'match_number')::integer, (s ->> 'team_number')::integer, s ->> 'alliance_position', s -> 'values',
    coalesce((s ->> 'estimated_points')::integer, 0), (s ->> 'created_at')::timestamptz, incoming,
    (s ->> 'submitted_at')::timestamptz, (s ->> 'deleted_at')::timestamptz
  );
  return 'saved';
end
$$;

grant update (event_id) on public.submissions to authenticated;
