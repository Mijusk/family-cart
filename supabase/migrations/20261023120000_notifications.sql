-- Notifications (Web Push). Design notes: docs/notificaciones.md.
--
-- Each device that turns notifications on leaves a push subscription. What there is to say goes
-- into an outbox (notifications): event reminders, written every minute by pg_cron; tasks
-- assigned to someone and requests to join a group, written by triggers. Every minute pg_cron
-- also calls the send-notifications Edge Function through pg_net, which sends what is pending.
-- The function's URL and a shared secret live in Vault; without them nothing is called.

create extension if not exists pg_net with schema extensions;

-- ── Devices ──────────────────────────────────────────────────────────────────

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  -- The push service's URL for this browser on this device; unique per device.
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 2000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);

create index push_subscriptions_person_id_idx on public.push_subscriptions (person_id);

alter table public.push_subscriptions enable row level security;

create policy "see my devices" on public.push_subscriptions
  for select to authenticated using (person_id = public.my_person_id());
create policy "remove my devices" on public.push_subscriptions
  for delete to authenticated using (person_id = public.my_person_id());

-- Saving goes through here: a device signed in with another account before is now mine.
create function public.save_push_subscription(endpoint text, p256dh text, auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
begin
  insert into public.push_subscriptions (person_id, endpoint, p256dh, auth)
  values (me, save_push_subscription.endpoint, save_push_subscription.p256dh, save_push_subscription.auth)
  on conflict on constraint push_subscriptions_endpoint_key do update
    set person_id = me, p256dh = excluded.p256dh, auth = excluded.auth, created_at = now();
end;
$$;

-- ── Outbox ───────────────────────────────────────────────────────────────────

-- Only the database and the Edge Function (service role) touch it.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  kind text not null check (kind in ('event_reminder', 'task_assigned', 'join_request')),
  title text not null,
  body text not null default '',
  -- Where tapping it takes you, inside the app.
  url text not null default '/',
  -- The same reminder is only written once.
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index notifications_unsent_idx on public.notifications (created_at) where sent_at is null;

alter table public.notifications enable row level security;

-- Who gets anything at all: people with an account (a profile without one has no devices).
create function public.notify(person uuid, kind text, title text, body text, url text, dedupe_key text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (person_id, kind, title, body, url, dedupe_key)
  select p.id, notify.kind, left(notify.title, 120), left(notify.body, 300), notify.url, notify.dedupe_key
    from public.people p
   where p.id = notify.person and p.user_id is not null
  on conflict (dedupe_key) do nothing
$$;

-- ── Spanish dates for the texts ──────────────────────────────────────────────

-- "hoy", "mañana", "lun 20 oct" (as src/utils/days.ts), seen from `today`.
create function public.short_day(d date, today date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d = today then 'hoy'
    when d = today + 1 then 'mañana'
    else (array['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'])[extract(isodow from d)::int]
         || ' ' || extract(day from d)::int
         || ' ' || (array['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'])[extract(month from d)::int]
  end
$$;

-- ── Event reminders ──────────────────────────────────────────────────────────

-- Minutes before the start; null means no reminder. Up to 30 days.
alter table public.events
  add column reminder_minutes integer check (reminder_minutes between 0 and 43200);

grant insert (reminder_minutes), update (reminder_minutes) on public.events to authenticated;

-- Whether `d` is a date of the series, before exceptions (as isSeriesDate in src/lib/recurrence.ts).
create function public.is_series_date(e public.events, d date)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select d >= e.start_date and (e.repeat_until is null or d <= e.repeat_until)
     and case e.repeat
       when 'none' then d = e.start_date
       when 'daily' then true
       when 'weekly' then extract(isodow from d)::smallint = any (e.repeat_weekdays)
       when 'biweekly' then extract(isodow from d)::smallint = any (e.repeat_weekdays)
         and ((date_trunc('week', d)::date - date_trunc('week', e.start_date)::date) / 7) % 2 = 0
       when 'monthly' then extract(day from d) = extract(day from e.start_date)
       else false
     end
$$;

-- Who an event's reminder goes to: the folder's owner and its participants. For a profile without
-- an account (a child), the admins of the groups the event is shared with, in which that profile is.
create function public.event_reminder_people(eid uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with goers as (
    select c.owner_id as person_id, c.id as calendar_id
      from public.events e join public.calendars c on c.id = e.calendar_id
     where e.id = eid
    union
    select p.person_id, e.calendar_id
      from public.event_participants p join public.events e on e.id = p.event_id
     where p.event_id = eid
  ),
  groups as (
    select s.group_id from public.calendar_shares s join public.events e on e.calendar_id = s.calendar_id where e.id = eid
    union
    select s.group_id from public.event_shares s where s.event_id = eid
  )
  select g.person_id from goers g join public.people p on p.id = g.person_id where p.user_id is not null
  union
  select a.person_id
    from goers g
    join public.people kid on kid.id = g.person_id and kid.user_id is null
    join public.members km on km.person_id = kid.id and km.status = 'active' and km.left_at is null
    join groups gr on gr.group_id = km.group_id
    join public.members a on a.group_id = km.group_id and a.role = 'admin' and a.status = 'active' and a.left_at is null
    join public.people ap on ap.id = a.person_id and ap.user_id is not null
$$;

-- Writes the reminders due in the last 15 minutes up to `at` (pg_cron calls it every minute;
-- the margin covers a late or missed run, and dedupe_key keeps each one to a single write).
-- An all-day event counts as starting at 09:00. Returns how many were written.
create function public.enqueue_event_reminders(at timestamptz default now())
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
          '/calendario/evento/' || e.id || '?dia=' || occ_date,
          format('event:%s:%s:%s:%s', e.id, series_date, extract(epoch from fire_at)::bigint, person)
        );
      end loop;
      written := written + 1;
    end loop;
  end loop;
  return written;
end;
$$;

-- ── Tasks assigned ───────────────────────────────────────────────────────────

-- Whoever is added to a task hears about it, unless they added themselves.
create function public.notify_task_assignees()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.my_person_id();
  who text := coalesce((select display_name from public.people where id = me), 'Alguien');
  list_name text := (select name from public.task_lists where id = new.list_id);
  person uuid;
begin
  if new.deleted_at is not null or new.done_at is not null then
    return null;
  end if;
  for person in
    select p from unnest(new.assignees) p
     where p is distinct from me
       and (tg_op = 'INSERT' or not (p = any (old.assignees)))
  loop
    perform public.notify(person, 'task_assigned', who || ' te ha asignado una tarea',
                          new.title || ' · ' || list_name, '/tareas/' || new.id);
  end loop;
  return null;
end;
$$;

create trigger tasks_notify_assignees after insert or update of assignees on public.tasks
  for each row execute function public.notify_task_assignees();

-- ── Requests to join ─────────────────────────────────────────────────────────

create function public.notify_join_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text := (select display_name from public.people where id = new.person_id);
  group_name text := (select name from public.groups where id = new.group_id);
  admin uuid;
begin
  if new.status <> 'pending' or new.left_at is not null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.status = 'pending' and old.left_at is null then
    return null;
  end if;
  for admin in
    select m.person_id from public.members m
     where m.group_id = new.group_id and m.role = 'admin' and m.status = 'active' and m.left_at is null
  loop
    perform public.notify(admin, 'join_request', 'Solicitud para entrar en ' || group_name,
                          coalesce(who, 'Alguien') || ' quiere unirse al grupo.', '/grupo');
  end loop;
  return null;
end;
$$;

create trigger members_notify_join_request after insert or update of status, left_at on public.members
  for each row execute function public.notify_join_request();

-- ── Sending ──────────────────────────────────────────────────────────────────

-- Every minute: write the reminders due, and if anything is waiting, wake the Edge Function.
-- Needs two Vault secrets (see docs/notificaciones.md); without them the outbox just waits.
create function public.dispatch_notifications()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fn_url text;
  fn_secret text;
begin
  perform public.enqueue_event_reminders();
  -- Old ones, sent or not, are no longer news.
  delete from public.notifications where created_at < now() - interval '7 days';
  if not exists (select 1 from public.notifications where sent_at is null and created_at > now() - interval '1 hour') then
    return;
  end if;
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'notifications_function_url';
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'notifications_secret';
  if fn_url is null or fn_secret is null then
    return;
  end if;
  perform net.http_post(
    url := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notifications-secret', fn_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
end;
$$;

select cron.schedule('send-notifications', '* * * * *', 'select public.dispatch_notifications()');

-- ── Privileges ───────────────────────────────────────────────────────────────

revoke all on public.push_subscriptions, public.notifications from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

revoke execute on function
  public.save_push_subscription(text, text, text),
  public.notify(uuid, text, text, text, text, text),
  public.short_day(date, date),
  public.is_series_date(public.events, date),
  public.event_reminder_people(uuid),
  public.enqueue_event_reminders(timestamptz),
  public.notify_task_assignees(),
  public.notify_join_request(),
  public.dispatch_notifications()
from public, anon, authenticated;

grant execute on function public.save_push_subscription(text, text, text) to authenticated;
