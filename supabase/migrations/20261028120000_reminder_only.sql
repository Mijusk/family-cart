-- «Recordatorio»: an event that is there for its notification («tomar la pastilla»). Hoy lists it
-- small; Semana, Mes, the busy slots and «Planificar con IA» leave it out. It still has a start and
-- an end (the app stores the start plus 15 minutes, so events_times holds), repeats and reminds as
-- any other event. Design: docs/calendario.md §8.

alter table public.events add column reminder_only boolean not null default false;

grant insert (reminder_only), update (reminder_only) on public.events to authenticated;

-- A reminder isn't time taken: it never shows as «Ocupado» to the group.
create or replace function public.busy_events(gid uuid)
returns table (
  id uuid, owner_id uuid, all_day boolean, start_date date, start_time time, end_time time,
  timezone text, repeat text, repeat_weekdays smallint[], repeat_until date, exceptions jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, c.owner_id, e.all_day, e.start_date, e.start_time, e.end_time,
         e.timezone, e.repeat, e.repeat_weekdays, e.repeat_until,
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'occurrence_date', x.occurrence_date,
                    'status', x.status,
                    'overrides', x.overrides - array['title', 'notes', 'location']
                  ) order by x.occurrence_date)
             from public.event_exceptions x where x.event_id = e.id
         ), '[]')
    from public.calendar_shares s
    join public.calendars c on c.id = s.calendar_id and c.deleted_at is null
    join public.events e on e.calendar_id = c.id and e.deleted_at is null and not e.reminder_only
   where s.group_id = gid and s.level = 'busy'
     and public.is_group_member(gid)
     and not public.can_view_event(e.id)
$$;
