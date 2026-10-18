-- Tasks for more than one person: tasks.assigned_to becomes tasks.assignees (an array of people).
-- Design notes: docs/tareas.md.
--
-- A task is still one task: whoever of them ticks it, it is done for all. An array instead of a
-- join table keeps adding and editing a task to one insert or update (and an edit stamp), as before.
-- Without a foreign key, deleting a person takes them off the arrays with a trigger.

-- ── Column ───────────────────────────────────────────────────────────────────

alter table public.tasks
  add column assignees uuid[] not null default '{}'
    constraint tasks_assignees_valid check (array_position(assignees, null) is null and cardinality(assignees) <= 50);

update public.tasks set assignees = array[assigned_to] where assigned_to is not null;

create index tasks_assignees_idx on public.tasks using gin (assignees);

-- ── Who can be on a task ─────────────────────────────────────────────────────

-- Everyone in pids sees the list (person_sees_task_list for each one).
create function public.people_see_task_list(pids uuid[], lid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(bool_and(public.person_sees_task_list(p, lid)), true) from unnest(pids) p
$$;

-- Of pids, those who still see the list, in the same order.
create function public.task_list_viewers(pids uuid[], lid uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(p order by n), '{}') from unnest(pids) with ordinality as x (p, n)
   where public.person_sees_task_list(p, lid)
$$;

-- The same person twice is once.
create function public.dedupe_task_assignees()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.assignees := coalesce(
    (select array_agg(p order by n) from (
       select p, min(n) as n from unnest(new.assignees) with ordinality as x (p, n) group by p
     ) d),
    '{}');
  return new;
end;
$$;

create trigger tasks_dedupe_assignees before insert or update of assignees on public.tasks
  for each row execute function public.dedupe_task_assignees();

drop policy "whoever sees a list adds tasks" on public.tasks;
drop policy "whoever sees a list edits its tasks" on public.tasks;

create policy "whoever sees a list adds tasks" on public.tasks
  for insert to authenticated
  with check (
    public.can_view_task_list(list_id) and public.is_live_task_list(list_id)
    and public.people_see_task_list(assignees, list_id)
  );
create policy "whoever sees a list edits its tasks" on public.tasks
  for update to authenticated
  using (deleted_at is null and public.can_view_task_list(list_id) and public.is_live_task_list(list_id))
  with check (public.can_view_task_list(list_id) and public.people_see_task_list(assignees, list_id));

-- ── Functions that named assigned_to ─────────────────────────────────────────

-- As before, with assignees.
create or replace function public.stamp_task_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.title, new.notes, new.assignees, new.due_date)
     is not distinct from (old.title, old.notes, old.assignees, old.due_date) then
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(public.my_person_id(), new.updated_by);
  return new;
end;
$$;

-- As before: whoever no longer sees the list comes off its tasks; the others stay.
create or replace function public.unassign_hidden_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.task_lists where id = old.list_id) then
    return null;
  end if;
  update public.tasks t set assignees = public.task_list_viewers(t.assignees, t.list_id)
   where t.list_id = old.list_id and t.assignees <> '{}'
     and not public.people_see_task_list(t.assignees, t.list_id);
  return null;
end;
$$;

create or replace function public.restore_task(task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.tasks;
begin
  perform public.require_person();
  select * into target from public.tasks t
   where t.id = restore_task.task_id and t.deleted_at is not null and public.can_view_task_list(t.list_id);
  if target.id is null then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  if not public.is_live_task_list(target.list_id) then
    raise exception 'task list is deleted';
  end if;
  -- Whoever it was assigned to may have lost sight of the list meanwhile.
  update public.tasks t
     set deleted_at = null, deleted_by = null, deletion_batch = null,
         assignees = public.task_list_viewers(t.assignees, t.list_id)
   where t.id = target.id;
end;
$$;

-- As in 20261019120000_tasks.sql, with assignees.
create or replace function public.retire_member(target_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.members;
begin
  update public.members m set left_at = now()
   where m.id = target_member_id and m.left_at is null
  returning * into target;
  if target.id is null then
    return;
  end if;

  update public.items i
     set status = 'pending', trip_id = null
    from public.trips t
   where t.member_id = target.id and t.finished_at is null
     and i.trip_id = t.id and i.status = 'in_cart';
  update public.trips
     set finished_at = now(), closed_reason = 'cancelled'
   where member_id = target.id and finished_at is null;

  delete from public.calendar_shares s
   using public.calendars c
   where s.calendar_id = c.id and c.owner_id = target.person_id and s.group_id = target.group_id;
  delete from public.event_shares s
   using public.events e, public.calendars c
   where s.event_id = e.id and e.calendar_id = c.id and c.owner_id = target.person_id and s.group_id = target.group_id;
  delete from public.event_participants p
   using public.events e, public.calendars c
   where p.person_id = target.person_id and p.event_id = e.id and e.calendar_id = c.id
     and c.owner_id <> target.person_id
     and (
       exists (select 1 from public.calendar_shares s where s.calendar_id = c.id and s.group_id = target.group_id)
       or exists (select 1 from public.event_shares s where s.event_id = e.id and s.group_id = target.group_id)
     );

  delete from public.task_list_shares s
   using public.task_lists l
   where s.list_id = l.id and l.owner_id = target.person_id and s.group_id = target.group_id;
  update public.tasks t set assignees = array_remove(t.assignees, target.person_id)
   where t.assignees @> array[target.person_id] and not public.person_sees_task_list(target.person_id, t.list_id);

  if target.role = 'admin' and not exists (
    select 1 from public.members m
     where m.group_id = target.group_id and m.role = 'admin' and m.status = 'active' and m.left_at is null
  ) then
    update public.members m set role = 'admin'
     where m.id = (
       select m2.id from public.members m2
         join public.people p on p.id = m2.person_id
        where m2.group_id = target.group_id and m2.status = 'active' and m2.left_at is null
        -- People with an account first: a profile without one can't administer anything.
        order by (p.user_id is null), m2.approved_at nulls last, m2.created_at
        limit 1
     );
  end if;
end;
$$;

-- What on delete set null did for assigned_to.
create function public.unassign_deleted_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.tasks t set assignees = array_remove(t.assignees, old.id) where t.assignees @> array[old.id];
  return null;
end;
$$;

create trigger people_unassign_tasks after delete on public.people
  for each row execute function public.unassign_deleted_person();

alter table public.tasks drop column assigned_to;

-- ── Privileges ───────────────────────────────────────────────────────────────

grant insert (assignees) on public.tasks to authenticated;
grant update (assignees) on public.tasks to authenticated;

revoke execute on function
  public.people_see_task_list(uuid[], uuid),
  public.task_list_viewers(uuid[], uuid),
  public.dedupe_task_assignees(),
  public.unassign_deleted_person()
from public, anon, authenticated;

-- The policies call it as the signed-in user.
grant execute on function public.people_see_task_list(uuid[], uuid) to authenticated;
