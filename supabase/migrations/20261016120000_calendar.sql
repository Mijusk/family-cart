-- Calendar schema: folders (calendars), events with simple repetition, sharing with groups,
-- history and trash. Design notes: docs/calendario.md (§4–§7).
--
-- Who sees what:
--   A calendar (folder) belongs to one person. Shared with a group at level 'full', the group's
--   active members see its events; at level 'busy' they only get the time slots through
--   busy_events(), never through the events table, so titles never reach their browser.
--   An event can add groups of its own (event_shares) and participants, who also see it.
-- Who edits:
--   The owner; the admins of a group a profile without account belongs to (can_manage_person);
--   and the admins of a group the calendar is shared with at level 'full'.
-- Deleting is soft (deleted_at + deletion_batch) and goes through RPCs; pg_cron empties the
-- trash after 30 days. event_history is written only by triggers.

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.people (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  color text not null default public.random_person_color() check (color ~ '^#[0-9a-f]{6}$'),
  position integer not null default 0,
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.people (id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_by uuid references public.people (id) on delete set null,
  deleted_at timestamptz,
  -- Everything deleted in the same action (a folder and its events) shares this id.
  deletion_batch uuid,
  constraint calendars_deleted_has_batch check ((deleted_at is null) = (deletion_batch is null))
);

create index calendars_owner_id_idx on public.calendars (owner_id);

-- New events go to the folder the person used last.
alter table public.people
  add column last_calendar_id uuid references public.calendars (id) on delete set null;

create table public.calendar_shares (
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  level text not null default 'full' check (level in ('full', 'busy')),
  shared_by uuid references public.people (id) on delete set null,
  shared_at timestamptz not null default now(),
  primary key (calendar_id, group_id)
);

create index calendar_shares_group_id_idx on public.calendar_shares (group_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  notes text check (char_length(notes) <= 2000),
  location text check (char_length(location) <= 200),
  all_day boolean not null default false,
  start_date date not null,
  -- Local wall-clock times in `timezone`. An end earlier than the start means the event ends
  -- the next day (23:00–01:00).
  start_time time,
  end_time time,
  timezone text not null default 'Europe/Madrid',
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'biweekly', 'monthly')),
  -- ISO weekdays, 1 = Monday … 7 = Sunday. Only for weekly and biweekly.
  repeat_weekdays smallint[],
  repeat_until date,
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.people (id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_by uuid references public.people (id) on delete set null,
  deleted_at timestamptz,
  deletion_batch uuid,
  constraint events_times check (
    case when all_day then start_time is null and end_time is null
         else start_time is not null and end_time is not null and end_time <> start_time end
  ),
  constraint events_weekdays check (
    case when repeat in ('weekly', 'biweekly')
         then repeat_weekdays is not null and cardinality(repeat_weekdays) between 1 and 7 and repeat_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
         else repeat_weekdays is null end
  ),
  constraint events_until check (repeat_until is null or (repeat <> 'none' and repeat_until >= start_date)),
  constraint events_deleted_has_batch check ((deleted_at is null) = (deletion_batch is null))
);

create index events_calendar_id_idx on public.events (calendar_id);

