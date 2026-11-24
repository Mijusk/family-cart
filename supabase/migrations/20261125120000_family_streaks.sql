-- Family streaks (Luis, 24-nov): tapping the fire in the header opens a page with the stretching
-- streak of everyone in the group. So each person now also sees the days of the people who are in
-- one of their groups (both active). Still only written by log_stretch_session, for oneself.
-- Design notes: docs/estiramientos.md (§4).

-- Active in a group where I'm active too (pending requests and those who left see and are seen by
-- nobody, as elsewhere).
create function public.shares_group_with(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
     where m.person_id = pid and m.status = 'active' and m.left_at is null
       and public.is_group_member(m.group_id)
  )
$$;

drop policy "see my stretch sessions" on public.stretch_sessions;

create policy "see my stretch sessions and my groups'" on public.stretch_sessions
  for select to authenticated using (person_id = public.my_person_id() or public.shares_group_with(person_id));

revoke execute on function public.shares_group_with(uuid) from public, anon, authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;
