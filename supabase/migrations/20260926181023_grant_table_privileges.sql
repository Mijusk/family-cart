-- Explicit table privileges for `authenticated`.
--
-- The local CLI image grants anon/authenticated/service_role default privileges on every
-- new object automatically (its bootstrap runs `alter default privileges ... grant ... on
-- tables to anon, authenticated, service_role`). A hosted project with "Automatically expose
-- new tables" turned off does not apply that default, so the initial migration's tables were
-- created with no table-level grant for `authenticated` at all — RLS never even gets
-- evaluated, Postgres rejects the query earlier with "permission denied for table …".
--
-- These grants only hand out what each table's RLS policies already allow the authenticated
-- role to do (see the `create policy ... to authenticated` statements in the initial
-- migration) — RLS still applies on top and decides which *rows* are visible, this just lets
-- the role attempt the statement at all. No policy targets `anon`, so `anon` gets nothing
-- here: without a matching policy, table grants alone wouldn't let it read or write any row.

grant select, update on public.groups to authenticated;                 -- select/update policies
grant select, update on public.members to authenticated;                -- select/update policies
grant select on public.products to authenticated;                       -- select policy only
grant select, insert on public.trips to authenticated;                  -- select/insert policies
grant select, insert, update, delete on public.items to authenticated;  -- select/insert/update/delete policies

-- Re-affirm (idempotent) the function grants from the initial migration, in case the same
-- "expose new tables" setting also suppressed any default privilege they relied on.
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
