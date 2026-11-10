-- Custom questions can take a Number answer (typed on the number pad),
-- e.g. "Cycle time (seconds)" or "Points they scored in Auto".
-- The old check (from 20261023000000) is named by Postgres after the column.
alter table public.custom_questions drop constraint custom_questions_type_check;
alter table public.custom_questions add constraint custom_questions_type_check
  check (type in ('toggle', 'counter', 'choice', 'rating', 'text', 'number'));
