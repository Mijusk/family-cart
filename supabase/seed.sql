-- Demo data for local development (npm run db:reset). Never runs against the hosted project.
--
-- Accounts (password for all: demo1234):
--   marta@ejemplo.com   admin of "Casa Martín"
--   daniel@ejemplo.com  member of "Casa Martín"
--   lucia@ejemplo.com   has asked to join "Casa Martín" (pending): approve her as Marta
-- Profiles without an account: Abuela Carmen, and Pablo (claim code PABLO7Q4KM: sign up with a
-- new email and enter it under "Tengo un código de perfil").
-- Invite link for "Casa Martín": /unirse/HUERTA7Q4K
-- Calendar: Marta's "Trabajo" and Pablo's "Colegio" are shared with the group in full, Daniel's
-- "Gimnasio" only as busy, and Marta's "Médico" is private except for one event.
-- Tasks: Marta's "Pendientes" shared with the group (one overdue, one for Pablo, one done) and
-- Daniel's private "Amigos con quien quedar".

-- ── Accounts (the on_auth_user_created trigger creates their people) ─────────

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', v.id::uuid, 'authenticated', 'authenticated', v.email,
       extensions.crypt('demo1234', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', v.name),
       now() - interval '62 days', now(), '', '', '', ''
from (values
  ('00000000-0000-4000-8000-0000000000c1', 'marta@ejemplo.com', 'Marta'),
  ('00000000-0000-4000-8000-0000000000c2', 'daniel@ejemplo.com', 'Daniel'),
  ('00000000-0000-4000-8000-0000000000c3', 'lucia@ejemplo.com', 'Lucía')
) as v (id, email, name);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.id::text like '00000000-0000-4000-8000-0000000000c%';

update public.people p set color = v.color
from (values
  ('00000000-0000-4000-8000-0000000000c1', '#a8522f'),
  ('00000000-0000-4000-8000-0000000000c2', '#3b6fb6'),
  ('00000000-0000-4000-8000-0000000000c3', '#7d4f9a')
) as v (user_id, color)
where p.user_id = v.user_id::uuid;

-- ── Profiles without an account ──────────────────────────────────────────────

insert into public.people (id, display_name, color, claim_code, created_by) values
  ('00000000-0000-4000-8000-0000000000d1', 'Abuela Carmen', '#8f6a1f', null,
    (select id from public.people where user_id = '00000000-0000-4000-8000-0000000000c1')),
  ('00000000-0000-4000-8000-0000000000d2', 'Pablo', '#277a7a', 'PABLO7Q4KM',
    (select id from public.people where user_id = '00000000-0000-4000-8000-0000000000c1'));

-- ── Group ────────────────────────────────────────────────────────────────────

insert into public.groups (id, name, invite_code, created_by, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'Casa Martín', 'HUERTA7Q4K',
    (select id from public.people where user_id = '00000000-0000-4000-8000-0000000000c1'), now() - interval '62 days');

insert into public.members (id, group_id, person_id, role, status, approved_at, created_at)
select ('00000000-0000-4000-8000-0000000000' || v.member)::uuid, '00000000-0000-4000-8000-000000000001',
       coalesce(
         (select id from public.people where user_id = v.person::uuid),
         v.person::uuid
       ),
       v.role, v.status, case when v.status = 'active' then now() - v.ago end, now() - v.ago
from (values
  ('a1', '00000000-0000-4000-8000-0000000000c1', 'admin',  'active',  interval '62 days'),
  ('a2', '00000000-0000-4000-8000-0000000000c2', 'member', 'active',  interval '40 days'),
  ('a3', '00000000-0000-4000-8000-0000000000d1', 'member', 'active',  interval '12 days'),
  ('a4', '00000000-0000-4000-8000-0000000000d2', 'member', 'active',  interval '12 days'),
  ('a5', '00000000-0000-4000-8000-0000000000c3', 'member', 'pending', interval '2 hours')
) as v (member, person, role, status, ago);

-- ── Shopping history ─────────────────────────────────────────────────────────

-- Daniel forgot to tap "Finalizar compra": the 4-hour timeout closed his trip.
insert into public.trips (id, group_id, member_id, started_at, finished_at, closed_reason) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
    now() - interval '9 days 4 hours', now() - interval '9 days 3 hours', 'manual'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2',
    now() - interval '5 days 7 hours', now() - interval '5 days 2 hours 45 minutes', 'timeout'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
    now() - interval '1 day 2 hours 40 minutes', now() - interval '1 day 2 hours', 'manual');

