-- Milestone 3: Submissions sync between phones and the group.
-- Words follow GLOSSARY.md; decisions in docs/adr/0001.
--
--   * Each phone keeps the main copy and sends Submissions here when it has signal.
--   * The newer edit wins, by when it was MADE on a phone (updated_at), not when
--     it arrived. Every overwritten version is kept in submission_edits.
--   * Deleting is "soft" (deleted_at is set), so other phones learn about it.
--   * server_updated_at is set by the database on every change; phones ask
--     "what changed since <the last one I saw>?" with it.

create table public.submissions (
  id uuid primary key,                                  -- made on the phone
  group_id uuid not null references public.groups (id) on delete cascade,
  scout_id uuid references auth.users (id) on delete set null,
  scout_name text not null,                             -- kept if the Scout leaves
  event text not null default '',
  config_id text not null,
  config_version integer not null,
  match_level text check (match_level in ('qual', 'playoff')),
  match_number integer,
  team_number integer,
  alliance_position text,
  "values" jsonb not null default '{}'::jsonb,
  estimated_points integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null,                      -- when last edited, on a phone
  submitted_at timestamptz,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now()  -- when it last changed here
);
create index submissions_group_changes on public.submissions (group_id, server_updated_at);

-- Every version that got replaced, so a Lead can see who changed what.
create table public.submission_edits (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  edited_by uuid references auth.users (id) on delete set null,
  edited_at timestamptz not null default now(),
  values_before jsonb not null,
  updated_at_before timestamptz not null
);
create index submission_edits_submission on public.submission_edits (submission_id);

-- ---------------------------------------------------------------- helpers

-- A Group setting (stored in groups.settings), or the default if not set.
create function public.group_setting(g uuid, setting text, fallback boolean) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select (gr.settings ->> setting)::boolean from public.groups gr where gr.id = g), fallback)
$$;

-- May the signed-in person see / change this Submission?
create function public.can_read_submission(g uuid, scout uuid) returns boolean
language sql stable
set search_path = ''
as $$
  select public.is_lead(g)
      or (public.is_member(g) and (scout = auth.uid() or public.group_setting(g, 'scoutsSeeAll', false)))
$$;

create function public.can_edit_submission(g uuid, scout uuid) returns boolean
language sql stable
set search_path = ''
as $$
  select (public.is_member(g) and scout = auth.uid())
      or (public.is_lead(g) and public.group_setting(g, 'leadsCanEdit', true))
$$;

-- ---------------------------------------------------------------- rules (RLS)

alter table public.submissions enable row level security;
alter table public.submission_edits enable row level security;

create policy "read: Leads see all, Scouts their own (or all if the group allows)" on public.submissions
  for select to authenticated using (public.can_read_submission(group_id, scout_id));
create policy "add: members add their own" on public.submissions
  for insert to authenticated with check (public.is_member(group_id) and scout_id = auth.uid());
create policy "change: your own, or any if you're a Lead and the group allows" on public.submissions
  for update to authenticated
  using (public.can_edit_submission(group_id, scout_id))
  with check (public.can_edit_submission(group_id, scout_id));
-- No delete policy: deleting is setting deleted_at.

create policy "Leads see the edit history" on public.submission_edits
  for select to authenticated using (
    exists (select 1 from public.submissions s where s.id = submission_id and public.is_lead(s.group_id))
  );

-- ---------------------------------------------------------------- triggers

-- Stamp every change with the server's time, and keep the old version.
create function public.track_submission_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.server_updated_at := now();
  if tg_op = 'UPDATE' and new."values" is distinct from old."values" then
    insert into public.submission_edits (submission_id, edited_by, values_before, updated_at_before)
    values (old.id, auth.uid(), old."values", old.updated_at);
  end if;
  return new;
end
$$;
create trigger submissions_track_change
  before insert or update on public.submissions
  for each row execute function public.track_submission_change();

-- ---------------------------------------------------------------- the sync function

-- A phone sends one Submission (as JSON). Returns:
--   'saved' – the server now has this version
--   'older' – the server already has a newer edit; the phone should take that one
-- Runs as the caller ("security invoker"), so all the rules above apply.
create function public.save_submission(s jsonb)
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
    id, group_id, scout_id, scout_name, event, config_id, config_version, match_level, match_number,
    team_number, alliance_position, "values", estimated_points, created_at, updated_at, submitted_at, deleted_at
  ) values (
    (s ->> 'id')::uuid, (s ->> 'group_id')::uuid, auth.uid(), s ->> 'scout_name', coalesce(s ->> 'event', ''),
    s ->> 'config_id', (s ->> 'config_version')::integer, s ->> 'match_level', (s ->> 'match_number')::integer,
    (s ->> 'team_number')::integer, s ->> 'alliance_position', s -> 'values',
    coalesce((s ->> 'estimated_points')::integer, 0), (s ->> 'created_at')::timestamptz, incoming,
    (s ->> 'submitted_at')::timestamptz, (s ->> 'deleted_at')::timestamptz
  );
  return 'saved';
end
$$;

-- ---------------------------------------------------------------- access

grant select, insert on public.submissions to authenticated;
-- Phones may change the scouting data, never who/what group it belongs to.
grant update (scout_name, event, config_id, config_version, match_level, match_number, team_number,
  alliance_position, "values", estimated_points, updated_at, submitted_at, deleted_at)
  on public.submissions to authenticated;
grant select on public.submission_edits to authenticated;

revoke execute on function public.save_submission from public, anon;
grant execute on function public.save_submission to authenticated;
revoke execute on function public.track_submission_change from public, anon, authenticated;
