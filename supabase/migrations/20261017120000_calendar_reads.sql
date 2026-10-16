-- Reads the calendar screens need beyond RLS. Design notes: docs/calendario.md.

-- Whose an event is. An event can be visible through an extra group or as a participant while
-- its folder stays private (its name hidden by RLS), so the owner and the folder's color come
-- from here.
create function public.event_owners(event_ids uuid[])
returns table (event_id uuid, owner_id uuid, color text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, c.owner_id, c.color
    from public.events e
    join public.calendars c on c.id = e.calendar_id
   where e.id = any (event_ids) and e.deleted_at is null and public.can_view_event(e.id)
$$;

-- Folders the signed-in person can put events in: their own, those of the profiles they
-- manage, and those shared in full with a group they administer.
create function public.editable_calendar_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.calendars c where c.deleted_at is null and public.can_edit_calendar(c.id)
$$;

revoke execute on function public.event_owners(uuid[]), public.editable_calendar_ids() from public, anon, authenticated;
grant execute on function public.event_owners(uuid[]), public.editable_calendar_ids() to authenticated;

-- A folder just created must be readable in the same statement (insert … returning): the
-- helper functions don't see the new row yet, so the owner check reads it from the row itself.
drop policy "see calendars shared with me" on public.calendars;
create policy "see calendars shared with me" on public.calendars
  for select to authenticated
  using (
    public.can_manage_person(owner_id)
    or public.can_edit_calendar(id)
    or (deleted_at is null and public.can_view_calendar(id))
  );
