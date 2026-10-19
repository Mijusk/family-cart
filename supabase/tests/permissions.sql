-- Permission checks for the schema (RLS, RPCs, grants) against the demo data in seed.sql.
--
--   npm run db:reset   # fresh database with the demo data
--   npm run db:test    # runs this file inside the local Supabase container
--
-- Everything runs in one transaction that is rolled back at the end, so the database is left
-- as it was. Each check prints "ok" or "FAIL"; the last line sums them up.

\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

begin;
create schema tests;
grant usage on schema tests to authenticated, anon;

create or replace function tests.as_user(email text) returns void language plpgsql security definer as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce((select id::text from auth.users u where u.email = as_user.email), ''), false);
end $$;
grant execute on function tests.as_user(text) to authenticated;

create table tests.results (n serial, name text, ok boolean);
grant insert, select on tests.results to authenticated;
grant usage on sequence tests.results_n_seq to authenticated;

create or replace function tests.check(name text, ok boolean) returns void language sql as $$
  insert into tests.results (name, ok) values (name, coalesce(ok, false))
$$;
grant execute on function tests.check(text, boolean) to authenticated;

-- Expect an error: runs sql, passes if it raises one whose message matches.
create or replace function tests.expect_error(name text, sql text, pattern text default '') returns void
language plpgsql as $$
begin
  execute sql;
  perform tests.check(name || ' (no error raised)', false);
exception when others then
  perform tests.check(name || ' [' || sqlerrm || ']', sqlerrm ~* pattern);
end $$;
grant execute on function tests.expect_error(text, text, text) to authenticated;

set role authenticated;

-- ── Calendar (runs first, on the untouched demo data) ──
-- Seed: Marta's Trabajo (e1) and Pablo's Colegio (e4) shared in full with Casa Martín, Daniel's
-- Gimnasio (e3) shared as busy, Marta's Médico (e2) private except Análisis (f4, extra group).
reset role;
insert into groups (id, name) values ('00000000-0000-4000-8000-000000000002', 'Otro grupo');
set role authenticated;

select tests.as_user('lucia@ejemplo.com');
select tests.check('calendar: pending sees no calendars', (select count(*) from calendars) = 0);
select tests.check('calendar: pending sees no events', (select count(*) from events) = 0);
select tests.check('calendar: pending gets no busy slots', (select count(*) from busy_events('00000000-0000-4000-8000-000000000001')) = 0);

select tests.as_user('daniel@ejemplo.com');
select tests.check('calendar: daniel sees full shares, the extra group and his own (8 events)', (select count(*) from events) = 8);
select tests.check('calendar: daniel does not see Marta''s private dentist', not exists (select 1 from events where id = '00000000-0000-4000-8000-0000000000f3'));
select tests.check('calendar: daniel sees 3 calendars, not Médico', (select count(*) from calendars) = 3);
select tests.check('calendar: daniel sees the exception of Clase', (select count(*) from event_exceptions) = 1);
select tests.check('calendar: daniel reads the history of Oficina', exists (select 1 from event_history where event_id = '00000000-0000-4000-8000-0000000000f1' and action = 'create'));
select tests.check('calendar: no history of the dentist for daniel', not exists (select 1 from event_history where event_id = '00000000-0000-4000-8000-0000000000f3'));
select tests.expect_error('calendar: the busy broadcast is only for triggers', $$select notify_busy_groups('00000000-0000-4000-8000-0000000000e3')$$, 'permission denied');
update events set title = 'Hackeado' where id = '00000000-0000-4000-8000-0000000000f1';
select tests.check('calendar: daniel cannot edit Marta''s Oficina', (select title from events where id = '00000000-0000-4000-8000-0000000000f1') = 'Oficina');
select tests.expect_error('calendar: daniel cannot add events to Trabajo',
  $$insert into events (calendar_id, title, start_date, start_time, end_time) values ('00000000-0000-4000-8000-0000000000e1', 'x', current_date, '10:00', '11:00')$$, 'row-level security');
select tests.expect_error('calendar: daniel cannot add exceptions to Oficina',
  $$insert into event_exceptions (event_id, occurrence_date, status) values ('00000000-0000-4000-8000-0000000000f1', current_date, 'cancelled')$$, 'row-level security');
