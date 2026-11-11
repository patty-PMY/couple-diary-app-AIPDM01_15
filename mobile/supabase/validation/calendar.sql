-- 在 smoke fixture 上驗證建立者以外的伴侶更新，以及資料隔離。
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ declare affected integer; begin
  begin
    insert into public.calendar_events (couple_id, created_by, title, starts_at, timezone)
      select couple_id, auth.uid(), '錯誤時區', starts_at, 'Invalid/Zone' from public.calendar_events;
    raise exception 'Invalid timezone insert accepted';
  exception when check_violation then null; end;
  begin
    insert into public.calendar_events (couple_id, created_by, title, starts_at, timezone)
      select couple_id, auth.uid(), '錯誤時間', 'infinity'::timestamptz, timezone from public.calendar_events;
    raise exception 'Infinite timestamp insert accepted';
  exception when check_violation then null; end;
  update public.calendar_events set title = '伴侶更新的行程', starts_at = '2026-11-13T10:30:00Z', timezone = 'Asia/Taipei';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Partner update failed'; end if;
  if not exists (select 1 from public.calendar_events where created_by = '00000000-0000-4000-8000-000000000001' and title = '伴侶更新的行程') then
    raise exception 'Original creator was lost';
  end if;
  begin
    update public.calendar_events set created_by = auth.uid();
    raise exception 'Creator changed';
  exception when insufficient_privilege then null; end;
  begin
    update public.calendar_events set timezone = 'Invalid/Zone';
    raise exception 'Invalid timezone accepted';
  exception when check_violation then null; end;
end $$;
reset role;
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000003', '{"adult_confirmed":true,"consent_accepted":true}'),
 ('00000000-0000-4000-8000-000000000004', '{"adult_confirmed":true,"consent_accepted":true}');
insert into public.couples (id) values ('10000000-0000-4000-8000-000000000001');
insert into public.couple_members (couple_id, user_id) values
 ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'),
 ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$ declare affected integer; begin
  if exists (select 1 from public.calendar_events) then raise exception 'Other couple read event'; end if;
  update public.calendar_events set title = 'intrusion';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other couple updated event'; end if;
  delete from public.calendar_events;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other couple deleted event'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ declare affected integer; begin
  delete from public.calendar_events;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Partner deletion failed'; end if;
end $$;
reset role;
