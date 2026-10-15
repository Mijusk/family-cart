-- Demo data for local development (npm run db:reset). Never runs against the hosted project.
--
-- Accounts (password for all: demo1234):
--   marta@ejemplo.com   admin of "Casa Martín"
--   daniel@ejemplo.com  member of "Casa Martín"
--   lucia@ejemplo.com   has asked to join "Casa Martín" (pending): approve her as Marta
-- Profiles without an account: Abuela Carmen, and Pablo (claim code PABLO7Q4KM: sign up with a
-- new email and enter it under "Tengo un código de perfil").
-- Invite link for "Casa Martín": /unirse/HUERTA7Q4K

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
