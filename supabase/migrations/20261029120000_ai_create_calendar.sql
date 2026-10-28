-- Connected AI apps can create calendar folders (docs/ia.md, 22-oct), so a schedule pasted into
-- the chat («Berta trabaja L–V de 8 a 15») can be filled into its own folder. One RPC does the
-- whole thing, with the same rules as the app: who can have a folder made (create_calendar /
-- create_calendar_for), no second folder with the same name, and a share only for the folder it
-- has just made. Connected apps get this RPC and nothing else new: no insert into calendars, no
-- calendar_shares, so they can't share a folder that already exists.

-- ── create_calendar_from_app ────────────────────────────────────────────────

-- owner_id: me, a profile without account that I manage, or (as an admin) someone with an
-- account in a group I administer. Mine and my profiles' stay private unless group_id is given
-- (shared with it at level, 'full' by default). Someone else's with an account is always shared
-- in full with group_id, as create_calendar_for does: otherwise I couldn't see it.
--
-- If the owner already has a folder with that name (normalize_name: case, accents and spaces
-- don't count), also in the trash, nothing is made or shared: it returns that one, with
-- created = false. One I can't edit (someone's private folder) is an error.
create function public.create_calendar_from_app(
  owner_id uuid, name text, color text default null, group_id uuid default null, level text default null
)
returns table (calendar_id uuid, calendar_name text, calendar_color text, created boolean, in_trash boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := public.require_person();
  clean text := regexp_replace(trim(create_calendar_from_app.name), '\s+', ' ', 'g');
  manage boolean := public.can_manage_person(create_calendar_from_app.owner_id);
  share_level text := create_calendar_from_app.level;
  found record;
  new_id uuid;
begin
  if share_level is not null and create_calendar_from_app.group_id is null then
    raise exception 'share level without a group' using errcode = '22023';
  end if;
  if share_level is not null and share_level not in ('full', 'busy') then
    raise exception 'invalid share level' using errcode = '22023';
  end if;
  if create_calendar_from_app.group_id is not null then
    share_level := coalesce(share_level, 'full');
    -- Both of us in that group, as can_share_calendar() asks.
    if not public.is_group_member(create_calendar_from_app.group_id) then
      raise exception 'not a member of the group' using errcode = 'P0002';
    end if;
    if not exists (
      select 1 from public.members m
       where m.group_id = create_calendar_from_app.group_id and m.person_id = create_calendar_from_app.owner_id
         and m.status = 'active' and m.left_at is null
    ) then
      raise exception 'not a member of the group' using errcode = 'P0002';
    end if;
  end if;
  if not manage then
    -- Someone else's with an account: as create_calendar_for.
    if create_calendar_from_app.group_id is null or not public.is_group_admin(create_calendar_from_app.group_id) then
      raise exception 'not an admin' using errcode = '42501';
    end if;
    if share_level <> 'full' then
      raise exception 'someone else''s folder is shared in full' using errcode = '22023';
    end if;
  end if;

  select c.id, c.name, c.color, c.deleted_at is not null as in_trash
    into found
    from public.calendars c
   where c.owner_id = create_calendar_from_app.owner_id
     and public.normalize_name(c.name) = public.normalize_name(clean)
   order by c.deleted_at nulls first
   limit 1;
  if found.id is not null then
    if not public.can_edit_calendar(found.id) then
      raise exception 'calendar name taken' using errcode = '23505';
    end if;
    return query select found.id, found.name, found.color, false, found.in_trash;
    return;
  end if;

  insert into public.calendars (owner_id, name, color, position)
  values (
    create_calendar_from_app.owner_id, clean,
    -- FOLDER_COLORS[2] in src/utils/colors.ts, the one the app's folder form starts with.
    coalesce(create_calendar_from_app.color, '#3b6fb6'),
    (select count(*) from public.calendars c where c.owner_id = create_calendar_from_app.owner_id and c.deleted_at is null)
  )
  returning calendars.id into new_id;
  if create_calendar_from_app.group_id is not null then
    insert into public.calendar_shares (calendar_id, group_id, level)
    values (new_id, create_calendar_from_app.group_id, share_level);
  end if;
  return query select c.id, c.name, c.color, true, false from public.calendars c where c.id = new_id;
end;
$$;

revoke execute on function public.create_calendar_from_app(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.create_calendar_from_app(uuid, text, text, uuid, text) to authenticated;

-- ── Data API: the allowlist, now with that RPC ──────────────────────────────

-- As in 20261027120000_ai_connector.sql, plus POST rpc/create_calendar_from_app.
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
       'task_lists', 'task_list_shares', 'tasks', 'items')
     or method = 'POST' and target in (
       'events', 'event_shares', 'event_participants', 'event_exceptions', 'tasks', 'items',
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
