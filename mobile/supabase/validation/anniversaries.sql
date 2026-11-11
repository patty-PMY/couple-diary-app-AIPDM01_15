-- smoke fixture 已有兩名配對成員與一筆日期；以 authenticated 角色驗證。
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ declare affected integer; saved jsonb; begin
  update public.anniversary_dates set title = '伴侶編輯', event_date = '2026-12-01', repeats_yearly = false;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Partner anniversary update failed'; end if;
  if (select created_by from public.anniversary_dates limit 1) <> '00000000-0000-4000-8000-000000000001' then
    raise exception 'Anniversary creator changed';
  end if;
  begin
    update public.anniversary_dates set created_by = auth.uid();
    raise exception 'Creator spoof allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.anniversary_dates set event_date = 'infinity'::date;
    raise exception 'Infinite anniversary allowed';
  exception when check_violation then null; end;
  if exists (select 1 from public.anniversary_reminders) then raise exception 'Partner reminder leaked'; end if;
  insert into public.anniversary_reminders (anniversary_id, couple_id, user_id, days_before)
    select id, couple_id, auth.uid(), 3 from public.anniversary_dates
    on conflict (anniversary_id, user_id) do update set days_before = excluded.days_before;
  if (select days_before from public.anniversary_reminders) <> 3 then raise exception 'Own reminder upsert failed'; end if;
  update public.anniversary_reminders set days_before = 7 where user_id <> auth.uid();
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Partner reminder update allowed'; end if;
  delete from public.anniversary_reminders where user_id <> auth.uid();
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Partner reminder delete allowed'; end if;
  delete from public.anniversary_reminders where user_id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Own reminder disable failed'; end if;
  begin
    insert into public.anniversary_reminders (anniversary_id, couple_id, user_id, days_before)
      select id, couple_id, auth.uid(), 31 from public.anniversary_dates;
    raise exception 'Invalid reminder lead allowed';
  exception when check_violation then null; end;
  saved := public.create_anniversary('原子建立日期', '2026-12-25', true, true);
  if not exists (select 1 from public.anniversary_reminders where anniversary_id = (saved->>'id')::uuid and days_before = 1) then
    raise exception 'Atomic reminder missing';
  end if;
  begin
    perform public.create_anniversary(E'\t\n', '2026-12-25', true, true);
    raise exception 'Blank title allowed';
  exception when check_violation then null; end;
  delete from public.anniversary_dates where id = (saved->>'id')::uuid;
  if exists (select 1 from public.anniversary_reminders where anniversary_id = (saved->>'id')::uuid) then
    raise exception 'Own reminder did not cascade';
  end if;
end $$;
reset role;
-- 另一位使用者的提醒必須保持原值。
do $$ begin
  if (select count(*) from public.anniversary_reminders) <> 1
    or (select days_before from public.anniversary_reminders) <> 1 then
    raise exception 'Partner reminder was modified';
  end if;
end $$;
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000003', '{"adult_confirmed":true,"consent_accepted":true}'),
 ('00000000-0000-4000-8000-000000000004', '{"adult_confirmed":true,"consent_accepted":true}'),
 ('00000000-0000-4000-8000-000000000005', '{"adult_confirmed":true,"consent_accepted":true}');
insert into public.couples (id) values ('10000000-0000-4000-8000-000000000001');
insert into public.couple_members (couple_id, user_id) values
 ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'),
 ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$ declare affected integer; begin
  if exists (select 1 from public.anniversary_dates) or exists (select 1 from public.anniversary_reminders) then
    raise exception 'Other couple can read dates or reminders';
  end if;
  update public.anniversary_dates set title = 'intrusion';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other couple can update anniversary'; end if;
  delete from public.anniversary_dates;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other couple can delete anniversary'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
do $$ begin
  if exists (select 1 from public.anniversary_dates) then raise exception 'Unpaired read allowed'; end if;
  begin
    perform public.create_anniversary('unpaired', '2026-12-25', true, false);
    raise exception 'Unpaired date creation allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ declare affected integer; begin
  delete from public.anniversary_dates;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Partner date deletion failed'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.anniversary_reminders) then raise exception 'Partner reminder did not cascade after date deletion'; end if;
  if has_function_privilege('anon', 'public.create_anniversary(text,date,boolean,boolean)', 'execute') then raise exception 'Anonymous RPC access allowed'; end if;
end $$;
