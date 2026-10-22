-- QR backup (docs/adr/0004): when nobody has signal, a Scout's phone shows
-- its matches as QR codes and a Lead's phone scans them. When the Lead's
-- phone later has signal it uploads them, and they must stay the Scout's
-- matches (not the Lead's). So:
--   * a Lead may add a Submission for a member of their group,
--   * added_by records who actually uploaded it (honest about QR copies).

alter table public.submissions add column added_by uuid references auth.users (id) on delete set null default auth.uid();

drop policy "add: members add their own" on public.submissions;
create policy "add: your own, or a Lead adds a member's (QR backup)" on public.submissions
  for insert to authenticated with check (
    public.is_member(group_id) and (
      scout_id = auth.uid()
      or (public.is_lead(group_id) and public.is_member_of(group_id, scout_id))
    )
  );

-- save_submission takes an optional scout_id (QR copies); otherwise it's the caller.
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
    (s ->> 'id')::uuid, (s ->> 'group_id')::uuid, coalesce((s ->> 'scout_id')::uuid, auth.uid()),
    s ->> 'scout_name', coalesce(s ->> 'event', ''),
    (s ->> 'event_id')::uuid, s ->> 'config_id', (s ->> 'config_version')::integer, s ->> 'match_level',
    (s ->> 'match_number')::integer, (s ->> 'team_number')::integer, s ->> 'alliance_position', s -> 'values',
    coalesce((s ->> 'estimated_points')::integer, 0), (s ->> 'created_at')::timestamptz, incoming,
    (s ->> 'submitted_at')::timestamptz, (s ->> 'deleted_at')::timestamptz
  );
  return 'saved';
end
$$;
