-- Demo group for local development. Join it at http://localhost:5180/unirse/HUERTA7Q4K
-- The demo members have no user_id: they are people "on other phones".
-- The products catalog fills itself through the items trigger.

insert into public.groups (id, name, invite_code, created_at) values
  ('00000000-0000-4000-8000-000000000001', 'Casa Martín', 'HUERTA7Q4K', now() - interval '62 days');

insert into public.members (id, group_id, name, created_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'Marta', now() - interval '62 days'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'Daniel', now() - interval '40 days'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000001', 'Abuela Carmen', now() - interval '12 days');

insert into public.trips (id, group_id, member_id, started_at, finished_at) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
    now() - interval '9 days 4 hours', now() - interval '9 days 3 hours'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a2',
    now() - interval '5 days 7 hours', now() - interval '5 days 6 hours'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000a1',
    now() - interval '1 day 2 hours 40 minutes', now() - interval '1 day 2 hours');

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
