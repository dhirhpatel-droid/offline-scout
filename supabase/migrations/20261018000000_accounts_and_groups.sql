-- Milestone 2: accounts and Scouting groups.
-- Words follow GLOSSARY.md. Plain-language guide: docs/roadmap.md.
--
-- How security works here:
--   * Every table has Row Level Security (RLS): the database itself checks each
--     row against the rules below, so even a modified app can't read or change
--     another group's data.
--   * auth.uid() is the signed-in person's id, taken from their login token.
--   * Some actions that touch several tables at once (creating a group,
--     accepting an Invite) are database functions marked "security definer":
--     they run with the database's own rights, after checking the caller.

-- ---------------------------------------------------------------- tables

-- A person. The id is the same as their login id in auth.users.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

-- A Scouting group. program + team_number is a label, not unique.
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  program text not null check (program in ('FTC', 'FRC')),
  team_number integer not null check (team_number between 1 and 99999),
  name text not null check (char_length(name) between 1 and 60),
  game_config_id text not null,
  settings jsonb not null default '{}'::jsonb, -- Group settings (later milestones)
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One person in one group, with their role.
create table public.memberships (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('lead', 'scout')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index memberships_user_id on public.memberships (user_id);

-- An email Invite. Lower-case emails so "Maya@x.com" and "maya@x.com" match.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  email text not null check (email = lower(email) and email like '%_@_%'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);
-- At most one open Invite per email per group.
create unique index invites_one_open on public.invites (group_id, email) where accepted_at is null;
create index invites_email on public.invites (email);

-- ---------------------------------------------------------------- helpers

-- The signed-in person's email, lower-case.
create function public.my_email() returns text
language sql stable
set search_path = ''
as $$ select lower(auth.jwt() ->> 'email') $$;

-- Is the signed-in person a member / a Lead of this group?
-- "security definer" so they can read memberships without tripping the
-- memberships rules themselves (which would loop forever).
create function public.is_member(g uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.memberships m where m.group_id = g and m.user_id = auth.uid())
$$;

create function public.is_lead(g uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.group_id = g and m.user_id = auth.uid() and m.role = 'lead'
  )
$$;

-- Do the signed-in person and this person share a group? (to see their name)
create function public.shares_group(other uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- ---------------------------------------------------------------- rules (RLS)

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;

-- profiles: see yourself and people in your groups; change only yourself.
create policy "see own and group members' profiles" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_group(id));
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- groups: members see them, Leads change them. Created only via create_group().
create policy "members see their groups" on public.groups
  for select to authenticated using (public.is_member(id));
create policy "leads update their groups" on public.groups
  for update to authenticated using (public.is_lead(id)) with check (public.is_lead(id));

-- memberships: members see who's in the group. Leads change roles and remove
-- people; anyone can remove themselves (leave). Added only via functions.
create policy "members see the member list" on public.memberships
  for select to authenticated using (public.is_member(group_id));
create policy "leads change roles" on public.memberships
  for update to authenticated using (public.is_lead(group_id)) with check (public.is_lead(group_id));
create policy "leads remove members, anyone can leave" on public.memberships
  for delete to authenticated using (public.is_lead(group_id) or user_id = auth.uid());

-- invites: Leads see, send and cancel their group's Invites; you can see
-- Invites sent to your own email.
create policy "leads and the invited person see invites" on public.invites
  for select to authenticated using (public.is_lead(group_id) or email = public.my_email());
create policy "leads send invites" on public.invites
  for insert to authenticated with check (public.is_lead(group_id) and invited_by = auth.uid());
create policy "leads cancel invites" on public.invites
  for delete to authenticated using (public.is_lead(group_id));

-- ---------------------------------------------------------------- functions

-- Creates a group and makes the caller its first Lead, in one step.
create function public.create_group(p_program text, p_team_number integer, p_name text, p_game_config_id text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.groups (program, team_number, name, game_config_id, created_by)
  values (upper(p_program), p_team_number, trim(p_name), p_game_config_id, auth.uid())
  returning id into new_id;
  insert into public.memberships (group_id, user_id, role) values (new_id, auth.uid(), 'lead');
  return new_id;
end
$$;

-- Accepts an Invite sent to the caller's email: they join as a Scout.
create function public.accept_invite(p_invite_id uuid)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites
  where id = p_invite_id and email = public.my_email() and accepted_at is null;
  if inv.id is null then raise exception 'This invite is not for you or was already used'; end if;
  if inv.expires_at < now() then raise exception 'This invite has expired. Ask a Lead to send a new one.'; end if;
  insert into public.memberships (group_id, user_id, role)
  values (inv.group_id, auth.uid(), 'scout')
  on conflict (group_id, user_id) do nothing;
  update public.invites set accepted_at = now() where id = inv.id;
  return inv.group_id;
end
$$;

-- ---------------------------------------------------------------- triggers

-- Every new account gets a profile. The name comes from the sign-up form
-- (or the part of the email before the @ if none was given).
create function public.create_profile_for_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 40));
  return new;
end
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- A group must always keep at least one Lead: block demoting or removing
-- the last one (unless the whole group is being deleted).
create function public.keep_one_lead()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'lead'
     and (tg_op = 'DELETE' or new.role <> 'lead')
     and exists (select 1 from public.groups where id = old.group_id)
     and not exists (
       select 1 from public.memberships
       where group_id = old.group_id and role = 'lead' and user_id <> old.user_id
     ) then
    raise exception 'A group needs at least one Lead. Make someone else a Lead first.';
  end if;
  return coalesce(new, old);
end
$$;
create trigger memberships_keep_one_lead
  before update or delete on public.memberships
  for each row execute function public.keep_one_lead();

-- ---------------------------------------------------------------- access
-- New tables are not exposed automatically (project setting), so list
-- exactly what signed-in users may attempt. The rules above still apply.

-- Updates and inserts are limited to the columns that should change, e.g. a
-- Lead can change a member's role but can't move them into another group.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.groups to authenticated;
grant update (name, program, team_number, game_config_id, settings) on public.groups to authenticated;
grant select, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;
grant select, delete on public.invites to authenticated;
grant insert (group_id, email, invited_by) on public.invites to authenticated;

revoke execute on function public.create_group, public.accept_invite from public, anon;
grant execute on function public.create_group, public.accept_invite to authenticated;
revoke execute on function public.create_profile_for_new_user, public.keep_one_lead from public, anon, authenticated;
