-- Compra Familiar: initial schema.
--
-- Every device signs in as an anonymous Supabase user; `members.user_id` links that
-- user to a member of a group (this is the "device token" of the original design).
-- Anything a member can do on their own goes through RLS; operations that must be
-- atomic across devices (merging quantities, finishing a trip) or that touch groups
-- the caller is not in yet (create/join) are security-definer RPCs.

create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ── Helpers ──────────────────────────────────────────────────────────────────

-- Must match normalizeName() in src/utils/text.ts: "  Plátanos " → "platanos".
create function public.normalize_name(name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(extensions.unaccent(trim(name))), '\s+', ' ', 'g')
$$;

-- 10 characters without look-alikes (no 0/O, 1/I/L): ~49 bits, fine for a family invite.
create function public.generate_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + get_byte(r.bytes, i) % 31, 1), '')
  from (select extensions.gen_random_bytes(10) as bytes) r, generate_series(0, 9) i
$$;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  invite_code text not null unique default public.generate_invite_code(),
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create index members_user_id_idx on public.members (user_id);

-- Autocomplete catalog, maintained by a trigger on items.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  normalized_name text not null,
  display_name text not null,
  last_quantity integer not null default 1 check (last_quantity > 0),
  times_used integer not null default 1,
  updated_at timestamptz not null default now(),
  unique (group_id, normalized_name)
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- One open shopping trip per member at a time.
create unique index trips_one_open_per_member on public.trips (member_id) where finished_at is null;
create index trips_group_id_idx on public.trips (group_id);

create type public.item_status as enum ('pending', 'in_cart', 'purchased', 'not_found');

create table public.items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  quantity integer not null default 1 check (quantity between 1 and 999),
  note text check (char_length(note) <= 120),
  status public.item_status not null default 'pending',
  added_by uuid references public.members (id) on delete set null,
  added_at timestamptz not null default now(),
  trip_id uuid references public.trips (id) on delete set null,
  purchased_by uuid references public.members (id) on delete set null,
  purchased_at timestamptz
);

create index items_group_status_idx on public.items (group_id, status);
create index items_trip_id_idx on public.items (trip_id);

-- ── Membership checks (security definer so RLS on members doesn't recurse) ───

create function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members where group_id = gid and user_id = (select auth.uid())
  )
$$;

