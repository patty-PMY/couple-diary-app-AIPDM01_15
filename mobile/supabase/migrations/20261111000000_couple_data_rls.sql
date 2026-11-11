-- Keep couple-scoped records private to the two authenticated members.
-- Users may manage shared content as a couple; identity columns remain bound
-- to auth.uid() so a member cannot impersonate their partner.

drop policy if exists "Members read calendar events" on public.calendar_events;
drop policy if exists "Members read anniversary dates" on public.anniversary_dates;
drop policy if exists "Users read their own anniversary reminders" on public.anniversary_reminders;
drop policy if exists "Members read diary entries" on public.diary_entries;
drop policy if exists "Members read diary comments" on public.diary_comments;
drop policy if exists "Members read mood entries" on public.mood_entries;
create policy "Couple members read calendar events" on public.calendar_events
  for select to authenticated using (public.is_couple_member(couple_id));
create policy "Couple members read anniversary dates" on public.anniversary_dates
  for select to authenticated using (public.is_couple_member(couple_id));
create policy "Users read their own anniversary reminders" on public.anniversary_reminders
  for select to authenticated using (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "Couple members read diary entries" on public.diary_entries
  for select to authenticated using (public.is_couple_member(couple_id));
create policy "Couple members read diary comments" on public.diary_comments
  for select to authenticated using (public.is_couple_member(couple_id));
create policy "Couple members read mood entries" on public.mood_entries
  for select to authenticated using (public.is_couple_member(couple_id));

drop policy if exists "Members add their calendar events" on public.calendar_events;
drop policy if exists "Authors update their calendar events" on public.calendar_events;
drop policy if exists "Authors delete their calendar events" on public.calendar_events;
create policy "Members add their calendar events" on public.calendar_events
  for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Members update calendar events" on public.calendar_events
  for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Members delete calendar events" on public.calendar_events
  for delete to authenticated using (public.is_couple_member(couple_id));

drop policy if exists "Members add anniversary dates" on public.anniversary_dates;
drop policy if exists "Authors update anniversary dates" on public.anniversary_dates;
drop policy if exists "Authors delete anniversary dates" on public.anniversary_dates;
create policy "Members add anniversary dates" on public.anniversary_dates
  for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Members update anniversary dates" on public.anniversary_dates
  for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Members delete anniversary dates" on public.anniversary_dates
  for delete to authenticated using (public.is_couple_member(couple_id));

drop policy if exists "Users manage their own anniversary reminders" on public.anniversary_reminders;
drop policy if exists "Users update their own anniversary reminders" on public.anniversary_reminders;
drop policy if exists "Users delete their own anniversary reminders" on public.anniversary_reminders;
create policy "Members add anniversary reminders" on public.anniversary_reminders
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_couple_member(couple_id)
    and exists (
      select 1 from public.anniversary_dates ad
      where ad.id = anniversary_id and ad.couple_id = couple_id
    )
  );
create policy "Users update their own anniversary reminders" on public.anniversary_reminders
  for update to authenticated
  using (user_id = auth.uid() and public.is_couple_member(couple_id))
  with check (
    user_id = auth.uid()
    and public.is_couple_member(couple_id)
    and exists (
      select 1 from public.anniversary_dates ad
      where ad.id = anniversary_id and ad.couple_id = couple_id
    )
  );
create policy "Users delete their own anniversary reminders" on public.anniversary_reminders
  for delete to authenticated using (user_id = auth.uid() and public.is_couple_member(couple_id));

drop policy if exists "Authors update diary entries" on public.diary_entries;
drop policy if exists "Authors delete diary entries" on public.diary_entries;
create policy "Members update diary entries" on public.diary_entries
  for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Members delete diary entries" on public.diary_entries
  for delete to authenticated using (public.is_couple_member(couple_id));

drop policy if exists "Authors update diary comments" on public.diary_comments;
drop policy if exists "Authors delete diary comments" on public.diary_comments;
create policy "Members update diary comments" on public.diary_comments
  for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Members delete diary comments" on public.diary_comments
  for delete to authenticated using (public.is_couple_member(couple_id));

drop policy if exists "Authors update mood entries" on public.mood_entries;
drop policy if exists "Authors delete mood entries" on public.mood_entries;
create policy "Members update mood entries" on public.mood_entries
  for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Members delete mood entries" on public.mood_entries
  for delete to authenticated using (public.is_couple_member(couple_id));

-- Couple membership and invitation rows contain private relationship data.
create or replace function public.is_couple_member_for_user(target_couple_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.couple_members cm
    where cm.couple_id = target_couple_id and cm.user_id = target_user_id
  );
$$;

create policy "Members add their couple membership" on public.couple_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_couple_member_for_user(couple_id, auth.uid())
    and not exists (select 1 from public.couple_members cm where cm.user_id = auth.uid())
  );

create policy "Creators manage their invitations" on public.couple_invitations
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_couple_member(couple_id));
create policy "Creators update their invitations" on public.couple_invitations
  for update to authenticated
  using (created_by = auth.uid() and public.is_couple_member(couple_id))
  with check (created_by = auth.uid() and public.is_couple_member(couple_id));
create policy "Creators delete their invitations" on public.couple_invitations
  for delete to authenticated
  using (created_by = auth.uid() and public.is_couple_member(couple_id));

-- The profile table is deliberately user-private and read-only to clients.
revoke insert, update, delete on public.profiles from authenticated;
grant execute on function public.is_couple_member_for_user(uuid, uuid) to authenticated;