-- Extra groups for one event. A share can add groups, never take away the folder's.
create table public.event_shares (
  event_id uuid not null references public.events (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  shared_by uuid references public.people (id) on delete set null,
  shared_at timestamptz not null default now(),
  primary key (event_id, group_id)
);

create index event_shares_group_id_idx on public.event_shares (group_id);

create table public.event_participants (
  event_id uuid not null references public.events (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  primary key (event_id, person_id)
);

create index event_participants_person_id_idx on public.event_participants (person_id);

-- One occurrence of a repeating event cancelled or changed ("this Tuesday there's no class").
-- Removing an exception deletes the row; event_history keeps the record.
create table public.event_exceptions (
  event_id uuid not null references public.events (id) on delete cascade,
  occurrence_date date not null,
  status text not null check (status in ('cancelled', 'modified')),
  -- Fields of the event that change for this occurrence only.
  overrides jsonb not null default '{}',
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.people (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (event_id, occurrence_date),
  constraint event_exceptions_overrides check (
    jsonb_typeof(overrides) = 'object'
    and overrides - array['title', 'notes', 'location', 'all_day', 'start_date', 'start_time', 'end_time'] = '{}'
  )
);

-- No foreign keys: when an event is purged its last line stays here. calendar_id says who may
-- read it afterwards (the folder's editors).
create table public.event_history (
  id bigint generated always as identity primary key,
  event_id uuid not null,
  calendar_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete', 'restore', 'purge')),
  changed_by uuid references public.people (id) on delete set null,
  changed_at timestamptz not null default now(),
  -- Only the fields that changed.
  before jsonb,
  after jsonb
);

create index event_history_event_id_idx on public.event_history (event_id, changed_at);

-- ── Who can see and edit (security definer so RLS on these tables doesn't recurse) ──

create function public.can_edit_calendar(cid uuid)
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
         -- Admins edit what is shared in full with their group. Never a 'busy' share: they
         -- would see what the owner chose to hide.
         or exists (
           select 1 from public.calendar_shares s
            where s.calendar_id = c.id and s.level = 'full' and public.is_group_admin(s.group_id)
         )
       )
  )
$$;

create function public.can_view_calendar(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_edit_calendar(cid)
      or exists (
        select 1 from public.calendar_shares s
         where s.calendar_id = cid and s.level = 'full' and public.is_group_member(s.group_id)
      )
$$;

-- Deletion is not checked here: the policies decide what the trash shows.
create function public.can_view_event(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.id = eid
       and (
         public.can_view_calendar(e.calendar_id)
         or exists (
           select 1 from public.event_shares s where s.event_id = e.id and public.is_group_member(s.group_id)
         )
         or exists (
           select 1 from public.event_participants p where p.event_id = e.id and p.person_id = public.my_person_id()
         )
       )
  )
$$;

create function public.can_edit_event(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events e where e.id = eid and public.can_edit_calendar(e.calendar_id))
$$;

-- Sharing a folder (or adding a group to an event) needs edit rights, being an active member of
-- that group, and the owner being in it too: a calendar only shows in groups its owner is in.
create function public.can_share_calendar(cid uuid, gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_edit_calendar(cid)
     and public.is_group_member(gid)
     and exists (
       select 1 from public.calendars c
         join public.members m on m.person_id = c.owner_id
        where c.id = cid and c.deleted_at is null
          and m.group_id = gid and m.status = 'active' and m.left_at is null
     )
$$;

create function public.can_share_event(eid uuid, gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
     where e.id = eid and e.deleted_at is null and public.can_share_calendar(e.calendar_id, gid)
  )
$$;

create function public.is_live_calendar(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.calendars where id = cid and deleted_at is null)
$$;

create function public.is_live_event(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events where id = eid and deleted_at is null)
$$;

-- ── Stamps ───────────────────────────────────────────────────────────────────

-- The author is whoever is signed in; rows inserted by the database itself (seed) keep theirs.
create function public.stamp_create()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  new.created_by := coalesce(public.my_person_id(), new.created_by);
  new.updated_at := new.created_at;
  return new;
end;
$$;

-- Like stamp_update, but moving to and from the trash is not an edit: deleted_by/at record it.
create function public.stamp_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is distinct from old.deleted_at then
    return new;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(public.my_person_id(), new.updated_by);
  return new;
end;
$$;

create function public.stamp_share()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.shared_at := now();
  new.shared_by := coalesce(public.my_person_id(), new.shared_by);
  return new;
end;
$$;

create trigger calendars_stamp_create before insert on public.calendars
  for each row execute function public.stamp_create();
create trigger calendars_stamp_edit before update on public.calendars
  for each row execute function public.stamp_edit();
create trigger events_stamp_create before insert on public.events
  for each row execute function public.stamp_create();
create trigger events_stamp_edit before update on public.events
  for each row execute function public.stamp_edit();
create trigger event_exceptions_stamp_create before insert on public.event_exceptions
  for each row execute function public.stamp_create();
create trigger event_exceptions_stamp_update before update on public.event_exceptions
  for each row execute function public.stamp_update();
create trigger calendar_shares_stamp before insert on public.calendar_shares
  for each row execute function public.stamp_share();
create trigger event_shares_stamp before insert on public.event_shares
  for each row execute function public.stamp_share();

create function public.remember_last_calendar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.people set last_calendar_id = new.calendar_id
   where id = public.my_person_id() and last_calendar_id is distinct from new.calendar_id;
  return new;
end;
$$;

create trigger events_remember_last_calendar
  after insert on public.events
  for each row execute function public.remember_last_calendar();

-- ── History ──────────────────────────────────────────────────────────────────

-- What an event looks like in the history: its own fields, without ids and stamps.
create function public.event_snapshot(e public.events)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select to_jsonb(e) - array['id', 'created_by', 'created_at', 'updated_by', 'updated_at',
                             'deleted_by', 'deleted_at', 'deletion_batch']
$$;

create function public.log_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_snap jsonb;
  new_snap jsonb;
  changed_before jsonb;
  changed_after jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.event_history (event_id, calendar_id, action, changed_by, after)
    values (new.id, new.calendar_id, 'create', coalesce(public.my_person_id(), new.created_by), public.event_snapshot(new));

  elsif tg_op = 'DELETE' then
    -- Purged for good: only a minimal line survives.
    delete from public.event_history where event_id = old.id;
    insert into public.event_history (event_id, calendar_id, action, changed_by, before)
    values (old.id, old.calendar_id, 'purge', public.my_person_id(), jsonb_build_object('title', old.title));

  elsif old.deleted_at is null and new.deleted_at is not null then
    insert into public.event_history (event_id, calendar_id, action, changed_by)
    values (new.id, new.calendar_id, 'delete', coalesce(public.my_person_id(), new.deleted_by));

  elsif old.deleted_at is not null and new.deleted_at is null then
    insert into public.event_history (event_id, calendar_id, action, changed_by)
    values (new.id, new.calendar_id, 'restore', public.my_person_id());

  else
    old_snap := public.event_snapshot(old);
    new_snap := public.event_snapshot(new);
    select jsonb_object_agg(o.key, o.value), jsonb_object_agg(o.key, new_snap -> o.key)
      into changed_before, changed_after
      from jsonb_each(old_snap) o
     where new_snap -> o.key is distinct from o.value;
    if changed_before is not null then
      insert into public.event_history (event_id, calendar_id, action, changed_by, before, after)
      values (new.id, new.calendar_id, 'update', coalesce(public.my_person_id(), new.updated_by), changed_before, changed_after);
    end if;
  end if;
  return null;
end;
$$;

create trigger events_log_change
  after insert or update or delete on public.events
  for each row execute function public.log_event_change();

-- Exceptions, extra groups and participants are changes to their event too. Rows removed
-- because the event itself is being purged are not logged.
create function public.log_event_part_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  part_event_id uuid := case when tg_op = 'DELETE' then old.event_id else new.event_id end;
  part_calendar_id uuid;
  key text := case tg_table_name
    when 'event_exceptions' then 'exception'
    when 'event_shares' then 'group'
    else 'participant' end;
  old_part jsonb;
  new_part jsonb;
begin
  select calendar_id into part_calendar_id from public.events where id = part_event_id;
  if part_calendar_id is null then
    return null;
  end if;

  if tg_table_name = 'event_exceptions' then
    if tg_op <> 'INSERT' then
      old_part := jsonb_build_object('occurrence_date', old.occurrence_date, 'status', old.status, 'overrides', old.overrides);
    end if;
    if tg_op <> 'DELETE' then
      new_part := jsonb_build_object('occurrence_date', new.occurrence_date, 'status', new.status, 'overrides', new.overrides);
    end if;
  elsif tg_table_name = 'event_shares' then
    old_part := case when tg_op = 'DELETE' then to_jsonb(old.group_id) end;
    new_part := case when tg_op = 'INSERT' then to_jsonb(new.group_id) end;
  else
    old_part := case when tg_op = 'DELETE' then to_jsonb(old.person_id) end;
    new_part := case when tg_op = 'INSERT' then to_jsonb(new.person_id) end;
  end if;

  insert into public.event_history (event_id, calendar_id, action, changed_by, before, after)
  values (part_event_id, part_calendar_id, 'update', public.my_person_id(),
          case when old_part is not null then jsonb_build_object(key, old_part) end,
          case when new_part is not null then jsonb_build_object(key, new_part) end);
  return null;
end;
$$;

create trigger event_exceptions_log_change
  after insert or update or delete on public.event_exceptions
  for each row execute function public.log_event_part_change();
create trigger event_shares_log_change
  after insert or delete on public.event_shares
  for each row execute function public.log_event_part_change();
create trigger event_participants_log_change
  after insert or delete on public.event_participants
  for each row execute function public.log_event_part_change();

-- ── Row level security ───────────────────────────────────────────────────────

alter table public.calendars enable row level security;
alter table public.calendar_shares enable row level security;
alter table public.events enable row level security;
alter table public.event_shares enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_exceptions enable row level security;
alter table public.event_history enable row level security;

-- Editors also see what is in the trash.
create policy "see calendars shared with me" on public.calendars
  for select to authenticated
  using (public.can_edit_calendar(id) or (deleted_at is null and public.can_view_calendar(id)));
create policy "create calendars for myself and the profiles I manage" on public.calendars
  for insert to authenticated with check (public.can_manage_person(owner_id));
-- Only name, color and position are updatable (column grants below).
create policy "editors edit calendars" on public.calendars
  for update to authenticated
  using (deleted_at is null and public.can_edit_calendar(id)) with check (public.can_edit_calendar(id));

-- Group members see what is shared with their group (even 'busy', so the week view knows
-- whose slots it is showing).
create policy "see shares of my calendars and groups" on public.calendar_shares
  for select to authenticated
  using (public.can_edit_calendar(calendar_id) or public.is_group_member(group_id));
create policy "editors share calendars with their groups" on public.calendar_shares
  for insert to authenticated with check (public.can_share_calendar(calendar_id, group_id));
create policy "editors change the share level" on public.calendar_shares
  for update to authenticated
  using (public.can_share_calendar(calendar_id, group_id)) with check (public.can_share_calendar(calendar_id, group_id));
create policy "editors stop sharing" on public.calendar_shares
  for delete to authenticated using (public.can_edit_calendar(calendar_id));

create policy "see events shared with me" on public.events
  for select to authenticated
  using (public.can_edit_calendar(calendar_id) or (deleted_at is null and public.can_view_event(id)));
create policy "editors add events" on public.events
  for insert to authenticated
  with check (public.can_edit_calendar(calendar_id) and public.is_live_calendar(calendar_id));
-- Moving an event to another folder needs edit rights on both.
create policy "editors edit events" on public.events
  for update to authenticated
  using (deleted_at is null and public.can_edit_calendar(calendar_id))
  with check (public.can_edit_calendar(calendar_id) and public.is_live_calendar(calendar_id));

create policy "see the extra groups of events I see" on public.event_shares
  for select to authenticated using (public.can_view_event(event_id));
create policy "editors add groups to events" on public.event_shares
  for insert to authenticated with check (public.can_share_event(event_id, group_id));
create policy "editors remove groups from events" on public.event_shares
  for delete to authenticated using (public.can_edit_event(event_id) and public.is_live_event(event_id));

create policy "see participants of events I see" on public.event_participants
  for select to authenticated using (public.can_view_event(event_id));
create policy "editors add participants" on public.event_participants
  for insert to authenticated
  with check (public.can_edit_event(event_id) and public.is_live_event(event_id) and public.can_see_person(person_id));
-- A participant can also take themselves off.
create policy "editors and the participant remove participants" on public.event_participants
  for delete to authenticated
  using (public.is_live_event(event_id) and (public.can_edit_event(event_id) or person_id = public.my_person_id()));

create policy "see exceptions of events I see" on public.event_exceptions
  for select to authenticated using (public.can_view_event(event_id));
create policy "editors add exceptions" on public.event_exceptions
  for insert to authenticated with check (public.can_edit_event(event_id) and public.is_live_event(event_id));
create policy "editors edit exceptions" on public.event_exceptions
  for update to authenticated
  using (public.can_edit_event(event_id) and public.is_live_event(event_id))
  with check (public.can_edit_event(event_id) and public.is_live_event(event_id));
create policy "editors remove exceptions" on public.event_exceptions
  for delete to authenticated using (public.can_edit_event(event_id) and public.is_live_event(event_id));

-- The history of an event goes with the event (the subquery applies its policy); once purged,
-- only the folder's editors read the last line.
create policy "see the history of events I see" on public.event_history
  for select to authenticated
  using (
    public.can_edit_calendar(calendar_id)
    or exists (select 1 from public.events e where e.id = event_history.event_id)
  );

-- ── Busy slots ───────────────────────────────────────────────────────────────

-- Events of folders shared with a group as 'busy', with times only: no title, notes, location
-- or folder. Events the caller can see in full (another share, participant) are left out: they
-- come from the events table. The app expands repetitions as it does for full events.
create function public.busy_events(gid uuid)
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
    join public.events e on e.calendar_id = c.id and e.deleted_at is null
   where s.group_id = gid and s.level = 'busy'
     and public.is_group_member(gid)
     and not public.can_view_event(e.id)
$$;

-- ── Trash ────────────────────────────────────────────────────────────────────

-- Returns the deletion batch.
create function public.delete_event(event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  batch uuid;
begin
  update public.events e
     set deleted_at = now(), deleted_by = me, deletion_batch = gen_random_uuid()
   where e.id = delete_event.event_id and e.deleted_at is null and public.can_edit_calendar(e.calendar_id)
  returning e.deletion_batch into batch;
  if batch is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  return batch;
end;
$$;

-- An event deleted with its folder comes back by restoring the folder.
create function public.restore_event(event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.events;
begin
  perform public.require_person();
  select * into target from public.events e
   where e.id = restore_event.event_id and e.deleted_at is not null and public.can_edit_calendar(e.calendar_id);
  if target.id is null then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if not public.is_live_calendar(target.calendar_id) then
    raise exception 'calendar is deleted';
  end if;
  update public.events e set deleted_at = null, deleted_by = null, deletion_batch = null where e.id = target.id;
end;
$$;

-- The folder and its events go to the trash together, as one batch.
create function public.delete_calendar(calendar_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  batch uuid := gen_random_uuid();
begin
  update public.calendars c
     set deleted_at = now(), deleted_by = me, deletion_batch = batch
   where c.id = delete_calendar.calendar_id and c.deleted_at is null and public.can_edit_calendar(c.id);
  if not found then
    raise exception 'calendar not found' using errcode = 'P0002';
  end if;
  update public.events e
     set deleted_at = now(), deleted_by = me, deletion_batch = batch
   where e.calendar_id = delete_calendar.calendar_id and e.deleted_at is null;
  update public.people set last_calendar_id = null where last_calendar_id = delete_calendar.calendar_id;
  return batch;
end;
$$;

-- Brings back the folder with exactly the events deleted along with it; its shares never left.
create function public.restore_calendar(calendar_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.calendars;
begin
  perform public.require_person();
  select * into target from public.calendars c
   where c.id = restore_calendar.calendar_id and c.deleted_at is not null and public.can_edit_calendar(c.id);
  if target.id is null then
    raise exception 'calendar not found' using errcode = 'P0002';
  end if;
  update public.events e set deleted_at = null, deleted_by = null, deletion_batch = null
   where e.calendar_id = target.id and e.deletion_batch = target.deletion_batch;
  update public.calendars c set deleted_at = null, deleted_by = null, deletion_batch = null where c.id = target.id;
end;
$$;

-- "Eliminar definitivamente" from the trash.
create function public.purge_event(event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_person();
  delete from public.events e
   where e.id = purge_event.event_id and e.deleted_at is not null and public.can_edit_calendar(e.calendar_id);
  if not found then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
end;
$$;

create function public.purge_calendar(calendar_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_person();
  delete from public.calendars c
   where c.id = purge_calendar.calendar_id and c.deleted_at is not null and public.can_edit_calendar(c.id);
  if not found then
    raise exception 'calendar not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Everything deleted more than max_age ago, gone for good. Returns how many rows were removed.
create function public.empty_trash(max_age interval default interval '30 days')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged_calendars integer;
  purged_events integer;
begin
  delete from public.calendars where deleted_at < now() - max_age;
  get diagnostics purged_calendars = row_count;
  delete from public.events where deleted_at < now() - max_age;
  get diagnostics purged_events = row_count;
  return purged_calendars + purged_events;
end;
$$;

-- ── Leaving a group, claiming a profile ──────────────────────────────────────

-- As before, plus the calendar: the member's folders and events stop showing in the group,
-- and they stop taking part in other people's events shared with it.
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

-- As before, but an account that already has folders isn't fresh either: discarding its person
-- would delete them.
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
     or exists (select 1 from public.calendars where owner_id = me) then
    raise exception 'account already in use';
  end if;

  update public.people set user_id = null where id = me;
  delete from public.people where id = me;
  update public.people set user_id = auth.uid(), claim_code = null where id = target;
  return target;
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────────
-- Same rule as the first migration: start from zero on every new table and function.

revoke all on public.calendars, public.calendar_shares, public.events, public.event_shares,
  public.event_participants, public.event_exceptions, public.event_history
  from anon, authenticated;

grant select on public.calendars to authenticated;
grant insert (id, owner_id, name, color, position) on public.calendars to authenticated;
grant update (name, color, position) on public.calendars to authenticated;
grant select, delete on public.calendar_shares to authenticated;
grant insert (calendar_id, group_id, level) on public.calendar_shares to authenticated;
grant update (level) on public.calendar_shares to authenticated;
grant select on public.events to authenticated;
grant insert (id, calendar_id, title, notes, location, all_day, start_date, start_time, end_time,
              timezone, repeat, repeat_weekdays, repeat_until) on public.events to authenticated;
grant update (calendar_id, title, notes, location, all_day, start_date, start_time, end_time,
              timezone, repeat, repeat_weekdays, repeat_until) on public.events to authenticated;
grant select, delete on public.event_shares to authenticated;
grant insert (event_id, group_id) on public.event_shares to authenticated;
grant select, insert, delete on public.event_participants to authenticated;
grant select, delete on public.event_exceptions to authenticated;
grant insert (event_id, occurrence_date, status, overrides) on public.event_exceptions to authenticated;
grant update (status, overrides) on public.event_exceptions to authenticated;
grant select on public.event_history to authenticated;

revoke execute on function
  public.can_edit_calendar(uuid),
  public.can_view_calendar(uuid),
  public.can_view_event(uuid),
  public.can_edit_event(uuid),
  public.can_share_calendar(uuid, uuid),
  public.can_share_event(uuid, uuid),
  public.is_live_calendar(uuid),
  public.is_live_event(uuid),
  public.stamp_create(),
  public.stamp_edit(),
  public.stamp_share(),
  public.remember_last_calendar(),
  public.event_snapshot(public.events),
  public.log_event_change(),
  public.log_event_part_change(),
  public.busy_events(uuid),
  public.delete_event(uuid),
  public.restore_event(uuid),
  public.delete_calendar(uuid),
  public.restore_calendar(uuid),
  public.purge_event(uuid),
  public.purge_calendar(uuid),
  public.empty_trash(interval)
from public, anon, authenticated;

-- The default color of a new folder is computed as the caller.
grant execute on function public.random_person_color() to authenticated;

grant execute on function
  public.can_edit_calendar(uuid),
  public.can_view_calendar(uuid),
  public.can_view_event(uuid),
  public.can_edit_event(uuid),
  public.can_share_calendar(uuid, uuid),
  public.can_share_event(uuid, uuid),
  public.is_live_calendar(uuid),
  public.is_live_event(uuid),
  public.busy_events(uuid),
  public.delete_event(uuid),
  public.restore_event(uuid),
  public.delete_calendar(uuid),
  public.restore_calendar(uuid),
  public.purge_event(uuid),
  public.purge_calendar(uuid)
to authenticated;

-- ── Schedule ─────────────────────────────────────────────────────────────────
-- pg_cron empties the trash every night at 04:00 UTC.

select cron.schedule('empty-trash', '0 4 * * *', 'select public.empty_trash()');