create function public.my_member_id(gid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.members where group_id = gid and user_id = (select auth.uid())
$$;

-- ── Catalog trigger ──────────────────────────────────────────────────────────

create function public.remember_product(gid uuid, product_name text, quantity integer)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.products (group_id, normalized_name, display_name, last_quantity)
  values (gid, public.normalize_name(product_name), trim(product_name), quantity)
  on conflict (group_id, normalized_name) do update
    set display_name = excluded.display_name,
        last_quantity = excluded.last_quantity,
        times_used = public.products.times_used + 1,
        updated_at = now()
$$;

create function public.items_remember_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.remember_product(new.group_id, new.name, new.quantity);
  return new;
end;
$$;

create trigger items_remember_product
  after insert on public.items
  for each row execute function public.items_remember_product();

-- ── Row level security ───────────────────────────────────────────────────────

alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.products enable row level security;
alter table public.trips enable row level security;
alter table public.items enable row level security;

create policy "members read their group" on public.groups
  for select to authenticated using (public.is_group_member(id));
create policy "members rename their group" on public.groups
  for update to authenticated using (public.is_group_member(id)) with check (public.is_group_member(id));

create policy "members see each other" on public.members
  for select to authenticated using (public.is_group_member(group_id));
create policy "members rename themselves" on public.members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "members read the catalog" on public.products
  for select to authenticated using (public.is_group_member(group_id));

create policy "members see trips" on public.trips
  for select to authenticated using (public.is_group_member(group_id));
create policy "members start their own trips" on public.trips
  for insert to authenticated with check (member_id = public.my_member_id(group_id));

create policy "members see items" on public.items
  for select to authenticated using (public.is_group_member(group_id));
-- added_by may be another member: undoing a delete re-inserts the row exactly as it was.
create policy "members add items" on public.items
  for insert to authenticated
  with check (
    public.is_group_member(group_id)
    and exists (select 1 from public.members m where m.id = added_by and m.group_id = items.group_id)
  );
create policy "members update items" on public.items
  for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "members delete items" on public.items
  for delete to authenticated using (public.is_group_member(group_id));

-- ── RPCs ─────────────────────────────────────────────────────────────────────

create function public.create_group(group_name text, member_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.groups (name) values (trim(group_name)) returning id into new_group_id;
  insert into public.members (group_id, user_id, name) values (new_group_id, auth.uid(), trim(member_name));
  return new_group_id;
end;
$$;

-- What the join screen shows before the visitor is a member.
create function public.group_by_invite(code text)
returns table (id uuid, name text, member_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, (select count(*) from public.members m where m.group_id = g.id)
  from public.groups g
  where g.invite_code = upper(trim(code))
$$;

create function public.join_group(code text, member_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select id into target_group_id from public.groups where invite_code = upper(trim(code));
  if target_group_id is null then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;
  insert into public.members (group_id, user_id, name)
  values (target_group_id, auth.uid(), trim(member_name))
  on conflict (group_id, user_id) do nothing;
  return target_group_id;
end;
$$;

-- Adds to an existing line atomically, so two people adding "leche" at once both count.
create function public.merge_item(item_id uuid, add_quantity integer, extra_note text default null)
returns public.items
language plpgsql
security definer
set search_path = ''
as $$
declare
  merged public.items;
  clean_note text := nullif(trim(extra_note), '');
begin
  update public.items i
     set quantity = least(i.quantity + greatest(add_quantity, 1), 999),
         note = case
           when clean_note is null or clean_note = i.note then i.note
           when i.note is null then clean_note
           else left(i.note || ' · ' || clean_note, 120)
         end
   where i.id = item_id
     and i.status in ('pending', 'not_found')
     and public.is_group_member(i.group_id)
  returning * into merged;

  if merged.id is null then
    raise exception 'item not found' using errcode = 'P0002';
  end if;
  perform public.remember_product(merged.group_id, merged.name, add_quantity);
  return merged;
end;
$$;

-- Cart → purchased and close the trip, in one transaction. Returns how many were bought.
create function public.finish_trip(trip_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  trip public.trips;
  bought integer;
begin
  select * into trip from public.trips t where t.id = finish_trip.trip_id and t.finished_at is null;
  if trip.id is null or trip.member_id is distinct from public.my_member_id(trip.group_id) then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;

  update public.items i
     set status = 'purchased', purchased_by = trip.member_id, purchased_at = now()
   where i.trip_id = trip.id and i.status = 'in_cart';
  get diagnostics bought = row_count;

  update public.trips set finished_at = now() where id = trip.id;
  return bought;
end;
$$;

-- Abandon the trip: the cart goes back to the list.
create function public.cancel_trip(trip_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  trip public.trips;
begin
  select * into trip from public.trips t where t.id = cancel_trip.trip_id and t.finished_at is null;
  if trip.id is null or trip.member_id is distinct from public.my_member_id(trip.group_id) then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;

  update public.items i
     set status = 'pending', trip_id = null
   where i.trip_id = trip.id and i.status = 'in_cart';

  update public.trips set finished_at = now() where id = trip.id;
end;
$$;

-- ── Privileges ───────────────────────────────────────────────────────────────
-- Functions are executable by PUBLIC by default; only signed-in (incl. anonymous) users get the RPCs.

revoke execute on function
  public.create_group(text, text),
  public.group_by_invite(text),
  public.join_group(text, text),
  public.merge_item(uuid, integer, text),
  public.finish_trip(uuid),
  public.cancel_trip(uuid),
  public.remember_product(uuid, text, integer),
  public.items_remember_product(),
  public.is_group_member(uuid),
  public.my_member_id(uuid)
from public, anon;

grant execute on function
  public.create_group(text, text),
  public.group_by_invite(text),
  public.join_group(text, text),
  public.merge_item(uuid, integer, text),
  public.finish_trip(uuid),
  public.cancel_trip(uuid),
  public.is_group_member(uuid),
  public.my_member_id(uuid)
to authenticated;

-- ── Realtime ─────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table public.groups, public.members, public.products, public.trips, public.items;
