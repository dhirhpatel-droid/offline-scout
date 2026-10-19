-- Custom questions belong to one Game config (one season's game), so a
-- group's FTC questions don't show up in the FRC game after kickoff.
alter table public.custom_questions add column config_id text;
update public.custom_questions q set config_id = g.game_config_id from public.groups g where g.id = q.group_id;
alter table public.custom_questions alter column config_id set not null;

-- A question's wording can't change once asked, so answers keep their
-- meaning. To reword: hide it and add a new one. Only order and hiding change.
revoke update on public.custom_questions from authenticated;
grant update (position, hidden_at) on public.custom_questions to authenticated;
