-- Connected AI apps (Claude, later ChatGPT): what an OAuth token can do. Design: docs/ia.md.
--
-- Supabase Auth's OAuth 2.1 server gives the app a token of the person, so RLS already limits it to
-- what that person sees and edits. But OAuth scopes don't limit the Data API: without this, the
-- token could do anything the app can (leave a group, change roles, empty the trash…). These
-- tokens carry a client_id claim (the app's own sessions don't), and here they get only what the
-- mcp Edge Function uses: read the calendar, tasks and shopping list, create and change events
-- and tasks, add products. Nothing is deleted, nothing about groups or accounts changes.

-- ── Who is calling ──────────────────────────────────────────────────────────

-- A token issued to an OAuth client (a connected app), not a session of Family App itself.
create function public.is_oauth_client() returns boolean
language sql stable set search_path = '' as $$
  select (auth.jwt() ->> 'client_id') is not null
$$;

-- ── Data API: an allowlist for connected apps ───────────────────────────────

-- PostgREST runs this before every request (pgrst.db_pre_request below), with the caller's role
-- and claims already set. Sessions of the app and the service role pass straight through; a
-- connected app only reaches the tables and RPCs the mcp function uses. Raising stops the request
-- before it touches anything. Security definer RPCs skip RLS, which is why they are listed too.
--
-- Security definer to read auth.sessions: «Quitar acceso» (revoking the grant) deletes the app's
-- sessions, and its access token, still within its hour, then stops working at once.
create function public.check_api_request() returns void
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
       'rpc/merge_item')
     or method = 'PATCH' and target in ('events', 'event_exceptions', 'tasks')
     -- Taking someone off an event, and a day going back to the series: no event is deleted.
     or method = 'DELETE' and target in ('event_participants', 'event_exceptions')
  then
    return;
  end if;
  raise exception 'not allowed for connected apps: % %', method, target
    using errcode = '42501', hint = 'Connected apps can only use the calendar, tasks and shopping tools.';
end $$;

alter role authenticator set pgrst.db_pre_request = 'public.check_api_request';
notify pgrst, 'reload config';

-- ── Storage and devices: nothing for connected apps ─────────────────────────

-- The pre-request check covers only the Data API. Photos (Storage) and the person's devices (seen
-- through Realtime too) are closed to these tokens with restrictive policies, which are ANDed
-- with the existing ones.
create policy "connected apps don't use photos" on storage.objects
  as restrictive for all to authenticated
  using (not public.is_oauth_client()) with check (not public.is_oauth_client());

create policy "connected apps don't see devices" on public.push_subscriptions
  as restrictive for all to authenticated
  using (not public.is_oauth_client());

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke execute on function public.is_oauth_client(), public.check_api_request() from public, anon, authenticated;
-- PostgREST calls the check as whoever is calling: anonymous, signed in, or the service role
-- (send-notifications). In Supabase Cloud the service role gets nothing by default.
grant execute on function public.is_oauth_client(), public.check_api_request() to anon, authenticated, service_role;