-- Oldest first, so the catalog's last_quantity ends up as the most recent one.
insert into public.items (group_id, name, quantity, note, status, added_by, added_at, trip_id, purchased_by, purchased_at)
select '00000000-0000-4000-8000-000000000001', v.name, v.quantity, v.note, v.status::public.item_status,
       ('00000000-0000-4000-8000-0000000000' || v.added_by)::uuid, now() - v.added_ago,
       t.id, case when v.status = 'purchased' then t.member_id end, case when v.status = 'purchased' then t.finished_at end
from (values
  ('Aceite de oliva',     1,  'Virgen extra, 1 L',          'purchased', 'a3', interval '11 days', 'b1'),
  ('Leche semidesnatada', 6,  null,                         'purchased', 'a1', interval '10 days', 'b1'),
  ('Arroz',               2,  'Bomba',                      'purchased', 'a2', interval '10 days', 'b1'),
  ('Manzanas',            1,  null,                         'purchased', 'a2', interval '10 days', 'b1'),
  ('Papel higiénico',     1,  'Paquete de 12',              'purchased', 'a3', interval '7 days',  'b2'),
  ('Pechuga de pollo',    2,  null,                         'purchased', 'a1', interval '6 days',  'b2'),
  ('Pasta',               3,  'Macarrones',                 'purchased', 'a2', interval '6 days',  'b2'),
  ('Café molido',         2,  null,                         'purchased', 'a1', interval '6 days',  'b2'),
  ('Tomate triturado',    2,  null,                         'purchased', 'a1', interval '6 days',  'b2'),
  ('Huevos',              12, 'Camperos',                   'purchased', 'a1', interval '3 days',  'b3'),
  ('Cilantro fresco',     1,  null,                         'not_found', 'a3', interval '3 days',  'b3'),
  ('Yogures naturales',   8,  null,                         'purchased', 'a2', interval '2 days',  'b3'),
  ('Pan de molde',        1,  'Integral',                   'purchased', 'a2', interval '2 days',  'b3'),
  ('Queso rallado',       1,  null,                         'purchased', 'a3', interval '2 days',  'b3'),
  ('Lechuga',             2,  null,                         'purchased', 'a3', interval '2 days',  'b3'),
  ('Detergente lavadora', 1,  'El de siempre, sin perfume', 'pending',   'a3', interval '2 days',  null),
  ('Tomate triturado',    3,  null,                         'pending',   'a1', interval '30 hours', null),
  ('Huevos',              12, 'Camperos',                   'pending',   'a2', interval '26 hours', null),
  ('Plátanos',            1,  'De Canarias, que no estén muy maduros', 'pending', 'a3', interval '5 hours', null),
  ('Leche semidesnatada', 6,  null,                         'pending',   'a1', interval '3 hours',  null),
  ('Yogures naturales',   8,  null,                         'pending',   'a2', interval '45 minutes', null),
  ('Pan de molde',        2,  'Integral',                   'pending',   'a2', interval '20 minutes', null)
) as v (name, quantity, note, status, added_by, added_ago, trip)
left join public.trips t on t.id = ('00000000-0000-4000-8000-0000000000' || v.trip)::uuid
order by v.added_ago desc;

-- ── Calendar ─────────────────────────────────────────────────────────────────
-- Dates are relative to the current week (Monday = date_trunc('week', …)).

insert into public.calendars (id, owner_id, name, color, position, created_by)
select ('00000000-0000-4000-8000-0000000000' || v.id)::uuid, coalesce(
         (select id from public.people where user_id = v.owner::uuid), v.owner::uuid),
       v.name, v.color, v.position,
       (select id from public.people where user_id = v.author::uuid)