select tests.expect_error('calendar: daniel cannot share Marta''s calendar',
  $$insert into calendar_shares (calendar_id, group_id) values ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001')$$, 'row-level security');
select tests.expect_error('calendar: daniel cannot create a calendar for Marta',
  $$insert into calendars (owner_id, name) values ((select id from people where user_id = '00000000-0000-4000-8000-0000000000c1'), 'x')$$, 'row-level security');

with c as (insert into calendars (id, owner_id, name) values ('00000000-0000-4000-8000-0000000000e5', my_person_id(), 'Hospital') returning id)
select tests.check('calendar: a new folder comes back from the insert (the app reads it at once)', (select count(*) from c) = 1);
insert into events (id, calendar_id, title, start_date, start_time, end_time) values ('00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-0000000000e5', 'Turno', current_date, '22:00', '06:00');
select tests.check('calendar: night shift crosses midnight', (select end_time < start_time from events where id = '00000000-0000-4000-8000-0000000000fa'));
select tests.check('calendar: created_by is daniel', (select created_by = my_person_id() from events where id = '00000000-0000-4000-8000-0000000000fa'));
select tests.check('calendar: last calendar remembered', (select last_calendar_id from people where id = my_person_id()) = '00000000-0000-4000-8000-0000000000e5');
select tests.expect_error('calendar: cannot set created_by',
  $$insert into events (calendar_id, title, start_date, all_day, created_by) values ('00000000-0000-4000-8000-0000000000e5', 'x', current_date, true, '00000000-0000-4000-8000-0000000000d2')$$, 'permission denied');
update events set title = 'Turno de noche', location = 'Hospital' where id = '00000000-0000-4000-8000-0000000000fa';
select tests.check('calendar: history keeps only the changed fields',
  (select before = '{"title": "Turno", "location": null}' and after = '{"title": "Turno de noche", "location": "Hospital"}'
     from event_history where event_id = '00000000-0000-4000-8000-0000000000fa' and action = 'update'));
select tests.check('calendar: updated_by is daniel', (select updated_by = my_person_id() from events where id = '00000000-0000-4000-8000-0000000000fa'));
select tests.expect_error('calendar: all-day without times',
  $$insert into events (calendar_id, title, start_date, all_day, start_time, end_time) values ('00000000-0000-4000-8000-0000000000e5', 'x', current_date, true, '10:00', '11:00')$$, 'events_times');
select tests.expect_error('calendar: start and end cannot match',
  $$insert into events (calendar_id, title, start_date, start_time, end_time) values ('00000000-0000-4000-8000-0000000000e5', 'x', current_date, '10:00', '10:00')$$, 'events_times');
select tests.expect_error('calendar: weekly needs weekdays',
  $$insert into events (calendar_id, title, start_date, all_day, repeat) values ('00000000-0000-4000-8000-0000000000e5', 'x', current_date, true, 'weekly')$$, 'events_weekdays');
select tests.expect_error('calendar: repeat end before start',
  $$insert into events (calendar_id, title, start_date, all_day, repeat, repeat_until) values ('00000000-0000-4000-8000-0000000000e5', 'x', current_date, true, 'daily', current_date - 1)$$, 'events_until');
select tests.expect_error('calendar: exceptions only override event fields',
  $$insert into event_exceptions (event_id, occurrence_date, status, overrides) values ('00000000-0000-4000-8000-0000000000fa', current_date, 'modified', '{"calendar_id": "x"}')$$, 'event_exceptions_overrides');
select tests.expect_error('calendar: cannot share with a group I am not in',
  $$insert into calendar_shares (calendar_id, group_id) values ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-000000000002')$$, 'row-level security');

select tests.check('calendar: delete_event returns its batch', delete_event('00000000-0000-4000-8000-0000000000fa') is not null);
select tests.check('calendar: deleted event is in daniel''s trash', (select deleted_at is not null and deleted_by = my_person_id() from events where id = '00000000-0000-4000-8000-0000000000fa'));
update events set title = 'x' where id = '00000000-0000-4000-8000-0000000000fa';
select tests.check('calendar: a deleted event cannot be edited', (select title from events where id = '00000000-0000-4000-8000-0000000000fa') = 'Turno de noche');
select tests.expect_error('calendar: deleted_at only through the trash RPCs', $$update events set deleted_at = null where id = '00000000-0000-4000-8000-0000000000fa'$$, 'permission denied');
select restore_event('00000000-0000-4000-8000-0000000000fa');
select tests.check('calendar: restore_event brings it back', (select deleted_at is null from events where id = '00000000-0000-4000-8000-0000000000fa'));
select tests.check('calendar: history create, update, delete, restore',
  (select string_agg(action, ',' order by id) from event_history where event_id = '00000000-0000-4000-8000-0000000000fa') = 'create,update,delete,restore');
select tests.check('calendar: trashing is not an edit', (select updated_by = my_person_id() from events where id = '00000000-0000-4000-8000-0000000000fa'));
insert into calendar_shares (calendar_id, group_id, level) values ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-000000000001', 'busy');
select tests.check('calendar: daniel shares Hospital as busy', (select shared_by = my_person_id() from calendar_shares where calendar_id = '00000000-0000-4000-8000-0000000000e5'));
insert into calendars (id, owner_id, name) values ('00000000-0000-4000-8000-0000000000e7', my_person_id(), 'Diario');
select tests.check('calendar: daniel creates a private folder', exists (select 1 from calendars where id = '00000000-0000-4000-8000-0000000000e7'));

-- Busy mode hides the details from the rest of the group, not from its admins: check it as Marta
-- while she is a plain member.
reset role;
update members set role = 'member' where person_id = (select id from people where user_id = '00000000-0000-4000-8000-0000000000c1');
set role authenticated;
select tests.as_user('marta@ejemplo.com');
select tests.check('calendar: a member sees her own, Colegio, not the busy ones (7 events)', (select count(*) from events) = 7);
select tests.check('calendar: busy slots of Daniel''s folders', (select count(*) from busy_events('00000000-0000-4000-8000-000000000001')) = 3);
select tests.check('calendar: busy slots carry the times', exists (select 1 from busy_events('00000000-0000-4000-8000-000000000001') where start_time = '19:00' and repeat_weekdays = '{2,4}'));
select tests.check('calendar: a member cannot read the busy events', (select count(*) from events where calendar_id = '00000000-0000-4000-8000-0000000000e3') = 0);
select tests.check('calendar: busy folder name stays hidden', not exists (select 1 from calendars where id = '00000000-0000-4000-8000-0000000000e3'));
select tests.check('calendar: but its share is visible', exists (select 1 from calendar_shares where calendar_id = '00000000-0000-4000-8000-0000000000e3' and level = 'busy'));
select tests.check('calendar: a member cannot edit a busy share', not can_edit_calendar('00000000-0000-4000-8000-0000000000e3'));
reset role;
update members set role = 'admin' where person_id = (select id from people where user_id = '00000000-0000-4000-8000-0000000000c1');
set role authenticated;

select tests.check('calendar: admin sees the busy ones in full too (10 events)', (select count(*) from events) = 10);
select tests.check('calendar: so the admin gets no busy slots', (select count(*) from busy_events('00000000-0000-4000-8000-000000000001')) = 0);
select tests.check('calendar: admin sees the busy folder', exists (select 1 from calendars where id = '00000000-0000-4000-8000-0000000000e3'));
select tests.check('calendar: admin edits a busy share', can_edit_calendar('00000000-0000-4000-8000-0000000000e3'));
update events set location = 'Polideportivo' where id = '00000000-0000-4000-8000-0000000000fa';
select tests.check('calendar: admin edits an event of another account', (select location from events where id = '00000000-0000-4000-8000-0000000000fa') = 'Polideportivo');
insert into events (id, calendar_id, title, start_date, all_day) values ('00000000-0000-4000-8000-0000000000fc', '00000000-0000-4000-8000-0000000000e3', 'Partido', current_date, true);
select tests.check('calendar: admin adds an event to a busy share', (select created_by = my_person_id() from events where id = '00000000-0000-4000-8000-0000000000fc'));
select tests.check('calendar: admin cannot edit Daniel''s private folder', not can_edit_calendar('00000000-0000-4000-8000-0000000000e7'));
select tests.check('calendar: nor see it', not exists (select 1 from calendars where id = '00000000-0000-4000-8000-0000000000e7'));
select tests.expect_error('calendar: nor add events to it',
  $$insert into events (calendar_id, title, start_date, all_day) values ('00000000-0000-4000-8000-0000000000e7', 'x', current_date, true)$$, 'row-level security');
select create_calendar_for((select id from people where user_id = '00000000-0000-4000-8000-0000000000c2'), 'Clases', '#3b6fb6', '00000000-0000-4000-8000-000000000001');
select tests.check('calendar: create_calendar_for gives Daniel a folder shared in full',
  (select s.level = 'full' and s.shared_by = my_person_id() and c.created_by = my_person_id() and c.owner_id = (select id from people where user_id = '00000000-0000-4000-8000-0000000000c2')
     from calendars c join calendar_shares s on s.calendar_id = c.id
    where c.name = 'Clases'));
select tests.expect_error('calendar: create_calendar_for only for active members',
  $$select create_calendar_for((select id from people where user_id = '00000000-0000-4000-8000-0000000000c3'), 'x', '#3b6fb6', '00000000-0000-4000-8000-000000000001')$$, 'not a member');
select tests.expect_error('calendar: create_calendar_for only in groups I administer',
  $$select create_calendar_for((select id from people where user_id = '00000000-0000-4000-8000-0000000000c2'), 'x', '#3b6fb6', '00000000-0000-4000-8000-000000000002')$$, 'not an admin');
select tests.check('calendar: marta edits Pablo''s Colegio (manages his profile)', can_edit_calendar('00000000-0000-4000-8000-0000000000e4'));
insert into calendars (id, owner_id, name) values ('00000000-0000-4000-8000-0000000000e6', '00000000-0000-4000-8000-0000000000d2', 'Pediatra');
insert into events (id, calendar_id, title, start_date, all_day) values ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-0000000000e6', 'Vacuna', current_date, true);
select tests.check('calendar: marta creates a private folder for Pablo', exists (select 1 from events where id = '00000000-0000-4000-8000-0000000000fb'));
insert into event_exceptions (event_id, occurrence_date, status, overrides)
values ('00000000-0000-4000-8000-0000000000f1', date_trunc('week', current_date)::date + 7, 'modified', '{"title": "Oficina (teletrabajo)", "start_time": "09:00"}');
select tests.check('calendar: marta changes one Monday of Oficina', exists (select 1 from event_history where event_id = '00000000-0000-4000-8000-0000000000f1' and after ? 'exception'));
insert into event_participants (event_id, person_id) values ('00000000-0000-4000-8000-0000000000f3', (select id from people where user_id = '00000000-0000-4000-8000-0000000000c2'));
select tests.check('calendar: marta adds daniel to the dentist', exists (select 1 from event_participants where event_id = '00000000-0000-4000-8000-0000000000f3'));

select tests.check('calendar: delete_calendar', delete_calendar('00000000-0000-4000-8000-0000000000e2') is not null);
select tests.check('calendar: the folder and its events go in one batch',
  (select count(*) = 3 and count(distinct deletion_batch) = 1
     from (select deletion_batch from calendars where id = '00000000-0000-4000-8000-0000000000e2' union all select deletion_batch from events where calendar_id = '00000000-0000-4000-8000-0000000000e2') x));
select tests.check('calendar: deleted folder still in marta''s trash', exists (select 1 from calendars where id = '00000000-0000-4000-8000-0000000000e2' and deleted_at is not null));
select tests.expect_error('calendar: an event of a deleted folder comes back with the folder', $$select restore_event('00000000-0000-4000-8000-0000000000f3')$$, 'calendar is deleted');
select tests.expect_error('calendar: no new events in a deleted folder',
  $$insert into events (calendar_id, title, start_date, all_day) values ('00000000-0000-4000-8000-0000000000e2', 'x', current_date, true)$$, 'row-level security');
select restore_calendar('00000000-0000-4000-8000-0000000000e2');
select tests.check('calendar: restore_calendar brings its events back', (select count(*) from events where calendar_id = '00000000-0000-4000-8000-0000000000e2' and deleted_at is null) = 2);
select tests.check('calendar: and its extra groups', exists (select 1 from event_shares where event_id = '00000000-0000-4000-8000-0000000000f4'));

select tests.check('calendar: marta deletes Análisis', delete_event('00000000-0000-4000-8000-0000000000f4') is not null);
select purge_event('00000000-0000-4000-8000-0000000000f4');
select tests.check('calendar: purge leaves one history line',
  (select count(*) = 1 and min(action) = 'purge' and min(before ->> 'title') = 'Análisis de sangre' from event_history where event_id = '00000000-0000-4000-8000-0000000000f4'));
select tests.expect_error('calendar: purge only from the trash', $$select purge_event('00000000-0000-4000-8000-0000000000f1')$$, 'event not found');

select tests.as_user('daniel@ejemplo.com');
select tests.check('calendar: daniel sees the dentist as participant', exists (select 1 from events where id = '00000000-0000-4000-8000-0000000000f3'));
select tests.check('calendar: daniel sees the changed Monday', exists (select 1 from event_exceptions where event_id = '00000000-0000-4000-8000-0000000000f1'));
select tests.check('calendar: event_owners hides events daniel cannot see',
  not exists (select 1 from event_owners(array['00000000-0000-4000-8000-0000000000fb']::uuid[])));
select tests.check('calendar: daniel does not see Pablo''s private folder', not exists (select 1 from events where id = '00000000-0000-4000-8000-0000000000fb'));
select tests.check('calendar: daniel cannot read the purged event''s line', not exists (select 1 from event_history where event_id = '00000000-0000-4000-8000-0000000000f4'));
select tests.expect_error('calendar: daniel cannot purge Marta''s events', $$select delete_event('00000000-0000-4000-8000-0000000000f1')$$, 'event not found');
delete from event_participants where event_id = '00000000-0000-4000-8000-0000000000f3' and person_id = my_person_id();
select tests.check('calendar: daniel sees the folder Marta made him', exists (select 1 from calendars where name = 'Clases' and owner_id = my_person_id()));
select tests.expect_error('calendar: a member cannot create folders for others',
  $$select create_calendar_for((select id from people where user_id = '00000000-0000-4000-8000-0000000000c1'), 'x', '#3b6fb6', '00000000-0000-4000-8000-000000000001')$$, 'not an admin');
select tests.check('calendar: daniel takes himself off the dentist', not exists (select 1 from events where id = '00000000-0000-4000-8000-0000000000f3'));
insert into event_participants (event_id, person_id) values ('00000000-0000-4000-8000-0000000000fa', (select id from people where user_id = '00000000-0000-4000-8000-0000000000c1'));
update calendar_shares set level = 'full' where calendar_id = '00000000-0000-4000-8000-0000000000e3';

select tests.as_user('marta@ejemplo.com');
select tests.check('calendar: event_owners gives the owner of an event seen as participant',
  (select owner_id from event_owners(array['00000000-0000-4000-8000-0000000000fa']::uuid[])) = (select id from people where user_id = '00000000-0000-4000-8000-0000000000c2'));
select tests.check('calendar: editable calendars of marta', (select count(*) from editable_calendar_ids()) = 7);
select tests.check('calendar: admin edits once shared in full', can_edit_calendar('00000000-0000-4000-8000-0000000000e3'));
update events set title = 'Crossfit (cambiado)' where id = '00000000-0000-4000-8000-0000000000f5';
select tests.check('calendar: marta renames Crossfit', (select title from events where id = '00000000-0000-4000-8000-0000000000f5') = 'Crossfit (cambiado)');
select tests.check('calendar: marta sees Turno as participant', exists (select 1 from events where id = '00000000-0000-4000-8000-0000000000fa'));
select tests.expect_error('calendar: empty_trash is internal', $$select empty_trash()$$, 'permission denied');

reset role;
update events set deleted_at = now() - interval '31 days', deleted_by = null, deletion_batch = gen_random_uuid() where id = '00000000-0000-4000-8000-0000000000f9';
update events set deleted_at = now() - interval '2 days', deleted_by = null, deletion_batch = gen_random_uuid() where id = '00000000-0000-4000-8000-0000000000f2';
select tests.check('calendar: empty_trash removes what is older than 30 days', empty_trash() = 1);
select tests.check('calendar: newer trash stays', exists (select 1 from events where id = '00000000-0000-4000-8000-0000000000f2'));
update events set deleted_at = null, deleted_by = null, deletion_batch = null where id = '00000000-0000-4000-8000-0000000000f2';
set role authenticated;

-- ── Tasks (on the demo data) ──
-- Seed: Marta's Pendientes (11) shared with Casa Martín, tasks 21–25 (21 assigned to Daniel, 23 to
-- Pablo, 25 done); Daniel's private Amigos con quien quedar (12), tasks 26–27. Someone in another
-- group (otro@ejemplo.com) checks that nothing leaks across groups.
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000c7', 'otro@ejemplo.com', '{"display_name":"Otro"}');
insert into members (group_id, person_id, role, status, approved_at)
select '00000000-0000-4000-8000-000000000002', id, 'admin', 'active', now() from people where user_id = '00000000-0000-4000-8000-0000000000c7';
set role authenticated;

select tests.as_user('lucia@ejemplo.com');
select tests.check('tasks: pending sees no lists', (select count(*) from task_lists) = 0);
select tests.check('tasks: pending sees no tasks', (select count(*) from tasks) = 0);
select tests.expect_error('tasks: pending cannot add tasks',
  $$insert into tasks (list_id, title) values ('00000000-0000-4000-8000-000000000011', 'x')$$, 'row-level security');

select tests.as_user('otro@ejemplo.com');
select tests.check('tasks: another group sees no lists', (select count(*) from task_lists) = 0);
select tests.check('tasks: another group sees no tasks', (select count(*) from tasks) = 0);
select tests.expect_error('tasks: another group cannot tick', $$select set_task_done('00000000-0000-4000-8000-000000000021', true)$$, 'task not found');

select tests.as_user('marta@ejemplo.com');
select tests.check('tasks: marta sees Pendientes, not Daniel''s private list', (select count(*) from task_lists) = 1 and (select count(*) from tasks) = 5);
select tests.expect_error('tasks: cannot share with a group the owner is not in',
  $$insert into task_list_shares (list_id, group_id) values ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000002')$$, 'row-level security');
insert into task_lists (id, owner_id, name) values ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-0000000000d2', 'Deberes');
select tests.check('tasks: marta creates a private list for Pablo', exists (select 1 from task_lists where id = '00000000-0000-4000-8000-000000000013'));
insert into tasks (id, list_id, title, assignees) values ('00000000-0000-4000-8000-000000000028', '00000000-0000-4000-8000-000000000013', 'Lámina de plástica', array['00000000-0000-4000-8000-0000000000d2']::uuid[]);
select tests.check('tasks: a private list takes its owner', (select assignees from tasks where id = '00000000-0000-4000-8000-000000000028') = array['00000000-0000-4000-8000-0000000000d2']::uuid[]);
select tests.expect_error('tasks: a private list takes no one else',
  $$update tasks set assignees = array['00000000-0000-4000-8000-0000000000d2', my_person_id()] where id = '00000000-0000-4000-8000-000000000028'$$, 'row-level security');

select tests.as_user('daniel@ejemplo.com');
select tests.check('tasks: daniel sees Pendientes and his own list', (select count(*) from task_lists) = 2 and (select count(*) from tasks) = 7);
select tests.check('tasks: Pablo''s private list stays private', not exists (select 1 from task_lists where id = '00000000-0000-4000-8000-000000000013'));
with t as (insert into tasks (id, list_id, title) values ('00000000-0000-4000-8000-000000000029', '00000000-0000-4000-8000-000000000011', 'Podar el seto') returning created_by, position)
select tests.check('tasks: daniel adds to the shared list, at the end, as himself', (select created_by = my_person_id() and position = 6 from t));
update tasks set title = 'Comprar manguera de 25 m', assignees = array['00000000-0000-4000-8000-0000000000d2']::uuid[] where id = '00000000-0000-4000-8000-000000000021';
select tests.check('tasks: daniel edits and assigns Marta''s task', (select updated_by = my_person_id() and assignees = array['00000000-0000-4000-8000-0000000000d2']::uuid[] from tasks where id = '00000000-0000-4000-8000-000000000021'));
select tests.check('tasks: the seed has a task for two', (select cardinality(assignees) = 2 from tasks where id = '00000000-0000-4000-8000-000000000022'));
update tasks set assignees = array[my_person_id(), '00000000-0000-4000-8000-0000000000d2', my_person_id()] where id = '00000000-0000-4000-8000-000000000024';
select tests.check('tasks: several people at once, each once', (select assignees = array[my_person_id(), '00000000-0000-4000-8000-0000000000d2'] from tasks where id = '00000000-0000-4000-8000-000000000024'));
update tasks set position = 2.5 where id = '00000000-0000-4000-8000-000000000029';
select tests.check('tasks: one update moves a task', (select array_agg(id order by position) from tasks where list_id = '00000000-0000-4000-8000-000000000011' and done_at is null)
  = array['00000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000022', '00000000-0000-4000-8000-000000000029', '00000000-0000-4000-8000-000000000023', '00000000-0000-4000-8000-000000000024']::uuid[]);
select set_task_done('00000000-0000-4000-8000-000000000023', true);
select tests.check('tasks: daniel ticks a task', (select done_by = my_person_id() and done_at is not null from tasks where id = '00000000-0000-4000-8000-000000000023'));
select tests.check('tasks: ticking is not an edit', (select updated_by is null from tasks where id = '00000000-0000-4000-8000-000000000023'));
select set_task_done('00000000-0000-4000-8000-000000000025', false);
select tests.check('tasks: and unticks one', (select done_by is null and done_at is null from tasks where id = '00000000-0000-4000-8000-000000000025'));
select tests.expect_error('tasks: done_by only through set_task_done', $$update tasks set done_by = '00000000-0000-4000-8000-0000000000d2' where id = '00000000-0000-4000-8000-000000000022'$$, 'permission denied');
select tests.expect_error('tasks: cannot insert done_at',
  $$insert into tasks (list_id, title, done_at) values ('00000000-0000-4000-8000-000000000011', 'x', now())$$, 'permission denied');
select tests.expect_error('tasks: cannot set created_by',
  $$insert into tasks (list_id, title, created_by) values ('00000000-0000-4000-8000-000000000011', 'x', '00000000-0000-4000-8000-0000000000d2')$$, 'permission denied');
select tests.expect_error('tasks: cannot assign to someone who does not see the list',
  $$update tasks set assignees = array[my_person_id(), (select id from people where user_id = '00000000-0000-4000-8000-0000000000c1')] where id = '00000000-0000-4000-8000-000000000026'$$, 'row-level security');
select tests.expect_error('tasks: nor to a pending member',
  $$update tasks set assignees = array[(select id from people where user_id = '00000000-0000-4000-8000-0000000000c3')] where id = '00000000-0000-4000-8000-000000000022'$$, 'row-level security');
select tests.expect_error('tasks: no empty slots in assignees',
  $$update tasks set assignees = array[null]::uuid[] where id = '00000000-0000-4000-8000-000000000022'$$, 'row-level security|tasks_assignees_valid');
select tests.expect_error('tasks: title without spaces around', $$insert into tasks (list_id, title) values ('00000000-0000-4000-8000-000000000012', ' x ')$$, 'tasks_title_check');
select tests.expect_error('tasks: no real delete of tasks', $$delete from tasks where id = '00000000-0000-4000-8000-000000000022'$$, 'permission denied');
select tests.expect_error('tasks: no real delete of lists', $$delete from task_lists where id = '00000000-0000-4000-8000-000000000012'$$, 'permission denied');
update task_lists set name = 'Hackeada' where id = '00000000-0000-4000-8000-000000000011';
select tests.check('tasks: daniel cannot rename Marta''s list', (select name from task_lists where id = '00000000-0000-4000-8000-000000000011') = 'Pendientes');
delete from task_list_shares where list_id = '00000000-0000-4000-8000-000000000011';
select tests.check('tasks: daniel cannot unshare Marta''s list', exists (select 1 from task_list_shares where list_id = '00000000-0000-4000-8000-000000000011'));
select tests.expect_error('tasks: daniel cannot delete Marta''s list', $$select delete_task_list('00000000-0000-4000-8000-000000000011')$$, 'task list not found');
select tests.expect_error('tasks: cannot share with a group I am not in',
  $$insert into task_list_shares (list_id, group_id) values ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002')$$, 'row-level security');

select tests.check('tasks: delete_task returns its batch', delete_task('00000000-0000-4000-8000-000000000029') is not null);
update tasks set title = 'x' where id = '00000000-0000-4000-8000-000000000029';
select tests.check('tasks: a deleted task cannot be edited', (select title from tasks where id = '00000000-0000-4000-8000-000000000029') = 'Podar el seto');
select restore_task('00000000-0000-4000-8000-000000000029');
select tests.check('tasks: restore_task brings it back', (select deleted_at is null from tasks where id = '00000000-0000-4000-8000-000000000029'));
select tests.check('tasks: delete_task_list', delete_task_list('00000000-0000-4000-8000-000000000012') is not null);
select tests.check('tasks: the list and its tasks go in one batch',
  (select count(*) = 3 and count(distinct deletion_batch) = 1
     from (select deletion_batch from task_lists where id = '00000000-0000-4000-8000-000000000012' union all select deletion_batch from tasks where list_id = '00000000-0000-4000-8000-000000000012') x));
select tests.expect_error('tasks: a task deleted with its list comes back with the list', $$select restore_task('00000000-0000-4000-8000-000000000026')$$, 'task list is deleted');
select tests.expect_error('tasks: no new tasks in a deleted list', $$insert into tasks (list_id, title) values ('00000000-0000-4000-8000-000000000012', 'x')$$, 'row-level security');
select restore_task_list('00000000-0000-4000-8000-000000000012');
select tests.check('tasks: restore_task_list brings its tasks back', (select count(*) from tasks where list_id = '00000000-0000-4000-8000-000000000012' and deleted_at is null) = 2);
insert into task_list_shares (list_id, group_id) values ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001');
select tests.check('tasks: daniel shares his list', (select shared_by = my_person_id() from task_list_shares where list_id = '00000000-0000-4000-8000-000000000012'));
update tasks set assignees = array[(select id from people where user_id = '00000000-0000-4000-8000-0000000000c1'), my_person_id()] where id = '00000000-0000-4000-8000-000000000026';
select tests.check('tasks: once shared, marta can be assigned', (select cardinality(assignees) = 2 from tasks where id = '00000000-0000-4000-8000-000000000026'));
delete from task_list_shares where list_id = '00000000-0000-4000-8000-000000000012';
select tests.check('tasks: unsharing unassigns who no longer sees it, not the rest', (select assignees = array[my_person_id()] from tasks where id = '00000000-0000-4000-8000-000000000026'));

reset role;
update tasks set deleted_at = now() - interval '31 days', deleted_by = null, deletion_batch = gen_random_uuid() where id = '00000000-0000-4000-8000-000000000027';
select tests.check('tasks: empty_trash clears old tasks too', empty_trash() = 1);
select tests.check('tasks: the old task is gone', not exists (select 1 from tasks where id = '00000000-0000-4000-8000-000000000027'));
set role authenticated;

-- ── Notifications ──
select tests.as_user('daniel@ejemplo.com');
select save_push_subscription('https://push.example.test/daniel-phone', 'p256dh-key', 'auth-key');
select tests.check('push: daniel saves his device', (select count(*) from push_subscriptions) = 1);
select tests.expect_error('push: no direct insert',
  $$insert into push_subscriptions (person_id, endpoint, p256dh, auth) values (my_person_id(), 'https://x.test/y', 'a', 'b')$$, 'permission denied');
select tests.expect_error('push: the outbox is not readable', $$select * from notifications$$, 'permission denied');
select tests.expect_error('push: nobody writes to the outbox', $$select notify(my_person_id(), 'task_assigned', 'x', 'y', '/')$$, 'permission denied');
select tests.expect_error('push: reminders only from the database', $$select enqueue_event_reminders()$$, 'permission denied');
update tasks set assignees = assignees || (select id from people where user_id = '00000000-0000-4000-8000-0000000000c1') where id = '00000000-0000-4000-8000-000000000024';
select tests.as_user('marta@ejemplo.com');
select tests.check('push: marta does not see daniel''s device', (select count(*) from push_subscriptions) = 0);
select save_push_subscription('https://push.example.test/daniel-phone', 'p256dh-2', 'auth-2');
select tests.check('push: the same device signed in as marta becomes hers', (select count(*) from push_subscriptions) = 1);
delete from push_subscriptions;
select tests.check('push: marta turns it off', (select count(*) from push_subscriptions) = 0);
reset role;
select tests.check('push: a task assigned to marta tells her, once',
  (select count(*) from notifications where kind = 'task_assigned' and url = '/tareas/00000000-0000-4000-8000-000000000024') = 1
  and (select person_id from notifications where kind = 'task_assigned' and url = '/tareas/00000000-0000-4000-8000-000000000024')
      = (select id from people where user_id = '00000000-0000-4000-8000-0000000000c1')
  and (select title from notifications where url = '/tareas/00000000-0000-4000-8000-000000000024') = 'Daniel te ha asignado una tarea');
select tests.check('push: the request to join tells the admins',
  exists (select 1 from notifications where kind = 'join_request' and body = 'Lucía quiere unirse al grupo.'
            and person_id = (select id from people where user_id = '00000000-0000-4000-8000-0000000000c1')));

update events set reminder_minutes = 60 where id = '00000000-0000-4000-8000-0000000000f3';
select tests.check('reminders: nothing before its time', enqueue_event_reminders(((current_date + 3) + time '16:20') at time zone 'Europe/Madrid') = 0);
select tests.check('reminders: one hour before the dentist', enqueue_event_reminders(((current_date + 3) + time '16:30') at time zone 'Europe/Madrid') = 1);
select enqueue_event_reminders(((current_date + 3) + time '16:35') at time zone 'Europe/Madrid');
select tests.check('reminders: written once, for marta, with when and where',
  (select count(*) = 1 and bool_and(title = 'Dentista' and body = 'Hoy a las 17:30 · Clínica Sonrisas'
          and person_id = (select id from people where user_id = '00000000-0000-4000-8000-0000000000c1'))
     from notifications where kind = 'event_reminder' and title = 'Dentista'));
update events set reminder_minutes = 1440 where id = '00000000-0000-4000-8000-0000000000f2';
select enqueue_event_reminders(((current_date + 9) + time '09:00') at time zone 'Europe/Madrid');
select tests.check('reminders: an all-day event counts from 09:00',
  (select body from notifications where title = 'Viaje a Valencia') = 'Mañana, todo el día · Valencia');
update events set reminder_minutes = 0 where id = '00000000-0000-4000-8000-0000000000f8';
select tests.check('reminders: Pablo''s swimming goes to Daniel (with him) and Marta (admin)',
  (select array_agg(p.user_id order by p.user_id) from event_reminder_people('00000000-0000-4000-8000-0000000000f8') r join people p on p.id = r)
  = array['00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2']::uuid[]);
update events set reminder_minutes = 0 where id = '00000000-0000-4000-8000-0000000000f7';
select tests.check('reminders: a repeating event, on one of its days',
  enqueue_event_reminders(((date_trunc('week', current_date)::date + 7) + time '09:00') at time zone 'Europe/Madrid') = 1);
select tests.check('reminders: not on a cancelled day',
  enqueue_event_reminders(((date_trunc('week', current_date)::date + 11) + time '09:00') at time zone 'Europe/Madrid') = 0);
select tests.check('reminders: not on a day off the series',
  enqueue_event_reminders(((date_trunc('week', current_date)::date + 12) + time '09:00') at time zone 'Europe/Madrid') = 0);
insert into event_exceptions (event_id, occurrence_date, status, overrides)
values ('00000000-0000-4000-8000-0000000000f7', date_trunc('week', current_date)::date + 8, 'modified', '{"start_time": "10:30"}');
select tests.check('reminders: a day moved to another time follows it',
  enqueue_event_reminders(((date_trunc('week', current_date)::date + 8) + time '09:00') at time zone 'Europe/Madrid') = 0
  and enqueue_event_reminders(((date_trunc('week', current_date)::date + 8) + time '10:30') at time zone 'Europe/Madrid') = 1);

select dispatch_notifications();
select tests.check('dispatch: without its secrets it calls nothing', not exists (select 1 from net.http_request_queue where url = 'https://functions.example.test/send-notifications'));
select vault.create_secret('https://functions.example.test/send-notifications', 'notifications_function_url');
select vault.create_secret('test-secret', 'notifications_secret');
select dispatch_notifications();
select tests.check('dispatch: with something pending it wakes the function',
  exists (select 1 from net.http_request_queue where url = 'https://functions.example.test/send-notifications'));
select tests.check('send-notifications: service_role claims the queue',
  has_table_privilege('service_role', 'public.notifications', 'select, update'));
select tests.check('send-notifications: service_role reads and drops devices',
  has_table_privilege('service_role', 'public.push_subscriptions', 'select, delete'));
set role authenticated;

-- ── Pending request sees nothing of the group ──
select tests.as_user('lucia@ejemplo.com');
select tests.check('lucia pending: no items', (select count(*) from items) = 0);
select tests.check('lucia pending: only her own member row', (select count(*) from members) = 1);
select tests.check('lucia pending: sees group name', (select count(*) from groups) = 1);
select tests.check('lucia pending: sees only herself', (select count(*) from people) = 1);
select tests.expect_error('lucia pending: cannot add items',
  $$insert into items (group_id, name, added_by) values ('00000000-0000-4000-8000-000000000001', 'x', '00000000-0000-4000-8000-0000000000a5')$$, 'row-level security');

-- ── Members vs admins ──
select tests.as_user('daniel@ejemplo.com');
select tests.check('daniel: sees 22 items', (select count(*) from items) = 22);
select tests.check('daniel: sees 5 members incl. pending', (select count(*) from members) = 5);
select tests.check('daniel: sees 5 people', (select count(*) from people) = 5);
select tests.expect_error('daniel: cannot approve', $$select approve_member('00000000-0000-4000-8000-0000000000a5')$$, 'member not found');
select tests.expect_error('daniel: cannot make admins', $$select set_member_role('00000000-0000-4000-8000-0000000000a2', 'admin')$$, 'member not found');
update groups set name = 'Hackeado';
select tests.check('daniel: cannot rename group', (select name from groups) = 'Casa Martín');
select tests.expect_error('daniel: cannot touch invite_code', $$update groups set invite_code = 'AAAAAAAAAA'$$, 'permission denied');
select tests.expect_error('daniel: cannot regenerate code', $$select regenerate_invite_code('00000000-0000-4000-8000-000000000001')$$, 'not an admin');
update people set display_name = 'Daniel M.' where user_id = auth.uid();
select tests.check('daniel: renames himself', (select display_name from people where user_id = auth.uid()) = 'Daniel M.');
select tests.check('stamp: updated_by is daniel', (select updated_by = my_person_id() from people where user_id = auth.uid()));
update people set display_name = 'Pablito' where id = '00000000-0000-4000-8000-0000000000d2';
select tests.check('daniel: cannot rename Pablo (not admin)', (select display_name from people where id = '00000000-0000-4000-8000-0000000000d2') = 'Pablo');
select tests.expect_error('daniel: cannot set user_id', $$update people set user_id = null where user_id = auth.uid()$$, 'permission denied');
select tests.expect_error('daniel: cannot read claim code holder change', $$update people set claim_code = 'X' where id = '00000000-0000-4000-8000-0000000000d2'$$, 'permission denied');
select tests.expect_error('daniel: cannot insert members', $$insert into members (group_id, person_id) values ('00000000-0000-4000-8000-000000000001', my_person_id())$$, 'permission denied');
select tests.expect_error('daniel: cannot create profiles', $$select create_profile('00000000-0000-4000-8000-000000000001', 'Intruso')$$, 'not an admin');

select tests.as_user('marta@ejemplo.com');
update people set display_name = 'Pablito' where id = '00000000-0000-4000-8000-0000000000d2';
select tests.check('marta (admin): renames Pablo profile', (select display_name from people where id = '00000000-0000-4000-8000-0000000000d2') = 'Pablito');
update people set display_name = 'Dani' where user_id = '00000000-0000-4000-8000-0000000000c2';
select tests.check('marta: cannot rename Daniel (has account)', (select display_name from people where user_id = '00000000-0000-4000-8000-0000000000c2') = 'Daniel M.');
update groups set name = 'Casa Martín García', shopping_enabled = false;
select tests.check('marta: renames group and toggles shopping', (select name = 'Casa Martín García' and not shopping_enabled from groups));
update groups set tasks_enabled = false;
select tests.check('marta: toggles tasks', (select not tasks_enabled from groups));
select tests.expect_error('marta: cannot disable all three sections', $$update groups set calendar_enabled = false$$, 'groups_some_section');
update groups set shopping_enabled = true, tasks_enabled = true;
select tests.check('marta: regenerate code', length(regenerate_invite_code('00000000-0000-4000-8000-000000000001')) = 10);
select tests.expect_error('marta: profile cannot be admin', $$select set_member_role('00000000-0000-4000-8000-0000000000a4', 'admin')$$, 'profile without account');
select tests.expect_error('marta: last admin cannot step down', $$select set_member_role('00000000-0000-4000-8000-0000000000a1', 'member')$$, 'last admin');
select approve_member('00000000-0000-4000-8000-0000000000a5');
select tests.check('marta: approves lucia', (select status from members where id = '00000000-0000-4000-8000-0000000000a5') = 'active');
select set_member_role('00000000-0000-4000-8000-0000000000a2', 'admin');
select tests.check('marta: makes daniel admin', (select role from members where id = '00000000-0000-4000-8000-0000000000a2') = 'admin');
select tests.check('marta: creates a profile', create_profile('00000000-0000-4000-8000-000000000001', 'Bebé') is not null);
select tests.check('marta: claim code for Pablo', length(create_claim_code('00000000-0000-4000-8000-0000000000d2')) = 10);
select tests.expect_error('marta: no claim code for Daniel', $$select create_claim_code((select id from people where user_id = '00000000-0000-4000-8000-0000000000c2'))$$, 'person not found');
select tests.check('storage: own group folder ok', can_use_group_folder('00000000-0000-4000-8000-000000000001/a.jpg'));
select tests.check('storage: other folder denied', not can_use_group_folder('00000000-0000-4000-8000-000000000999/a.jpg'));

select tests.as_user('lucia@ejemplo.com');
select tests.check('lucia approved: sees items', (select count(*) from items) = 22);
with t as (insert into trips (group_id, member_id) values ('00000000-0000-4000-8000-000000000001', my_member_id('00000000-0000-4000-8000-000000000001')) returning 1)
select tests.check('lucia: can start a trip', (select count(*) from t) = 1);
select tests.expect_error('lucia: cannot start a trip as daniel',
  $$insert into trips (group_id, member_id) values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2')$$, 'row-level security');

-- Cancelling a trip returns its cart and its "not found" items to the list; finishing keeps
-- the "not found" ones on the list (for next time) and leaves older marks alone.
create temp table trip_items on commit drop as
  select id, row_number() over (order by id) as n from items where status = 'pending' order by id limit 4;
reset role;
grant select on trip_items to authenticated;
set role authenticated;
select id as lucia_trip from trips where member_id = my_member_id('00000000-0000-4000-8000-000000000001') and finished_at is null \gset
update items set status = 'in_cart', trip_id = :'lucia_trip' where id = (select id from trip_items where n = 1);
update items set status = 'not_found', trip_id = :'lucia_trip' where id = (select id from trip_items where n = 2);
select cancel_trip(:'lucia_trip');
select tests.check('cancel_trip: cart and not found go back to pending',
  (select bool_and(status = 'pending' and trip_id is null) from items where id in (select id from trip_items where n <= 2)));
select tests.check('cancel_trip: older not found marks stay', exists (select 1 from items where name = 'Cilantro fresco' and status = 'not_found'));
with t as (insert into trips (group_id, member_id) values ('00000000-0000-4000-8000-000000000001', my_member_id('00000000-0000-4000-8000-000000000001')) returning id)
select id as lucia_trip from t \gset
update items set status = 'in_cart', trip_id = :'lucia_trip' where id = (select id from trip_items where n = 3);
update items set status = 'not_found', trip_id = :'lucia_trip' where id = (select id from trip_items where n = 4);
select tests.check('finish_trip: buys the cart', finish_trip(:'lucia_trip') = 1);
select tests.check('finish_trip: not found stays on the list', (select status = 'not_found' from items where id = (select id from trip_items where n = 4)));
with t as (insert into trips (group_id, member_id) values ('00000000-0000-4000-8000-000000000001', my_member_id('00000000-0000-4000-8000-000000000001')) returning id)
select id as lucia_trip from t \gset
with u as (update items set status = 'in_cart', trip_id = :'lucia_trip' where id = (select id from trip_items where n = 4) returning 1)
select tests.check('finish_trip: a not found item can go in the next cart', (select count(*) from u) = 1);

-- ── Leaving and coming back ──
select tests.as_user('marta@ejemplo.com');
select leave_group('00000000-0000-4000-8000-000000000001');
select tests.check('marta left: sees no items', (select count(*) from items) = 0);
select tests.check('marta left: Pablo is off her tasks', (select assignees = '{}' from tasks where id = '00000000-0000-4000-8000-000000000021'));
select tests.check('marta left: she stays on her own task, Daniel comes off it', (select assignees = array[my_person_id()] from tasks where id = '00000000-0000-4000-8000-000000000022'));
select tests.as_user('daniel@ejemplo.com');
select tests.check('daniel still admin after marta left', is_group_admin('00000000-0000-4000-8000-000000000001'));
select tests.check('history keeps marta''s name', (select display_name from people where user_id = '00000000-0000-4000-8000-0000000000c1') = 'Marta');
select tests.check('marta left: her folders are no longer shared with the group', not exists (select 1 from calendar_shares where calendar_id = '00000000-0000-4000-8000-0000000000e1'));
select tests.check('marta left: daniel no longer sees Oficina', not exists (select 1 from events where id = '00000000-0000-4000-8000-0000000000f1'));
select tests.check('marta left: she is off daniel''s night shift', not exists (select 1 from event_participants where event_id = '00000000-0000-4000-8000-0000000000fa'));
select tests.check('marta left: Pablo''s Colegio still shared', exists (select 1 from events where id = '00000000-0000-4000-8000-0000000000f7'));
select tests.check('marta left: Pendientes is no longer shared with the group', not exists (select 1 from task_list_shares where list_id = '00000000-0000-4000-8000-000000000011'));
select tests.check('marta left: daniel no longer sees its tasks', not exists (select 1 from tasks where list_id = '00000000-0000-4000-8000-000000000011'));
reset role;
select invite_code as invite from groups where id = '00000000-0000-4000-8000-000000000001' \gset
set role authenticated;
select tests.as_user('marta@ejemplo.com');
select tests.expect_error('old invite stops working after regenerate', $$select request_join('HUERTA7Q4K')$$, 'invalid invite code');
select request_join(:'invite');
select tests.check('marta rejoins with the same member row', (select id from members where person_id = my_person_id()) = '00000000-0000-4000-8000-0000000000a1');
select tests.check('marta rejoin is pending', (select status from members where person_id = my_person_id()) = 'pending');
select tests.as_user('daniel@ejemplo.com');
select reject_member('00000000-0000-4000-8000-0000000000a1');
select tests.check('rejecting a returning member keeps the row', (select left_at is not null from members where id = '00000000-0000-4000-8000-0000000000a1'));
select tests.check('trips of marta survive', (select count(*) from trips where member_id = '00000000-0000-4000-8000-0000000000a1') = 2);

-- ── Only admin leaves: oldest member with an account takes over ──
select tests.as_user('daniel@ejemplo.com');
select leave_group('00000000-0000-4000-8000-000000000001');
select tests.as_user('lucia@ejemplo.com');
select tests.check('lucia promoted when last admin left', is_group_admin('00000000-0000-4000-8000-000000000001'));

reset role;
-- ── Sign-up creates a person; claiming a profile ──
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000c9', 'pablo@ejemplo.com', '{"display_name":"Pablo nuevo"}');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-4000-8000-0000000000c8', 'sinnombre@ejemplo.com', null);
set role authenticated;
select tests.as_user('sinnombre@ejemplo.com');
select tests.check('sign-up without name uses email', (select display_name from people where user_id = auth.uid()) = 'sinnombre');
select tests.as_user('pablo@ejemplo.com');
select tests.check('sign-up creates a person with the given name', (select display_name from people where user_id = auth.uid()) = 'Pablo nuevo');
select tests.check('claim preview works', (select display_name from profile_by_claim_code((select claim_code from people where id = '00000000-0000-4000-8000-0000000000d2'))) is null);
reset role;
select claim_code as code from people where id = '00000000-0000-4000-8000-0000000000d2' \gset
set role authenticated;
select tests.as_user('pablo@ejemplo.com');
select tests.check('claim preview shows the profile', (select display_name from profile_by_claim_code(:'code')) = 'Pablito');
select tests.expect_error('bad claim code', $$select claim_profile('NOPENOPE00')$$, 'invalid claim code');
select tests.check('claim profile', claim_profile(lower(:'code')) = '00000000-0000-4000-8000-0000000000d2');
select tests.check('after claim I am Pablo', my_person_id() = '00000000-0000-4000-8000-0000000000d2');
select tests.check('after claim I am in the group', is_group_member('00000000-0000-4000-8000-000000000001'));
select tests.check('claim code is consumed', (select claim_code is null from people where id = '00000000-0000-4000-8000-0000000000d2'));
select tests.check('only one person for this account', (select count(*) from people where user_id = auth.uid()) = 1);

select tests.as_user('sinnombre@ejemplo.com');
select create_group('Pareja', false, true);
select tests.check('create_group: creator is active admin', (select role = 'admin' and status = 'active' from members where person_id = my_person_id()));
select tests.check('create_group: sections', (select not shopping_enabled and calendar_enabled and tasks_enabled from groups where name = 'Pareja'));
select tests.check('create_group: a Pendientes list shared with the group',
  exists (select 1 from task_lists l join task_list_shares s on s.list_id = l.id join groups g on g.id = s.group_id
           where l.owner_id = my_person_id() and l.name = 'Pendientes' and g.name = 'Pareja'));
select tests.check('other group invisible to Pablo? (as sinnombre sees 1 group)', (select count(*) from groups) = 1);

reset role;
grant execute on function tests.expect_error(text, text, text), tests.check(text, boolean) to anon;
grant insert on tests.results to anon; grant usage on sequence tests.results_n_seq to anon;
set role anon;
select tests.expect_error('anon: no people', $$select * from people$$, 'permission denied');
select tests.expect_error('anon: no events', $$select * from events$$, 'permission denied');
select tests.expect_error('anon: no tasks', $$select * from tasks$$, 'permission denied');
select tests.expect_error('anon: no task lists', $$select * from task_lists$$, 'permission denied');
select tests.expect_error('anon: cannot tick', $$select set_task_done('00000000-0000-4000-8000-000000000022', true)$$, 'permission denied');
select tests.expect_error('anon: no busy slots', $$select * from busy_events('00000000-0000-4000-8000-000000000001')$$, 'permission denied');
select tests.expect_error('anon: no rpc', $$select group_by_invite('HUERTA7Q4K')$$, 'permission denied');
reset role;

select (case when ok then 'ok   ' else 'FAIL ' end) || name from tests.results order by n;
select count(*) filter (where ok) || ' ok, ' || count(*) filter (where not ok) || ' failed' from tests.results;
rollback;
