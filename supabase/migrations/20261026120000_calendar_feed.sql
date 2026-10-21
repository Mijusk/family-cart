-- Calendar feed: a private link per person that phone calendars (Google, Apple, Outlook)
-- subscribe to, read-only. The calendar-feed Edge Function turns feed_calendar() into an .ics.
-- Design notes: docs/calendario.md §13.

-- ── Links ────────────────────────────────────────────────────────────────────

-- One link per person with an account. Whoever has the token reads that person's calendar, so it
-- is only shown to its owner; making a new one (or removing it) cuts off the old link.
create table public.calendar_feeds (
  person_id uuid primary key references public.people (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.calendar_feeds enable row level security;

create policy "see my feed" on public.calendar_feeds
  for select to authenticated
  using (person_id = public.my_person_id());

-- Creates the link, or replaces it with a new token. Returns the token.
create function public.create_calendar_feed()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  new_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.calendar_feeds (person_id, token) values (me, new_token)
  on conflict (person_id) do update set token = excluded.token, created_at = now();
  return new_token;
end;
$$;

create function public.delete_calendar_feed()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.calendar_feeds where person_id = public.my_person_id()
$$;

-- ── What the feed shows ──────────────────────────────────────────────────────

-- Everything the link's owner sees in the app: events in full (with folder, owner and exceptions)
-- and the busy slots of the groups they're in. Null for an unknown token.
--
-- The visibility rules are not repeated here: for the rest of the transaction the function acts
-- as the owner (request.jwt.claim.sub, which auth.uid() reads), so can_view_event() and
-- busy_events() answer exactly as they do in the app. Only service_role (the Edge Function) can
-- call it.
--
-- One-off events older than a year are left out; repeating ones always go in.
create function public.feed_calendar(feed_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  owner public.people;
begin
  select p.* into owner
    from public.calendar_feeds f join public.people p on p.id = f.person_id
   where f.token = feed_token and p.user_id is not null;
  if owner.id is null then
    return null;
  end if;
  perform set_config('request.jwt.claim.sub', owner.user_id::text, true);

  return jsonb_build_object(
    'name', owner.display_name,
    'timezone', coalesce((
      select g.timezone from public.members m join public.groups g on g.id = m.group_id
       where m.person_id = owner.id and m.status = 'active' and m.left_at is null
       order by m.created_at limit 1
    ), 'Europe/Madrid'),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'title', e.title, 'notes', e.notes, 'location', e.location,
               'all_day', e.all_day, 'start_date', e.start_date, 'start_time', e.start_time,
               'end_time', e.end_time, 'timezone', e.timezone, 'repeat', e.repeat,
               'repeat_weekdays', e.repeat_weekdays, 'repeat_until', e.repeat_until,
               'updated_at', e.updated_at, 'calendar', c.name, 'owner', p.display_name,
               'mine', c.owner_id = owner.id,
               'exceptions', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'occurrence_date', x.occurrence_date, 'status', x.status, 'overrides', x.overrides
                        ) order by x.occurrence_date)
                   from public.event_exceptions x where x.event_id = e.id
               ), '[]')
             ) order by e.start_date)
        from public.events e
        join public.calendars c on c.id = e.calendar_id and c.deleted_at is null
        join public.people p on p.id = c.owner_id
       where e.deleted_at is null
         and (e.repeat <> 'none' or e.start_date >= current_date - 365)
         and public.can_view_event(e.id)
    ), '[]'),
    -- The same busy event can come from several groups: once is enough.
    'busy', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'owner', p.display_name, 'all_day', b.all_day, 'start_date', b.start_date,
               'start_time', b.start_time, 'end_time', b.end_time, 'timezone', b.timezone,
               'repeat', b.repeat, 'repeat_weekdays', b.repeat_weekdays, 'repeat_until', b.repeat_until,
               'exceptions', b.exceptions
             ) order by b.start_date)
        from (
          select distinct on (be.id) be.*
            from public.members m, public.busy_events(m.group_id) be
           where m.person_id = owner.id and m.status = 'active' and m.left_at is null
        ) b
        join public.people p on p.id = b.owner_id
       where b.repeat <> 'none' or b.start_date >= current_date - 365
    ), '[]')
  );
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────────

revoke all on public.calendar_feeds from anon, authenticated;
grant select on public.calendar_feeds to authenticated;

revoke execute on function
  public.create_calendar_feed(),
  public.delete_calendar_feed(),
  public.feed_calendar(text)
from public, anon, authenticated;

grant execute on function public.create_calendar_feed(), public.delete_calendar_feed() to authenticated;
-- The calendar-feed Edge Function reads the feed as service_role.
grant execute on function public.feed_calendar(text) to service_role;
