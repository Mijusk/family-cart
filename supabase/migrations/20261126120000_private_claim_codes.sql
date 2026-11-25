-- Two fixes. Nothing changes for the app, so it can be applied before or after it is deployed.
--
-- 1. The claim code of a profile without an account (a child) was a column of people, which every
--    member of the group reads: anyone in it could take the code an admin had made and, with a new
--    account, become that person. It moves to a table nobody reads: only the RPCs do.
-- 2. The reminder of a day moved by an exception linked to its new date, which the event's screen
--    takes as a date of the series. It links to the series date, as event_changed already does.
--    And the every-minute job stops going through events that can't be due.

-- ── 1. Claim codes ───────────────────────────────────────────────────────────

create table public.claim_codes (
  person_id uuid primary key references public.people (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);

-- No policies and no grants: only the functions below.
alter table public.claim_codes enable row level security;
revoke all on public.claim_codes from anon, authenticated;

insert into public.claim_codes (person_id, code)
select id, claim_code from public.people where claim_code is not null and user_id is null;

-- Takes its check constraint with it.
alter table public.people drop column claim_code;

create or replace function public.create_claim_code(pid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  perform public.require_person();
  if not exists (select 1 from public.people where id = pid and user_id is null) or not public.can_manage_person(pid) then
    raise exception 'person not found' using errcode = 'P0002';
  end if;
  insert into public.claim_codes (person_id, code) values (pid, public.generate_invite_code())
  on conflict (person_id) do update set code = excluded.code, created_at = now()
  returning code into new_code;
  return new_code;
end;
$$;

create or replace function public.profile_by_claim_code(code text)
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name
    from public.claim_codes c join public.people p on p.id = c.person_id
   where c.code = upper(trim(profile_by_claim_code.code)) and p.user_id is null
$$;

-- As in 20261019120000_tasks.sql, with the code in its table.
create or replace function public.claim_profile(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  target uuid;
begin
  -- Taken by deleting it, so two accounts at once can't both use it.
  delete from public.claim_codes c
   using public.people p
   where c.code = upper(trim(claim_profile.code)) and p.id = c.person_id and p.user_id is null
  returning c.person_id into target;
  if target is null then
    raise exception 'invalid claim code' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.members where person_id = me)
     or exists (select 1 from public.calendars where owner_id = me)
     or exists (select 1 from public.task_lists where owner_id = me) then
    raise exception 'account already in use';
  end if;

  update public.people set user_id = null where id = me;
  delete from public.people where id = me;
  update public.people set user_id = auth.uid() where id = target;
  return target;
end;
$$;

-- ── 2. Event reminders ───────────────────────────────────────────────────────

-- As in 20261023120000_notifications.sql, except the link and which events it looks at.
create or replace function public.enqueue_event_reminders(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.events;
  margin constant interval := interval '15 minutes';
  first_day date;
  last_day date;
  series_date date;
  x public.event_exceptions;
  o jsonb;
  occ_date date;
  occ_all_day boolean;
  occ_time time;
  occ_title text;
  occ_location text;
  starts_at timestamptz;
  fire_at timestamptz;
  today date;
  body text;
  person uuid;
  written integer := 0;
begin
  for e in
    select ev.* from public.events ev join public.calendars c on c.id = ev.calendar_id
     where ev.reminder_minutes is not null and ev.deleted_at is null and c.deleted_at is null
       -- Not begun by the day reminded about, or over before it (two days of slack for time zones).
       and ev.start_date <= (at + make_interval(mins => ev.reminder_minutes))::date + 2
       and (case when ev.repeat = 'none' then ev.start_date else coalesce(ev.repeat_until, 'infinity') end
              >= (at + make_interval(mins => ev.reminder_minutes))::date - 2
            -- A changed day may have been moved past the end.
            or exists (select 1 from public.event_exceptions xe where xe.event_id = ev.id and xe.status = 'modified'))
  loop
    -- Occurrences whose reminder falls in the window start between these days (local, ±1 for safety).
    first_day := ((at - margin + make_interval(mins => e.reminder_minutes)) at time zone e.timezone)::date - 1;
    last_day := ((at + make_interval(mins => e.reminder_minutes)) at time zone e.timezone)::date + 1;
    today := (at at time zone e.timezone)::date;
    for series_date in
      select d::date from generate_series(greatest(first_day, e.start_date), least(last_day, coalesce(e.repeat_until, last_day)), interval '1 day') d
       where public.is_series_date(e, d::date)
      union
      -- Moved here from another day by an exception.
      select xe.occurrence_date from public.event_exceptions xe
       where xe.event_id = e.id and xe.status = 'modified'
         and (xe.overrides ->> 'start_date')::date between first_day and last_day
         and public.is_series_date(e, xe.occurrence_date)
    loop
      select * into x from public.event_exceptions xe where xe.event_id = e.id and xe.occurrence_date = series_date;
      continue when x.status = 'cancelled';
      o := coalesce(x.overrides, '{}');
      occ_date := coalesce((o ->> 'start_date')::date, series_date);
      occ_all_day := coalesce((o ->> 'all_day')::boolean, e.all_day);
      occ_time := case when occ_all_day then time '09:00' else coalesce((o ->> 'start_time')::time, e.start_time) end;
      occ_title := coalesce(o ->> 'title', e.title);
      occ_location := case when o ? 'location' then o ->> 'location' else e.location end;
      starts_at := (occ_date + occ_time) at time zone e.timezone;
      fire_at := starts_at - make_interval(mins => e.reminder_minutes);
      continue when fire_at > at or fire_at <= at - margin;

      body := initcap(left(public.short_day(occ_date, today), 1)) || substr(public.short_day(occ_date, today), 2)
        || case when occ_all_day then ', todo el día' else ' a las ' || to_char(occ_time, 'HH24:MI') end
        || coalesce(' · ' || nullif(occ_location, ''), '');
      for person in select public.event_reminder_people(e.id) loop
        perform public.notify(
          person, 'event_reminder', occ_title, body,
          '/calendario/evento/' || e.id || '?dia=' || series_date,
          format('event:%s:%s:%s:%s', e.id, series_date, extract(epoch from fire_at)::bigint, person)
        );
      end loop;
      written := written + 1;
    end loop;
  end loop;
  return written;
end;
$$;
