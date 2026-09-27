-- Leaving a group.
--
-- A device can already belong to several groups (member_identities is unique per group and
-- device). Leaving unlinks this device from one of them. The member row is never deleted:
-- trips.member_id cascades, so deleting it would erase that person's purchases from the
-- group's history. When a member's last device leaves, the member is marked as gone
-- (left_at): hidden from "who's in the group" but still named in the history. Coming back
-- with the same name offers "¿Eres tú?" as usual, and claiming the member revives it.

alter table public.members add column left_at timestamptz;

-- Returns true if this was the member's last device (they have left the group entirely).
create function public.leave_group(gid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  my_member uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  delete from public.member_identities
   where group_id = gid and user_id = auth.uid()
  returning member_id into my_member;
  if my_member is null then
    raise exception 'not a member' using errcode = 'P0002';
  end if;

  -- Still in the group on another device: nothing else changes.
  if exists (select 1 from public.member_identities where member_id = my_member) then
    return false;
  end if;

  update public.members set left_at = now() where id = my_member;

  -- An unfinished trip goes back to the list now, instead of being bought by the 4-hour timeout.
  update public.items i
     set status = 'pending', trip_id = null
    from public.trips t
   where t.member_id = my_member and t.finished_at is null
     and i.trip_id = t.id and i.status = 'in_cart';
  update public.trips
     set finished_at = now(), closed_reason = 'cancelled'
   where member_id = my_member and finished_at is null;
  return true;
end;
$$;

-- Same as before, plus: linking a device to a member who had left brings them back.
create or replace function public.claim_member(code text, member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
  linked integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select id into target_group_id from public.groups where invite_code = upper(trim(code));
  if target_group_id is null then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.members m where m.id = claim_member.member_id and m.group_id = target_group_id) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  -- A device that is already someone in this group stays who it is.
  insert into public.member_identities (member_id, group_id, user_id)
  values (claim_member.member_id, target_group_id, auth.uid())
  on conflict (group_id, user_id) do nothing;
  get diagnostics linked = row_count;
  if linked = 1 then
    update public.members m set left_at = null where m.id = claim_member.member_id;
  end if;
  return target_group_id;
end;
$$;

-- The join screen's "N personas ya la usan" counts people still in the group.
create or replace function public.group_by_invite(code text)
returns table (id uuid, name text, member_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, (select count(*) from public.members m where m.group_id = g.id and m.left_at is null)
  from public.groups g
  where g.invite_code = upper(trim(code))
$$;

revoke execute on function public.leave_group(uuid) from public, anon;
grant execute on function public.leave_group(uuid) to authenticated;
