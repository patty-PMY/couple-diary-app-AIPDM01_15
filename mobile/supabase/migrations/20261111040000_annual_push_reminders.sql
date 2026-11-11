-- 年度提醒由伺服器按裝置時區計算，不依賴 App 再次啟動。
create table public.reminder_devices (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  push_token text not null unique check (push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'),
  timezone text not null,
  updated_at timestamptz not null default now()
);
alter table public.reminder_devices enable row level security;
create policy "Users read own reminder devices" on public.reminder_devices
  for select to authenticated using (user_id = auth.uid());
grant select on public.reminder_devices to authenticated;
grant all on public.reminder_devices to service_role;

create function public.register_reminder_device(device_token text, device_timezone text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare device_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = device_timezone) then
    raise exception 'Invalid device timezone' using errcode = '23514';
  end if;
  insert into public.reminder_devices (user_id, push_token, timezone)
    values (auth.uid(), device_token, device_timezone)
    on conflict (push_token) do update set user_id = auth.uid(), timezone = excluded.timezone, updated_at = now()
    returning id into device_id;
  return device_id;
end;
$$;
create function public.unregister_reminder_device(device_token text)
returns void language sql security definer set search_path = '' as $$
  delete from public.reminder_devices where user_id = auth.uid() and push_token = device_token;
$$;
revoke all on function public.register_reminder_device(text, text), public.unregister_reminder_device(text) from public, anon;
grant execute on function public.register_reminder_device(text, text), public.unregister_reminder_device(text) to authenticated;

create table public.annual_reminder_deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  reminder_id uuid not null references public.anniversary_reminders(id) on delete cascade,
  device_id uuid not null references public.reminder_devices(id) on delete cascade,
  occurrence date not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_id uuid,
  locked_until timestamptz,
  ticket_id text,
  receipt_checked boolean not null default false,
  last_error text,
  sent_at timestamptz,
  constraint unique_annual_device_occurrence unique (reminder_id, device_id, occurrence)
);
alter table public.annual_reminder_deliveries enable row level security;
grant all on public.annual_reminder_deliveries to service_role;

-- 修改偏好、日期或 token 所屬帳號時，使未送出的舊工作失效。
create function public.invalidate_annual_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if TG_TABLE_NAME = 'anniversary_dates' then
    delete from public.annual_reminder_deliveries d using public.anniversary_reminders r
      where d.reminder_id = r.id and r.anniversary_id = old.id and d.status <> 'sent';
  elsif TG_TABLE_NAME = 'anniversary_reminders' then
    delete from public.annual_reminder_deliveries where reminder_id = old.id and status <> 'sent';
  else
    delete from public.annual_reminder_deliveries where device_id = old.id and status <> 'sent';
  end if;
  return new;
end;
$$;
create trigger invalidate_annual_date after update on public.anniversary_dates for each row execute function public.invalidate_annual_reminders();
create trigger invalidate_annual_preference after update on public.anniversary_reminders for each row execute function public.invalidate_annual_reminders();
create trigger invalidate_annual_device after update on public.reminder_devices for each row
  when (old.user_id is distinct from new.user_id or old.timezone is distinct from new.timezone)
  execute function public.invalidate_annual_reminders();
revoke all on function public.invalidate_annual_reminders() from public, anon, authenticated;

create function public.claim_annual_reminders(at_time timestamptz default now())
returns table (delivery_id uuid, lease uuid, push_token text)
language plpgsql security definer set search_path = '' as $$
begin
  -- 2/29 非閏年以「2/1 + 28 天」順延至 3/1；跨年提前提醒依發生日年份計算。
  insert into public.annual_reminder_deliveries (reminder_id, device_id, occurrence, due_at, available_at)
  select r.id, dev.id, dates.occurrence, due.due_at, at_time
    from public.anniversary_reminders r
    join public.anniversary_dates a on a.id = r.anniversary_id and a.couple_id = r.couple_id
    join public.reminder_devices dev on dev.user_id = r.user_id
    cross join lateral (select (at_time at time zone dev.timezone)::date as today) local_day
    cross join lateral (select (make_date(extract(year from (local_day.today + r.days_before))::int,
      extract(month from a.event_date)::int, 1) + (extract(day from a.event_date)::int - 1)) as occurrence) dates
    cross join lateral (select ((local_day.today + time '09:00') at time zone dev.timezone) as due_at) due
    where a.repeats_yearly and dates.occurrence = local_day.today + r.days_before
      and due.due_at <= at_time
      and (select count(*) from public.couple_members cm where cm.couple_id = r.couple_id) = 2
      and exists (select 1 from public.couple_members cm where cm.couple_id = r.couple_id and cm.user_id = r.user_id)
    on conflict on constraint unique_annual_device_occurrence do nothing;

  -- 只重試當地當天的提醒，避免服務恢復後補發數日前的內容。
  update public.annual_reminder_deliveries d set status = 'failed', last_error = 'expired'
    from public.reminder_devices dev
    where d.device_id = dev.id and d.status in ('pending', 'sending')
      and (d.due_at at time zone dev.timezone)::date < (at_time at time zone dev.timezone)::date;
  return query
    with candidates as (
      select d.id from public.annual_reminder_deliveries d
      join public.reminder_devices dev on dev.id = d.device_id
      join public.anniversary_reminders r on r.id = d.reminder_id and r.user_id = dev.user_id
      join public.anniversary_dates a on a.id = r.anniversary_id and a.repeats_yearly
      where (d.status = 'pending' or (d.status = 'sending' and d.locked_until <= at_time))
        and d.attempts < 8 and d.available_at <= at_time
        and (select count(*) from public.couple_members cm where cm.couple_id = r.couple_id) = 2
        and exists (select 1 from public.couple_members cm where cm.couple_id = r.couple_id and cm.user_id = r.user_id)
      order by d.due_at limit 100 for update of d skip locked
    ), claimed as (
      update public.annual_reminder_deliveries d set status = 'sending', attempts = attempts + 1,
        lease_id = extensions.gen_random_uuid(), locked_until = at_time + interval '5 minutes'
        from candidates c where d.id = c.id
        returning d.id, d.lease_id, d.device_id, d.reminder_id, d.occurrence
    )
    select c.id, c.lease_id, dev.push_token
      from claimed c join public.reminder_devices dev on dev.id = c.device_id
      join public.anniversary_reminders r on r.id = c.reminder_id
      join public.anniversary_dates a on a.id = r.anniversary_id;
end;
$$;
revoke all on function public.claim_annual_reminders(timestamptz) from public, anon, authenticated;
grant execute on function public.claim_annual_reminders(timestamptz) to service_role;

create function public.finish_annual_reminder(delivery uuid, delivery_lease uuid, expo_ticket text, failure text, permanent boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.annual_reminder_deliveries set
    status = case when expo_ticket is not null then 'sent' when permanent or attempts >= 8 then 'failed' else 'pending' end,
    ticket_id = expo_ticket, last_error = failure, sent_at = case when expo_ticket is not null then now() else null end,
    available_at = now() + interval '5 minutes', locked_until = null
    where id = delivery and lease_id = delivery_lease and status = 'sending';
end;
$$;
revoke all on function public.finish_annual_reminder(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.finish_annual_reminder(uuid, uuid, text, text, boolean) to service_role;
