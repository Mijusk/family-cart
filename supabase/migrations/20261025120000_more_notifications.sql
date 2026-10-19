-- More notifications: changes to events, being let into a group, tasks due today, and choosing
-- which kinds each person gets. Design notes: docs/notificaciones.md.

-- ── Kinds and preferences ────────────────────────────────────────────────────

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in ('event_reminder', 'event_changed', 'task_assigned', 'task_due', 'join_request', 'member_approved')
);

-- The kinds this person doesn't want, on any device. Empty = all of them.
alter table public.people
  add column muted_notifications text[] not null default '{}'
  check (muted_notifications <@ array['event_reminder', 'event_changed', 'task_assigned', 'task_due', 'join_request', 'member_approved']);

grant update (muted_notifications) on public.people to authenticated;

-- Same as before, skipping the kinds the person turned off.
create or replace function public.notify(person uuid, kind text, title text, body text, url text, dedupe_key text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (person_id, kind, title, body, url, dedupe_key)
  select p.id, notify.kind, left(notify.title, 120), left(notify.body, 300), notify.url, notify.dedupe_key
    from public.people p
   where p.id = notify.person and p.user_id is not null
     and not (notify.kind = any (p.muted_notifications))
  on conflict (dedupe_key) do nothing
$$;

-- "hoy a las 17:30", "mañana, todo el día", "lun 20 oct a las 09:00".
create function public.event_when(d date, all_day boolean, t time, today date)
returns text
language sql
immutable
set search_path = ''
as $$
  select public.short_day(d, today)
      || case when all_day then ', todo el día' else ' a las ' || to_char(t, 'HH24:MI') end
$$;

-- ── Changes to events ────────────────────────────────────────────────────────

-- Whoever gets the event's reminders (owner and participants, or the admins for a child) hears
-- when someone else changes, cancels or deletes it, while it still has days ahead. Several saves
-- in a row, or an undo, leave only the latest news: what is still unsent about it is dropped.
-- dedupe_key: event-change:<event>:<series date, or "all">:<person>:<time>.
create function public.notify_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.my_person_id();
  who text := coalesce((select display_name from public.people where id = me), 'Alguien');
  today date := (now() at time zone new.timezone)::date;
  title text;
  body text;
  url text;
  person uuid;
begin
  -- Undone deletion: the news no longer holds.
  if old.deleted_at is not null and new.deleted_at is null then
    delete from public.notifications where sent_at is null and dedupe_key like 'event-change:' || new.id || ':%';
    return null;
  end if;

  if new.deleted_at is not null and old.deleted_at is null then
    if (case when old.repeat = 'none' then old.start_date else coalesce(old.repeat_until, 'infinity') end) < today then
      return null;
    end if;
    title := who || ' ha borrado «' || old.title || '»';
    body := case when old.repeat = 'none'
                 then 'Era ' || public.event_when(old.start_date, old.all_day, old.start_time, today) || '.'
                 else 'Con todas sus repeticiones.' end;
    url := '/calendario';
    delete from public.notifications where sent_at is null and dedupe_key like 'event-change:' || new.id || ':%';
  elsif new.deleted_at is null
    and (new.title, new.location, new.all_day, new.start_date, new.start_time, new.end_time,
         new.repeat, new.repeat_weekdays, new.repeat_until, new.calendar_id)
        is distinct from
        (old.title, old.location, old.all_day, old.start_date, old.start_time, old.end_time,
         old.repeat, old.repeat_weekdays, old.repeat_until, old.calendar_id) then
    if greatest(case when old.repeat = 'none' then old.start_date else coalesce(old.repeat_until, 'infinity') end,
                case when new.repeat = 'none' then new.start_date else coalesce(new.repeat_until, 'infinity') end) < today then
      return null;
    end if;
    title := who || ' ha cambiado «' || new.title || '»';
    body := case when new.repeat = 'none'
                 then 'Ahora ' || public.event_when(new.start_date, new.all_day, new.start_time, today)
                      || coalesce(' · ' || nullif(new.location, ''), '')
                 else 'Cambia en todas sus repeticiones.' end;
    url := '/calendario/evento/' || new.id;
    delete from public.notifications where sent_at is null and dedupe_key like 'event-change:' || new.id || ':all:%';
  else
    return null;
  end if;

  for person in select public.event_reminder_people(new.id) loop
    continue when person = me;
    perform public.notify(person, 'event_changed', title, body, url,
                          format('event-change:%s:all:%s:%s', new.id, person, clock_timestamp()));
  end loop;
  return null;
end;
$$;

create trigger events_notify_change after update on public.events
  for each row execute function public.notify_event_change();

-- One day of a repeating event changed or cancelled (or put back as the series: the news is dropped).
create function public.notify_occurrence_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.my_person_id();
  who text := coalesce((select display_name from public.people where id = me), 'Alguien');
  e public.events;
  today date;
  occ_date date;
  day_text text;
  title text;
  body text;
  person uuid;
  key_prefix text;
begin
  if tg_op = 'DELETE' then
    delete from public.notifications
     where sent_at is null and dedupe_key like format('event-change:%s:%s:', old.event_id, old.occurrence_date) || '%';
    return null;
  end if;

  -- Only what people would notice: a note on one day isn't news.
  if new.status = 'modified' and (new.overrides - 'notes') = '{}' then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status = old.status and (new.overrides - 'notes') = (old.overrides - 'notes') then
    return null;
  end if;

  select * into e from public.events where id = new.event_id;
  if e.deleted_at is not null then
    return null;
  end if;
  today := (now() at time zone e.timezone)::date;
  occ_date := coalesce((new.overrides ->> 'start_date')::date, new.occurrence_date);
  if greatest(new.occurrence_date, occ_date) < today then
    return null;
  end if;

  day_text := case public.short_day(new.occurrence_date, today)
                when 'hoy' then 'Solo hoy'
                when 'mañana' then 'Solo mañana'
                else 'Solo el ' || public.short_day(new.occurrence_date, today) end;
  if new.status = 'cancelled' then
    title := who || ' ha cancelado «' || e.title || '»';
    body := day_text || '.';
  else
    title := who || ' ha cambiado «' || coalesce(new.overrides ->> 'title', e.title) || '»';
    body := day_text || ': ahora '
      || public.event_when(occ_date,
                           coalesce((new.overrides ->> 'all_day')::boolean, e.all_day),
                           coalesce((new.overrides ->> 'start_time')::time, e.start_time),
                           today)
      || coalesce(' · ' || nullif(case when new.overrides ? 'location' then new.overrides ->> 'location' else e.location end, ''), '');
  end if;

  key_prefix := format('event-change:%s:%s:', new.event_id, new.occurrence_date);
  delete from public.notifications where sent_at is null and dedupe_key like key_prefix || '%';
  for person in select public.event_reminder_people(e.id) loop
    continue when person = me;
    perform public.notify(person, 'event_changed', title, body,
                          '/calendario/evento/' || e.id || '?dia=' || new.occurrence_date,
                          key_prefix || person || ':' || clock_timestamp());
  end loop;
  return null;
end;
$$;

create trigger event_exceptions_notify_change after insert or update or delete on public.event_exceptions
  for each row execute function public.notify_occurrence_change();

-- ── Let into a group ─────────────────────────────────────────────────────────

create function public.notify_member_approved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin_name text := (select display_name from public.people where id = new.approved_by);
begin
  if old.status = 'pending' and new.status = 'active' and new.left_at is null then
    perform public.notify(new.person_id, 'member_approved',
                          'Ya estás en ' || (select name from public.groups where id = new.group_id),
                          coalesce(admin_name, 'Un administrador') || ' ha aceptado tu solicitud.', '/');
  end if;
  return null;
end;
$$;

create trigger members_notify_approved after update of status on public.members
  for each row execute function public.notify_member_approved();

-- ── Tasks due today ──────────────────────────────────────────────────────────

-- At 09:00 on its date, an unfinished task reminds the people it is assigned to (or, with no one,
-- the list's owner). The time zone is that of a group the list is shared with, else one of its
-- owner's groups. Like the event reminders: a 15-minute window and a dedupe_key.
create function public.enqueue_task_reminders(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  margin constant interval := interval '15 minutes';
  fire_at timestamptz;
  person uuid;
  written integer := 0;
begin
  for t in
    select tk.id, tk.title, tk.due_date, tk.assignees, l.owner_id, l.name as list_name,
           coalesce(
             (select g.timezone from public.task_list_shares s join public.groups g on g.id = s.group_id
               where s.list_id = l.id order by s.shared_at limit 1),
             (select g.timezone from public.members m join public.groups g on g.id = m.group_id
               where m.person_id = l.owner_id and m.status = 'active' and m.left_at is null
               order by m.created_at limit 1),
             'Europe/Madrid') as timezone
      from public.tasks tk join public.task_lists l on l.id = tk.list_id
     where tk.due_date between (at at time zone 'UTC')::date - 1 and (at at time zone 'UTC')::date + 1
       and tk.done_at is null and tk.deleted_at is null and l.deleted_at is null
  loop
    fire_at := (t.due_date + time '09:00') at time zone t.timezone;
    continue when fire_at > at or fire_at <= at - margin;
    for person in
      select unnest(case when cardinality(t.assignees) > 0 then t.assignees else array[t.owner_id] end)
    loop
      perform public.notify(person, 'task_due', t.title, 'Para hoy · ' || t.list_name, '/tareas/' || t.id,
                            format('task-due:%s:%s:%s', t.id, t.due_date, person));
    end loop;
    written := written + 1;
  end loop;
  return written;
end;
$$;

-- Every minute, now also with the tasks due.
create or replace function public.dispatch_notifications()
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
  perform public.enqueue_task_reminders();
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

-- ── Privileges ───────────────────────────────────────────────────────────────

revoke execute on function
  public.event_when(date, boolean, time, date),
  public.notify_event_change(),
  public.notify_occurrence_change(),
  public.notify_member_approved(),
  public.enqueue_task_reminders(timestamptz)
from public, anon, authenticated;
