-- One member, many devices.
--
-- Until now `members.user_id` tied each member to exactly one anonymous auth user, so the
-- same person opening the app on a second phone became a second member. Devices now live
-- in `member_identities`: several anonymous users can act as the same member, and all the
-- history (items.added_by, items.purchased_by, trips.member_id) keeps pointing at the
-- member, never at a device.
--
-- Joining a group checks for a member with the same normalized name first
-- (check_member_name); the app then either links this device to that member
-- (claim_member) or creates a new, disambiguated one (join_group).

-- ── Table ────────────────────────────────────────────────────────────────────

-- Lets member_identities carry group_id with a foreign key that guarantees it matches the member's.
alter table public.members add constraint members_id_group_id_key unique (id, group_id);

create table public.member_identities (
  member_id uuid not null,
  group_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, user_id),
  -- A device is one member per group.
  unique (group_id, user_id),
  foreign key (member_id, group_id) references public.members (id, group_id) on delete cascade
);

create index member_identities_user_id_idx on public.member_identities (user_id);

insert into public.member_identities (member_id, group_id, user_id, created_at)
select id, group_id, user_id, created_at from public.members where user_id is not null;

alter table public.member_identities enable row level security;

-- A device only needs to see its own links; who belongs to the group is on `members`.
create policy "devices see their own identities" on public.member_identities
  for select to authenticated using (user_id = (select auth.uid()));

-- Only read access from the API: identities are created by the RPCs below.
grant select on public.member_identities to authenticated;

-- Display names like "Marta (García)" need a bit more room than 40 characters.
alter table public.members drop constraint members_name_check;
alter table public.members add constraint members_name_check check (char_length(trim(name)) between 1 and 60);

-- ── Membership checks now go through identities ─────────────────────────────

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_identities where group_id = gid and user_id = (select auth.uid())
  )
$$;

create or replace function public.my_member_id(gid uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select member_id from public.member_identities where group_id = gid and user_id = (select auth.uid())
$$;

drop policy "members rename themselves" on public.members;
create policy "members rename themselves" on public.members
  for update to authenticated
  using (id = public.my_member_id(group_id))
  with check (id = public.my_member_id(group_id));

-- ── RPCs ─────────────────────────────────────────────────────────────────────

create or replace function public.create_group(group_name text, member_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_group_id uuid;
  new_member_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.groups (name) values (trim(group_name)) returning id into new_group_id;
  insert into public.members (group_id, name) values (new_group_id, trim(member_name)) returning id into new_member_id;
  insert into public.member_identities (member_id, group_id, user_id) values (new_member_id, new_group_id, auth.uid());
  return new_group_id;
end;
$$;

-- Existing member whose name matches once normalized ("  MÁRTA " = "marta"), if any.
-- Only reveals names to someone who already holds the invite code.
create function public.check_member_name(code text, member_name text)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.name
  from public.members m
  join public.groups g on g.id = m.group_id
  where g.invite_code = upper(trim(code))
    and public.normalize_name(m.name) = public.normalize_name(member_name)
  order by m.created_at
  limit 1
$$;

-- Creates a new member. Refuses a name that already exists in the group (normalized):
-- the app must either claim that member or pick a distinguishing name.
create or replace function public.join_group(code text, member_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
  new_member_id uuid;
  clean_name text := regexp_replace(trim(member_name), '\s+', ' ', 'g');
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select id into target_group_id from public.groups where invite_code = upper(trim(code));
  if target_group_id is null then
    raise exception 'invalid invite code' using errcode = 'P0002';
  end if;

  -- This device is already in the group: nothing to do.
  if exists (select 1 from public.member_identities where group_id = target_group_id and user_id = auth.uid()) then
    return target_group_id;
  end if;

  if exists (
    select 1 from public.members
    where group_id = target_group_id and public.normalize_name(name) = public.normalize_name(clean_name)
  ) then
    raise exception 'member name taken';
  end if;

  insert into public.members (group_id, name) values (target_group_id, clean_name) returning id into new_member_id;
  insert into public.member_identities (member_id, group_id, user_id) values (new_member_id, target_group_id, auth.uid());
  return target_group_id;
end;
$$;

-- "It's me on another device": link this device to an existing member of the invite's group.
create function public.claim_member(code text, member_id uuid)
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
  if not exists (select 1 from public.members m where m.id = claim_member.member_id and m.group_id = target_group_id) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  -- A device that is already someone in this group stays who it is.
  insert into public.member_identities (member_id, group_id, user_id)
  values (claim_member.member_id, target_group_id, auth.uid())
  on conflict (group_id, user_id) do nothing;
  return target_group_id;
end;
$$;

revoke execute on function public.check_member_name(text, text), public.claim_member(text, uuid) from public, anon;
grant execute on function public.check_member_name(text, text), public.claim_member(text, uuid) to authenticated;

-- ── Drop the old one-device link ─────────────────────────────────────────────
-- Everything that read it has been replaced above; this also drops its unique constraint and index.

alter table public.members drop column user_id;
