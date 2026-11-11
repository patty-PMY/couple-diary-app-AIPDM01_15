-- 無網路呼叫：以多個未來年份模擬伺服器定時工作，裝置不重新註冊。
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select public.register_reminder_device('ExpoPushToken[testDeviceA]', 'Asia/Taipei');
update public.anniversary_dates set event_date = '2020-11-20', repeats_yearly = true;
do $$ begin
  if has_function_privilege('authenticated', 'public.claim_annual_reminders(timestamptz)', 'execute') then raise exception 'Client can run dispatch RPC'; end if;
  if has_function_privilege('anon', 'public.register_reminder_device(text,text)', 'execute') then raise exception 'Anonymous device registration allowed'; end if;
  begin
    perform public.register_reminder_device('ExpoPushToken[testBad]', 'Invalid/Zone');
    raise exception 'Invalid device timezone accepted';
  exception when check_violation then null; end;
end $$;
reset role;
do $$ declare item record; total integer; begin
  select count(*) into total from public.claim_annual_reminders('2026-11-19T00:59:59Z');
  if total <> 0 then raise exception 'Reminder claimed before local 9 AM'; end if;
  for item in select * from public.claim_annual_reminders('2026-11-19T01:00:00Z') loop
    perform public.finish_annual_reminder(item.delivery_id, item.lease, 'ticket-2026', null, false);
  end loop;
  if (select count(*) from public.annual_reminder_deliveries where status = 'sent') <> 1 then raise exception '2026 delivery missing'; end if;
  if (select count(*) from public.claim_annual_reminders('2026-11-19T01:01:00Z')) <> 0 then raise exception 'Duplicate 2026 delivery'; end if;
  for item in select * from public.claim_annual_reminders('2027-11-19T01:00:00Z') loop
    perform public.finish_annual_reminder(item.delivery_id, item.lease, 'ticket-2027', null, false);
  end loop;
  for item in select * from public.claim_annual_reminders('2028-11-19T01:00:00Z') loop
    perform public.finish_annual_reminder(item.delivery_id, item.lease, 'ticket-2028', null, false);
  end loop;
  if (select count(*) from public.annual_reminder_deliveries where status = 'sent') <> 3 then raise exception 'Annual recurrence requires reopening app'; end if;
end $$;

-- 3/1 前一天在一般年是 2/28，閏年是 2/29。
update public.anniversary_dates set event_date = '2020-03-01';
do $$ begin
  if (select count(*) from public.claim_annual_reminders('2027-02-28T01:00:00Z')) <> 1 then raise exception 'Common-year lead date wrong'; end if;
  if (select count(*) from public.claim_annual_reminders('2028-02-28T01:00:00Z')) <> 0 then raise exception 'Leap-year reminder early'; end if;
  if (select count(*) from public.claim_annual_reminders('2028-02-29T01:00:00Z')) <> 1 then raise exception 'Leap-year reminder missing'; end if;
end $$;
-- 使用者變更日期後，未送出工作必須失效。
update public.anniversary_dates set event_date = '2020-01-01';
do $$ begin
  if exists (select 1 from public.annual_reminder_deliveries where status <> 'sent') then raise exception 'Edited date retained stale jobs'; end if;
  if (select count(*) from public.claim_annual_reminders('2029-12-31T01:00:00Z')) <> 1 then raise exception 'Cross-year reminder missing'; end if;
  if not exists (select 1 from public.annual_reminder_deliveries where occurrence = '2030-01-01') then raise exception 'Wrong occurrence year'; end if;
end $$;

-- 時區與夏令時間使用伺服器 IANA 規則。
update public.reminder_devices set timezone = 'America/New_York';
update public.anniversary_dates set event_date = '2020-07-02';
do $$ begin
  if (select count(*) from public.claim_annual_reminders('2027-07-01T12:59:00Z')) <> 0 then raise exception 'DST reminder early'; end if;
  if (select count(*) from public.claim_annual_reminders('2027-07-01T13:00:00Z')) <> 1 then raise exception 'DST 9AM reminder missing'; end if;
  if (select count(*) from public.claim_annual_reminders('2027-07-01T13:01:00Z')) <> 0 then raise exception 'Concurrent worker stole active lease'; end if;
  if (select count(*) from public.claim_annual_reminders('2027-07-01T13:06:00Z')) <> 1 then raise exception 'Expired lease not retried'; end if;
end $$;
-- 另一成員無法讀取或移除對方的裝置。
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ begin
  if exists (select 1 from public.reminder_devices) then raise exception 'Partner push token leaked'; end if;
end $$;
select public.unregister_reminder_device('ExpoPushToken[testDeviceA]');
reset role;
do $$ begin
  if (select count(*) from public.reminder_devices) <> 1 then raise exception 'Partner device removed'; end if;
end $$;
-- 停用提醒連帶移除派送工作，登出移除裝置。
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
delete from public.anniversary_reminders where user_id = auth.uid();
select public.unregister_reminder_device('ExpoPushToken[testDeviceA]');
reset role;
do $$ begin
  if exists (select 1 from public.annual_reminder_deliveries) then raise exception 'Disabled reminder retained jobs'; end if;
  if exists (select 1 from public.reminder_devices) then raise exception 'Device not unregistered'; end if;
end $$;
