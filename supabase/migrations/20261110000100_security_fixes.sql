-- Fixes from the security review of Nov 10, 2026. Nothing here changes what
-- a member can do; it closes gaps for people outside a group.

-- 1. Helper functions only answer about groups you're in, and only signed-in
--    people can call them. Before, anyone who knew a group's id could read
--    its settings (group_setting) or check who is in it (is_member_of).
create or replace function public.group_setting(g uuid, setting text, fallback boolean) returns boolean
language sql stable security definer
set search_path = ''
as $$
  -- Only true/false settings count; anything else falls back (no cast error
  -- that would show the stored value).
  select coalesce((
    select (gr.settings -> setting)::boolean from public.groups gr
    where gr.id = g and public.is_member(g) and jsonb_typeof(gr.settings -> setting) = 'boolean'
  ), fallback)
$$;

create or replace function public.is_member_of(g uuid, person uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_member(g)
     and exists (select 1 from public.memberships m where m.group_id = g and m.user_id = person)
$$;

revoke execute on function public.my_email, public.is_member, public.is_lead, public.shares_group,
  public.group_setting, public.can_read_submission, public.can_edit_submission, public.is_member_of
  from public, anon;
grant execute on function public.my_email, public.is_member, public.is_lead, public.shares_group,
  public.group_setting, public.can_read_submission, public.can_edit_submission, public.is_member_of
  to authenticated;

-- 2. Size limits on what a phone sends, so nobody can fill the database.
alter table public.submissions
  add constraint submissions_values_size check (pg_column_size("values") < 32768),
  add constraint submissions_scout_name_length check (char_length(scout_name) <= 60),
  add constraint submissions_event_length check (char_length(event) <= 120);

-- 3. The name on a Submission is the Scout's own profile name (set here, not
--    by the phone), so nobody can put someone else's name on a match.
create function public.submission_scout_name() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.scout_name := coalesce(
    (select p.display_name from public.profiles p where p.id = new.scout_id),
    new.scout_name);
  return new;
end;
$$;
create trigger submission_scout_name before insert or update on public.submissions
  for each row execute function public.submission_scout_name();
revoke execute on function public.submission_scout_name from public, anon, authenticated;

-- 4. Someone who leaves (or is removed from) a group no longer counts as
--    watching anything: their Position shifts and Team watches go too.
create function public.drop_plan_of_leaver() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.position_shifts where group_id = old.group_id and scout_id = old.user_id;
  delete from public.team_watches where group_id = old.group_id and scout_id = old.user_id;
  return old;
end;
$$;
create trigger drop_plan_of_leaver after delete on public.memberships
  for each row execute function public.drop_plan_of_leaver();
revoke execute on function public.drop_plan_of_leaver from public, anon, authenticated;
