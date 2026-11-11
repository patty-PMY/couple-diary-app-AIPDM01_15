-- Match ECMAScript String.trim(), including non-breaking/full-width spaces.
-- Apply to direct table writes as well as RPC writes.
create function public.validate_shared_title()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.title := btrim(new.title, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
  if new.title is null or char_length(new.title) not between 1 and 120 then
    raise exception 'Invalid shared title' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validate_shared_title before insert or update on public.calendar_events
  for each row execute function public.validate_shared_title();
create trigger validate_shared_title before insert or update on public.anniversary_dates
  for each row execute function public.validate_shared_title();
revoke all on function public.validate_shared_title() from public, anon, authenticated;

-- Explicitly qualify both sides of the parent relation in reminder policies.
drop policy "Members add anniversary reminders" on public.anniversary_reminders;
create policy "Members add anniversary reminders" on public.anniversary_reminders
  for insert to authenticated with check (
    user_id = auth.uid() and public.is_couple_member(couple_id)
    and exists (select 1 from public.anniversary_dates ad
      where ad.id = anniversary_reminders.anniversary_id
        and ad.couple_id = anniversary_reminders.couple_id)
  );
drop policy "Users update their own anniversary reminders" on public.anniversary_reminders;
create policy "Users update their own anniversary reminders" on public.anniversary_reminders
  for update to authenticated
  using (user_id = auth.uid() and public.is_couple_member(couple_id))
  with check (
    user_id = auth.uid() and public.is_couple_member(couple_id)
    and exists (select 1 from public.anniversary_dates ad
      where ad.id = anniversary_reminders.anniversary_id
        and ad.couple_id = anniversary_reminders.couple_id)
  );
