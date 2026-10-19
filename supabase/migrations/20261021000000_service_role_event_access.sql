-- The event-data server function writes FIRST's event data as Supabase's
-- "service_role". That role skips Row Level Security, but it still needs
-- table permissions, and this project doesn't grant them automatically
-- ("Automatically expose new tables" is off, on purpose). Found by Dhir:
-- picking an event failed with "permission denied for table events".
grant select, insert, update, delete on public.events, public.event_teams, public.event_matches
  to service_role;
