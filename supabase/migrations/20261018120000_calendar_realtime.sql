-- Calendar in real time.
--
-- What someone can see arrives through Postgres changes (Realtime applies the same RLS as a
-- select). Busy slots can't: whoever sees a folder in busy mode has no access to its rows. For
-- them a trigger broadcasts an empty "changed" message on the group's calendar topic, and the app
-- reloads its busy slots. The message carries nothing, so it reveals nothing.

alter publication supabase_realtime add table
  public.calendars, public.calendar_shares, public.events, public.event_exceptions,
  public.event_shares, public.event_participants;

-- Groups that see this folder in busy mode.
create function public.notify_busy_groups(cid uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select realtime.send('{}'::jsonb, 'changed', 'calendar:' || s.group_id, false)
    from public.calendar_shares s
   where s.calendar_id = cid and s.level = 'busy'
$$;

create function public.calendar_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  case tg_table_name
    when 'calendars' then
      perform public.notify_busy_groups(coalesce(new.id, old.id));
    when 'events' then
      -- An event moved to another folder leaves one and enters the other.
      perform public.notify_busy_groups(old.calendar_id) where old.calendar_id is not null;
      perform public.notify_busy_groups(new.calendar_id)
        where new.calendar_id is not null and new.calendar_id is distinct from old.calendar_id;
    when 'calendar_shares' then
      -- Sharing in busy mode, or no longer: that group gains or loses slots.
      perform realtime.send('{}'::jsonb, 'changed', 'calendar:' || coalesce(new.group_id, old.group_id), false)
        where 'busy' in (old.level, new.level);
    else
      -- Exceptions, extra groups and participants: through their event's folder.
      perform public.notify_busy_groups(e.calendar_id)
         from public.events e where e.id = coalesce(new.event_id, old.event_id);
  end case;
  return null;
end;
$$;

create trigger calendars_notify after insert or update or delete on public.calendars
  for each row execute function public.calendar_changed();
create trigger events_notify after insert or update or delete on public.events
  for each row execute function public.calendar_changed();
create trigger calendar_shares_notify after insert or update or delete on public.calendar_shares
  for each row execute function public.calendar_changed();
create trigger event_exceptions_notify after insert or update or delete on public.event_exceptions
  for each row execute function public.calendar_changed();
create trigger event_shares_notify after insert or update or delete on public.event_shares
  for each row execute function public.calendar_changed();
create trigger event_participants_notify after insert or update or delete on public.event_participants
  for each row execute function public.calendar_changed();

-- Only the triggers use them.
revoke execute on function public.notify_busy_groups(uuid), public.calendar_changed() from public, anon, authenticated;
