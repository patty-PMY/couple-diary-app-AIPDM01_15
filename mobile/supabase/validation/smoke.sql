-- 僅由驗證工具在交易內以資料庫管理員執行，最後 rollback。
do $$ declare rejected boolean := false; begin
  begin
    insert into auth.users (id, raw_user_meta_data)
    values ('00000000-0000-4000-8000-000000000011', '{"adult_confirmed":false,"consent_accepted":true,"consent_version":"v1"}');
  exception when raise_exception then
    rejected := sqlerrm = 'Adult confirmation is required';
  end;
  if not rejected then raise exception 'Signup without adult confirmation was accepted'; end if;
end $$;
do $$ declare rejected boolean := false; begin
  begin
    insert into auth.users (id, raw_user_meta_data)
    values ('00000000-0000-4000-8000-000000000012', '{"adult_confirmed":true,"consent_accepted":false,"consent_version":"v1"}');
  exception when raise_exception then
    rejected := sqlerrm = 'Consent is required';
  end;
  if not rejected then raise exception 'Signup without consent was accepted'; end if;
end $$;
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000001', '{"adult_confirmed":true,"consent_accepted":true,"consent_version":"v1","consent_at":"2026-11-11T00:00:00Z"}'),
  ('00000000-0000-4000-8000-000000000002', '{"adult_confirmed":true,"consent_accepted":true,"consent_version":"v1","consent_at":"2026-11-11T00:00:00Z"}');
insert into public.couples default values;
insert into public.couple_members (couple_id, user_id)
  select c.id, u.id from public.couples c cross join auth.users u;
insert into public.couple_invitations (couple_id, created_by, token_hash, expires_at)
  select id, '00000000-0000-4000-8000-000000000001',
    encode(extensions.digest(extensions.gen_random_bytes(24), 'sha256'), 'hex'), now() + interval '48 hours'
  from public.couples;
insert into public.calendar_events (couple_id, created_by, title, starts_at)
  select id, '00000000-0000-4000-8000-000000000001', '一起吃晚餐', '2026-11-12 18:30:00+08' from public.couples;
insert into public.anniversary_dates (couple_id, created_by, title, event_date, repeats_yearly)
  select id, '00000000-0000-4000-8000-000000000001', '紀念日', '2024-02-29', true from public.couples;
insert into public.anniversary_reminders (anniversary_id, couple_id, user_id)
  select id, couple_id, '00000000-0000-4000-8000-000000000001' from public.anniversary_dates;
insert into public.diary_entries (couple_id, created_by, body)
  select id, '00000000-0000-4000-8000-000000000001', '一起記錄今天😊' from public.couples;
insert into public.diary_comments (couple_id, diary_id, created_by, body)
  select couple_id, id, '00000000-0000-4000-8000-000000000002', '謝謝你 💛' from public.diary_entries;
insert into public.mood_entries (couple_id, created_by, mood)
  select id, '00000000-0000-4000-8000-000000000002', 'happy' from public.couples;
