-- Tasks: one-off to-dos in lists. Design notes: docs/tareas.md.
--
-- A list belongs to one person and is shared whole with groups, like a calendar folder; without
-- shares it is private. Who sees a list uses its tasks (add, edit, tick, reorder, delete); only the
-- owner and whoever manages the owner (can_manage_person) rename, share or delete the list.
-- Ticking goes through set_task_done so done_by can't be faked. Deleting is soft (deleted_at +
-- deletion_batch), as in the calendar, and empty_trash() clears it after 30 days.

-- ── Groups: a third section ──────────────────────────────────────────────────

alter table public.groups add column tasks_enabled boolean not null default true;
alter table public.groups drop constraint groups_some_section;
alter table public.groups
  add constraint groups_some_section check (shopping_enabled or calendar_enabled or tasks_enabled);

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.people (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.people (id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_by uuid references public.people (id) on delete set null,
  deleted_at timestamptz,
  -- A list and the tasks deleted with it share this id.
  deletion_batch uuid,
  constraint task_lists_deleted_has_batch check ((deleted_at is null) = (deletion_batch is null))
);

create index task_lists_owner_id_idx on public.task_lists (owner_id);

create table public.task_list_shares (
  list_id uuid not null references public.task_lists (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  shared_by uuid references public.people (id) on delete set null,
  shared_at timestamptz not null default now(),
  primary key (list_id, group_id)
);

create index task_list_shares_group_id_idx on public.task_list_shares (group_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.task_lists (id) on delete cascade,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 120),
  notes text check (char_length(notes) <= 2000),
  assigned_to uuid references public.people (id) on delete set null,
  due_date date,
  -- Manual order inside the list. Numeric, so a task moves between two others with one update
  -- (the midpoint of its neighbours). Left out on insert, the task goes to the end.
  position numeric not null,
  done_at timestamptz,
  done_by uuid references public.people (id) on delete set null,
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.people (id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_by uuid references public.people (id) on delete set null,
  deleted_at timestamptz,
  deletion_batch uuid,
  constraint tasks_done_by_needs_done_at check (done_by is null or done_at is not null),
  constraint tasks_deleted_has_batch check ((deleted_at is null) = (deletion_batch is null))
);

create index tasks_list_id_idx on public.tasks (list_id, position);
create index tasks_assigned_to_idx on public.tasks (assigned_to);

-- ── Who can see and manage (security definer so RLS on these tables doesn't recurse) ──

create function public.can_manage_task_list(lid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.task_lists l where l.id = lid and public.can_manage_person(l.owner_id))
$$;

-- Group members stop seeing a list once it is in the trash; whoever manages it still does.
create function public.can_view_task_list(lid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_task_list(lid)
      or exists (
        select 1 from public.task_list_shares s
          join public.task_lists l on l.id = s.list_id and l.deleted_at is null
         where s.list_id = lid and public.is_group_member(s.group_id)
      )
$$;

-- As with folders: whoever shares must manage the list and be in the group, and so must its owner.
create function public.can_share_task_list(lid uuid, gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_task_list(lid)
     and public.is_group_member(gid)
     and exists (
       select 1 from public.task_lists l
         join public.members m on m.person_id = l.owner_id
        where l.id = lid and l.deleted_at is null
          and m.group_id = gid and m.status = 'active' and m.left_at is null
     )
$$;

-- Whom a task can be assigned to: the owner, or an active member of a group the list is shared
-- with. A private list only takes its owner.
create function public.person_sees_task_list(pid uuid, lid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.task_lists l where l.id = lid and l.owner_id = pid)
      or exists (
        select 1 from public.task_list_shares s
          join public.members m on m.group_id = s.group_id
         where s.list_id = lid and m.person_id = pid and m.status = 'active' and m.left_at is null
      )
$$;

create function public.is_live_task_list(lid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.task_lists where id = lid and deleted_at is null)
$$;

-- ── Stamps and defaults ──────────────────────────────────────────────────────

create trigger task_lists_stamp_create before insert on public.task_lists
  for each row execute function public.stamp_create();
create trigger task_lists_stamp_edit before update on public.task_lists
  for each row execute function public.stamp_edit();
create trigger task_list_shares_stamp before insert on public.task_list_shares
  for each row execute function public.stamp_share();
create trigger tasks_stamp_create before insert on public.tasks
  for each row execute function public.stamp_create();

-- Only changes to what the task says count as an edit: ticking, moving and deleting have their
-- own fields.
create function public.stamp_task_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.title, new.notes, new.assigned_to, new.due_date)
     is not distinct from (old.title, old.notes, old.assigned_to, old.due_date) then
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(public.my_person_id(), new.updated_by);
  return new;
end;
$$;

create trigger tasks_stamp_edit before update on public.tasks
  for each row execute function public.stamp_task_edit();

-- New tasks go to the end of their list.
create function public.task_default_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(t.position), 0) + 1 into new.position from public.tasks t where t.list_id = new.list_id;
  end if;
  return new;
end;
$$;

create trigger tasks_default_position before insert on public.tasks
  for each row execute function public.task_default_position();

-- Someone who no longer sees a list (the share went, or they left the group) can't keep tasks in it.
create function public.unassign_hidden_tasks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The list itself is being purged: its tasks go with it.
  if not exists (select 1 from public.task_lists where id = old.list_id) then
    return null;
  end if;
  update public.tasks t set assigned_to = null
   where t.list_id = old.list_id and t.assigned_to is not null
     and not public.person_sees_task_list(t.assigned_to, t.list_id);
  return null;
end;
$$;

create trigger task_list_shares_unassign after delete on public.task_list_shares
  for each row execute function public.unassign_hidden_tasks();

-- ── Row level security ───────────────────────────────────────────────────────

alter table public.task_lists enable row level security;
alter table public.task_list_shares enable row level security;
alter table public.tasks enable row level security;

-- can_manage_person(owner_id) reads the new row itself, so insert … returning works (see the
-- calendars policy in 20261017120000_calendar_reads.sql). It also shows the trash to managers.
create policy "see task lists shared with me" on public.task_lists
  for select to authenticated
  using (public.can_manage_person(owner_id) or (deleted_at is null and public.can_view_task_list(id)));
create policy "create task lists for myself and the profiles I manage" on public.task_lists
  for insert to authenticated with check (public.can_manage_person(owner_id));
-- Only the name is updatable (column grants below).
create policy "managers rename task lists" on public.task_lists
  for update to authenticated
  using (deleted_at is null and public.can_manage_task_list(id)) with check (public.can_manage_task_list(id));

create policy "see the groups of lists I see" on public.task_list_shares
  for select to authenticated using (public.can_view_task_list(list_id));
create policy "managers share task lists with their groups" on public.task_list_shares
  for insert to authenticated with check (public.can_share_task_list(list_id, group_id));
create policy "managers stop sharing task lists" on public.task_list_shares
  for delete to authenticated using (public.can_manage_task_list(list_id));

create policy "see tasks of lists I see" on public.tasks
  for select to authenticated using (public.can_view_task_list(list_id));
create policy "whoever sees a list adds tasks" on public.tasks
  for insert to authenticated
  with check (
    public.can_view_task_list(list_id) and public.is_live_task_list(list_id)
    and (assigned_to is null or public.person_sees_task_list(assigned_to, list_id))
  );
create policy "whoever sees a list edits its tasks" on public.tasks
  for update to authenticated
  using (deleted_at is null and public.can_view_task_list(list_id) and public.is_live_task_list(list_id))
  with check (
    public.can_view_task_list(list_id)
    and (assigned_to is null or public.person_sees_task_list(assigned_to, list_id))
  );

-- ── Ticking ──────────────────────────────────────────────────────────────────

create function public.set_task_done(task_id uuid, done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
begin
  update public.tasks t
     set done_at = case when done then coalesce(t.done_at, now()) end,
         done_by = case when done then coalesce(t.done_by, me) end
   where t.id = set_task_done.task_id and t.deleted_at is null
     and public.can_view_task_list(t.list_id) and public.is_live_task_list(t.list_id);
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
end;
$$;

-- ── Trash ────────────────────────────────────────────────────────────────────

-- Returns the deletion batch, for "Deshacer".
create function public.delete_task(task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  batch uuid;
begin
  update public.tasks t
     set deleted_at = now(), deleted_by = me, deletion_batch = gen_random_uuid()
   where t.id = delete_task.task_id and t.deleted_at is null
     and public.can_view_task_list(t.list_id) and public.is_live_task_list(t.list_id)
  returning t.deletion_batch into batch;
  if batch is null then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  return batch;
end;
$$;

-- A task deleted with its list comes back by restoring the list.
create function public.restore_task(task_id uuid)
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
         assigned_to = case when public.person_sees_task_list(t.assigned_to, t.list_id) then t.assigned_to end
   where t.id = target.id;
end;
$$;

-- The list and its tasks go to the trash together, as one batch. Its shares stay, so restoring
-- it brings it back to the same groups.
create function public.delete_task_list(list_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  batch uuid := gen_random_uuid();
begin
  update public.task_lists l
     set deleted_at = now(), deleted_by = me, deletion_batch = batch
   where l.id = delete_task_list.list_id and l.deleted_at is null and public.can_manage_task_list(l.id);
  if not found then
    raise exception 'task list not found' using errcode = 'P0002';
  end if;
  update public.tasks t
     set deleted_at = now(), deleted_by = me, deletion_batch = batch
   where t.list_id = delete_task_list.list_id and t.deleted_at is null;
  return batch;
end;
$$;

create function public.restore_task_list(list_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.task_lists;
begin
  perform public.require_person();
  select * into target from public.task_lists l
   where l.id = restore_task_list.list_id and l.deleted_at is not null and public.can_manage_task_list(l.id);
  if target.id is null then
    raise exception 'task list not found' using errcode = 'P0002';
  end if;
  update public.tasks t set deleted_at = null, deleted_by = null, deletion_batch = null
   where t.list_id = target.id and t.deletion_batch = target.deletion_batch;
  update public.task_lists l set deleted_at = null, deleted_by = null, deletion_batch = null where l.id = target.id;
end;
$$;

-- "Eliminar definitivamente" from the trash.
create function public.purge_task(task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_person();
  delete from public.tasks t
   where t.id = purge_task.task_id and t.deleted_at is not null and public.can_view_task_list(t.list_id);
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.purge_task_list(list_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_person();
  delete from public.task_lists l
   where l.id = purge_task_list.list_id and l.deleted_at is not null and public.can_manage_task_list(l.id);
  if not found then
    raise exception 'task list not found' using errcode = 'P0002';
  end if;
end;
$$;

-- As before, plus lists and tasks.
create or replace function public.empty_trash(max_age interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer;
  total integer := 0;
begin
  delete from public.calendars where deleted_at < now() - max_age;
  get diagnostics purged = row_count;
  total := total + purged;
  delete from public.events where deleted_at < now() - max_age;
  get diagnostics purged = row_count;
  total := total + purged;
  delete from public.task_lists where deleted_at < now() - max_age;
  get diagnostics purged = row_count;
  total := total + purged;
  delete from public.tasks where deleted_at < now() - max_age;
  get diagnostics purged = row_count;
  return total + purged;
end;
$$;

-- ── Creating a group, leaving it, claiming a profile ─────────────────────────

-- As before, with the third section, and the creator gets a "Pendientes" list shared with the group.
drop function public.create_group(text, boolean, boolean);
create function public.create_group(
  group_name text,
  with_shopping boolean default true,
  with_calendar boolean default true,
  with_tasks boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  new_group_id uuid;
  new_list_id uuid;
begin
  insert into public.groups (name, shopping_enabled, calendar_enabled, tasks_enabled, created_by)
  values (trim(group_name), with_shopping, with_calendar, with_tasks, me)
  returning id into new_group_id;
  insert into public.members (group_id, person_id, role, status, approved_by, approved_at)
  values (new_group_id, me, 'admin', 'active', me, now());
  insert into public.task_lists (owner_id, name) values (me, 'Pendientes') returning id into new_list_id;
  insert into public.task_list_shares (list_id, group_id) values (new_list_id, new_group_id);
  return new_group_id;
end;
$$;

-- As before, plus tasks: the member's lists stop being shared with the group (the share trigger
-- unassigns whoever no longer sees them), and they come off tasks in lists they no longer see.
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
  update public.tasks t set assigned_to = null
   where t.assigned_to = target.person_id and not public.person_sees_task_list(target.person_id, t.list_id);

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

-- As before: an account that already has lists isn't fresh either.
create or replace function public.claim_profile(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  target uuid;
begin
  select p.id into target from public.people p where p.claim_code = upper(trim(code)) and p.user_id is null;
  if target is null then
    raise exception 'invalid claim code' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.members where person_id = me)
     or exists (select 1 from public.calendars where owner_id = me)
     or exists (select 1 from public.task_lists where owner_id = me) then
    raise exception 'account already in use';
  end if;

  update public.people set user_id = null where id = me;
  delete from public.people where id = me;
  update public.people set user_id = auth.uid(), claim_code = null where id = target;
  return target;
end;
$$;

-- ── Realtime ─────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.task_lists, public.task_list_shares, public.tasks;

-- ── Privileges ───────────────────────────────────────────────────────────────
-- Same rule as the first migration: start from zero on every new table and function.

grant update (tasks_enabled) on public.groups to authenticated;

revoke all on public.task_lists, public.task_list_shares, public.tasks from anon, authenticated;

grant select on public.task_lists to authenticated;
grant insert (id, owner_id, name) on public.task_lists to authenticated;
grant update (name) on public.task_lists to authenticated;
grant select, delete on public.task_list_shares to authenticated;
grant insert (list_id, group_id) on public.task_list_shares to authenticated;
grant select on public.tasks to authenticated;
grant insert (id, list_id, title, notes, assigned_to, due_date, position) on public.tasks to authenticated;
grant update (title, notes, assigned_to, due_date, position) on public.tasks to authenticated;

revoke execute on function
  public.can_manage_task_list(uuid),
  public.can_view_task_list(uuid),
  public.can_share_task_list(uuid, uuid),
  public.person_sees_task_list(uuid, uuid),
  public.is_live_task_list(uuid),
  public.stamp_task_edit(),
  public.task_default_position(),
  public.unassign_hidden_tasks(),
  public.set_task_done(uuid, boolean),
  public.delete_task(uuid),
  public.restore_task(uuid),
  public.delete_task_list(uuid),
  public.restore_task_list(uuid),
  public.purge_task(uuid),
  public.purge_task_list(uuid),
  public.empty_trash(interval),
  public.create_group(text, boolean, boolean, boolean),
  public.retire_member(uuid),
  public.claim_profile(text)
from public, anon, authenticated;

grant execute on function
  public.can_manage_task_list(uuid),
  public.can_view_task_list(uuid),
  public.can_share_task_list(uuid, uuid),
  public.person_sees_task_list(uuid, uuid),
  public.is_live_task_list(uuid),
  public.set_task_done(uuid, boolean),
  public.delete_task(uuid),
  public.restore_task(uuid),
  public.delete_task_list(uuid),
  public.restore_task_list(uuid),
  public.purge_task(uuid),
  public.purge_task_list(uuid),
  public.create_group(text, boolean, boolean, boolean),
  public.claim_profile(text)
to authenticated;
