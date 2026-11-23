-- The stretching streak (Luis, 19-nov): each routine a person finishes is written down with the
-- day it was on their device. The streak, the best one and the weekly wildcard are worked out in
-- the app from these days (src/lib/streak.ts), so nothing else is stored. Private: each person
-- sees only their own. Design notes: docs/estiramientos.md (§4).

create table public.stretch_sessions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  -- The day on the person's device when they finished (their morning, wherever they are).
  day date not null,
  routine text not null check (char_length(routine) between 1 and 40),
  created_at timestamptz not null default now()
);

create index stretch_sessions_person_id_day_idx on public.stretch_sessions (person_id, day);

alter table public.stretch_sessions enable row level security;

create policy "see my stretch sessions" on public.stretch_sessions
  for select to authenticated using (person_id = public.my_person_id());

-- Written only here: always for oneself, and only for a day around today (a device's day can be
-- one ahead or behind the database's), so past days can't be filled in afterwards.
create function public.log_stretch_session(routine text, local_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
begin
  if local_day is null or local_day not between current_date - 1 and current_date + 1 then
    raise exception 'invalid stretch day' using errcode = '22023';
  end if;
  insert into public.stretch_sessions (person_id, day, routine)
  values (me, local_day, left(trim(log_stretch_session.routine), 40));
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────────

revoke all on public.stretch_sessions from anon, authenticated;
grant select (id, person_id, day, routine, created_at) on public.stretch_sessions to authenticated;

revoke execute on function public.log_stretch_session(text, date) from public, anon, authenticated;
grant execute on function public.log_stretch_session(text, date) to authenticated;
