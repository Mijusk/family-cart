-- Cancelling a trip also undoes its "no lo encontré": those items go back to the list as plain
-- pending, like the cart does. Items not found on a trip that was finished (or closed by the
-- timeout) keep their mark and stay on the list; the app shows them as still to pick on the
-- next trip, so they are bought then.

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
   where i.trip_id = trip.id and i.status in ('in_cart', 'not_found');

  update public.trips set finished_at = now(), closed_reason = 'cancelled' where id = trip.id;
end;
$$;