from (values
  ('e1', '00000000-0000-4000-8000-0000000000c1', 'Trabajo',  '#3b6fb6', 0, '00000000-0000-4000-8000-0000000000c1'),
  ('e2', '00000000-0000-4000-8000-0000000000c1', 'Médico',   '#b5476f', 1, '00000000-0000-4000-8000-0000000000c1'),
  ('e3', '00000000-0000-4000-8000-0000000000c2', 'Gimnasio', '#5f7a2e', 0, '00000000-0000-4000-8000-0000000000c2'),
  ('e4', '00000000-0000-4000-8000-0000000000d2', 'Colegio',  '#277a7a', 0, '00000000-0000-4000-8000-0000000000c1')
) as v (id, owner, name, color, position, author);

insert into public.calendar_shares (calendar_id, group_id, level, shared_by)
select ('00000000-0000-4000-8000-0000000000' || v.calendar)::uuid, '00000000-0000-4000-8000-000000000001', v.level,
       (select owner_id from public.calendars where id = ('00000000-0000-4000-8000-0000000000' || v.calendar)::uuid)
from (values ('e1', 'full'), ('e3', 'busy'), ('e4', 'full')) as v (calendar, level);

insert into public.events (id, calendar_id, title, notes, location, all_day, start_date, start_time, end_time,
                           repeat, repeat_weekdays, repeat_until, created_by)
select ('00000000-0000-4000-8000-0000000000' || v.id)::uuid, ('00000000-0000-4000-8000-0000000000' || v.calendar)::uuid,
       v.title, v.notes, v.location, v.all_day, date_trunc('week', current_date)::date + v.day_offset,
       v.start_time::time, v.end_time::time, v.repeat, v.weekdays::smallint[], v.until::date,
       (select created_by from public.calendars where id = ('00000000-0000-4000-8000-0000000000' || v.calendar)::uuid)
from (values
  ('f1', 'e1', 'Oficina',              null,                     null,              false, 0,  '08:00', '15:00', 'weekly',   '{1,2,3,4,5}', null),
  ('f2', 'e1', 'Viaje a Valencia',     'Tren de las 7:10',       'Valencia',        true,  10, null,    null,    'none',     null,          null),
  ('f3', 'e2', 'Dentista',             'Revisión anual',         'Clínica Sonrisas', false, 3, '17:30', '18:15', 'none',     null,          null),
  ('f4', 'e2', 'Análisis de sangre',   'En ayunas',              'Centro de salud', false, 8,  '08:30', '09:00', 'none',     null,          null),
  ('f5', 'e3', 'Crossfit',             null,                     'Box Norte',       false, 1,  '19:00', '20:30', 'weekly',   '{2,4}',       null),
  ('f6', 'e3', 'Partido de pádel',     'Con Javi',               null,              false, 5,  '23:00', '00:30', 'none',     null,          null),
  ('f7', 'e4', 'Clase',                null,                     'CEIP Las Huertas', false, 0, '09:00', '14:00', 'weekly',   '{1,2,3,4,5}', null),
  ('f8', 'e4', 'Natación',             'Llevar gorro',           'Polideportivo',   false, 2,  '17:30', '18:30', 'biweekly', '{3}',         null),
  ('f9', 'e4', 'Reunión de padres',    null,                     'CEIP Las Huertas', false, 3, '18:00', '19:00', 'monthly',  null,          null)
) as v (id, calendar, title, notes, location, all_day, day_offset, start_time, end_time, repeat, weekdays, until);

-- Marta adds the group to her blood test, so whoever drives her can see it.
insert into public.event_shares (event_id, group_id, shared_by)
values ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-000000000001',
        (select id from public.people where user_id = '00000000-0000-4000-8000-0000000000c1'));

-- Daniel takes Pablo to swimming.
insert into public.event_participants (event_id, person_id)
values ('00000000-0000-4000-8000-0000000000f8', (select id from public.people where user_id = '00000000-0000-4000-8000-0000000000c2'));

