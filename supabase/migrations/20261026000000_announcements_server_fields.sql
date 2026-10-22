-- Who posted an Announcement, under what name and when, is set by the
-- database, never by the phone, so nobody can post as someone else or
-- back/forward-date a post to pin it.
create function public.announcement_fill_in() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.created_by := auth.uid();
  new.created_at := now();
  new.author_name := coalesce((select p.display_name from public.profiles p where p.id = auth.uid()), '');
  return new;
end $$;

create trigger announcements_fill_in before insert on public.announcements
  for each row execute function public.announcement_fill_in();
