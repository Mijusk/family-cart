-- An item can only be in the cart of an open trip.
--
-- The app writes in the background, so "put in cart" can reach the server after the trip
-- was closed (the 4-hour timeout, or the same member finishing on another device). Without
-- this guard the item stayed 'in_cart' on a finished trip: neither pending nor bought,
-- stuck under "Ya en el carrito" for good. Now that write is rejected; the app reports it
-- and reloads, and the item shows as pending again.

-- Items already stuck that way go back to the list.
update public.items i
   set status = 'pending', trip_id = null
  from public.trips t
 where i.trip_id = t.id and i.status = 'in_cart' and t.finished_at is not null;

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

revoke execute on function public.items_cart_requires_open_trip() from public, anon, authenticated;
