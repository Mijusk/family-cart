-- Family Cart: schema with email accounts, people and group roles.
--
-- Replaces the earlier migrations (anonymous devices + member_identities), which only ever
-- held test data. Design notes: docs/calendario.md.
--
-- Who is who:
--   auth.users  one per email account.
--   people      one per human. Created automatically for every account; a child without a
--               phone is a person with no account (user_id is null), managed by the admins
--               of their groups, who can later hand it over with a claim code.
--   members     a person inside a group: role (admin/member) and status (pending/active).
--               Shopping history (items.added_by, trips.member_id…) points at members, so a
--               member row is never deleted once it has been active: leaving sets left_at.
--
-- Anything a person can do on their own goes through RLS; operations that must be atomic or
-- that touch groups the caller is not in yet are security-definer RPCs.

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

-- 10 characters without look-alikes (no 0/O, 1/I/L): ~49 bits. Used for invites and claim codes.
create function public.generate_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + get_byte(r.bytes, i) % 31, 1), '')
  from (select extensions.gen_random_bytes(10) as bytes) r, generate_series(0, 9) i
$$;

-- Must match PERSON_COLORS in src/utils/colors.ts.
create function public.random_person_color()
returns text
language sql
volatile
set search_path = ''
as $$
  select (array['#3a6b52', '#a8522f', '#3b6fb6', '#8f6a1f', '#7d4f9a', '#277a7a', '#b5476f', '#5f7a2e'])[1 + floor(random() * 8)::int]
$$;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table public.people (
  id uuid primary key default gen_random_uuid(),
  -- Null for a profile without an account (a child without a phone).
  user_id uuid unique references auth.users (id) on delete set null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 60),
  color text not null default public.random_person_color() check (color ~ '^#[0-9a-f]{6}$'),
  -- Lets the owner of a new account take over this profile (see claim_profile).
  claim_code text unique,
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.people (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint people_claim_code_only_without_account check (claim_code is null or user_id is null)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  invite_code text not null unique default public.generate_invite_code(),
  timezone text not null default 'Europe/Madrid',
  shopping_enabled boolean not null default true,
  calendar_enabled boolean not null default true,
  created_by uuid references public.people (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references public.people (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint groups_some_section check (shopping_enabled or calendar_enabled)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'pending' check (status in ('pending', 'active')),
  -- When they asked to join (or were added, for profiles without an account).
  created_at timestamptz not null default now(),
  approved_by uuid references public.people (id) on delete set null,
  approved_at timestamptz,
  -- Set when they leave or are removed. The row stays so the history keeps their name.
  left_at timestamptz,
  unique (group_id, person_id),
  unique (id, group_id),
  constraint members_pending_is_plain check (status = 'active' or role = 'member')
);

create index members_person_id_idx on public.members (person_id);

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
  finished_at timestamptz,
  -- manual: "Finalizar compra"; timeout: closed by the 4-hour job; cancelled: cart sent back.
  closed_reason text check (closed_reason in ('manual', 'timeout', 'cancelled')),
  constraint trips_closed_reason_matches_finished check ((finished_at is null) = (closed_reason is null))
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
  -- Object in the item-photos bucket: `<group_id>/<uuid>.jpg`.
  photo_path text,
  status public.item_status not null default 'pending',
  added_by uuid references public.members (id) on delete set null,
  added_at timestamptz not null default now(),
  trip_id uuid references public.trips (id) on delete set null,
  purchased_by uuid references public.members (id) on delete set null,
  purchased_at timestamptz,
  constraint items_photo_in_group_folder check (photo_path is null or photo_path like group_id::text || '/%')
);

create index items_group_status_idx on public.items (group_id, status);
create index items_trip_id_idx on public.items (trip_id);

-- ── Who am I (security definer so RLS on these tables doesn't recurse) ───────

create function public.my_person_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.people where user_id = (select auth.uid())
$$;

-- Active member: approved and still in the group. Pending requests see nothing of the group.
create function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
      join public.people p on p.id = m.person_id
     where m.group_id = gid and p.user_id = (select auth.uid())
       and m.status = 'active' and m.left_at is null
  )
$$;

create function public.is_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
      join public.people p on p.id = m.person_id
     where m.group_id = gid and p.user_id = (select auth.uid())
       and m.status = 'active' and m.left_at is null and m.role = 'admin'
  )
$$;