-- No school on Friday next week.
insert into public.event_exceptions (event_id, occurrence_date, status, created_by)
values ('00000000-0000-4000-8000-0000000000f7', date_trunc('week', current_date)::date + 11, 'cancelled',
        (select id from public.people where user_id = '00000000-0000-4000-8000-0000000000c1'));

update public.people p set last_calendar_id = v.calendar::uuid
from (values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000e1'),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000e3')
) as v (user_id, calendar)
where p.user_id = v.user_id::uuid;

-- ── Tasks ────────────────────────────────────────────────────────────────────
-- Dates are relative to today.

insert into public.task_lists (id, owner_id, name, created_by)
select ('00000000-0000-4000-8000-0000000000' || v.id)::uuid, p.id, v.name, p.id
from (values
  ('11', '00000000-0000-4000-8000-0000000000c1', 'Pendientes'),
  ('12', '00000000-0000-4000-8000-0000000000c2', 'Amigos con quien quedar')
) as v (id, owner, name)
join public.people p on p.user_id = v.owner::uuid;

insert into public.task_list_shares (list_id, group_id, shared_by)
values ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001',
        (select id from public.people where user_id = '00000000-0000-4000-8000-0000000000c1'));

insert into public.tasks (id, list_id, title, notes, assigned_to, due_date, position, done_at, done_by, created_by)
select ('00000000-0000-4000-8000-0000000000' || v.id)::uuid, ('00000000-0000-4000-8000-0000000000' || v.list)::uuid,
       v.title, v.notes,
       coalesce((select id from public.people where user_id = v.assigned::uuid), v.assigned::uuid),
       current_date + v.due, v.position,
       now() - v.done_ago, (select id from public.people where user_id = v.done_by::uuid),
       (select id from public.people where user_id = v.author::uuid)
from (values
  ('21', '11', 'Comprar manguera',                       'Para el patio, de 25 m',  '00000000-0000-4000-8000-0000000000c2', -2,   1, null::interval, null, '00000000-0000-4000-8000-0000000000c1'),
  ('22', '11', 'Llamar al fontanero',                    'Gotea el grifo del baño', '00000000-0000-4000-8000-0000000000c1', 0,    2, null,           null, '00000000-0000-4000-8000-0000000000c1'),
  ('23', '11', 'Firmar la autorización de la excursión', null,                      '00000000-0000-4000-8000-0000000000d2', 3,    3, null,           null, '00000000-0000-4000-8000-0000000000c1'),
  ('24', '11', 'Renovar el DNI de la abuela',            'Pedir cita por internet', null,                                   null, 4, null,           null, '00000000-0000-4000-8000-0000000000c2'),
  ('25', '11', 'Devolver los libros a la biblioteca',    null,                      null,                                   -1,   5, interval '1 day', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c1'),
  ('26', '12', 'Quedar con Javi',                        'Para el pádel',           null,                                   5,    1, null,           null, '00000000-0000-4000-8000-0000000000c2'),
  ('27', '12', 'Llamar a Sara',                          null,                      null,                                   null, 2, null,           null, '00000000-0000-4000-8000-0000000000c2')
) as v (id, list, title, notes, assigned, due, position, done_ago, done_by, author);

-- The insert stamps every row with now(); spread them out as if written over the last weeks.
update public.task_lists set created_at = now() - interval '62 days', updated_at = now() - interval '62 days'
 where id = '00000000-0000-4000-8000-000000000011';
update public.task_lists set created_at = now() - interval '20 days', updated_at = now() - interval '20 days'
 where id = '00000000-0000-4000-8000-000000000012';
update public.tasks t set created_at = now() - v.ago, updated_at = now() - v.ago
from (values ('21', interval '6 days'), ('22', interval '3 days'), ('23', interval '2 days'), ('24', interval '1 day'),
             ('25', interval '8 days'), ('26', interval '4 days'), ('27', interval '2 days')) as v (id, ago)
where t.id = ('00000000-0000-4000-8000-0000000000' || v.id)::uuid;
