-- 共享日期由雙方管理，但原建立者與所屬配對不可改寫。
create function public.preserve_anniversary_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and (new.id is distinct from old.id
    or new.couple_id is distinct from old.couple_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at) then
    raise exception 'Anniversary identity cannot be changed' using errcode = '42501';
  end if;
  if new.title ~ '^[[:space:]]*$' or not pg_catalog.isfinite(new.event_date)
    or new.event_date < date '0001-01-01' or new.event_date > date '9999-12-31' then
    raise exception 'Invalid anniversary data' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger preserve_anniversary_identity before insert or update on public.anniversary_dates
for each row execute function public.preserve_anniversary_identity();
revoke all on function public.preserve_anniversary_identity() from public, anon, authenticated;

drop policy "Members update anniversary dates" on public.anniversary_dates;
create policy "Members update anniversary dates" on public.anniversary_dates
  for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id));

-- 日期和首次個人提醒同一交易建立，避免部分失敗後重試產生重複日期。
create function public.create_anniversary(date_title text, date_value date, yearly boolean, remind boolean)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  target uuid;
  saved public.anniversary_dates%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select couple_id into target from public.get_pairing_status() where member_count = 2;
  if target is null then raise exception 'Completed pair required' using errcode = '42501'; end if;
  insert into public.anniversary_dates (couple_id, created_by, title, event_date, repeats_yearly)
    values (target, auth.uid(), trim(date_title), date_value, yearly) returning * into saved;
  if remind then
    insert into public.anniversary_reminders (anniversary_id, couple_id, user_id, days_before)
      values (saved.id, target, auth.uid(), 1);
  end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.create_anniversary(text, date, boolean, boolean) from public, anon;
grant execute on function public.create_anniversary(text, date, boolean, boolean) to authenticated;