create function public.my_member_id(gid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.members m
    join public.people p on p.id = m.person_id
   where m.group_id = gid and p.user_id = (select auth.uid())
     and m.status = 'active' and m.left_at is null
$$;

-- Myself, or a profile without an account that is in a group I administer.
create function public.can_manage_person(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.people where id = pid and user_id = (select auth.uid()))
      or exists (
        select 1 from public.people p
          join public.members m on m.person_id = p.id and m.status = 'active' and m.left_at is null
         where p.id = pid and p.user_id is null and public.is_group_admin(m.group_id)
      )
$$;

-- People I share a group with (in any state), so names in lists and history resolve.
create function public.can_see_person(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.people where id = pid and user_id = (select auth.uid()))
      or exists (
        select 1 from public.members m
         where m.person_id = pid and public.is_group_member(m.group_id)
      )
$$;

-- ── Stamps ───────────────────────────────────────────────────────────────────

-- Who and when, on every update. Rows changed by the database itself keep updated_by null.
create function public.stamp_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(public.my_person_id(), new.updated_by);
  return new;
end;
$$;

create trigger people_stamp_update before update on public.people
  for each row execute function public.stamp_update();
create trigger groups_stamp_update before update on public.groups
  for each row execute function public.stamp_update();

-- ── Every account is a person ────────────────────────────────────────────────

-- The sign-up form sends the name as user metadata (display_name); the email's local part is
-- only a fallback for accounts created some other way (e.g. from the dashboard).
create function public.create_person_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
begin
  insert into public.people (user_id, display_name)
  values (new.id, left(coalesce(wanted, split_part(new.email, '@', 1), 'Sin nombre'), 60));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_person_for_user();

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

-- An item can only be in the cart of an open trip. The app writes in the background, so
-- "put in cart" can reach the server after the trip was closed (timeout, or the same member
-- finishing on another device); that write is rejected and the app reloads.
create function public.items_cart_requires_open_trip()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'in_cart' and not exists (
    select 1 from public.trips t where t.id = new.trip_id and t.finished_at is null
  ) then
    raise exception 'trip is closed';
  end if;
  return new;
end;
$$;

create trigger items_cart_requires_open_trip
  before insert or update of status, trip_id on public.items
  for each row execute function public.items_cart_requires_open_trip();

-- ── Row level security ───────────────────────────────────────────────────────

alter table public.people enable row level security;
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.products enable row level security;
alter table public.trips enable row level security;
alter table public.items enable row level security;

create policy "see people in my groups" on public.people
  for select to authenticated using (public.can_see_person(id));
-- Only name and color are updatable (column grants below).
create policy "edit myself and the profiles I manage" on public.people
  for update to authenticated
  using (public.can_manage_person(id)) with check (public.can_manage_person(id));

-- A pending request can see the group's name, nothing else from it.
create policy "members read their group" on public.groups
  for select to authenticated
  using (
    public.is_group_member(id)
    or exists (
      select 1 from public.members m
       where m.group_id = groups.id and m.person_id = public.my_person_id() and m.left_at is null
    )
  );
-- Only name, timezone and sections are updatable (column grants below).
create policy "admins edit their group" on public.groups
  for update to authenticated using (public.is_group_admin(id)) with check (public.is_group_admin(id));

-- Members change only through RPCs (join, approve, roles, leave).
create policy "see my group's members and my own requests" on public.members
  for select to authenticated
  using (public.is_group_member(group_id) or person_id = public.my_person_id());

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

-- ── Groups: create, join, approve ────────────────────────────────────────────

create function public.require_person()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := public.my_person_id();
begin
  if me is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  return me;
end;
$$;

-- The creator is the group's first admin.
create function public.create_group(group_name text, with_shopping boolean default true, with_calendar boolean default true)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  new_group_id uuid;
begin
  insert into public.groups (name, shopping_enabled, calendar_enabled, created_by)
  values (trim(group_name), with_shopping, with_calendar, me)
  returning id into new_group_id;
  insert into public.members (group_id, person_id, role, status, approved_by, approved_at)
  values (new_group_id, me, 'admin', 'active', me, now());
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
  select g.id, g.name,
         (select count(*) from public.members m where m.group_id = g.id and m.status = 'active' and m.left_at is null)
  from public.groups g
  where g.invite_code = upper(trim(code))
$$;

-- Asks to join; an admin has to approve it. Someone who had left asks again with the same
-- member row, so their history stays theirs. Returns the group id.
create function public.request_join(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  target_group_id uuid;
begin
  select id into target_group_id from public.groups where invite_code = upper(trim(code));
  if target_group_id is null then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;

  insert into public.members (group_id, person_id)
  values (target_group_id, me)
  on conflict (group_id, person_id) do update
    -- approved_at stays: it marks a member with history, so turning this request down
    -- later sends them back to having left instead of deleting the row (reject_member).
    set status = 'pending', role = 'member', left_at = null, created_at = now()
    where public.members.left_at is not null;
  return target_group_id;
end;
$$;

create function public.approve_member(member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  target public.members;
begin
  select * into target from public.members m where m.id = approve_member.member_id;
  if target.id is null or not public.is_group_admin(target.group_id) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  update public.members m
     set status = 'active', approved_by = me, approved_at = now()
   where m.id = target.id and m.status = 'pending' and m.left_at is null;
end;
$$;

-- Turns down a request (admins) or withdraws one's own. A pending member has no history,
-- unless they had been in the group before: then they go back to having left.
create function public.reject_member(member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  target public.members;
begin
  select * into target from public.members m where m.id = reject_member.member_id;
  if target.id is null or target.status <> 'pending'
     or (target.person_id <> me and not public.is_group_admin(target.group_id)) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if target.approved_at is null then
    delete from public.members m where m.id = target.id;
  else
    update public.members m set left_at = now() where m.id = target.id;
  end if;
end;
$$;

-- Internal: marks an active member as gone and sends an unfinished trip back to the list.
-- If they were the last admin, the longest-standing remaining member becomes admin.
create function public.retire_member(target_member_id uuid)
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

create function public.leave_group(gid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  mine public.members;
begin
  select * into mine from public.members m where m.group_id = gid and m.person_id = me and m.left_at is null;
  if mine.id is null then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if mine.status = 'pending' then
    perform public.reject_member(mine.id);
  else
    perform public.retire_member(mine.id);
  end if;
end;
$$;

create function public.remove_member(member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.members;
begin
  perform public.require_person();
  select * into target from public.members m where m.id = remove_member.member_id and m.status = 'active';
  if target.id is null or not public.is_group_admin(target.group_id) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  perform public.retire_member(target.id);
end;
$$;

-- Admins name other admins. The last admin can't step down (they can leave instead).
create function public.set_member_role(member_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.members;
  target_has_account boolean;
begin
  perform public.require_person();
  if new_role not in ('admin', 'member') then
    raise exception 'invalid role';
  end if;
  select * into target from public.members m
   where m.id = set_member_role.member_id and m.status = 'active' and m.left_at is null;
  if target.id is null or not public.is_group_admin(target.group_id) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  select p.user_id is not null into target_has_account from public.people p where p.id = target.person_id;
  if new_role = 'admin' and not target_has_account then
    raise exception 'profile without account';
  end if;
  if new_role = 'member' and target.role = 'admin' and not exists (
    select 1 from public.members m
     where m.group_id = target.group_id and m.role = 'admin' and m.status = 'active'
       and m.left_at is null and m.id <> target.id
  ) then
    raise exception 'last admin';
  end if;
  update public.members m set role = new_role where m.id = target.id;
end;
$$;

-- The old link stops working at once.
create function public.regenerate_invite_code(gid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  if not public.is_group_admin(gid) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  update public.groups set invite_code = public.generate_invite_code() where id = gid
  returning invite_code into new_code;
  return new_code;
end;
$$;

-- ── Profiles without an account ──────────────────────────────────────────────

-- An admin adds someone without a phone (a young child) straight into the group.
create function public.create_profile(gid uuid, display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  new_person_id uuid;
begin
  if not public.is_group_admin(gid) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  insert into public.people (display_name, created_by) values (trim(create_profile.display_name), me)
  returning id into new_person_id;
  insert into public.members (group_id, person_id, status, approved_by, approved_at)
  values (gid, new_person_id, 'active', me, now());
  return new_person_id;
end;
$$;

-- Code for that person to take over the profile once they have their own account.
create function public.create_claim_code(pid uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_code text;
begin
  perform public.require_person();
  if not exists (select 1 from public.people where id = pid and user_id is null) or not public.can_manage_person(pid) then
    raise exception 'person not found' using errcode = 'P0002';
  end if;
  update public.people set claim_code = public.generate_invite_code() where id = pid
  returning claim_code into new_code;
  return new_code;
end;
$$;

create function public.profile_by_claim_code(code text)
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name from public.people p
   where p.claim_code = upper(trim(code)) and p.user_id is null
$$;

-- The new account becomes that profile: its groups and history become theirs. Only for a
-- fresh account (no groups yet), whose own empty person is discarded.
create function public.claim_profile(code text)
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
  if exists (select 1 from public.members where person_id = me) then
    raise exception 'account already in use';
  end if;

  update public.people set user_id = null where id = me;
  delete from public.people where id = me;
  update public.people set user_id = auth.uid(), claim_code = null where id = target;
  return target;
end;
$$;

-- ── Shopping RPCs ────────────────────────────────────────────────────────────

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

-- Cart → purchased and trip finished, for "Finalizar compra" and for the timeout alike.
-- Returns how many items were bought, or null if the trip was already closed.
-- Internal: no permission checks here, callers do them.
create function public.close_trip(target_trip_id uuid, reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  trip public.trips;
  bought integer;
begin
  if reason not in ('manual', 'timeout') then
    raise exception 'invalid close reason: %', reason;
  end if;

  -- Closing the trip first locks its row: if the shopper and the timeout race, the second
  -- one finds it already finished and does nothing.
  update public.trips t
     set finished_at = now(), closed_reason = reason
   where t.id = target_trip_id and t.finished_at is null
  returning * into trip;
  if trip.id is null then
    return null;
  end if;

  update public.items i
     set status = 'purchased', purchased_by = trip.member_id, purchased_at = now()
   where i.trip_id = trip.id and i.status = 'in_cart';
  get diagnostics bought = row_count;
  return bought;
end;
$$;

create function public.finish_trip(trip_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  trip public.trips;
begin
  select * into trip from public.trips t where t.id = finish_trip.trip_id and t.finished_at is null;
  if trip.id is null or trip.member_id is distinct from public.my_member_id(trip.group_id) then
    raise exception 'trip not found' using errcode = 'P0002';
  end if;
  -- 0 if the timeout closed it a moment ago: the cart was bought either way.
  return coalesce(public.close_trip(trip.id, 'manual'), 0);
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

  update public.trips set finished_at = now(), closed_reason = 'cancelled' where id = trip.id;
end;
$$;

-- Every open trip older than max_age, closed as 'timeout'. Returns how many were closed.
create function public.close_stale_trips(max_age interval default interval '4 hours')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stale_id uuid;
  closed integer := 0;
begin
  for stale_id in
    select id from public.trips where finished_at is null and started_at < now() - max_age
  loop
    if public.close_trip(stale_id, 'timeout') is not null then
      closed := closed + 1;
    end if;
  end loop;
  return closed;
end;
$$;

-- ── Item photos ──────────────────────────────────────────────────────────────
-- The image lives in the private `item-photos` bucket under `<group_id>/<uuid>.jpg`. The app
-- shrinks photos to ~1024px JPEG before uploading, so the 2 MB cap is just a safety net.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 2097152, array['image/jpeg']);

-- The first folder of the object name is the group id. Compared as text so a malformed
-- name is simply denied instead of failing a uuid cast.
create function public.can_use_group_folder(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.groups g
     where g.id::text = (storage.foldername(object_name))[1] and public.is_group_member(g.id)
  )
$$;

create policy "members see their group's photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'item-photos' and public.can_use_group_folder(name));
create policy "members upload photos to their group" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'item-photos' and public.can_use_group_folder(name));
create policy "members delete their group's photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'item-photos' and public.can_use_group_folder(name));

-- ── Privileges ───────────────────────────────────────────────────────────────
-- A hosted project with "Automatically expose new tables" off grants nothing by default, so
-- every table grant is explicit and matches what its RLS policies allow. Supabase grants
-- EXECUTE on new functions to anon and authenticated, so internal ones are revoked from both.
-- Local Supabase (and projects with the default setting) also grant ALL on every new table
-- to anon and authenticated, so start from zero.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.people to authenticated;
grant update (display_name, color) on public.people to authenticated;
grant select on public.groups to authenticated;
grant update (name, timezone, shopping_enabled, calendar_enabled) on public.groups to authenticated;
grant select on public.members to authenticated;
grant select on public.products to authenticated;
grant select, insert on public.trips to authenticated;
grant select, insert, update, delete on public.items to authenticated;

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  public.normalize_name(text),
  public.my_person_id(),
  public.is_group_member(uuid),
  public.is_group_admin(uuid),
  public.my_member_id(uuid),
  public.can_manage_person(uuid),
  public.can_see_person(uuid),
  public.can_use_group_folder(text),
  public.create_group(text, boolean, boolean),
  public.group_by_invite(text),
  public.request_join(text),
  public.approve_member(uuid),
  public.reject_member(uuid),
  public.leave_group(uuid),
  public.remove_member(uuid),
  public.set_member_role(uuid, text),
  public.regenerate_invite_code(uuid),
  public.create_profile(uuid, text),
  public.create_claim_code(uuid),
  public.profile_by_claim_code(text),
  public.claim_profile(text),
  public.merge_item(uuid, integer, text),
  public.finish_trip(uuid),
  public.cancel_trip(uuid)
to authenticated;

-- Triggers run as the table owner whatever the caller's grants, but the stamp trigger calls
-- my_person_id() as the caller, so authenticated keeps that one (granted above).

-- ── Realtime ─────────────────────────────────────────────────────────────────

alter publication supabase_realtime add table
  public.people, public.groups, public.members, public.products, public.trips, public.items;

-- ── Schedule ─────────────────────────────────────────────────────────────────
-- pg_cron closes trips left open for 4 hours, inside the database, every 15 minutes.

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('close-stale-trips', '*/15 * * * *', 'select public.close_stale_trips()');
