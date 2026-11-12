-- The bell's list of recent notifications, and a daily reminder to breathe. Design notes:
-- docs/notificaciones.md (§5 and §6) and docs/respiracion.md.

-- ── Recent notifications ─────────────────────────────────────────────────────

-- Each person reads their own, whether or not a device received them. Only what the list shows:
-- the queue's bookkeeping (dedupe_key, sent_at) stays with the database and the Edge Function.
create policy "see my notifications" on public.notifications
  for select to authenticated using (person_id = public.my_person_id());

grant select (id, person_id, kind, title, body, url, created_at) on public.notifications to authenticated;

create index notifications_person_id_created_at_idx on public.notifications (person_id, created_at desc);

-- Until when this person has looked at the list: newer ones are unread (the bell's badge).
-- Starts now, so the ones already in the queue don't all appear as new.
alter table public.people add column notifications_seen_at timestamptz not null default now();

create function public.mark_notifications_seen()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.people set notifications_seen_at = now() where id = public.require_person()
$$;

-- ── Daily reminder to breathe ────────────────────────────────────────────────

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (
  kind in ('event_reminder', 'event_changed', 'task_assigned', 'task_due', 'join_request', 'member_approved',
           'breathing_reminder')
);

-- Local time of the day for the reminder; null = none. Only the person sets their own.
alter table public.people add column breathing_reminder_time time;

create function public.set_breathing_reminder(at time)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.people set breathing_reminder_time = date_trunc('minute', set_breathing_reminder.at)
   where id = public.require_person()
$$;

-- Every day at that time, in the time zone of the person's oldest group (Europe/Madrid without
-- one). Like the other reminders: a 15-minute window and a dedupe_key, one a day at most.
create function public.enqueue_breathing_reminders(at timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  margin constant interval := interval '15 minutes';
  d date;
  fire_at timestamptz;
  written integer := 0;
begin
  for p in
    select pe.id, pe.breathing_reminder_time as time,
           coalesce(
             (select g.timezone from public.members m join public.groups g on g.id = m.group_id
               where m.person_id = pe.id and m.status = 'active' and m.left_at is null
               order by m.created_at limit 1),
             'Europe/Madrid') as timezone
      from public.people pe
     where pe.breathing_reminder_time is not null and pe.user_id is not null
  loop
    -- Yesterday too: a reminder at 23:55 is still in the window just after midnight.
    for d in select (at at time zone p.timezone)::date - i from generate_series(0, 1) i loop
      fire_at := (d + p.time) at time zone p.timezone;
      continue when fire_at > at or fire_at <= at - margin;
      perform public.notify(p.id, 'breathing_reminder', 'Un momento para respirar',
                            'Unos minutos de respiración tranquila, sin forzar.', '/respiracion',
                            format('breathing:%s:%s', p.id, d));
      written := written + 1;
    end loop;
  end loop;
  return written;
end;
$$;

-- Every minute, now also with the reminders to breathe. Kept for 30 days instead of 7, as the
-- bell's list shows them; the Edge Function still sends only those less than an hour old.
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
  perform public.enqueue_breathing_reminders();
  delete from public.notifications where created_at < now() - interval '30 days';
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
  public.mark_notifications_seen(),
  public.set_breathing_reminder(time),
  public.enqueue_breathing_reminders(timestamptz)
from public, anon, authenticated;

grant execute on function
  public.mark_notifications_seen(),
  public.set_breathing_reminder(time)
to authenticated;
