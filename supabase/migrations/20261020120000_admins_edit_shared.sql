-- Admins edit every folder shared with their group, also in busy mode, and can create a folder
-- for any active member of it (Luis, after the launch). Private folders stay private: a folder
-- with no share is only for its owner (and whoever manages a profile without account).
--
-- A busy share keeps hiding the details from the rest of the group, not from its admins: they
-- now see those events in full (can_view_calendar includes can_edit_calendar), and busy_events()
-- leaves them out for them because they can see them.

create or replace function public.can_edit_calendar(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.calendars c
     where c.id = cid
       and (
         public.can_manage_person(c.owner_id)
         -- Admins edit whatever is shared with their group, in full or busy mode.
         or exists (
           select 1 from public.calendar_shares s
            where s.calendar_id = c.id and public.is_group_admin(s.group_id)
         )
       )
  )
$$;

-- A new folder for someone else in the group, shared with it in full so the admin can edit it.
-- The owner can then share it elsewhere, or stop sharing it, from Mis carpetas.
create function public.create_calendar_for(owner_id uuid, name text, color text, group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  new_id uuid;
begin
  if not public.is_group_admin(create_calendar_for.group_id) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.members m
     where m.group_id = create_calendar_for.group_id and m.person_id = create_calendar_for.owner_id
       and m.status = 'active' and m.left_at is null
  ) then
    raise exception 'not a member of the group' using errcode = 'P0002';
  end if;
  insert into public.calendars (owner_id, name, color, position)
  values (
    create_calendar_for.owner_id, create_calendar_for.name, create_calendar_for.color,
    (select count(*) from public.calendars c where c.owner_id = create_calendar_for.owner_id and c.deleted_at is null)
  )
  returning id into new_id;
  insert into public.calendar_shares (calendar_id, group_id, level)
  values (new_id, create_calendar_for.group_id, 'full');
  return new_id;
end;
$$;

revoke execute on function public.create_calendar_for(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_calendar_for(uuid, text, text, uuid) to authenticated;
