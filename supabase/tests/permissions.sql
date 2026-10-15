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
select tests.expect_error('marta: cannot disable both sections', $$update groups set calendar_enabled = false$$, 'groups_some_section');
update groups set shopping_enabled = true;
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

-- ── Leaving and coming back ──
select tests.as_user('marta@ejemplo.com');
select leave_group('00000000-0000-4000-8000-000000000001');
select tests.check('marta left: sees no items', (select count(*) from items) = 0);
select tests.as_user('daniel@ejemplo.com');
select tests.check('daniel still admin after marta left', is_group_admin('00000000-0000-4000-8000-000000000001'));
select tests.check('history keeps marta''s name', (select display_name from people where user_id = '00000000-0000-4000-8000-0000000000c1') = 'Marta');
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
select tests.check('create_group: sections', (select not shopping_enabled and calendar_enabled from groups where name = 'Pareja'));
select tests.check('other group invisible to Pablo? (as sinnombre sees 1 group)', (select count(*) from groups) = 1);

reset role;
grant execute on function tests.expect_error(text, text, text), tests.check(text, boolean) to anon;
grant insert on tests.results to anon; grant usage on sequence tests.results_n_seq to anon;
set role anon;
select tests.expect_error('anon: no people', $$select * from people$$, 'permission denied');
select tests.expect_error('anon: no rpc', $$select group_by_invite('HUERTA7Q4K')$$, 'permission denied');
reset role;

select (case when ok then 'ok   ' else 'FAIL ' end) || name from tests.results order by n;
select count(*) filter (where ok) || ' ok, ' || count(*) filter (where not ok) || ' failed' from tests.results;
rollback;
