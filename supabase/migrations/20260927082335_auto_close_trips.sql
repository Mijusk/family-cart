-- Close shopping trips that were left open.
--
-- A trip open for more than 4 hours closes itself exactly as if its shopper had tapped
-- "Finalizar compra": the cart becomes purchased (by the shopper, now) and the trip is
-- finished. pg_cron runs it inside the database every 15 minutes, so it doesn't depend
-- on anyone having the app open. trips.closed_reason records how each trip ended.

-- ── Why a trip closed ────────────────────────────────────────────────────────

alter table public.trips add column closed_reason text
  check (closed_reason in ('manual', 'timeout', 'cancelled'));

-- Existing closed trips: cancel_trip never bought anything, finish_trip usually did.
update public.trips t
   set closed_reason = case
     when exists (select 1 from public.items i where i.trip_id = t.id and i.status = 'purchased') then 'manual'
     else 'cancelled'
   end
 where t.finished_at is not null;

alter table public.trips add constraint trips_closed_reason_matches_finished
  check ((finished_at is null) = (closed_reason is null));

-- ── Shared closing logic ─────────────────────────────────────────────────────

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

create or replace function public.finish_trip(trip_id uuid)
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

create or replace function public.cancel_trip(trip_id uuid)
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

-- ── Privileges ───────────────────────────────────────────────────────────────
-- Supabase grants EXECUTE on every new function to anon and authenticated by default, so
-- internal functions must revoke it from them explicitly (revoking from public isn't enough).
-- remember_product was only revoked from public/anon in the initial migration: a signed-in
-- user could call it with any group id and write into that group's autocomplete catalog.

revoke execute on function
  public.close_trip(uuid, text),
  public.close_stale_trips(interval),
  public.remember_product(uuid, text, integer),
  public.items_remember_product()
from public, anon, authenticated;

-- ── Schedule ─────────────────────────────────────────────────────────────────

create extension if not exists pg_cron with schema pg_catalog;

-- Scheduling under the same name again updates the job instead of duplicating it.
select cron.schedule('close-stale-trips', '*/15 * * * *', 'select public.close_stale_trips()');
