-- QR backup fixes (from the critique):
--  1. added_by is set by the database, so nobody can fake who uploaded a match.
--  2. save_submission says 'denied' (not 'older') when the row exists but the
--     caller may not change it (e.g. a Lead's scanned copy when the group
--     doesn't let Leads edit), so the phone stops retrying instead of
--     showing "waiting" forever. The Scout's own phone still sends it.

create function public.submission_added_by() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.added_by := auth.uid();
  return new;
end $$;

create trigger submissions_added_by before insert on public.submissions
  for each row execute function public.submission_added_by();

create or replace function public.save_submission(s jsonb)
returns text
language plpgsql security invoker
set search_path = ''
as $$
declare
  incoming timestamptz := (s ->> 'updated_at')::timestamptz;
  existing record;
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

  -- Already there. Newer on the server, or not ours to change?
  select group_id, scout_id, updated_at into existing
    from public.submissions where id = (s ->> 'id')::uuid;
  if found then
    if existing.updated_at >= incoming then return 'older'; end if;
    return 'denied';
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
