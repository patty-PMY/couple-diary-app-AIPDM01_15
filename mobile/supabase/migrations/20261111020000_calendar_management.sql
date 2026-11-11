-- 配對雙方可以修改行程內容；建立者及資料所屬配對保持不變。
create or replace function public.preserve_calendar_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' and (new.id is distinct from old.id
    or new.couple_id is distinct from old.couple_id
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at) then
    raise exception 'Calendar identity cannot be changed' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Invalid calendar timezone' using errcode = '23514';
  end if;
  if not pg_catalog.isfinite(new.starts_at)
    or (new.ends_at is not null and not pg_catalog.isfinite(new.ends_at)) then
    raise exception 'Invalid calendar date' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger preserve_calendar_identity before insert or update on public.calendar_events
for each row execute function public.preserve_calendar_identity();
revoke all on function public.preserve_calendar_identity() from public, anon, authenticated;

drop policy "Members update calendar events" on public.calendar_events;
create policy "Members update calendar events" on public.calendar_events
  for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id));
