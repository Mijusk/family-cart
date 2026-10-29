-- Shopping folders (Luis, 29-oct): the group's list split into folders anyone in the group makes
-- («Casa», «Coche», «Trabajo»…). They belong to the group, like the list: everyone sees and uses
-- them. What is personal is the default: the folder I last added something to, kept per member.
-- Items without a folder are «General». Connected AI apps can see folders, create them and add
-- products to one (docs/ia.md).

-- ── Tables ──────────────────────────────────────────────────────────────────

create table public.shopping_folders (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  created_by uuid references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, group_id)
);

-- No two folders with the same name in a group (case, accents and spaces don't count).
create unique index shopping_folders_group_name_idx on public.shopping_folders (group_id, public.normalize_name(name));

-- Same group as the item. Deleting a folder sends its items to «General» (only folder_id is
-- cleared, so the history keeps them).
alter table public.items
  add column folder_id uuid,
  add constraint items_folder_in_group foreign key (folder_id, group_id)
    references public.shopping_folders (id, group_id) on delete set null (folder_id);

create index items_folder_id_idx on public.items (folder_id);

alter table public.members
  add column last_shopping_folder_id uuid references public.shopping_folders (id) on delete set null;

-- ── Last folder used ────────────────────────────────────────────────────────

-- Adding something (in the app or from an AI chat) makes its folder my default. Only my own
-- adds count: undoing a delete inserts the row again with whoever added it first. Written only
-- when it changes, since every change to members makes the app reload the group.
create function public.remember_last_shopping_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.members m set last_shopping_folder_id = new.folder_id
   where m.id = new.added_by and m.person_id = public.my_person_id()
     and m.last_shopping_folder_id is distinct from new.folder_id;
  return new;
end;
$$;

create trigger items_remember_last_shopping_folder
  after insert on public.items
  for each row execute function public.remember_last_shopping_folder();

-- Adding to a line already there counts too. As in 20261015180000_schema.sql, plus that.
create or replace function public.merge_item(item_id uuid, add_quantity integer, extra_note text default null)
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
  update public.members m set last_shopping_folder_id = merged.folder_id
   where m.group_id = merged.group_id and m.person_id = public.my_person_id()
     and m.last_shopping_folder_id is distinct from merged.folder_id;
  return merged;
end;
$$;

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.shopping_folders enable row level security;

create policy "members see the group's shopping folders" on public.shopping_folders
  for select to authenticated using (public.is_group_member(group_id));
create policy "members create shopping folders" on public.shopping_folders
  for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = public.my_member_id(group_id));
-- Only the name is updatable (column grant below).
create policy "members rename shopping folders" on public.shopping_folders
  for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy "members delete shopping folders" on public.shopping_folders
  for delete to authenticated using (public.is_group_member(group_id));

-- ── Privileges ──────────────────────────────────────────────────────────────

revoke all on public.shopping_folders from anon, authenticated;
grant select, insert, delete on public.shopping_folders to authenticated;
grant update (name) on public.shopping_folders to authenticated;

revoke execute on function public.remember_last_shopping_folder() from public, anon, authenticated;

alter publication supabase_realtime add table public.shopping_folders;

-- ── Data API: the allowlist, now with shopping folders ──────────────────────

-- As in 20261029120000_ai_create_calendar.sql, plus GET and POST shopping_folders (see and
-- create; not renamed or deleted from a chat).
create or replace function public.check_api_request() returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  method text := current_setting('request.method', true);
  -- 'events' or 'rpc/busy_events' (no leading slash, but be lenient).
  target text := ltrim(coalesce(current_setting('request.path', true), ''), '/');
begin
  if not public.is_oauth_client() then
    return;
  end if;
  if not exists (select 1 from auth.sessions s where s.id::text = auth.jwt() ->> 'session_id') then
    raise exception 'connected app access revoked'
      using errcode = '42501', hint = 'The person took away this app''s access; sign in again to use it.';
  end if;
  if method in ('GET', 'HEAD') and target in (
       'people', 'members', 'calendars', 'calendar_shares', 'events', 'event_exceptions',
       'task_lists', 'task_list_shares', 'tasks', 'items', 'shopping_folders')
     or method = 'POST' and target in (
       'events', 'event_shares', 'event_participants', 'event_exceptions', 'tasks', 'items',
       'shopping_folders',
       'rpc/editable_calendar_ids', 'rpc/event_owners', 'rpc/busy_events', 'rpc/set_task_done',
       'rpc/merge_item', 'rpc/create_calendar_from_app')
     or method = 'PATCH' and target in ('events', 'event_exceptions', 'tasks')
     -- Taking someone off an event, and a day going back to the series: no event is deleted.
     or method = 'DELETE' and target in ('event_participants', 'event_exceptions')
  then
    return;
  end if;
  raise exception 'not allowed for connected apps: % %', method, target
    using errcode = '42501', hint = 'Connected apps can only use the calendar, tasks and shopping tools.';
end $$;
