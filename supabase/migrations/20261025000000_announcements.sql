-- Announcements (GLOSSARY.md): short messages a Lead posts to their Scouting
-- group ("Switch to Red 2 after lunch"). Phones download them with the rest
-- of the group's data, so they can be read with no signal.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_by uuid references auth.users (id) on delete set null,
  author_name text not null default '',   -- copied, so it still shows if they leave
  created_at timestamptz not null default now()
);
create index announcements_group on public.announcements (group_id, created_at desc);

alter table public.announcements enable row level security;

-- Everyone in the group reads them; only Leads post or remove them.
create policy "members read their group's announcements" on public.announcements
  for select to authenticated using (public.is_member(group_id));
create policy "Leads post announcements" on public.announcements
  for insert to authenticated with check (public.is_lead(group_id) and created_by = auth.uid());
create policy "Leads remove announcements" on public.announcements
  for delete to authenticated using (public.is_lead(group_id));

grant select, insert, delete on public.announcements to authenticated;
