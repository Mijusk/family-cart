-- The send-notifications Edge Function reads the queue and devices as service_role. Supabase no
-- longer grants new tables to the Data API roles by default, so without this the function fails
-- with "permission denied for table notifications". Same rule as the rest: explicit grants only.

grant select, update on public.notifications to service_role;
grant select, delete on public.push_subscriptions to service_role;
